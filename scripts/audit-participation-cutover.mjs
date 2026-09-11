// Read-only, bounded parity audit. Never prints owner identifiers or row data.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parse} from 'dotenv';
const env={};
for(const file of ['.env','.env.local']) {try{Object.assign(env,parse(readFileSync(file)));}catch{}}
Object.assign(env,process.env);
const base=env.SUPABASE_URL||env.VITE_SUPABASE_URL, key=env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!key)throw new Error('SOURCE_CONFIG_MISSING');
const source=[];
for(let page=0;page<50;page++){
 const url=new URL('/rest/v1/user_participations',base);
 url.search=new URLSearchParams({select:'id,user_id,event_id,created_at',order:'id.asc',limit:'500',offset:String(page*500)}).toString();
 const r=await fetch(url,{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error(`SOURCE_READ_${r.status}`);
 const rows=await r.json();source.push(...rows);
 if(rows.length<500)break;
 if(page===49)throw new Error('PARITY_BOUND_EXCEEDED');
}
const d1=[];
for(let page=0;page<50;page++){
 const out=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','hub-planner-public-dev','--remote','--config','cloudflare/wrangler.jsonc','--json','--command',`SELECT user_id,event_id,created_at FROM user_event_participations ORDER BY user_id,event_id LIMIT 500 OFFSET ${page*500}`],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const rows=JSON.parse(out.slice(out.indexOf('[')))[0].results;d1.push(...rows);
 if(rows.length<500)break;
 if(page===49)throw new Error('PARITY_BOUND_EXCEEDED');
}
const norm=r=>JSON.stringify([r.user_id,r.event_id,r.created_at?new Date(r.created_at).toISOString():null]);
const hash=rows=>createHash('sha256').update(JSON.stringify(rows.map(norm).sort())).digest('hex');
const duplicates=source.length-new Set(source.map(r=>`${r.user_id}:${r.event_id}`)).size;
const pass=source.length===d1.length&&hash(source)===hash(d1)&&!duplicates;
console.log(JSON.stringify({sourceRows:source.length,d1Rows:d1.length,duplicates,ownerEventTimestampHashMatch:pass,identity:'user_id,event_id',sourceSurrogateIdUsedByAPI:false}));
if(!pass)process.exitCode=1;
