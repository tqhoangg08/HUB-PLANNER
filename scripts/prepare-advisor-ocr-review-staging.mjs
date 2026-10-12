// Read ONLY isolated staging. Trial artifact/review draft stay outside Git.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {assemblePageAwareMarkdown,renderDerivedPage,buildDerivedPageObjectKey} from '../cloudflare/worker/src/ai-document-ingestion.ts';
import {OCR_PAGE_MARKDOWN_PIPELINE_VERSION} from '../cloudflare/worker/src/ai-document-index-identity.ts';
import {buildOcrReviewDraft} from '../shared/ai-document-ocr-review.ts';
const arg=n=>process.argv[process.argv.indexOf(n)+1];
async function main(){
  for(const n of ['--pdf','--trial','--output-dir'])if(!process.argv.includes(n))throw Error('ARGUMENT_REQUIRED');
  const paths=['--pdf','--trial','--output-dir'].map(n=>resolve(arg(n)));
  for(const p of paths){const r=relative(process.cwd(),p);if(!r.startsWith('..')&&!isAbsolute(r))throw Error('OUTSIDE_GIT_REQUIRED');}
  const [pdf,trialPath,out]=paths,sha=v=>createHash('sha256').update(v).digest('hex');
  const sourceHash=sha(readFileSync(pdf)),trial=JSON.parse(readFileSync(trialPath)),pageNumber=Number(arg('--page'))||3;
  if(trial.sourceHash!==sourceHash||trial.pageNumber!==pageNumber||trial.parameters?.region!==null)throw Error('OPTICAL_TRIAL_SOURCE_MISMATCH');
  const state=JSON.parse(readFileSync('.cache/advisor-app-staging/private-state.json'));
  if(state.name!=='hub-advisor-pr88-app-staging'||state.db==='88d702e1-60d3-490a-8514-38ef881cf133')throw Error('ISOLATION_REQUIRED');
  const token=readFileSync('.cache/cloudflare/xdg/.wrangler/config/default.toml','utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if(!token)throw Error('AUTH_UNAVAILABLE');
  const base=`https://api.cloudflare.com/client/v4/accounts/${state.account}/`,headers={Authorization:`Bearer ${token}`};
  const query=async(sql,params=[])=>{
    if(!/^SELECT\b/.test(sql))throw Error('READ_ONLY_REQUIRED');
    const r=await fetch(base+`d1/database/${state.db}/query`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
    const j=await r.json();if(!r.ok||!j.success)throw Error('STAGING_READ_FAILED');return j.result[0].results;
  };
  const db=await fetch(base+`d1/database/${state.db}`,{headers}).then(r=>r.json());if(db.result?.name!==state.name)throw Error('ISOLATION_REQUIRED');
  const rows=await query("SELECT * FROM ai_documents WHERE content_hash=? AND deleted_at IS NULL AND ai_search_status='completed'",[sourceHash]);
  if(rows.length!==1)throw Error('SOURCE_NOT_READY');const d=rows[0],pages=[];
  if(d.ocr_page_count<1||d.ocr_page_count>40||pageNumber>d.ocr_page_count)throw Error('PAGE_LIMIT');
  for(let n=1;n<=d.ocr_page_count;n++){
    const key=buildDerivedPageObjectKey(d.id,d.ai_search_revision,n),r=await fetch(base+`r2/buckets/${state.name}/objects/${key}`,{headers,signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('STAGING_PAGE_MISSING');const body=await r.text();if(Buffer.byteLength(body)>32000)throw Error('PAGE_LIMIT');
    const metadata=body.match(/<!-- extraction: (ocr|native_text)(?:; confidence: ([\d.]+))?; uncertain_tokens: (\d+) -->/);
    const fenced=body.includes('```text\n'),text=fenced?body.split('```text\n')[1].split('\n```')[0]:body.split(`## Trang ${n}\n\n`)[1]?.trim();
    if(!metadata||!text)throw Error('PAGE_CONTRACT_MISMATCH');
    const p={pageNumber:n,text,sourceKind:metadata[1],layout:fenced?'columns':'lines',uncertainTokens:Number(metadata[3]),...(metadata[2]?{confidence:Number(metadata[2])}:{})};
    if(renderDerivedPage(p)!==body)throw Error('UNCHANGED_PAGE_SERIALIZATION_MISMATCH');pages.push(p);
  }
  const review=buildOcrReviewDraft({sourceHash,baseRevision:d.ai_search_revision,pageNumber,baselineText:pages[pageNumber-1].text,
    trialText:trial.serialized.text,trialUncertainTokens:trial.serialized.uncertainTokens,method:'tesseract-vie-best-full-page-optical-trial'});
  pages[pageNumber-1]={...pages[pageNumber-1],text:trial.serialized.text,confidence:trial.raw.confidence,uncertainTokens:trial.serialized.uncertainTokens};
  const markdown=assemblePageAwareMarkdown(pages).trim(),prepared={pages,sourceContentHash:sourceHash,derivedContentHash:sha(markdown),pipelineVersion:OCR_PAGE_MARKDOWN_PIPELINE_VERSION,ocrUsed:true};
  mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'prepared-artifact.json'),JSON.stringify(prepared));
  writeFileSync(resolve(out,'review-draft.json'),JSON.stringify(review));
  console.log(JSON.stringify({phase:'ocr_trial_preparation',pages:pages.length,replacedPages:1,unchangedPages:pages.length-1,
    comparison:review.comparison,quality:review.quality,adminApproved:false,promotionAllowed:false,productionWrites:0}));
}
main().catch(e=>{console.log(JSON.stringify({phase:'ocr_trial_preparation',result:'BLOCKED',safeError:/^[A-Z_]+$/.test(e.message)?e.message:e.name}));process.exitCode=1;});
