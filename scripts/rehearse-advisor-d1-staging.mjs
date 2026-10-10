// Explicit isolated D1 writes only. Original app DB is READ-ONLY (export/query).
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
const emit=v=>console.log(JSON.stringify(v));
export const assertRehearsalTarget=(db,name,appDb)=>{
  if(!/^hub-pr88-0054-rehearsal-[a-f0-9-]+$/.test(name)||!db||[appDb,'88d702e1-60d3-490a-8514-38ef881cf133'].includes(db))throw Error('STAGING_WRITE_GUARD');
};
async function main(){
  if(!process.argv.includes('--rehearse'))throw Error('EXPLICIT_STAGING_REHEARSAL_REQUIRED');
  const at=process.argv.indexOf('--output-dir');if(at<0)throw Error('PRIVATE_OUTPUT_REQUIRED');
  const dir=resolve(process.argv[at+1]),rel=relative(process.cwd(),dir);if(!rel.startsWith('..')&&!isAbsolute(rel))throw Error('OUTSIDE_GIT_REQUIRED');mkdirSync(dir,{recursive:true});
  const app=JSON.parse(readFileSync('.cache/advisor-app-staging/private-state.json'));
  if(app.name!=='hub-advisor-pr88-app-staging'||app.db==='88d702e1-60d3-490a-8514-38ef881cf133')throw Error('ISOLATION_FAILED');
  const token=readFileSync('.cache/cloudflare/xdg/.wrangler/config/default.toml','utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  const cf=async(p,body)=>{const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${app.account}/${p}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const j=await r.json();if(!r.ok||!j.success)throw Error(`STAGING_HTTP_${r.status}`);return j.result;};
  const owned=new Map();
  const create=async()=>{const name=`hub-pr88-0054-rehearsal-${randomUUID()}`;const db=await cf('d1/database',{name});owned.set(db.uuid,name);writeFileSync(resolve(dir,`${name}.json`),JSON.stringify({name,db:db.uuid}));return db.uuid;};
  const verify=async db=>{const name=owned.get(db);assertRehearsalTarget(db,name,app.db);const live=await cf(`d1/database/${db}`);if(live.name!==name)throw Error('STAGING_NAME_MISMATCH');};
  const query=async(db,sql)=>{if(db!==app.db)await verify(db);else if(!/^(SELECT|PRAGMA)\b/i.test(sql)||sql.includes(';'))throw Error('APP_READ_ONLY_GUARD');return cf(`d1/database/${db}/query`,{sql});};
  const config=db=>{const name=db===app.db?app.name:owned.get(db);const p=resolve(dir,`${name}-wrangler.json`);writeFileSync(p,JSON.stringify({name,account_id:app.account,d1_databases:[{binding:'DB',database_name:name,database_id:db,migrations_dir:resolve(dir,'only-0054')}]}));return p;};
  const cli=(args,stdin='')=>new Promise((res,rej)=>{const p=spawn(process.execPath,['scripts/run-wrangler.mjs',...args],{stdio:['pipe','pipe','pipe']});let s='';p.stdout.on('data',b=>s+=b);p.stderr.resume();p.on('error',()=>rej(Error('STAGING_CLI_FAILED')));p.on('close',c=>c?rej(Error('STAGING_CLI_FAILED')):res(s));p.stdin.end(stdin);});
  const digest=async db=>{const[tables]=await query(db,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name");const hashes=[];for(const {name}of tables.results){if(!/^[a-z0-9_]+$/i.test(name))throw Error('TABLE_NAME_GUARD');const[rows]=await query(db,`SELECT * FROM ${name} ORDER BY rowid`);hashes.push([name,rows.results.length,createHash('sha256').update(JSON.stringify(rows.results)).digest('hex')]);}return hashes;};
  const before=await digest(app.db),backup=resolve(dir,'app-staging-backup-private.sql');
  let restore,db;
  if(process.argv.includes('--resume-migration')){
    const saved=JSON.parse(readFileSync(resolve(dir,'targets-private.json')));restore=saved.restore;db=saved.db;
    for(const id of[restore,db])owned.set(id,saved.names[id]);
    await verify(restore);await verify(db);
  }else{
    await cli(['d1','export',app.name,'--remote','--config',config(app.db),'--output',backup,'--skip-confirmation']);
    restore=await create();await verify(restore);
    await cli(['d1','execute',owned.get(restore),'--remote','--config',config(restore),'--file',backup,'--yes']);
    const restored=await digest(restore);
    if(JSON.stringify(before)!==JSON.stringify(restored))throw Error('FULL_BACKUP_RESTORE_DIGEST_MISMATCH');
    emit({phase:'staging_full_backup_restore',result:'PASS',tables:before.length,allRowDigestsMatch:true,backupBytes:readFileSync(backup).length,productionWrites:0});
    db=await create();writeFileSync(resolve(dir,'targets-private.json'),JSON.stringify({restore,db,names:Object.fromEntries(owned)}));
    const selected=['0032_ai_documents_chat_d1_r2_authority','0043_ai_chat_conversations','0044_ai_document_ocr_ingestion','0045_ai_document_public_view_policy','0049_ai_document_derived_index_identity'];
    await query(db,selected.map(n=>readFileSync(`cloudflare/migrations/${n}.sql`,'utf8')).join('\n'));
  }
  const[preColumns]=await query(db,'PRAGMA table_info(ai_documents)');
  if(preColumns.results.some(c=>c.name==='ai_search_status'))throw Error('REHEARSAL_ALREADY_MIGRATED_STOP');
  await query(db,`INSERT OR IGNORE INTO ai_documents(id,title,original_file_name,storage_path,mime_type,file_size,content_hash,category,visibility,indexing_status,uploaded_by,created_at,updated_at)
    VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Fixture','fixture.pdf','ai-documents/fixture1.pdf','application/pdf',1,'${'a'.repeat(64)}','general','public','completed','11111111-1111-4111-8111-111111111111','date','date'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Fixture','fixture.pdf','ai-documents/fixture2.pdf','application/pdf',1,'${'b'.repeat(64)}','general','admin','deleted','11111111-1111-4111-8111-111111111111','date','date')`);
  const pre=await digest(db),dbConfig=config(db);
  const info=JSON.parse(await cli(['d1','time-travel','info',owned.get(db),'--config',dbConfig,'--json']));
  const bookmark=info.bookmark;if(!bookmark)throw Error('TIME_TRAVEL_BOOKMARK_UNAVAILABLE');
  mkdirSync(resolve(dir,'only-0054'),{recursive:true});
  writeFileSync(resolve(dir,'only-0054','0054_ai_document_search_ingestion_state.sql'),readFileSync('cloudflare/migrations/0054_ai_document_search_ingestion_state.sql'));
  await verify(db);await cli(['d1','migrations','apply',owned.get(db),'--remote','--config',dbConfig],'y\n');
  const[columns]=await query(db,"PRAGMA table_info(ai_documents)");
  const[legacy]=await query(db,"SELECT id,indexing_status,content_hash,ai_search_status,ai_search_revision,ocr_uncertain_tokens,gemini_indexing_status FROM ai_documents ORDER BY id");
  const[ledger]=await query(db,"SELECT name FROM d1_migrations");
  if(columns.results.length!== (await query(restore,"PRAGMA table_info(ai_documents)"))[0].results.length||!legacy.results.every(r=>r.ai_search_status==='not_prepared'&&r.ai_search_revision===null&&r.ocr_uncertain_tokens===0)||ledger.results.length!==1||ledger.results[0].name!=='0054_ai_document_search_ingestion_state.sql')throw Error('MIGRATION_COMPATIBILITY_FAILED');
  emit({phase:'remote_0054_only_migration',result:'PASS',ledgerEntries:1,legacyRowsPreserved:true,defaultsVerified:true,productionWrites:0});
  // Destructive restore is authorized ONLY for this fresh isolated rehearsal DB.
  await verify(db);await cli(['d1','time-travel','restore',owned.get(db),'--config',dbConfig,'--bookmark',bookmark,'--json'],'y\n');
  const after=await digest(db);if(JSON.stringify(pre)!==JSON.stringify(after))throw Error('TIME_TRAVEL_RESTORE_DIGEST_MISMATCH');
  emit({phase:'remote_time_travel_restore',result:'PASS',schemaAndAllRowsRestored:true,originalAppDbChanged:false,productionWrites:0});
  writeFileSync(resolve(dir,'rehearsal-counts.json'),JSON.stringify({fullBackupRestore:'PASS',migration0054:'PASS',timeTravelRestore:'PASS',tables:before.length}));
}
if(process.argv[1]?.endsWith('rehearse-advisor-d1-staging.mjs'))main().catch(e=>{emit({phase:'d1_staging_rehearsal',result:'BLOCKED',safeError:/^[A-Z_0-9]+$/.test(e.message)?e.message:e.name,productionWrites:0});process.exitCode=1;});
