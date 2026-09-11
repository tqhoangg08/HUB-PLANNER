// Operator parity audit; --reconcile-flags repairs at most 20 old is_new flags.
// Never writes source rows or credentials, and never changes push-eligible rows.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parse} from 'dotenv';
const env={};
for(const path of ['.env','.env.local']) {try{Object.assign(env,parse(readFileSync(path)));}catch{}}
Object.assign(env,process.env);
const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL;
const key=env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('SOURCE_CONFIG_MISSING');
const fields='id,title,link,date,is_new,created_at,is_hidden';
const source=[];
let cursor=0;
for(let page=0;page<100;page++){
 const target=new URL('/rest/v1/school_announcements',url);
 target.search=new URLSearchParams({select:fields,id:`gt.${cursor}`,order:'id.asc',limit:'500'}).toString();
 const res=await fetch(target,{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw new Error(`SOURCE_READ_${res.status}`);
 const rows=await res.json();source.push(...rows);
 if(rows.length<500)break;cursor=rows.at(-1).id;
 if(page===99)throw new Error('PARITY_BOUND_EXCEEDED');
}
const d1=[];cursor=0;
for(let page=0;page<100;page++){
 const out=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','hub-planner-public-dev','--remote','--config','cloudflare/wrangler.jsonc','--json','--command',`SELECT ${fields} FROM school_announcements WHERE id>${Number(cursor)} ORDER BY id LIMIT 500`],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const rows=JSON.parse(out.slice(out.indexOf('[')))[0].results;d1.push(...rows);
 if(rows.length<500)break;cursor=rows.at(-1).id;
 if(page===99)throw new Error('PARITY_BOUND_EXCEEDED');
}
const normalize=r=>[r.id,r.title,r.link,r.date,Boolean(r.is_new),r.created_at?new Date(r.created_at).toISOString():null,Boolean(r.is_hidden)];
const hash=rows=>createHash('sha256').update(JSON.stringify(rows.map(normalize))).digest('hex');
const byId=new Map(d1.map(r=>[r.id,JSON.stringify(normalize(r))]));
const mismatches=source.filter(r=>byId.get(r.id)!==JSON.stringify(normalize(r))).length;
const fieldNames=fields.split(',');
const mismatchFields={};
const d1ById=new Map(d1.map(r=>[r.id,r]));
for(const row of source){
 const other=d1ById.get(row.id);if(!other)continue;
 const a=normalize(row),b=normalize(other);
 a.forEach((value,index)=>{if(value!==b[index])mismatchFields[fieldNames[index]]=(mismatchFields[fieldNames[index]]||0)+1;});
}
console.log(JSON.stringify({sourceRows:source.length,d1Rows:d1.length,mismatches,
 mismatchFields,hashMatch:hash(source)===hash(d1),sourceNewest:source.map(r=>r.date).sort().at(-1),d1Newest:d1.map(r=>r.date).sort().at(-1)}));
if(mismatches && process.argv.includes('--reconcile-flags')) {
 if(Object.keys(mismatchFields).some(k=>k!=='is_new') || mismatches>20 || source.length!==d1.length)
   throw new Error('PARITY_REPAIR_OUTSIDE_BOUND');
 const changed=source.filter(r=>byId.get(r.id)!==JSON.stringify(normalize(r)));
 if(changed.some(r=>Date.parse(r.created_at)>Date.now()-2*3600000))throw new Error('PARITY_REPAIR_PUSH_FRESHNESS_GUARD');
 const ids=changed.map(r=>Number(r.id));
 if(ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw new Error('INVALID_ID');
 const sql=changed.map(r=>`UPDATE school_announcements SET is_new=${r.is_new?1:0} WHERE id=${Number(r.id)} AND is_new=${d1ById.get(r.id).is_new?1:0};`).join('\n');
 execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','hub-planner-public-dev','--remote','--config','cloudflare/wrangler.jsonc','--json','--command',sql],{stdio:['ignore','pipe','pipe']});
 const out=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','hub-planner-public-dev','--remote','--config','cloudflare/wrangler.jsonc','--json','--command',`SELECT ${fields} FROM school_announcements WHERE id IN (${ids.join(',')})`],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const verified=JSON.parse(out.slice(out.indexOf('[')))[0].results;
 for(const row of verified)d1ById.set(row.id,row);
 const pass=hash(source)===hash([...d1ById.values()].sort((a,b)=>a.id-b.id));
 console.log(JSON.stringify({reconciledFlags:verified.length,parityHashMatch:pass}));
 if(!pass)throw new Error('PARITY_VERIFY_FAILED');
} else if(mismatches)process.exitCode=1;
