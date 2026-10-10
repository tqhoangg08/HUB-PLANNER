// Provision only named PR88 resources. Never reads/copies production D1, secrets or R2.
import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
import {spawn,execFileSync} from 'node:child_process';
import dotenv from 'dotenv';
const NAME='hub-advisor-pr88-app-staging',DIR=resolve('.cache/advisor-app-staging'),STATE=resolve(DIR,'private-state.json');
const emit=v=>console.log(JSON.stringify(v));
async function cli(args,stdin){return new Promise((res,rej)=>{const c=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{stdio:['pipe','pipe','pipe'],env:{...process.env,XDG_CONFIG_HOME:resolve('.cache/cloudflare/xdg')}});let output='';c.stdout.on('data',b=>{output+=b});c.stderr.resume();c.on('close',code=>code===0?res(output):rej(Error('STAGING_WRANGLER_FAILED')));c.on('error',()=>rej(Error('STAGING_WRANGLER_FAILED')));c.stdin.end(stdin||'');});}
async function main(){
  const action=process.argv.includes('--create')?'create':process.argv.includes('--finish-create')?'finish-create':process.argv.includes('--prepare-context')?'prepare-context':process.argv.includes('--prepare-review')?'prepare-review':process.argv.includes('--deploy')?'deploy':null;if(!action)throw Error('ACTION_REQUIRED');
  mkdirSync(DIR,{recursive:true});
  const token=readFileSync('.cache/cloudflare/xdg/.wrangler/config/default.toml','utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if(!token)throw Error('AUTH_UNAVAILABLE');
  let account,state;
  const api=async(path,method='GET',body)=>{
    if(method!=='GET'&&!path.includes(NAME)&&!(path.endsWith('/d1/database')&&body?.name===NAME)&&!(path.endsWith('/r2/buckets')&&body?.name===NAME)
      &&!(path.endsWith('/namespaces/default/instances')&&body?.id===NAME)&&!(state?.db&&path.endsWith(`/d1/database/${state.db}/query`)))throw Error('PRODUCTION_WRITE_GUARD');
    const r=await fetch(`https://api.cloudflare.com/client/v4/${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
    const j=await r.json();if(!r.ok||!j.success)throw Error(`STAGING_HTTP_${r.status}`);return j.result;
  };
  const accounts=await api('accounts');if(accounts.length!==1)throw Error('ACCOUNT_AMBIGUOUS');account=accounts[0].id;
  if(action==='create'){
    if(existsSync(STATE))throw Error('STAGING_ALREADY_CREATED');
    const db=await api(`accounts/${account}/d1/database`,'POST',{name:NAME});
    state={name:NAME,account,db:db.uuid,secret:randomBytes(32).toString('hex'),email:`pr88-${randomUUID()}@example.invalid`,password:randomBytes(24).toString('base64url'),userId:randomUUID()};
    // Recoverable checkpoint before any subsequent action. Not inside commit set.
    writeFileSync(STATE,JSON.stringify(state));
    await api(`accounts/${account}/r2/buckets`,'POST',{name:NAME});
    await api(`accounts/${account}/ai-search/namespaces/default/instances`,'POST',{id:NAME,engine_version:3,embedding_model:'@cf/baai/bge-m3',chunk_size:512,chunk_overlap:10,public_endpoint_params:{enabled:false},
      custom_metadata:[{field_name:'document_id',data_type:'text'},{field_name:'category',data_type:'text'},{field_name:'visibility',data_type:'text'},{field_name:'revision',data_type:'text'},{field_name:'active',data_type:'boolean'}]});
    const selected=['0016_create_profile_shadow.sql','0032_ai_documents_chat_d1_r2_authority.sql','0034_policy_consents_d1_authority.sql','0043_ai_chat_conversations.sql','0044_ai_document_ocr_ingestion.sql','0045_ai_document_public_view_policy.sql','0049_ai_document_derived_index_identity.sql','0054_ai_document_search_ingestion_state.sql'];
    const sql=[...readdirSync('cloudflare/auth-production-schema').filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync(`cloudflare/auth-production-schema/${f}`,'utf8')),
      readFileSync('cloudflare/auth-production-migrations/0004_internal_accounts.sql','utf8'),...selected.map(f=>readFileSync(`cloudflare/migrations/${f}`,'utf8'))].join('\n');
    await api(`accounts/${account}/d1/database/${state.db}/query`,'POST',{sql});
  }else{state=JSON.parse(readFileSync(STATE,'utf8'));}
  if(action==='create'||action==='finish-create'){
    if(state.name!==NAME||state.account!==account||state.db==='88d702e1-60d3-490a-8514-38ef881cf133')throw Error('ISOLATION_FAILED');
    const now=Date.now(),hash=await hashPassword(state.password);
    for(const [sql,params]of [
      ["INSERT OR IGNORE INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES(?1,'PR88 synthetic test',?2,1,?3,?3)",[state.userId,state.email,now]],
      ["INSERT INTO auth_account(id,account_id,provider_id,user_id,password,created_at,updated_at) SELECT ?1,?2,'credential',?2,?3,?4,?4 WHERE NOT EXISTS(SELECT 1 FROM auth_account WHERE user_id=?2)",[randomUUID(),state.userId,hash,now]],
      ["INSERT OR IGNORE INTO app_user_roles(user_id,role,created_at,updated_at) VALUES(?1,'admin',?2,?2)",[state.userId,now]],
    ])await api(`accounts/${account}/d1/database/${state.db}/query`,'POST',{sql,params});
    const subdomain=await api(`accounts/${account}/workers/subdomain`);state.origin=`https://${NAME}.${subdomain.subdomain}.workers.dev`;
    writeFileSync(STATE,JSON.stringify(state));
    emit({phase:'staging_resources',d1Created:true,r2Created:true,privateIndexCreated:true,existingBetterAuthReused:true,productionChanged:false});
  }
  if(state.name!==NAME||state.account!==account||!state.origin||state.db==='88d702e1-60d3-490a-8514-38ef881cf133')throw Error('ISOLATION_FAILED');
  if(action==='prepare-review'){
    const live=await api(`accounts/${account}/d1/database/${state.db}`);if(live.name!==NAME)throw Error('ISOLATION_FAILED');
    const reviewConfig=resolve(DIR,'review-wrangler.json');
    writeFileSync(reviewConfig,JSON.stringify({name:NAME,account_id:account,d1_databases:[{binding:'DB',database_name:NAME,database_id:state.db}]}));
    await cli(['d1','execute',NAME,'--remote','--config',reviewConfig,'--file',resolve('staging/advisor/migrations/0001_ocr_review.sql'),'--yes']);
    const [tables]=await api(`accounts/${account}/d1/database/${state.db}/query`,'POST',{sql:"SELECT COUNT(*) AS tables FROM sqlite_master WHERE type='table' AND name IN ('staging_ocr_reviews','staging_ocr_review_history')"});
    if(tables.results[0].tables!==2)throw Error('ISOLATION_FAILED');
    emit({phase:'staging_review_schema',tables:2,productionChanged:false});return;
  }
  if(action==='prepare-context'||action==='create'){
    // Proven missing staging schema: ordinary "môn học" policy questions also
    // read the catalogue. Add EMPTY existing schema, never copy production data.
    const live=await api(`accounts/${account}/d1/database/${state.db}`);
    if(live.name!==NAME)throw Error('ISOLATION_FAILED');
    const [columns]=await api(`accounts/${account}/d1/database/${state.db}/query`,'POST',{sql:'PRAGMA table_info(course_schedules)'});
    if(!columns.results.length){
      const selected=['0001_create_school_announcements.sql','0002_create_course_schedules.sql','0003_reduce_read_amplification.sql','0018_add_course_authority_foundation.sql'];
      // D1 REST query cannot execute this compound trigger script (actual
      // SQLITE_ERROR incomplete input). Wrangler's SQL file import can.
      const sqlPath=resolve(DIR,'context-schema-private.sql'),contextConfig=resolve(DIR,'context-wrangler.json');
      writeFileSync(sqlPath,selected.map(f=>readFileSync(`cloudflare/migrations/${f}`,'utf8')).join('\n'));
      writeFileSync(contextConfig,JSON.stringify({name:NAME,account_id:account,d1_databases:[{binding:'DB',database_name:NAME,database_id:state.db}]}));
      await cli(['d1','execute',NAME,'--remote','--config',contextConfig,'--file',sqlPath,'--yes']);
    }else if(!['catalogue_visibility','retired_at'].every(n=>columns.results.some(c=>c.name===n)))throw Error('PARTIAL_CONTEXT_SCHEMA_STOP');
    const [count]=await api(`accounts/${account}/d1/database/${state.db}/query`,'POST',{sql:'SELECT COUNT(*) AS rows FROM course_schedules'});
    emit({phase:'staging_context_schema',result:'PASS',catalogueRows:count.results[0].rows,productionChanged:false});if(action==='prepare-context')return;
  }
  const config={name:NAME,main:resolve('cloudflare/worker/src/staging/advisor-app.ts'),account_id:account,compatibility_date:'2026-10-10',compatibility_flags:['nodejs_compat'],workers_dev:true,routes:[],
    assets:{directory:resolve('.cache/advisor-staging-assets'),binding:'ASSETS',not_found_handling:'single-page-application',run_worker_first:['/api/*','/health']},
    vars:{STAGING_ORIGIN:state.origin,STAGING_SYNTHETIC_EMAIL:state.email,STAGING_OCR_PROMOTION_ENABLED:'false',STAGING_SOURCE_COMMIT:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()},
    d1_databases:[{binding:'DB',database_name:NAME,database_id:state.db},{binding:'AUTH_DB',database_name:NAME,database_id:state.db}],
    r2_buckets:[{binding:'AI_DOCUMENTS_BUCKET',bucket_name:NAME}],ai:{binding:'AI'},ai_search:[{binding:'STAGING_AI_SEARCH',instance_name:NAME}],
    observability:{enabled:false},triggers:{crons:[]}};
  const configPath=resolve(DIR,'wrangler.json');writeFileSync(configPath,JSON.stringify(config));
  if(action==='deploy'){
    await cli(['deploy','--config',configPath]);
    await cli(['secret','put','AUTH_BETTER_AUTH_SECRET','--config',configPath],state.secret);
    dotenv.config({path:'.env.local',quiet:true});dotenv.config({quiet:true});
    const geminiState=JSON.parse(readFileSync('C:/Users/tqhoa/AppData/Local/Temp/hub-advisor-pr88-ocr-cells-final/gemini-staging-state.json','utf8'));
    if(geminiState.label!=='hub-pr88-ocr-isolated-staging'||geminiState.store===process.env.GEMINI_FILE_SEARCH_STORE)throw Error('ISOLATION_FAILED');
    if(process.env.GEMINI_FILE_SEARCH_API_KEY){await cli(['secret','put','GEMINI_FILE_SEARCH_API_KEY','--config',configPath],process.env.GEMINI_FILE_SEARCH_API_KEY);await cli(['secret','put','GEMINI_FILE_SEARCH_STORE','--config',configPath],geminiState.store);}
    const r=await fetch(`${state.origin}/health`);emit({phase:'staging_app_deploy',httpStatus:r.status,productionChanged:false,authWorkerDeployed:false,credentialsPrinted:false});
  }
}
main().catch(e=>{emit({phase:'staging_setup',result:'BLOCKED',reason:/^STAGING_HTTP_\d+$/.test(e.message)?e.message:['ACTION_REQUIRED','AUTH_UNAVAILABLE','STAGING_ALREADY_CREATED','ACCOUNT_AMBIGUOUS','PRODUCTION_WRITE_GUARD','ISOLATION_FAILED','STAGING_WRANGLER_FAILED'].includes(e.message)?e.message:e.name});process.exitCode=1;});
