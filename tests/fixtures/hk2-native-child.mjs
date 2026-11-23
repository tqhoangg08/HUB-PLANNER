/** Local-only native D1. No Wrangler, credentials, remote binding or owner API. */
import {Miniflare} from 'miniflare';
import {nativeRequestHandler} from '../../scripts/hk2-2026-2027/publication-native-worker.mjs';
let mf;
const fault=process.env.HK2_NATIVE_TEST_FAULT;
const boot=(async()=>{
  mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("local fixture")}}',compatibilityDate:'2026-07-29',
    d1Databases:{DB:'native-publication-fixture'},d1Persist:process.env.HK2_NATIVE_TEST_STATE});
  const db=await mf.getD1Database('DB');
  await db.prepare("CREATE TABLE IF NOT EXISTS hk2_catalogue_publications(semester TEXT PRIMARY KEY,state TEXT,revision INTEGER,receipt_id TEXT CHECK(receipt_id IS NOT 'reject'))").run();
  await db.prepare('CREATE TABLE IF NOT EXISTS hk2_catalogue_publication_receipts(id TEXT PRIMARY KEY,note TEXT)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS course_schedules(id TEXT PRIMARY KEY,semester TEXT)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS user_schedules(id TEXT PRIMARY KEY,note TEXT)').run();
  await db.prepare("INSERT OR IGNORE INTO hk2_catalogue_publications VALUES('HK2_2026_2027','CLOSED',0,NULL)").run();
  await db.prepare("INSERT OR IGNORE INTO course_schedules VALUES('hk1','HK1_2026_2027')").run();
  await db.prepare("INSERT OR IGNORE INTO user_schedules VALUES('kept','personal unchanged')").run();
  const primary={prepare:sql=>{
    const s=db.prepare(sql);const wrap=raw=>({bind:(...v)=>wrap(raw.bind(...v)),first:(...a)=>raw.first(...a),all:async()=>{const r=await raw.all();return {...r,meta:{...r.meta,served_by_primary:true}};}});return wrap(s);
  },batch:list=>db.batch(list)};
  // db.batch expects native statements. all() only needs synthetic primary metadata.
  const direct={prepare:sql=>db.prepare(sql),batch:list=>db.batch(list)};
  const handler=nativeRequestHandler(direct,process.argv[2]==='publication');
  return async message=>{
    if(message.kind==='all'&&message.statements[0].sql.includes('publication_connection_health'))return primary.prepare(message.statements[0].sql).all();
    return handler(message);
  };
})();
process.on('message',async message=>{
  if(message.kind==='close'){await mf?.dispose();process.send({closed:true});process.disconnect();return;}
  if(fault==='hang')return;
  if(fault==='exit'){process.exit(19);}
  try{
    const result=await (await boot)(message);
    if(fault==='lost-ack'&&message.kind==='batch'&&message.statements.some(s=>s.sql.startsWith('INSERT'))){await mf.dispose();process.exit(23);}
    process.send({id:message.id,result});
  }catch(e){process.send({id:message.id,error:e.message});}
});
process.on('disconnect',()=>{void mf?.dispose().finally(()=>process.exit(0));});
