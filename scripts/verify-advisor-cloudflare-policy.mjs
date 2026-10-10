// Real UI/provider acceptance on the existing five-file isolated Word catalog.
// No source upload, migration, indexing, production binding or flag writes.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {WORD_USABILITY_CASES} from './verify-advisor-word-usability.mjs';
import {normalizeAcceptanceText as norm} from '../shared/ai-advisor-acceptance-text.ts';
import {sanitizeAIReply} from '../utils/aiSafety.ts';
const emit=x=>console.log(JSON.stringify(x));
const DIR=resolve('.cache/advisor-word-staging');
const option=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:null;
async function main(){
  const s=JSON.parse(readFileSync(resolve(DIR,'private-state.json'))),expected=option('--expected-source'),profile=option('--profile');
  if(s.name!=='hub-advisor-pr88-word-staging'||!/^https:\/\/hub-advisor-pr88-word-staging\.[a-z0-9-]+\.workers\.dev$/.test(s.origin))throw Error('ISOLATION_FAILED');
  if(!/^[a-f0-9]{40}$/.test(expected||'')||!['policy-selected','policy-unselected','controls'].includes(profile))throw Error('INVALID_TEST_PROFILE');
  const out=resolve(DIR,'cloudflare-policy',profile);mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1365,height:900}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.name));
    const health=await(await context.request.get(`${s.origin}/health`)).json();if(health.sourceCommit!==expected)throw Error('STAGING_SOURCE_MISMATCH');
    await page.goto(s.origin);await page.getByLabel('Email kiểm thử').fill(s.email);await page.getByLabel('Mật khẩu kiểm thử').fill(s.password);
    await page.getByRole('button',{name:'Đăng nhập staging',exact:true}).click();await page.getByRole('heading',{name:'Kho tài liệu AI'}).waitFor({timeout:30000});
    const readDocs=async()=>{const j=await(await context.request.get(`${s.origin}/api/admin/v1/ai-documents`)).json();return j.documents||j.data||[];};
    const docs=await readDocs(),sources=JSON.parse(readFileSync(resolve(DIR,'source-inspection-private.json')));
    if(docs.length!==5||docs.some(d=>!sources.some(x=>x.sourceHash===d.content_hash)))throw Error('CORPUS_CHANGED');
    const old=JSON.parse(readFileSync(resolve(DIR,'acceptance-private.json')));
    if(old.length!==10)throw Error('ACCEPTANCE_CHANGED');
    const cases=profile==='controls'?[
      {profile:'policy-completeness-off',q:old[0].question,facts:old[0].contains,topics:['conduct']},
      {profile:'policy-gemini-error',q:old[0].question,facts:old[0].contains,topics:['conduct']},
      {profile:'policy-cloudflare-error',q:old[0].question,insufficient:true,providerError:true},
      {profile:'policy-workers-error',q:WORD_USABILITY_CASES[19].q,insufficient:true,providerError:true},
      ...['Tôi được bao nhiêu điểm ĐRL kỳ này?','Tôi đã tích lũy bao nhiêu tín chỉ?','GPA của tôi hiện tại bao nhiêu?','Lịch học của mình','IT101 có mấy tín chỉ?'].map(q=>({profile:'policy-unselected',q,nonDocument:true})),
    ]:[...WORD_USABILITY_CASES,...old.map(c=>({q:c.question,facts:c.contains,topics:[c.topic],locators:c.locators,old:true}))];
    await page.locator('button.fixed.bottom-6').click();const consent=page.getByRole('button',{name:'Tôi đồng ý',exact:true});if(await consent.count())await consent.click();
    let active=profile;
    await page.route(`${s.origin}/api/private/v1/ai-advisor`,route=>route.request().method()==='POST'
      ?route.continue({url:`${s.origin}/api/staging/ai-advisor-routing?profile=${active}`}):route.continue());
    for(const [i,c]of cases.entries()){
      if(i)await page.getByRole('button',{name:'Cuộc trò chuyện mới',exact:true}).click();active=c.profile||profile;
      const started=Date.now(),response=page.waitForResponse(r=>r.request().method()==='POST'&&(r.url()===`${s.origin}/api/private/v1/ai-advisor`||r.url().includes(`/api/staging/ai-advisor-routing?profile=${active}`)),{timeout:90000});
      const input=page.getByPlaceholder('Nhập câu hỏi tại đây...');await input.fill(c.q);await input.press('Enter');
      const r=await response,payload=await r.json(),anchor=norm(sanitizeAIReply(payload.reply||'')).replace(/[|*#_`>]/g,'').trim().slice(0,45);
      if(anchor)await page.waitForFunction(value=>[...document.querySelectorAll('.ai-message-markdown')].some(el=>el.textContent.normalize('NFC').toLowerCase().replace(/[|*#_`>]/g,'').replace(/\s+/g,' ').trim().includes(value)),anchor,{timeout:15000});
      const visibleReply=await page.locator('.ai-message-markdown').last().innerText(),citations=payload.documentSources||[],metrics=payload.stagingMetrics;
      writeFileSync(resolve(out,`case-${i+1}-private.json`),JSON.stringify({expectation:c,payload,visibleReply}));
      const expectedIds=(c.topics||[]).map(t=>docs.find(d=>d.content_hash===sources.find(x=>x.topic===t)?.sourceHash)?.id);
      const technicalRefusal=visibleReply.includes('thông tin kỹ thuật hoặc bảo mật'),metadataVisible=/word_unit|uncertain_tokens|<!--/.test(visibleReply);
      const allSourcesAuthorized=citations.every(x=>docs.some(d=>d.id===x.documentId)),noFakeWordPages=citations.every(x=>!x.pageNumber&&!x.pageNumbers?.length);
      const checks={expectedFacts:(c.facts||[]).every(f=>norm(visibleReply).includes(norm(f))),
        expectedSources:c.insufficient||c.nonDocument?citations.length===0:expectedIds.every(id=>citations.some(x=>x.documentId===id)),
        locators:(c.locators||[]).every(l=>citations.some(x=>(x.locators||[]).some(v=>norm(v).includes(norm(l))))),
        noGemini:metrics?.releaseMetrics?.gemini_calls===0,noGeneralForDocuments:c.nonDocument||metrics?.releaseMetrics?.general_ai_calls===0,
        bounded:metrics?.searchCalls<=3&&metrics?.pageReads<=3&&metrics?.generatorCalls<=1,
        unchangedPersonalRouting:!c.nonDocument||(metrics?.searchCalls===0&&metrics?.pageReads===0&&metrics?.generatorCalls===0),
        policyObserved:c.nonDocument||metrics?.releaseMetrics?.document_provider_policy==='cloudflare_first',
        safeRefusal:!c.insufficient||/chưa|không có dữ liệu|không thể/i.test(visibleReply)&&citations.length===0};
      emit({phase:'cloudflare_policy_ui',profile:active,case:i+1,sourceCommit:expected,http:r.status(),durationMs:Date.now()-started,
        expectedAnswer:c.nonDocument?'NON_DOCUMENT':c.insufficient?'INSUFFICIENT_SOURCE':'ANSWERABLE',...checks,allSourcesAuthorized,noFakeWordPages,technicalRefusal,metadataVisible,pageErrors:errors.length,metrics,
        verdict:'AWAITING_CONTENT_REVIEW'});
      await page.screenshot({path:resolve(out,`case-${i+1}.png`)});
      if(r.status()!==200||technicalRefusal||metadataVisible||!allSourcesAuthorized||!noFakeWordPages||Object.values(checks).some(x=>!x))throw Error('UI_CONTROL_FAILED');
    }
    await page.setViewportSize({width:390,height:844});
    emit({phase:'cloudflare_policy_layout',profile,mobile390:true,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),pageErrors:errors.length});
    await page.screenshot({path:resolve(out,'mobile390.png')});
    const after=await readDocs();const unchanged=after.length===5&&docs.every(d=>after.some(a=>a.id===d.id&&a.content_hash===d.content_hash&&a.ai_search_revision===d.ai_search_revision));
    emit({phase:'cloudflare_policy_inventory',profile,documents:after.length,sourceHashesAndRevisionsUnchanged:unchanged,productionChanged:false});if(!unchanged)throw Error('CORPUS_CHANGED');
  }finally{await browser.close();}
}
main().catch(e=>{emit({phase:'cloudflare_policy',result:'BLOCKED',errorClass:e.name,safeReason:['ISOLATION_FAILED','INVALID_TEST_PROFILE','STAGING_SOURCE_MISMATCH','CORPUS_CHANGED','ACCEPTANCE_CHANGED','UI_CONTROL_FAILED'].includes(e.message)?e.message:null});process.exitCode=1;});
