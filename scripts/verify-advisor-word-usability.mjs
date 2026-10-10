// Bounded real-provider Word usability probes. No source/index/production writes.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import dotenv from 'dotenv';
import {GoogleGenAI,UploadToFileSearchStoreOperation} from '@google/genai';
import {normalizeAcceptanceText as normalize} from '../shared/ai-advisor-acceptance-text.ts';
import {sanitizeAIReply} from '../utils/aiSafety.ts';
const DIR=resolve('.cache/advisor-word-staging'),OUT=resolve(DIR,'usability-results');
const emit=value=>console.log(JSON.stringify(value));
export const WORD_USABILITY_CASES=[
  {topics:['conduct'],q:'Nếu một sinh viên được 85 điểm rèn luyện thì xếp loại gì theo quy chế?',facts:['tốt'],locator:'Điều 7'},
  {topics:['conduct'],q:'drl 49 diem thi xep loai gi vay ban?',facts:['yếu'],locator:'Điều 7'},
  {topics:['conduct'],q:'Trong quy chế rèn luyện, 89 điểm và 90 điểm có cùng xếp loại không? Nêu từng mức giúp mình.',facts:['tốt','xuất sắc'],locator:'Điều 7'},
  {topics:['conduct'],q:'Bị kỷ luật cảnh cáo thì có được xếp loại rèn luyện tốt không, hay bị giới hạn ở mức nào?',facts:['trung bình'],locator:'Điều 8'},
  {topics:['conduct'],q:'Sinh viên bị đình chỉ học tập và sinh viên buộc thôi học có được đánh giá rèn luyện không?',facts:['không được đánh giá','đình chỉ','buộc thôi học'],locator:'Điều 8'},
  {topics:['conduct'],q:'Mình thấy đánh giá rèn luyện chưa chính xác. Quy chế cho khiếu nại lúc nào và đơn vị nào giải quyết?',facts:['thời gian đánh giá','Trung tâm','khoa','GVCV'],locator:'Điều 15'},
  {topics:['student_affairs'],q:'Theo quy chế công tác sinh viên, ban cán sự một lớp gồm mấy lớp trưởng và tối đa mấy lớp phó?',facts:['01','02'],locator:'Điều 8'},
  {topics:['student_affairs'],q:'Quy chế công tác sinh viên có cho hút thuốc lá hoặc uống bia trong trường không?',facts:['hút thuốc','rượu','bia'],locator:'Điều 6'},
  {topics:['student_affairs'],q:'Quy chế công tác sinh viên nói trường hỗ trợ sức khỏe tâm lý cho sinh viên mới nhập học như thế nào?',facts:['tư vấn tâm lý','hòa nhập'],locator:'Điều 18'},
  {topics:['standard_plan'],q:'Ke hoach hoc tap he chuan 2026-2027: hoc ky he bat dau ngay nao va dang ky mon tu ngay nao?',facts:['19/7/2027','31/5/2027']},
  {topics:['special_plan'],q:'Theo kế hoạch tổ chức học tập 2026–2027 của chương trình tiếng Anh bán phần, kỳ 2 bắt đầu và kết thúc ngày nào?',facts:['15/02/2027','18/07/2027']},
  {topics:['standard_plan','special_plan'],q:'So sánh lịch nghỉ Tết năm học 2026–2027 của chính quy chuẩn với chương trình tinh hoa: mỗi bên bắt đầu ngày nào, kết thúc ngày nào?',facts:['27/01/2027','01/02/2027','14/02/2027']},
  {topics:['tuition'],q:'Mình học K41 Tài chính ngân hàng hệ chuẩn. Theo bảng học phí 2026–2027, một năm và mỗi tín chỉ là bao nhiêu tiền?',facts:['25.600.000','752.000']},
  {topics:['tuition'],q:'hoc phi K39 nganh Ke toan chuong trinh chuan nam hoc 2026-2027 theo nam va tin chi bao nhieu?',facts:['25.600.000','742.000']},
  {topics:['tuition'],q:'K42 ngành Ngôn ngữ Trung Quốc hệ đại học chính quy chuẩn có mức thu năm và tín chỉ thế nào trong bảng 2026–2027?',facts:['28.800.000','834.000']},
  {topics:['conduct','tuition'],q:'Cho mình hai thông tin từ tài liệu: điểm rèn luyện tối đa là bao nhiêu và học phí K39 Tài chính ngân hàng hệ chuẩn 2026–2027 theo tín chỉ là bao nhiêu?',facts:['100','747.000']},
  {topics:[],q:'Bạn xem giúp điểm rèn luyện cá nhân của tôi học kỳ này được bao nhiêu?',insufficient:true},
  {topics:[],q:'Học phí K45 ngành Tài chính ngân hàng chương trình chuẩn năm học 2028–2029 chính xác là bao nhiêu?',insufficient:true},
  {topics:['special_plan'],q:'Kế hoạch chương trình tiếng Anh bán phần 2026–2027 cho biết chính xác ngày nào trong tháng 11 mở đăng ký học kỳ 2?',insufficient:true,noExactDate:true},
  {topics:[],q:'Theo các quy chế đang có, sinh viên tham gia hoạt động tình nguyện trên sao Hỏa được cộng chính xác mấy điểm rèn luyện?',insufficient:true},
];
function state(){const s=JSON.parse(readFileSync(resolve(DIR,'private-state.json'),'utf8'));
  if(s.name!=='hub-advisor-pr88-word-staging'||!/^https:\/\/hub-advisor-pr88-word-staging\.[a-z0-9-]+\.workers\.dev$/.test(s.origin))throw Error('ISOLATION_FAILED');return s;}
async function login(){const s=state(),browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1365,height:900}}),page=await context.newPage();await page.goto(s.origin);
  await page.getByLabel('Email kiểm thử').fill(s.email);await page.getByLabel('Mật khẩu kiểm thử').fill(s.password);
  await page.getByRole('button',{name:'Đăng nhập staging',exact:true}).click();await page.getByRole('heading',{name:'Kho tài liệu AI'}).waitFor({timeout:30000});return{s,browser,context,page};}
async function main(){mkdirSync(OUT,{recursive:true});
  if(process.argv.includes('--index-diagnosis')){
    const s=state(),token=readFileSync('.cache/cloudflare/xdg/.wrangler/config/default.toml','utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!token)throw Error('AUTH_UNAVAILABLE');
    const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${s.account}/d1/database/${s.db}/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({sql:'SELECT id,content_hash,gemini_operation_name,gemini_document_name,gemini_indexing_status,ai_search_status FROM ai_documents WHERE deleted_at IS NULL'}),signal:AbortSignal.timeout(15000)}),j=await r.json();
    if(!r.ok||!j.success){emit({phase:'staging_read_error',http:r.status,codes:j.errors?.map(e=>e.code)||[]});throw Error('STAGING_READ_FAILED');}
    if(j.result.some(r=>r.meta?.rows_written||r.meta?.changed_db))throw Error('READ_ONLY_GUARD');
    const docs=j.result[0].results,sources=JSON.parse(readFileSync(resolve(DIR,'source-inspection-private.json')));
    if(docs.length!==5||docs.some(d=>!sources.some(s=>s.sourceHash===d.content_hash)))throw Error('CORPUS_CHANGED');
    dotenv.config({path:'.env.local',quiet:true});dotenv.config({quiet:true});
    const g=JSON.parse(readFileSync('C:/Users/tqhoa/AppData/Local/Temp/hub-advisor-pr88-ocr-cells-final/gemini-staging-state.json','utf8'));
    if(g.label!=='hub-pr88-ocr-isolated-staging'||g.store===process.env.GEMINI_FILE_SEARCH_STORE||!process.env.GEMINI_FILE_SEARCH_API_KEY)throw Error('ISOLATION_FAILED');
    const ai=new GoogleGenAI({apiKey:process.env.GEMINI_FILE_SEARCH_API_KEY,httpOptions:{timeout:15000,retryOptions:{attempts:1}}});
    const store=await ai.fileSearchStores.get({name:g.store});if(store.displayName!==g.label)throw Error('ISOLATION_FAILED');
    const providerDocs=[];
    for await(const d of await ai.fileSearchStores.documents.list({parent:g.store,config:{pageSize:20}})){
      if(providerDocs.length>=100)throw Error('PROVIDER_DOCUMENT_LIMIT');providerDocs.push(d);
    }
    for(const doc of docs){const matched=providerDocs.filter(p=>p.customMetadata?.some(m=>m.key==='document_id'&&m.stringValue===doc.id));
      writeFileSync(resolve(OUT,`${sources.find(s=>s.sourceHash===doc.content_hash).topic}-provider-documents-private.json`),JSON.stringify(matched));
      emit({phase:'gemini_provider_document',topic:sources.find(s=>s.sourceHash===doc.content_hash).topic,localStatus:doc.gemini_indexing_status,matches:matched.length,states:matched.map(p=>p.state||null)});
    }
    for(const doc of docs){const topic=sources.find(s=>s.sourceHash===doc.content_hash).topic;
      if(!doc.gemini_operation_name){emit({phase:'gemini_index_diagnosis',topic,localStatus:doc.gemini_indexing_status,operationPresent:false,documentPresent:Boolean(doc.gemini_document_name)});continue;}
      const operation=new UploadToFileSearchStoreOperation();operation.name=doc.gemini_operation_name;const started=Date.now();
      try{const result=await ai.operations.get({operation});writeFileSync(resolve(OUT,`${topic}-operation-private.json`),JSON.stringify(result));
        emit({phase:'gemini_index_diagnosis',topic,localStatus:doc.gemini_indexing_status,done:result.done===true,errorCode:result.error?.code??null,errorPresent:Boolean(result.error),responseDocumentPresent:Boolean(result.response?.documentName),durationMs:Date.now()-started});
      }catch(e){writeFileSync(resolve(OUT,`${topic}-operation-error-private.json`),JSON.stringify({name:e.name,status:e.status,message:e.message}));emit({phase:'gemini_index_diagnosis',topic,localStatus:doc.gemini_indexing_status,errorClass:e.name,httpStatus:Number.isInteger(e.status)?e.status:null,durationMs:Date.now()-started});}
    }return;
  }
  if(process.argv.includes('--routing')){
    const {s,browser,context}=await login();
    try{
      const expected=process.argv[process.argv.indexOf('--expected-source')+1];
      if(!process.argv.includes('--expected-source')||!/^[a-f0-9]{40}$/.test(expected))throw Error('STAGING_SOURCE_MISMATCH');
      const health=await(await context.request.get(`${s.origin}/health`)).json();if(health.sourceCommit!==expected)throw Error('STAGING_SOURCE_MISMATCH');
      const before=await(await context.request.get(`${s.origin}/api/admin/v1/ai-documents`)).json(),docs=before.documents||before.data||[];
      const sources=JSON.parse(readFileSync(resolve(DIR,'source-inspection-private.json')));
      if(docs.length!==5||docs.some(d=>!sources.some(x=>x.sourceHash===d.content_hash)))throw Error('CORPUS_CHANGED');
      const anonymous=await fetch(`${s.origin}/api/staging/ai-advisor-routing?profile=canary-selected`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'test'})});
      emit({phase:'routing_probe_auth',anonymousHttp:anonymous.status});
      const q='Bạn có bảng điểm rèn luyện mới nhất không?';
      for(const profile of ['canary-selected','canary-unselected','selected-completeness-off','legacy-provider-error','selected-provider-error']){
        const started=Date.now(),r=await context.request.post(`${s.origin}/api/staging/ai-advisor-routing?profile=${profile}`,{data:{question:q,history:[]},timeout:90000}),payload=await r.json();
        writeFileSync(resolve(OUT,`routing-${profile}-private.json`),JSON.stringify(payload));
        const text=normalize(payload.reply),citations=payload.documentSources||[];
        emit({phase:'word_routing_probe',profile,http:r.status(),durationMs:Date.now()-started,scale100:text.includes('100'),fiveGroupScores:['25','20','15'].every(f=>text.includes(f)),citations:citations.length,
          noFakeWordPages:citations.every(x=>!x.pageNumber&&!x.pageNumbers?.length),allSourcesAuthorized:citations.every(x=>docs.some(d=>d.id===x.documentId)),
          status:payload.documentSearchStatus||null,unavailable:payload.documentSearchUnavailable===true,metrics:payload.stagingMetrics});
      }
      const after=await(await context.request.get(`${s.origin}/api/admin/v1/ai-documents`)).json(),afterDocs=after.documents||after.data||[];
      emit({phase:'routing_inventory',documents:afterDocs.length,sourceHashesUnchanged:docs.length===afterDocs.length&&docs.every(d=>afterDocs.some(a=>a.id===d.id&&a.content_hash===d.content_hash&&a.ai_search_revision===d.ai_search_revision)),productionChanged:false});
    }finally{await browser.close();}return;
  }
  if(!process.argv.includes('--ui'))throw Error('ACTION_REQUIRED');
  const {s,browser,context,page}=await login();
  try{const expected=process.argv[process.argv.indexOf('--expected-source')+1];if(!process.argv.includes('--expected-source')||!/^[a-f0-9]{40}$/.test(expected))throw Error('STAGING_SOURCE_MISMATCH');
    const health=await(await context.request.get(`${s.origin}/health`)).json();if(health.sourceCommit!==expected)throw Error('STAGING_SOURCE_MISMATCH');
    const sources=JSON.parse(readFileSync(resolve(DIR,'source-inspection-private.json'))),list=await(await context.request.get(`${s.origin}/api/admin/v1/ai-documents`)).json(),docs=list.documents||list.data||[];
    if(docs.length!==5||docs.some(d=>!sources.some(s=>s.sourceHash===d.content_hash)))throw Error('CORPUS_CHANGED');
    const errors=[];page.on('pageerror',e=>errors.push(e.name));await page.locator('button.fixed.bottom-6').click();const consent=page.getByRole('button',{name:'Tôi đồng ý',exact:true});if(await consent.count())await consent.click();
    for(const [i,c]of WORD_USABILITY_CASES.entries()){
      if(i)await page.getByRole('button',{name:'Cuộc trò chuyện mới',exact:true}).click();const started=Date.now();
      try{const next=page.waitForResponse(r=>r.url()===`${s.origin}/api/private/v1/ai-advisor`&&r.request().method()==='POST',{timeout:90000});
        const input=page.getByPlaceholder('Nhập câu hỏi tại đây...');await input.fill(c.q);await input.press('Enter');const response=await next,payload=await response.json();
        const anchor=normalize(sanitizeAIReply(payload.reply||'')).replace(/[|*#_`>]/g,'').trim().slice(0,45);
        if(anchor)await page.waitForFunction(value=>[...document.querySelectorAll('.ai-message-markdown')].some(el=>el.textContent.normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[|*#_`>]/g,'').replace(/\s+/g,' ').trim().includes(value)),anchor,{timeout:15000});
        await page.locator('.ai-message-markdown').last().waitFor({timeout:15000});
        const visibleReply=await page.locator('.ai-message-markdown').last().innerText();
        writeFileSync(resolve(OUT,`case-${i+1}-private.json`),JSON.stringify({question:c.q,expectation:c,payload,visibleReply}));
        const citations=payload.documentSources||[],expectedIds=c.topics.map(t=>docs.find(d=>d.content_hash===sources.find(s=>s.topic===t).sourceHash)?.id);
        const citationChecks={allExpectedSources:expectedIds.every(id=>citations.some(x=>x.documentId===id)),allSourcesAuthorized:citations.every(x=>docs.some(d=>d.id===x.documentId)),noFakeWordPages:citations.every(x=>!x.pageNumber&&!x.pageNumbers?.length),hasLocators:citations.length>0&&citations.every(x=>x.locators?.length>0)};
        emit({phase:'word_usability_ui',case:i+1,expectedAnswer:c.insufficient?'INSUFFICIENT_SOURCE':'ANSWERABLE',http:response.status(),durationMs:Date.now()-started,expectedFacts:(c.facts||[]).every(f=>normalize(visibleReply).includes(normalize(f))),technicalRefusal:visibleReply.includes('thông tin kỹ thuật hoặc bảo mật'),metadataVisible:/word_unit|uncertain_tokens/.test(visibleReply),...citationChecks,pageErrors:errors.length,metrics:payload.stagingMetrics,verdict:'AWAITING_CONTENT_REVIEW'});
        await page.screenshot({path:resolve(OUT,`case-${i+1}-desktop.png`)});
      }catch(e){emit({phase:'word_usability_ui',case:i+1,errorClass:e.name,durationMs:Date.now()-started,verdict:'FAIL'});throw e;}
    }
    const after=await(await context.request.get(`${s.origin}/api/admin/v1/ai-documents`)).json();const afterDocs=after.documents||after.data||[];
    emit({phase:'word_usability_inventory',documents:afterDocs.length,sourceHashesUnchanged:afterDocs.length===docs.length&&docs.every(d=>afterDocs.some(a=>a.id===d.id&&a.content_hash===d.content_hash&&a.ai_search_revision===d.ai_search_revision)),productionChanged:false});
  }finally{await browser.close();}
}
if(process.argv[1]?.endsWith('verify-advisor-word-usability.mjs'))main().catch(e=>{emit({phase:'word_usability',result:'BLOCKED',errorClass:e.name,safeReason:['ISOLATION_FAILED','ACTION_REQUIRED','READ_ONLY_GUARD','CORPUS_CHANGED','STAGING_SOURCE_MISMATCH','AUTH_UNAVAILABLE'].includes(e.message)?e.message:null});process.exitCode=1;});
