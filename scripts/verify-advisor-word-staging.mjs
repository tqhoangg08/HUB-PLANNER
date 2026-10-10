// Reads exactly five owner-selected DOCX files. Private artifacts stay in .cache.
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {extractNativeDocx} from '../cloudflare/worker/src/ai-document-docx.ts';
const emit=v=>console.log(JSON.stringify(v)),DIR=resolve('.cache/advisor-word-staging');
const sourceArg=process.argv.indexOf('--source');
async function main(){
  if(process.argv.includes('--inspect')){
    if(sourceArg<0)throw Error('SOURCE_REQUIRED');
    const folder=resolve(process.argv[sourceArg+1]),files=readdirSync(folder).filter(f=>/\.docx$/i.test(f));
    if(files.length!==5||files.some(f=>/\(1\)/.test(f)))throw Error('AMBIGUOUS_SOURCE');
    const topics=['standard_plan','special_plan','student_affairs','conduct','tuition'];
    const patterns=[/^Kế hoạch học tập/,/^Kế hoạch tổ chức/,/^Quy chế công tác/,/^Quy chế đánh giá/,/^Quyết định về mức thu/];
    const documents=topics.map((topic,i)=>{const matches=files.filter(f=>patterns[i].test(f));if(matches.length!==1)throw Error('AMBIGUOUS_SOURCE');
      const path=resolve(folder,matches[0]),bytes=readFileSync(path),extracted=extractNativeDocx(bytes);
      return{topic,fileName:matches[0],sourceHash:createHash('sha256').update(bytes).digest('hex'),...extracted};});
    mkdirSync(DIR,{recursive:true});writeFileSync(resolve(DIR,'source-inspection-private.json'),JSON.stringify(documents));
    // The following facts are acceptance expectations read from these exact
    // files, not facts injected into retrieval, prompts, or production code.
    const cases=[
      {topic:'conduct',question:'Bạn có bảng điểm rèn luyện mới nhất không?',contains:['100','25','20','15'],locators:['Bảng 2']},
      {topic:'conduct',question:'Tham gia mini game có được tính điểm ĐRL không?',contains:['không được tính điểm rèn luyện']},
      {topic:'conduct',question:'Minh chứng hoạt động ngoài trường để tính điểm rèn luyện cần yêu cầu gì?',contains:['xác nhận','chữ ký','dấu tròn']},
      {topic:'standard_plan',question:'Theo kế hoạch học tập đại học chính quy chuẩn năm học 2026–2027, đăng ký môn học học kỳ 2 dự kiến bắt đầu khi nào?',contains:['16/11/2026']},
      {topic:'special_plan',question:'Theo kế hoạch tổ chức học tập chương trình tiếng Anh bán phần năm học 2026–2027, đăng ký học phần học kỳ 2 dự kiến tháng nào?',contains:['11/2026']},
      {topic:'standard_plan',question:'Theo kế hoạch học tập chương trình chuẩn năm học 2026–2027, nghỉ Tết Nguyên Đán từ ngày nào đến ngày nào?',contains:['27/01/2027','14/02/2027']},
      {topic:'special_plan',question:'Theo kế hoạch tổ chức học tập chương trình tinh hoa năm học 2026–2027, nghỉ Tết Nguyên Đán từ ngày nào đến ngày nào?',contains:['01/02/2027','14/02/2027']},
      {topic:'tuition',question:'Học phí K39 ngành Tài chính ngân hàng chương trình đại học chính quy chuẩn năm học 2026–2027 theo năm và theo tín chỉ là bao nhiêu?',contains:['25.600.000','747.000']},
      {topic:'student_affairs',question:'Theo Quy chế công tác sinh viên đối với chương trình đào tạo đại học chính quy, Điều 3 quy định những nguyên tắc thực hiện nào?',contains:['khách quan','minh bạch','chuyển đổi số','gia đình và xã hội'],locators:['Điều 3']},
      {topic:'conduct',question:'Quy chế đánh giá kết quả rèn luyện sinh viên quy định thang điểm rèn luyện bao nhiêu?',contains:['100']},
    ].map(c=>({...c,sourceHash:documents.find(d=>d.topic===c.topic).sourceHash}));
    for(const c of cases){const text=documents.find(d=>d.topic===c.topic).markdown.normalize('NFC');
      if(!c.contains.every(f=>text.includes(f)))throw Error('SOURCE_EXPECTATION_MISSING');}
    writeFileSync(resolve(DIR,'acceptance-private.json'),JSON.stringify(cases));
    emit({phase:'word_source_inspection',documents:documents.map(d=>({topic:d.topic,...d.counts,uncertainTokens:d.uncertainTokens})),originalsModified:false,ocrUsed:false});return;
  }
  const state=JSON.parse(readFileSync(resolve(DIR,'private-state.json'),'utf8'));
  if(state.name!=='hub-advisor-pr88-word-staging'||!/^https:\/\/hub-advisor-pr88-word-staging\.[a-z0-9-]+\.workers\.dev$/.test(state.origin))throw Error('ISOLATION_FAILED');
  if(process.argv.includes('--index-detail')||process.argv.includes('--retrieval-debug')){
    const token=readFileSync('.cache/cloudflare/xdg/.wrangler/config/default.toml','utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!token)throw Error('AUTH_UNAVAILABLE');
    if(process.argv.includes('--retrieval-debug')){
      const uploads=readdirSync(resolve(DIR,'browser-results')).filter(f=>f.startsWith('upload-')).map(f=>JSON.parse(readFileSync(resolve(DIR,'browser-results',f))));
      const document=uploads.map(u=>u.document).find(d=>d?.category==='student_conduct');if(!document)throw Error('DOCUMENT_NOT_UPLOADED');
      const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${state.account}/ai-search/namespaces/default/instances/${state.name}/search`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:'Nội dung đánh giá Khung điểm',ai_search_options:{retrieval:{retrieval_type:'hybrid',match_threshold:0.4,max_num_results:10,filters:{document_id:{$in:[document.id]},active:true,visibility:'public'}}}})}),j=await r.json();
      if(!r.ok){emit({phase:'word_retrieval_debug',http:r.status,result:'BLOCKED'});return;}
      writeFileSync(resolve(DIR,'conduct-retrieval-private.json'),JSON.stringify(j));
      const chunks=j.result?.chunks||j.chunks||[];
      emit({phase:'word_retrieval_debug',http:r.status,chunks:chunks.map(c=>({unit:Number(c.item?.key?.match(/page-(\d+)/)?.[1]),score:c.score,explicitScale:/thang điểm 100/.test(c.text),tableHeader:/Nội dung đánh giá.*Khung điểm/.test(c.text)}))});return;
    }
    const items=[];
    for(let page=1;page<=2;page++){
      const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${state.account}/ai-search/namespaces/default/instances/${state.name}/items?per_page=50&page=${page}`,{headers:{Authorization:`Bearer ${token}`}}),j=await r.json();
      if(!r.ok||!Array.isArray(j.result)){emit({phase:'word_index_detail',http:r.status,result:'BLOCKED'});return;}
      items.push(...j.result);if(items.length>=j.result_info?.total_count)break;
    }
    emit({phase:'word_index_detail',items:items.length,states:items.reduce((counts,i)=>{counts[i.status]=(counts[i.status]||0)+1;return counts;},{}),metadataKeys:[...new Set(items.flatMap(i=>Object.keys(i.metadata||{})))]});return;
  }
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const context=await browser.newContext(),page=await context.newPage();await page.goto(state.origin);
    await page.getByLabel('Email kiểm thử').fill(state.email);await page.getByLabel('Mật khẩu kiểm thử').fill(state.password);
    await page.getByRole('button',{name:'Đăng nhập staging',exact:true}).click();await page.getByRole('heading',{name:'Kho tài liệu AI'}).waitFor({timeout:30000});
    const list=await(await context.request.get(`${state.origin}/api/admin/v1/ai-documents`)).json(),docs=list.documents||list.data||[];
    const sources=JSON.parse(readFileSync(resolve(DIR,'source-inspection-private.json')));
    if(docs.some(d=>!sources.some(s=>s.sourceHash===d.content_hash)))throw Error('UNEXPECTED_STAGING_DOCUMENT');
    const statuses=[];
    for(const source of sources){const d=docs.find(d=>d.content_hash===source.sourceHash);if(!d){statuses.push({topic:source.topic,uploaded:false});continue;}
      const r=await context.request.get(`${state.origin}/api/admin/v1/ai-documents?id=${encodeURIComponent(d.id)}`),j=await r.json();
      statuses.push({topic:source.topic,uploaded:true,http:r.status(),aiSearchStatus:j.document?.ai_search_status,geminiStatus:j.document?.gemini_indexing_status,ocrUsed:j.document?.ocr_used,units:j.document?.ocr_page_count});}
    emit({phase:'word_provider_index_status',documents:statuses,productionChanged:false});
    if(process.argv.includes('--gemini')){
      const cases=JSON.parse(readFileSync(resolve(DIR,'acceptance-private.json')));
      for(const index of [1,7]){
        const c=cases[index],document=docs.find(d=>d.content_hash===c.sourceHash),started=Date.now();
        const r=await context.request.post(`${state.origin}/api/staging/ai-advisor-gemini`,{data:{question:c.question,history:[]},timeout:90000}),payload=await r.json();
        writeFileSync(resolve(DIR,`gemini-case-${index+1}-private.json`),JSON.stringify(payload));
        const text=String(payload.reply||'').normalize('NFC'),citations=payload.documentSources||[];
        emit({phase:'word_gemini_probe',case:index+1,http:r.status(),durationMs:Date.now()-started,
          expectedFactsPresent:c.contains.every(f=>text.includes(f)),correctDocument:citations.some(s=>s.documentId===document?.id),
          status:payload.documentSearchStatus||null,unavailable:payload.documentSearchUnavailable===true,metrics:payload.stagingMetrics});
      }
    }
  }finally{await browser.close();}
}
main().catch(e=>{emit({phase:'word_staging',result:'BLOCKED',reason:['SOURCE_REQUIRED','AMBIGUOUS_SOURCE','SOURCE_EXPECTATION_MISSING','ISOLATION_FAILED','UNEXPECTED_STAGING_DOCUMENT'].includes(e.message)?e.message:e.name});process.exitCode=1;});
