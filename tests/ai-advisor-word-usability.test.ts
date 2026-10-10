import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readRoutingProbeProfile,routingProbeConfig,injectedGeminiFailure} from '../cloudflare/worker/src/staging/advisor-routing-probe.ts';
import {shouldUseAiAdvisorV2,type AiAdvisorV2RuntimeConfig} from '../cloudflare/worker/src/ai-advisor-v2-runtime.ts';
import {GeminiFileSearchError} from '../cloudflare/worker/src/gemini-file-search.ts';

const origin='https://hub-advisor-pr88-word-staging.example.workers.dev';
const req=(suffix='?profile=canary-selected',method='POST')=>new Request(`${origin}/api/staging/ai-advisor-routing${suffix}`,{method});
test('routing experiments are POST-only, Admin-only, isolated Word staging and static profiles',()=>{
  assert.equal(readRoutingProbeProfile(req(),'admin'),'canary-selected');
  for(const role of ['user','auditor',''])assert.throws(()=>readRoutingProbeProfile(req(),role));
  for(const request of [req('', 'POST'),req('?profile=canary-selected','GET'),req('?profile=on'),req('?profile=canary-selected&userId=other'),req('?profile=canary-selected&profile=canary-unselected'),new Request('https://hotrosinhvienhub.id.vn/api/staging/ai-advisor-routing?profile=canary-selected',{method:'POST'})])assert.throws(()=>readRoutingProbeProfile(request,'admin'));
});
test('selected/nonselected experiments exercise real stable bucket without substituting identity',async()=>{
  for(const id of ['synthetic-a','synthetic-b'])for(const profile of ['canary-selected','canary-unselected','selected-completeness-off','legacy-provider-error','selected-provider-error'] as const){
    const c=await routingProbeConfig(profile,id);
    assert.equal(await shouldUseAiAdvisorV2({mode:c.AI_ADVISOR_V2_MODE,canaryPercent:Number(c.AI_ADVISOR_V2_CANARY_PERCENT)} as AiAdvisorV2RuntimeConfig,id),c.diagnostic.expectedSelected);
    assert.equal(c.AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED,profile==='selected-completeness-off'?'false':'true');
    assert.equal(c.diagnostic.faultInjected,profile.endsWith('provider-error'));
    assert.ok(!JSON.stringify(c).includes(id));
  }
});
test('Gemini fault injection is explicit and contains no source, token or provider receipt',async()=>{
  await assert.rejects(injectedGeminiFailure(),e=>e instanceof GeminiFileSearchError&&e.reason==='GEMINI_REQUEST_TIMEOUT'&&e.diagnostics.durationMs===0);
});
test('probe is absent from production entrypoint, requires trusted staff and does not set persisted flags',()=>{
  const stage=readFileSync('cloudflare/worker/src/staging/advisor-app.ts','utf8'),prod=readFileSync('cloudflare/worker/src/index.ts','utf8');
  assert.match(stage,/await requireBetterAuthStaff\(request,shared\)/);
  assert.doesNotMatch(prod,/advisor-routing-probe|ai-advisor-routing|injectedGeminiFailure/);
  assert.doesNotMatch(readFileSync('cloudflare/worker/src/staging/advisor-routing-probe.ts','utf8'),/\.prepare\(|\.put\(|\.upload\(/);
});
test('real usability runner does not count HTTP success or expected word presence as content PASS',()=>{
  const runner=readFileSync('scripts/verify-advisor-word-usability.mjs','utf8');
  assert.match(runner,/AWAITING_CONTENT_REVIEW/);assert.match(runner,/CORPUS_CHANGED/);assert.match(runner,/STAGING_SOURCE_MISMATCH/);
  assert.match(runner,/sourceHashesUnchanged/);assert.doesNotMatch(runner,/verdict:'PASS'/);
  assert.doesNotMatch(runner,/\.items\.upload|--apply|--reindex|ocrPdf/);
});
