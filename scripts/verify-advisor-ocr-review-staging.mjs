// Read-only verification of an UNPROMOTED OCR trial in the isolated app.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {buildDerivedPageObjectKey,isCompleteDerivedRevision,renderDerivedPage} from '../cloudflare/worker/src/ai-document-ingestion.ts';
const arg=n=>process.argv[process.argv.indexOf(n)+1];
async function main(){
  if(!process.argv.includes('--artifact-dir'))throw Error('ARTIFACT_REQUIRED');
  const dir=resolve(arg('--artifact-dir')),rel=relative(process.cwd(),dir);if(!rel.startsWith('..')&&!isAbsolute(rel))throw Error('OUTSIDE_GIT_REQUIRED');
  const prepared=JSON.parse(readFileSync(resolve(dir,'prepared-artifact.json'))),review=JSON.parse(readFileSync(resolve(dir,'review-draft.json')));
  const state=JSON.parse(readFileSync('.cache/advisor-app-staging/private-state.json')),rehearsal=JSON.parse(readFileSync('.cache/advisor-app-staging/reprocess-private.json'));
  if(state.name!=='hub-advisor-pr88-app-staging'||state.db==='88d702e1-60d3-490a-8514-38ef881cf133'||review.approved!==false||review.promotionAllowed!==false)throw Error('ISOLATION_REQUIRED');
  const token=readFileSync('.cache/cloudflare/xdg/.wrangler/config/default.toml','utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if(!token)throw Error('AUTH_UNAVAILABLE');
  const base=`https://api.cloudflare.com/client/v4/accounts/${state.account}/`,headers={Authorization:`Bearer ${token}`};
  const api=async(path,body)=>{
    if(body&&path!==`d1/database/${state.db}/query`&&path!==`ai-search/namespaces/default/instances/${state.name}/search`)throw Error('READ_ONLY_REQUIRED');
    if(body?.sql&&!/^SELECT\b/.test(body.sql))throw Error('READ_ONLY_REQUIRED');
    const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...headers,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(35000)});
    const j=await r.json();if(!r.ok||!j.success)throw Error('STAGING_READ_FAILED');return j.result;
  };
  const db=await api(`d1/database/${state.db}`);if(db.name!==state.name)throw Error('ISOLATION_REQUIRED');
  const [rows]=await api(`d1/database/${state.db}/query`,{sql:'SELECT * FROM ai_documents WHERE id=? AND content_hash=? AND deleted_at IS NULL',params:[rehearsal.documentId,review.sourceHash]});
  const d=rows.results[0];if(!d||d.ai_search_revision!==review.baseRevision||prepared.sourceContentHash!==d.content_hash)throw Error('BASE_REVISION_CHANGED');
  const index=`ai-search/namespaces/default/instances/${state.name}`;
  const listing=await api(index+'/items?per_page=50&metadata_filter='+encodeURIComponent(JSON.stringify({document_id:d.id,revision:rehearsal.newRevision})));
  const items=listing.result||listing;
  const complete=isCompleteDerivedRevision({id:d.id,revision:rehearsal.newRevision,pages:prepared.pages.length,visibility:d.visibility},items);
  if(!complete){console.log(JSON.stringify({phase:'ocr_trial_verification',allNewPagesReady:false,statuses:items.reduce((a,i)=>(a[i.status]=(a[i.status]||0)+1,a),{}),pages:items.map(i=>({page:Number(i.key?.match(/page-(\d+)/)?.[1]),status:i.status})),productionWrites:0}));return;}
  const get=async(key)=>{
    const r=await fetch(base+`r2/buckets/${state.name}/objects/${key}`,{headers,signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('OBJECT_MISSING');const bytes=await r.arrayBuffer();if(bytes.byteLength>20*1024*1024)throw Error('OBJECT_LIMIT');return Buffer.from(bytes);
  };
  const sha=v=>createHash('sha256').update(v).digest('hex');
  if(sha(await get(d.storage_path))!==d.content_hash)throw Error('ORIGINAL_CHANGED');
  let unchanged=0;
  for(const p of prepared.pages){
    const old=await get(buildDerivedPageObjectKey(d.id,d.ai_search_revision,p.pageNumber));
    const trial=await get(buildDerivedPageObjectKey(d.id,rehearsal.newRevision,p.pageNumber));
    if(trial.toString()!==renderDerivedPage(p))throw Error('TRIAL_CHANGED');
    if(p.pageNumber===review.pageNumber){if(!old.toString().includes(review.baselineText))throw Error('BASE_PAGE_CHANGED');}
    else{if(!old.equals(trial))throw Error('OTHER_PAGE_CHANGED');unchanged++;}
  }
  // A DIAGNOSTIC revision filter, not permission to make it runtime-active.
  const started=Date.now(),search=await api(index+'/search',{query:'Điều 3 Trách nhiệm với bản thân gia đình và xã hội',ai_search_options:{retrieval:{retrieval_type:'hybrid',max_num_results:10,filters:{document_id:d.id,revision:rehearsal.newRevision,active:true,visibility:d.visibility}}}});
  const pages=[...new Set((search.chunks||[]).map(c=>Number(c.item?.key?.match(/page-(\d+)/)?.[1])).filter(Number.isInteger))];
  writeFileSync(resolve(dir,'trial-retrieval-local.json'),JSON.stringify(search));
  console.log(JSON.stringify({phase:'ocr_trial_verification',allNewPagesReady:true,pages:prepared.pages.length,unchangedPages:unchanged,
    originalPreserved:true,oldRevisionPreserved:true,d1PointerChanged:false,trialRetrievalPages:pages,searchCalls:1,generatorCalls:0,
    retrievalMs:Date.now()-started,accuracyVerified:false,promotionAllowed:false,productionWrites:0}));
}
main().catch(e=>{console.log(JSON.stringify({phase:'ocr_trial_verification',result:'BLOCKED',safeError:/^[A-Z_]+$/.test(e.message)?e.message:e.name}));process.exitCode=1;});
