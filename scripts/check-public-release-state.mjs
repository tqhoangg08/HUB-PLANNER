// Read-only preflight; never applies migrations or deploys.
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {isDeepStrictEqual} from 'node:util';
const canonicalObservability=o=>({enabled:o?.enabled??false,head_sampling_rate:o?.head_sampling_rate??1,redact_query_string:o?.redact_query_string??false,
  logs:{enabled:o?.logs?.enabled??o?.enabled??false,head_sampling_rate:o?.logs?.head_sampling_rate??o?.head_sampling_rate??1,persist:o?.logs?.persist??true,invocation_logs:o?.logs?.invocation_logs??true},
  traces:{enabled:o?.traces?.enabled??false,head_sampling_rate:o?.traces?.head_sampling_rate??1,persist:o?.traces?.persist??true}});
export function validatePublicReleaseState(config,settings,schema) {
  if(config.name!=='hub-planner-public-dev-api'||config.main!=='worker/src/index.ts')throw Error('PUBLIC_ONLY_CONFIG_REQUIRED');
  const live=settings.bindings||[],vars=Object.fromEntries(live.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
  for(const [key,value]of Object.entries(config.vars||{})) {
    if(key==='AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED'&&!vars[key]&&value==='false')continue;
    if(vars[key]!==value)throw Error('LIVE_VARIABLE_DRIFT');
  }
  if(vars.AI_ADVISOR_V2_MODE!=='canary'||vars.AI_ADVISOR_V2_CANARY_PERCENT!=='7'||!['false',undefined].includes(vars.AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED))throw Error('AI_RELEASE_STATE_DRIFT');
  const expected=[...(config.d1_databases||[]).map(b=>[b.binding,'d1',b.database_id]),...(config.r2_buckets||[]).map(b=>[b.binding,'r2_bucket',b.bucket_name]),
    ...(config.services||[]).map(b=>[b.binding,'service',b.service]),...(config.queues?.producers||[]).map(b=>[b.binding,'queue',b.queue]),
    ...(config.workflows||[]).map(b=>[b.binding,'workflow',b.name]),...(config.ai_search_namespaces||[]).map(b=>[b.binding,'ai_search_namespace',b.namespace]),
    ...(config.ratelimits||[]).map(b=>[b.name,'ratelimit',b.namespace_id]),[config.assets.binding,'assets'],[config.ai.binding,'ai']];
  for(const [name,type,identity]of expected) {
    const b=live.find(b=>b.name===name&&b.type===type);
    if(!b||identity!==undefined&&![b.id,b.bucket_name,b.service,b.queue_name,b.workflow_name,b.namespace,b.namespace_id].includes(identity))throw Error('LIVE_BINDING_DRIFT');
  }
  if(live.some(b=>!['plain_text','secret_text'].includes(b.type)&&!expected.some(([name])=>name===b.name)))throw Error('UNREVIEWED_LIVE_BINDING');
  if(!isDeepStrictEqual(canonicalObservability(settings.observability),canonicalObservability(config.observability)))throw Error('OBSERVABILITY_DRIFT_REQUIRES_REVIEW');
  if(!['ai_search_status','ai_search_revision','ocr_uncertain_tokens','gemini_indexing_status'].every(n=>schema.some(c=>c.name===n)))throw Error('0054_MIGRATION_APPROVAL_REQUIRED');
  return true;
}
if(process.argv[1]?.endsWith('check-public-release-state.mjs')) {
  try {
    const parsed=ts.parseConfigFileTextToJson('cloudflare/wrangler.jsonc',readFileSync('cloudflare/wrangler.jsonc','utf8'));
    if(parsed.error)throw Error('CONFIG_PARSE_FAILED');
    const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
    if(!account||!token)throw Error('PUBLIC_SCOPED_CREDENTIAL_REQUIRED');
    const cf=async(path,body)=>{const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok||!j.success)throw Error('READ_ONLY_PREFLIGHT_FAILED');return j.result;};
    const settings=await cf(`workers/scripts/${parsed.config.name}/settings`);
    const [schema]=await cf(`d1/database/${parsed.config.d1_databases[0].database_id}/query`,{sql:'PRAGMA table_info(ai_documents)'});
    validatePublicReleaseState(parsed.config,settings,schema.results);
    console.log('PUBLIC_LIVE_STATE_GATE=PASS');
  }catch(e){const reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:'PREFLIGHT_UNVERIFIED';console.error(`PUBLIC_LIVE_STATE_GATE=BLOCKED; REASON=${reason}; OWNER_REVIEW_REQUIRED`);process.exitCode=1;}
}
