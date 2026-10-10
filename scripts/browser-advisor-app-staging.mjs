// Real browser acceptance runner. Fresh disposable browser, no production session.
import {chromium} from 'playwright-core';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {CONDUCT_ACCEPTANCE_QUESTIONS} from './verify-advisor-conduct-providers.mjs';
const emit=v=>console.log(JSON.stringify(v));
async function main(){
  const state=JSON.parse(readFileSync('.cache/advisor-app-staging/private-state.json','utf8'));
  if(state.name!=='hub-advisor-pr88-app-staging'||!/^https:\/\/hub-advisor-pr88-app-staging\.[a-z0-9-]+\.workers\.dev$/.test(state.origin))throw Error('ISOLATION_FAILED');
  const dir=resolve('.cache/advisor-app-staging/browser-results');mkdirSync(dir,{recursive:true});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1365,height:900}}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.name));
    await page.goto(state.origin);await page.getByLabel('Email kiểm thử').fill(state.email);await page.getByLabel('Mật khẩu kiểm thử').fill(state.password);
    await page.getByRole('button',{name:'Đăng nhập staging',exact:true}).click();
    await page.getByRole('heading',{name:'Kho tài liệu AI'}).waitFor({timeout:30000});
    emit({phase:'browser_login',result:'PASS',realBetterAuthCookie:true,productionSessionUsed:false});
    if(process.argv.includes('--upload')){
      const arg=process.argv.indexOf('--pdf');if(arg<0)throw Error('PDF_REQUIRED');
      const listed=await(await context.request.get(`${state.origin}/api/admin/v1/ai-documents`)).json();
      if(listed.total||listed.documents?.length)throw Error('STAGING_ALREADY_UPLOADED');
      await page.getByRole('button',{name:/Tải tài liệu/}).click();
      await page.locator('input[type=file]').setInputFiles(process.argv[arg+1]);
      await page.getByLabel('Tiêu đề',{exact:true}).fill('Quy chế đánh giá kết quả rèn luyện sinh viên');
      const upload=page.waitForResponse(r=>r.url()===`${state.origin}/api/admin/v1/ai-documents`&&r.request().method()==='POST',{timeout:600000});
      const t=Date.now();await page.getByRole('button',{name:'Tải và lập chỉ mục',exact:true}).click();
      // Real UX warns about unreadable OCR cells; explicitly acknowledge the
      // staging-only test artifact, never silently suppress this warning.
      const confirm=page.getByRole('button',{name:'Xác nhận',exact:true});
      await Promise.race([upload,confirm.waitFor({timeout:600000}).then(async()=>{emit({phase:'browser_ocr_warning',acknowledged:true,legalIdentityNotAssumed:true});await confirm.click();})]);
      const response=await upload,data=await response.json();
      writeFileSync(resolve(dir,'upload-result-local.json'),JSON.stringify(data));
      emit({phase:'browser_upload_ocr',httpStatus:response.status(),durationMs:Date.now()-t,ocrPages:data.document?.ocr_page_count,ocrUsed:data.document?.ocr_used,uncertainTokens:data.document?.ocr_uncertain_tokens,aiSearchStatus:data.document?.ai_search_status,geminiStatus:data.document?.gemini_indexing_status,pageErrors:errors.length});
      return;
    }
    if(!process.argv.includes('--benchmark'))throw Error('ACTION_REQUIRED');
    const list=await(await context.request.get(`${state.origin}/api/admin/v1/ai-documents`)).json();
    const docs=list.data||list.documents||[];
    if(!docs.length)throw Error('INDEX_NOT_READY');
    const document=await(await context.request.get(`${state.origin}/api/admin/v1/ai-documents?id=${encodeURIComponent(docs[0].id)}`)).json();
    writeFileSync(resolve(dir,'index-status-local.json'),JSON.stringify(document));
    const ready=document.data?.[0]||document.documents?.[0]||document.document||document;
    if(ready.ai_search_status!=='completed')throw Error('INDEX_NOT_READY');
    await page.locator('button.fixed.bottom-6').click();
    const consent=page.getByRole('button',{name:'Tôi đồng ý',exact:true});if(await consent.count())await consent.click();
    for(const [index,question]of CONDUCT_ACCEPTANCE_QUESTIONS.entries()){
      const caseArg=process.argv.indexOf('--case');if(caseArg>=0&&Number(process.argv[caseArg+1])!==index+1)continue;
      if(index>0)await page.getByRole('button',{name:'Cuộc trò chuyện mới',exact:true}).click();
      const t=Date.now();const response=page.waitForResponse(r=>r.url()===`${state.origin}/api/private/v1/ai-advisor`&&r.request().method()==='POST',{timeout:90000});
      const input=page.getByPlaceholder('Nhập câu hỏi tại đây...');await input.fill(question);await input.press('Enter');
      const r=await response,payload=await r.json();writeFileSync(resolve(dir,`case-${index+1}-local.json`),JSON.stringify(payload));
      const content=String(payload.reply||'');const durationMs=Date.now()-t;
      // Markdown tables/lists split text into DOM nodes; compare normalized
      // visible text rather than demanding one exact raw-Markdown node.
      const marker=content.replace(/<!--[\s\S]*?-->/g,'').replace(/[|*#_`>]/g,'').replace(/\s+/g,' ').trim().slice(0,50);
      const rendered=marker?await page.locator('body').innerText().then(text=>text.replace(/\s+/g,' ').includes(marker)):false;
      const citations=payload.documentSources||[];
      emit({phase:'browser_acceptance',case:index+1,httpStatus:r.status(),durationMs,visibleResponse:rendered,citations:citations.length,pages:citations.map(s=>s.pageNumbers||[s.pageNumber||null]),unavailable:payload.documentSearchUnavailable===true,pageErrors:errors.length,metrics:payload.stagingMetrics});
      await page.waitForTimeout(700);
      await page.screenshot({path:resolve(dir,`case-${index+1}-desktop.png`)});
    }
    await page.screenshot({path:resolve(dir,'advisor-desktop.png')});
  }finally{await browser.close();}
}
main().catch(e=>{emit({phase:'browser_staging',result:'BLOCKED',safeError:['ISOLATION_FAILED','PDF_REQUIRED','STAGING_ALREADY_UPLOADED','INDEX_NOT_READY','ACTION_REQUIRED'].includes(e.message)?e.message:e.name});process.exitCode=1;});
