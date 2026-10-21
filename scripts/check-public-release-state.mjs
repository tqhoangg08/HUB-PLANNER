// Read-only pre/postflight; never applies migrations or deploys.
import {appendFileSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {isDeepStrictEqual} from 'node:util';
import {validateScholarshipReleaseSchema,SCHOLARSHIP_MIGRATIONS,SCHOLARSHIP_SCHEMA_QUERY} from './scholarship-release-schema.mjs';
const canonicalObservability=o=>({enabled:o?.enabled??false,head_sampling_rate:o?.head_sampling_rate??1,redact_query_string:o?.redact_query_string??false,
  logs:{enabled:o?.logs?.enabled??o?.enabled??false,head_sampling_rate:o?.logs?.head_sampling_rate??o?.head_sampling_rate??1,persist:o?.logs?.persist??true,invocation_logs:o?.logs?.invocation_logs??true},
  traces:{enabled:o?.traces?.enabled??false,head_sampling_rate:o?.traces?.head_sampling_rate??1,persist:o?.traces?.persist??true}});
export const PUBLIC_RELEASE_ACCOUNT='6cd8bac6009a55f96bdf9df7c2057548';
export const PUBLIC_RELEASE_DB='88d702e1-60d3-490a-8514-38ef881cf133';
// Reviewed release baseline: run 39565559132, exact SHA 379332840b540bc3a6e9eff7797f7f276409bb72.
// See docs/public-release-baseline-58c94fc8.json for GitHub receipts and independent live browser GET metadata.
export const PUBLIC_RELEASE_PREDEPLOY_VERSION='58c94fc8-5bfe-41e3-97f5-d0c39bc8be65';
// The already-serving limiter is required in BOTH phases of this code release.
export const SCHOLARSHIP_LIMITER=Object.freeze({name:'SCHOLARSHIP_SEARCH_RATE_LIMIT',namespace_id:'45871912',simple:Object.freeze({limit:60,period:60})});
// Text-first code release preserves the already deployed V2 100% baseline.
// Neither phase accepts an old 7% baseline or a dispatcher-selected percentage.
export const PUBLIC_V2_TRANSITION=Object.freeze({before:'100',after:'100',mode:'canary'});
const phasePercent=phase=>{
  if(!['predeploy','postdeploy'].includes(phase))throw Error('UNSUPPORTED_RELEASE_PHASE');
  return phase==='predeploy'?PUBLIC_V2_TRANSITION.before:PUBLIC_V2_TRANSITION.after;
};
const liveVariables=bindings=>{
  if(!Array.isArray(bindings)||new Set(bindings.map(b=>b.name)).size!==bindings.length)throw Error('LIVE_BINDING_METADATA_INVALID');
  return Object.fromEntries(bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
};
const offFlags={AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT:'0'};
function validateRolloutVariables(vars,phase){
  if(vars.AI_ADVISOR_V2_MODE!==PUBLIC_V2_TRANSITION.mode||vars.AI_ADVISOR_V2_CANARY_PERCENT!==phasePercent(phase))throw Error('AI_RELEASE_STATE_DRIFT');
  for(const [key,value]of Object.entries(offFlags)){
    if(vars[key]!==value)throw Error('INITIAL_DOCUMENT_POLICY_MUST_BE_OFF');
  }
}
export function validatePublicReleaseState(config,settings,schema,phase='predeploy') {
  const expectedPercent=phasePercent(phase);
  if(config.name!=='hub-planner-public-dev-api'||config.main!=='worker/src/index.ts')throw Error('PUBLIC_ONLY_CONFIG_REQUIRED');
  if(config.vars?.AI_ADVISOR_V2_MODE!==PUBLIC_V2_TRANSITION.mode||config.vars?.AI_ADVISOR_V2_CANARY_PERCENT!==PUBLIC_V2_TRANSITION.after
    ||Object.entries(offFlags).some(([key,value])=>config.vars?.[key]!==value))throw Error('APPROVED_V2_TARGET_REQUIRED');
  const live=settings.bindings,vars=liveVariables(live);
  const limiter=config.ratelimits?.filter(b=>b.name===SCHOLARSHIP_LIMITER.name);
  if(limiter?.length!==1||!isDeepStrictEqual(limiter[0],SCHOLARSHIP_LIMITER))throw Error('SCHOLARSHIP_BINDING_CONFIG_REQUIRED');
  validateRolloutVariables(vars,phase);
  for(const [key,value]of Object.entries(config.vars||{})) {
    if(vars[key]!==(key==='AI_ADVISOR_V2_CANARY_PERCENT'?expectedPercent:value))throw Error('LIVE_VARIABLE_DRIFT');
  }
  const expected=[...(config.d1_databases||[]).map(b=>[b.binding,'d1',b.database_id]),...(config.r2_buckets||[]).map(b=>[b.binding,'r2_bucket',b.bucket_name]),
    ...(config.services||[]).map(b=>[b.binding,'service',b.service]),...(config.queues?.producers||[]).map(b=>[b.binding,'queue',b.queue]),
    ...(config.workflows||[]).map(b=>[b.binding,'workflow',b.name]),...(config.ai_search_namespaces||[]).map(b=>[b.binding,'ai_search_namespace',b.namespace]),
    ...(config.ratelimits||[]).map(b=>[b.name,'ratelimit',b.namespace_id]),[config.assets.binding,'assets'],[config.ai.binding,'ai']];
  for(const [name,type,identity]of expected) {
    const b=live.find(b=>b.name===name&&b.type===type);
    if(!b||identity!==undefined&&![b.id,b.bucket_name,b.service,b.queue_name,b.workflow_name,b.namespace,b.namespace_id].includes(identity))throw Error('LIVE_BINDING_DRIFT');
    if(type==='ratelimit'&&!isDeepStrictEqual(b.simple,config.ratelimits.find(r=>r.name===name).simple))throw Error('LIVE_BINDING_DRIFT');
  }
  if(live.some(b=>!['plain_text','secret_text'].includes(b.type)&&!expected.some(([name])=>name===b.name)))throw Error('UNREVIEWED_LIVE_BINDING');
  if(!isDeepStrictEqual(canonicalObservability(settings.observability),canonicalObservability(config.observability)))throw Error('OBSERVABILITY_DRIFT_REQUIRES_REVIEW');
  if(!['ai_search_status','ai_search_revision','ocr_uncertain_tokens','gemini_indexing_status'].every(n=>schema.some(c=>c.name===n)))throw Error('0054_MIGRATION_APPROVAL_REQUIRED');
  return true;
}
export const TEXT_FIRST_MIGRATIONS=Object.freeze(['0055_ai_document_index_segment_count.sql','0056_ai_text_document_revisions.sql']);
const sqlIdentity=sql=>String(sql||'').replace(/\s/g,'').replace(/;$/,'');
/** Additive migrations must be explicitly applied and recorded before release.
 * No partial schema, missing guard, fabricated ledger or migration runner here. */
export function validateTextFirstReleaseSchema(schema,objects,ledger){
  const count=schema.filter(c=>c.name==='index_segment_count');
  if(count.length!==1||count[0].type!=='INTEGER'||count[0].notnull!==0||count[0].dflt_value!==null)
    throw Error('0055_SCHEMA_APPROVAL_REQUIRED');
  if(!Array.isArray(objects)||!Array.isArray(ledger)||TEXT_FIRST_MIGRATIONS.some(name=>ledger.filter(r=>r.name===name).length!==1))
    throw Error('TEXT_FIRST_MIGRATION_LEDGER_REQUIRED');
  const migration=readFileSync('cloudflare/migrations/0056_ai_text_document_revisions.sql','utf8');
  const specs=[['table','ai_text_documents',/CREATE TABLE ai_text_documents \([\s\S]*?\n\);/],
    ['table','ai_text_revisions',/CREATE TABLE ai_text_revisions \([\s\S]*?\n\);/],
    ['index','ai_text_revisions_document',/CREATE INDEX ai_text_revisions_document[^;]+;/],
    ['trigger','ai_text_publication_source_guard',/CREATE TRIGGER ai_text_publication_source_guard[\s\S]*?\nEND;/]];
  for(const [type,name,pattern]of specs){
    const expected=migration.match(pattern)?.[0],actual=objects.filter(o=>o.name===name&&o.type===type);
    if(!expected||actual.length!==1||sqlIdentity(actual[0].sql)!==sqlIdentity(expected))throw Error('0056_PUBLICATION_SCHEMA_DRIFT');
  }
  const table=objects.filter(o=>o.name==='ai_documents'&&o.type==='table');
  const check=readFileSync('cloudflare/migrations/0055_ai_document_index_segment_count.sql','utf8').split('ADD COLUMN ')[1];
  if(table.length!==1||!sqlIdentity(table[0].sql).includes(sqlIdentity(check)))throw Error('0055_SEGMENT_CHECK_DRIFT');
  return true;
}
export async function checkPublicReleaseState(config,{account,token,phase='predeploy',beforeVersion,fetchImpl=fetch}={}){
  phasePercent(phase);
  if(config.name!=='hub-planner-public-dev-api'||config.main!=='worker/src/index.ts'||account!==PUBLIC_RELEASE_ACCOUNT
    ||config.d1_databases?.length!==1||config.d1_databases[0].binding!=='DB'||config.d1_databases[0].database_id!==PUBLIC_RELEASE_DB
    ||config.d1_databases[0].database_name!=='hub-planner-public-dev')throw Error('PUBLIC_ONLY_TARGET_REQUIRED');
  if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token))throw Error('PUBLIC_SCOPED_CREDENTIAL_REQUIRED');
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if(phase==='postdeploy'&&beforeVersion!==PUBLIC_RELEASE_PREDEPLOY_VERSION)throw Error('PREDEPLOY_VERSION_REQUIRED');
  const cf=async(path,body)=>{
    let r,j;
    try{r=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`,{
      method:body?'POST':'GET',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});}
    catch{throw Error('READ_ONLY_STATE_UNAVAILABLE');}
    if(!r.ok)throw Error('READ_ONLY_STATE_HTTP_ERROR');
    try{j=await r.json();}catch{throw Error('READ_ONLY_STATE_MALFORMED');}
    if(j.success!==true||!j.result)throw Error('READ_ONLY_STATE_UNVERIFIED');
    return j.result;
  };
  const worker=`workers/scripts/${config.name}`;
  const settings=await cf(`${worker}/settings`);
  const [schema]=await cf(`d1/database/${PUBLIC_RELEASE_DB}/query`,{sql:'PRAGMA table_info(ai_documents)'});
  if(!Array.isArray(schema?.results)||schema.meta?.rows_written>0||schema.meta?.changed_db===true)throw Error('READ_ONLY_SCHEMA_UNVERIFIED');
  validatePublicReleaseState(config,settings,schema.results,phase);
  const [objects]=await cf(`d1/database/${PUBLIC_RELEASE_DB}/query`,{sql:"SELECT type,name,sql FROM sqlite_schema WHERE name IN ('ai_documents','ai_text_documents','ai_text_revisions','ai_text_revisions_document','ai_text_publication_source_guard')"});
  const [ledger]=await cf(`d1/database/${PUBLIC_RELEASE_DB}/query`,{sql:"SELECT name FROM d1_migrations WHERE name IN ('0055_ai_document_index_segment_count.sql','0056_ai_text_document_revisions.sql')"});
  for(const result of [objects,ledger])if(!Array.isArray(result?.results)||result.meta?.rows_written>0||result.meta?.changed_db===true)throw Error('READ_ONLY_SCHEMA_UNVERIFIED');
  validateTextFirstReleaseSchema(schema.results,objects.results,ledger.results);
  const [scholarshipObjects]=await cf(`d1/database/${PUBLIC_RELEASE_DB}/query`,{sql:SCHOLARSHIP_SCHEMA_QUERY});
  const [scholarshipLedger]=await cf(`d1/database/${PUBLIC_RELEASE_DB}/query`,{sql:`SELECT name FROM d1_migrations WHERE name IN (${SCHOLARSHIP_MIGRATIONS.map(n=>`'${n}'`).join(',')})`});
  for(const result of [scholarshipObjects,scholarshipLedger])if(!Array.isArray(result?.results)||result.meta?.rows_written>0||result.meta?.changed_db===true)throw Error('READ_ONLY_SCHEMA_UNVERIFIED');
  validateScholarshipReleaseSchema(scholarshipObjects.results,scholarshipLedger.results);
  const deployments=await cf(`${worker}/deployments`);
  if(!Array.isArray(deployments.deployments)||!deployments.deployments.length
    ||deployments.deployments.some(d=>!Number.isFinite(Date.parse(d.created_on))))throw Error('TRAFFIC_METADATA_UNVERIFIED');
  const current=[...deployments.deployments].sort((a,b)=>Date.parse(b.created_on)-Date.parse(a.created_on))[0];
  if(current.versions?.length!==1||current.versions[0].percentage!==100||!uuid.test(current.versions[0].version_id||''))throw Error('SINGLE_PUBLIC_VERSION_REQUIRED');
  const versionId=current.versions[0].version_id;
  if(phase==='predeploy'&&versionId!==PUBLIC_RELEASE_PREDEPLOY_VERSION)throw Error('UNREVIEWED_PREDEPLOY_VERSION');
  if(phase==='postdeploy'&&versionId===beforeVersion)throw Error('NEW_PUBLIC_VERSION_REQUIRED');
  const serving=await cf(`${worker}/versions/${versionId}`);
  if(serving.id!==versionId)throw Error('SERVING_VERSION_UNVERIFIED');
  // Settings can describe a latest upload while traffic still serves another
  // version. Check every configured variable/resource in the serving bindings.
  validatePublicReleaseState(config,{bindings:serving.resources?.bindings,observability:settings.observability},schema.results,phase);
  return {phase,versionId};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const args=process.argv.slice(2);
    if(args.length>1||args.length===1&&!['--predeploy','--postdeploy'].includes(args[0]))throw Error('UNSUPPORTED_RELEASE_ARGUMENT');
    const phase=args[0]==='--postdeploy'?'postdeploy':'predeploy';
    const parsed=ts.parseConfigFileTextToJson('cloudflare/wrangler.jsonc',readFileSync('cloudflare/wrangler.jsonc','utf8'));
    if(parsed.error)throw Error('CONFIG_PARSE_FAILED');
    const result=await checkPublicReleaseState(parsed.config,{phase,account:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN,beforeVersion:process.env.PUBLIC_RELEASE_VERSION_BEFORE});
    if(phase==='predeploy'&&process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`public_version_before=${result.versionId}\n`);
    console.log(`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=${phase}; PUBLIC_VERSION=${result.versionId}`);
  }catch(e){const reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:'PREFLIGHT_UNVERIFIED';console.error(`PUBLIC_LIVE_STATE_GATE=BLOCKED; REASON=${reason}; OWNER_REVIEW_REQUIRED`);process.exitCode=1;}
}
