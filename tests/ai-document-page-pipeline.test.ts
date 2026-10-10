import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {DatabaseSync} from 'node:sqlite';
import {assessDocumentPageText,serializeOcrLines,confirmedNumericConfidence} from '../shared/ai-document-text-quality.ts';
import {detectRuledTable,serializeTableCells,findCellInkBounds} from '../shared/ai-document-table-layout.ts';
import {refreshAiSearchDocument} from '../cloudflare/worker/src/ai-documents.ts';
import {hasFullPageScan,hasUsablePdfText,isPdfDocument} from '../utils/aiDocumentOcr.ts';
import {assemblePageAwareMarkdown,parsePreparedPdfPages,storeDerivedPdfPages,OCR_DERIVED_TEXT_PIPELINE,isCompleteDerivedRevision,buildDerivedPageObjectKey} from '../cloudflare/worker/src/ai-document-ingestion.ts';

const sha=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),(b)=>b.toString(16).padStart(2,'0')).join('');
const page={pageNumber:1,text:'Điểm rèn luyện được đánh giá bằng thang điểm 100.',sourceKind:'ocr' as const,confidence:96,uncertainTokens:0,layout:'lines' as const};
const payload=async()=>{const markdown=assemblePageAwareMarkdown([page]).trim();return {pages:[page],sourceContentHash:'a'.repeat(64),derivedContentHash:await sha(markdown),pipelineVersion:OCR_DERIVED_TEXT_PIPELINE};};
test('long damaged Vietnamese layers require OCR despite >120 characters and no replacement glyphs',()=>{
  const broken='Quy ch6 rdn luyQn sinh vi6n c6c di6u kho4n. '.repeat(20);
  const result=assessDocumentPageText(broken);
  assert.equal(result.replacementCharacterCount,0);assert.equal(result.classification,'OCR_REQUIRED');
  assert.ok(result.reasons.includes('damaged_word_mapping'));
  assert.equal(hasUsablePdfText([broken]),false);
  assert.equal(assessDocumentPageText('Điều 10: 75%.').classification,'NATIVE_GOOD');
  assert.equal(assessDocumentPageText('Valid English paragraph; report 2026.').classification,'NATIVE_GOOD');
});
test('all pages are evaluated and scan detection respects saved transforms rather than image presence',()=>{
  assert.equal(hasUsablePdfText(Array.from({length:8},(_,i)=>i===7?'\uFFFD':'Văn bản hợp lệ.')),false);
  assert.equal(assessDocumentPageText('Long existing OCR text. '.repeat(20),true).classification,'OCR_REQUIRED');
  assert.equal(hasFullPageScan({fnArray:[1,2,3,4],argsArray:[[],[600,0,0,800,0,0],[],[]]},[3],2,1,4,600*800),true);
  assert.equal(hasFullPageScan({fnArray:[2,3],argsArray:[[50,0,0,50,0,0],[]]},[3],2,1,4,600*800),false);
  const client=readFileSync('utils/aiDocumentOcr.ts','utf8');
  assert.doesNotMatch(client,/MAX_INSPECT_PAGES|MIN_USABLE_TEXT_CHARS/);
  assert.match(client,/n <= pdf.numPages/);
});
test('uncertain numbers are not guessed and valid Vietnamese words/column order stay intact',()=>{
  const words=[{text:'100',confidence:97,bbox:{x0:0,y0:0,x1:20,y1:15}},
    {text:'3549',confidence:50,bbox:{x0:90,y0:0,x1:130,y1:15}},
    {text:'không',confidence:96,bbox:{x0:150,y0:0,x1:200,y1:15}}];
  const result=serializeOcrLines([{words}]);assert.match(result.text,/100/);assert.match(result.text,/không/);
  assert.doesNotMatch(result.text,/3549/);assert.equal(result.uncertainTokens,1);assert.match(result.text,/ {4}/);
});
test('ruled tables are detected geometrically and cell serializer does not invent semantic headings',()=>{
  const width=100,height=100,data=new Uint8Array(width*height*4).fill(255);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(([10,50,90].includes(y)&&x>=10&&x<=90)||([10,50,90].includes(x)&&y>=10&&y<=90))data[(y*width+x)*4]=data[(y*width+x)*4+1]=data[(y*width+x)*4+2]=0;
  assert.deepEqual(detectRuledTable({width,height,data}),{xs:[10,50,90],ys:[10,50,90]});
  const md=serializeTableCells([[{text:'Trách nhiệm',confidence:95,uncertainTokens:0},{text:'0–25 điểm',confidence:96,uncertainTokens:0}]]);
  assert.match(md,/Cột 1/);assert.match(md,/0–25 điểm/);assert.match(md,/Trách nhiệm/);
});
test('numeric crop confirmation cannot change digits or lower the numeric confidence threshold',()=>{
  const word={text:'0–15',confidence:70,bbox:{x0:0,y0:0,x1:60,y1:20}};
  assert.equal(confirmedNumericConfidence(word,{text:'0-15',confidence:96}),96);
  assert.equal(confirmedNumericConfidence(word,{text:'0-25',confidence:99}),70);
  assert.equal(confirmedNumericConfidence(word,{text:'0-15',confidence:84}),70);
  assert.equal(confirmedNumericConfidence({...word,text:'35?9'},{text:'3549',confidence:99}),70);
  const serialized=serializeOcrLines([{words:[{...word,confidence:confirmedNumericConfidence(word,{text:'0-25',confidence:99})}]}]);
  assert.match(serialized.text,/không đọc rõ/);assert.doesNotMatch(serialized.text,/25/);
});
test('empty ruled-table cells remain empty instead of recognizing faint background as text',()=>{
  const image={width:30,height:30,data:new Uint8Array(30*30*4).fill(255)};
  const rect={left:0,top:0,width:30,height:30};assert.equal(findCellInkBounds(image,rect),null);
  for(let y=12;y<20;y++)for(let x=12;x<20;x++)image.data[(y*30+x)*4]=image.data[(y*30+x)*4+1]=image.data[(y*30+x)*4+2]=0;
  assert.deepEqual(findCellInkBounds(image,rect),{left:4,top:4,width:24,height:24});
});
test('prepared page contract enforces contiguous pages, source hash, pipeline and content hash',async()=>{
  const input=await payload();
  const parsed=await parsePreparedPdfPages(JSON.stringify(input),input.sourceContentHash);
  assert.equal(parsed.pages.length,1);assert.match(parsed.markdown,/page: 1/);
  await assert.rejects(()=>parsePreparedPdfPages(JSON.stringify({...input,sourceContentHash:'b'.repeat(64)}),input.sourceContentHash),/source hash/);
  await assert.rejects(()=>parsePreparedPdfPages(JSON.stringify({...input,pages:[{...page,pageNumber:2}]}),input.sourceContentHash),/Invalid prepared/);
  await assert.rejects(()=>parsePreparedPdfPages(JSON.stringify({...input,pipelineVersion:'untrusted'}),input.sourceContentHash),/Unsupported/);
  await assert.rejects(()=>parsePreparedPdfPages(JSON.stringify({...input,derivedContentHash:'b'.repeat(64)}),input.sourceContentHash),/hash/);
});
test('PDF with empty browser MIME still prepares pages and NFD native columns round-trip with NFC hash',async()=>{
  assert.equal(isPdfDocument({name:'scan.PDF',type:''}),true);
  assert.equal(isPdfDocument({name:'report.txt',type:'text/plain'}),false);
  const pages=[{pageNumber:1,text:'Điểm    100'.normalize('NFD'),sourceKind:'native_text' as const,layout:'columns' as const}];
  const markdown=assemblePageAwareMarkdown(pages).trim();
  assert.match(markdown,/Điểm    100/);assert.match(markdown,/Trang 1/);
  const parsed=await parsePreparedPdfPages(JSON.stringify({pages,sourceContentHash:'a'.repeat(64),derivedContentHash:await sha(markdown),pipelineVersion:'native-page-text-v2-layout'}),'a'.repeat(64));
  assert.equal(parsed.markdown,markdown);
});
test('real local R2 binding stores page Markdown with only server-authoritative filter metadata',async()=>{
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2025-12-01',r2Buckets:['DOCS']});
  try{
    const bucket=await mf.getR2Bucket('DOCS');const input=await payload();
    const prepared=await parsePreparedPdfPages(JSON.stringify(input),input.sourceContentHash);
    const result=await storeDerivedPdfPages(bucket,{id:'11111111-1111-4111-8111-111111111111',content_hash:input.sourceContentHash,version:1,category:'training_regulation',visibility:'public'},prepared);
    assert.equal(result.keys.length,1);assert.match(result.keys[0],/^ai-search\/text\//);
    const obj=await bucket.get(result.keys[0]);assert.ok(obj);assert.match(await obj.text(),/thang điểm 100/);
    assert.equal(obj.customMetadata.document_id,'11111111-1111-4111-8111-111111111111');assert.equal(obj.customMetadata.active,'true');
    assert.deepEqual(Object.keys(obj.customMetadata).sort(),['active','category','document_id','revision','visibility']);
  }finally{await mf.dispose();}
});

test('reprocess side-by-side revision retains original and previous pages; no existing-key overwrite allowed',async()=>{
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2025-12-01',r2Buckets:['DOCS']});
  try{
    const bucket=await mf.getR2Bucket('DOCS'),input=await payload(),prepared=await parsePreparedPdfPages(JSON.stringify(input),input.sourceContentHash);
    const doc={id:'11111111-1111-4111-8111-111111111111',content_hash:input.sourceContentHash,category:'training_regulation',visibility:'public' as const};
    await bucket.put('ai-documents/original.pdf','original bytes');
    const old=await storeDerivedPdfPages(bucket,{...doc,version:1},prepared);
    const before=await (await bucket.get(old.keys[0]))!.text();
    // Reprocess executor must allocate a NEW version, never reuse upload retry keys.
    const next=await storeDerivedPdfPages(bucket,{...doc,version:2},prepared);
    assert.notEqual(next.revision,old.revision);assert.ok(next.keys.every(k=>!old.keys.includes(k)));
    assert.equal(await(await bucket.get('ai-documents/original.pdf'))!.text(),'original bytes');
    assert.equal(await(await bucket.get(old.keys[0]))!.text(),before);
    assert.equal(await(await bucket.get(next.keys[0]))!.text(),before);
  }finally{await mf.dispose();}
});
test('UI prepares both native and scan PDFs; Gemini completion is not AI Search completion',()=>{
  const ui=readFileSync('components/AdminAIDocuments.tsx','utf8');
  const worker=readFileSync('cloudflare/worker/src/ai-documents.ts','utf8');
  assert.match(ui,/preparedPages/);assert.doesNotMatch(ui,/if \(!inspection.hasUsableText\)/);
  assert.match(worker,/ai_search_status:'derived_ready'/);assert.match(worker,/refreshAiSearchDocument/);
  assert.match(worker,/isCompleteDerivedRevision/);assert.match(worker,/gemini_indexing_status/);
});
test('AI Search completion requires every page, current revision, active visibility and authoritative ID',()=>{
  const doc={id:'11111111-1111-4111-8111-111111111111',revision:'v1-test',pages:2,visibility:'public'};
  const items=[1,2].map((p)=>({key:buildDerivedPageObjectKey(doc.id,doc.revision,p),status:'completed',
    metadata:{document_id:doc.id,revision:doc.revision,visibility:'public',active:true}}));
  assert.equal(isCompleteDerivedRevision(doc,items),true);
  assert.equal(isCompleteDerivedRevision(doc,items.slice(0,1)),false);
  for(const patch of [{active:false},{revision:'old'},{visibility:'admin'},{document_id:'other'}])
    assert.equal(isCompleteDerivedRevision(doc,[items[0],{...items[1],metadata:{...items[1].metadata,...patch}}]),false);
  assert.equal(isCompleteDerivedRevision(doc,[items[0],{...items[1],status:'running'}]),false);
});
test('additive migration and local D1 readiness persist independent AI Search completion after Gemini failure',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('CREATE TABLE ai_documents(id TEXT PRIMARY KEY, visibility TEXT, indexing_status TEXT, updated_at TEXT, deleted_at TEXT, ocr_page_count INTEGER)');
    db.exec(readFileSync('cloudflare/migrations/0054_ai_document_search_ingestion_state.sql','utf8'));
    const id='11111111-1111-4111-8111-111111111111';
    db.prepare("INSERT INTO ai_documents(id,visibility,indexing_status,ocr_page_count,ai_search_status,ai_search_revision,gemini_indexing_status) VALUES(?,?,?,1,?,?,?)").run(id,'public','failed','derived_ready','v1-test','failed');
    const row=db.prepare('SELECT * FROM ai_documents').get() as Parameters<typeof refreshAiSearchDocument>[1];
    const storage={prepare:(sql:string)=>({bind:(...args:unknown[])=>({first:async()=>db.prepare(sql).get(...args as never[]),run:async()=>db.prepare(sql).run(...args as never[])})})};
    const env={DB:storage,AI_DOCUMENTS_BUCKET:{},AI_ADVISOR_SEARCH:{get:()=>({items:{list:async()=>({result:[{key:buildDerivedPageObjectKey(id,'v1-test',1),status:'completed',metadata:{document_id:id,revision:'v1-test',visibility:'public',active:true}}]})}})}};
    const result=await refreshAiSearchDocument(env as never,row);
    assert.equal(result.ai_search_status,'completed');assert.equal(result.indexing_status,'completed');
    assert.equal(result.gemini_indexing_status,'failed');
  }finally{db.close();}
});

test('readiness refresh cannot promote a replaced revision or revive a deleting document',async()=>{
  for(const mutation of ["ai_search_revision='v2-new'","indexing_status='deleting'","deleted_at='2026-10-10'","visibility='admin'","ocr_page_count=2"]){
    const db=new DatabaseSync(':memory:');
    try{
      db.exec('CREATE TABLE ai_documents(id TEXT PRIMARY KEY, visibility TEXT, indexing_status TEXT, updated_at TEXT, deleted_at TEXT, ocr_page_count INTEGER)');
      db.exec(readFileSync('cloudflare/migrations/0054_ai_document_search_ingestion_state.sql','utf8'));
      const id='11111111-1111-4111-8111-111111111111';
      db.prepare("INSERT INTO ai_documents(id,visibility,indexing_status,ocr_page_count,ai_search_status,ai_search_revision) VALUES(?,'public','processing',1,'derived_ready','v1-test')").run(id);
      const snapshot=db.prepare('SELECT * FROM ai_documents').get() as Parameters<typeof refreshAiSearchDocument>[1];
      const storage={prepare:(sql:string)=>({bind:(...args:unknown[])=>({first:async()=>db.prepare(sql).get(...args as never[]),run:async()=>db.prepare(sql).run(...args as never[])})})};
      const env={DB:storage,AI_DOCUMENTS_BUCKET:{},AI_ADVISOR_SEARCH:{get:()=>({items:{list:async()=>{
        // Concurrent admin action while the provider request was in flight.
        db.exec(`UPDATE ai_documents SET ${mutation}`);
        return {result:[{key:buildDerivedPageObjectKey(id,'v1-test',1),status:'completed',metadata:{document_id:id,revision:'v1-test',visibility:'public',active:true}}]};
      }}})}};
      await refreshAiSearchDocument(env as never,snapshot);
      const current=db.prepare('SELECT * FROM ai_documents').get()!;
      assert.equal(current.ai_search_status,'derived_ready',mutation);
      assert.notEqual(current.indexing_status,'completed',mutation);
    }finally{db.close();}
  }
});
