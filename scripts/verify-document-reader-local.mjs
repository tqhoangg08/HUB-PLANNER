// Explicit opt-in local PDF browser verification. No upload/API/provider calls.
import {chromium} from 'playwright-core';
import {createServer} from 'vite';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
if(!process.argv[2])throw Error('Explicit local PDF path required');
const bytes=fs.readFileSync(process.argv[2]);
const server=await createServer({server:{host:'127.0.0.1',port:5198,strictPort:true,hmr:false,watch:{ignored:['**/*']}},open:false});
await server.listen();
console.log(JSON.stringify({phase:'local_server_ready'}));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();
 await page.exposeFunction('readerProgress',(phase,n)=>console.log(JSON.stringify({phase,page:n})));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  // Only local source modules and public OCR engine/language assets. Never
  // connect this test to an application API or production origin.
  if(url.hostname==='127.0.0.1'&&!url.pathname.startsWith('/api/')||['cdn.jsdelivr.net','tessdata.projectnaptha.com'].includes(url.hostname))return route.continue();
  return route.abort();
 });
 await page.goto('http://127.0.0.1:5198/tests/fixtures/document-reader.html');
 page.setDefaultTimeout(30*60_000);
 const reading=page.evaluate(async(raw)=>{
  await window.readerProgress('loading_reader',0);
  const {inspectPdfTextLayer,runPdfOcrInBrowser}=await import('/utils/aiDocumentOcr.ts');
  const file=new File([new Uint8Array(raw)],'source.pdf',{type:'application/pdf'});
  const start=performance.now(),plan=await inspectPdfTextLayer(file);
  await window.readerProgress('inspection_complete',plan.pageCount);
  const ocrPages=plan.pages.filter(p=>p.requiresOcr).map(p=>p.pageNumber);
  let last=0;
  try{
   const output=await runPdfOcrInBrowser(file,(n)=>{last=n;void window.readerProgress('page_complete',n);},undefined,plan);
   return {status:'PASS',pages:output.pageCount,contiguous:output.pages.every((p,i)=>p.pageNumber===i+1),
    ocrPages,completedPages:last,sourceHash:output.sourceContentHash,derivedHash:output.derivedContentHash,
    derivedBytes:new TextEncoder().encode(output.text).length,uncertainTokens:output.uncertainTokens,
    elapsedMs:Math.round(performance.now()-start)};
  }catch(e){return {status:'BLOCKED',pages:plan.pageCount,ocrPages,completedPages:last,error:e.message,elapsedMs:Math.round(performance.now()-start)};}
 },Array.from(bytes));
 let timer;
 const result=await Promise.race([reading,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOCAL_READER_TIMEOUT')),15*60_000);})]).finally(()=>clearTimeout(timer));
 if(result.sourceHash&&result.sourceHash!==createHash('sha256').update(bytes).digest('hex'))throw Error('Source hash mismatch');
 console.log(JSON.stringify(result));
 if(result.status!=='PASS')process.exitCode=1;
}finally{await browser.close();await server.close();}
