// UI tests and local handoff use ONLY the existing disposable staging account.
// No automated approve/index/promote calls. Human review actions remain manual.
import {chromium} from 'playwright-core';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const emit=v=>console.log(JSON.stringify(v));
let phase='start';
async function main(){
  const state=JSON.parse(readFileSync('.cache/advisor-app-staging/private-state.json','utf8'));
  if(state.name!=='hub-advisor-pr88-app-staging'||!/^https:\/\/hub-advisor-pr88-app-staging\.[a-z0-9-]+\.workers\.dev$/.test(state.origin))throw Error('STAGING_ISOLATION_REQUIRED');
  const manual=process.argv.includes('--manual-review');
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:!manual});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name));
    const health=await(await context.request.get(`${state.origin}/health`)).json();
    if(health.sourceCommit!==execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim())throw Error('FINAL_COMMIT_MISMATCH');
    phase='login';await page.goto(state.origin);await page.getByLabel('Email kiểm thử').fill(state.email);await page.getByLabel('Mật khẩu kiểm thử').fill(state.password);
    await page.getByRole('button',{name:'Đăng nhập staging',exact:true}).click();await page.getByRole('heading',{name:'Kho tài liệu AI'}).waitFor({timeout:30000});
    const identity=await(await context.request.get(`${state.origin}/api/private/v1/me`)).json();if(identity.role!=='admin')throw Error('ADMIN_REQUIRED');
    phase='catalog';const docs=await(await context.request.get(`${state.origin}/api/admin/v1/ai-documents`)).json();
    const target=docs.documents.find(d=>d.content_hash==='9f87e2298f5b1a15817615c5b52ca8d41728f7da5aaf6b2872ae5bcd35a59391');if(!target)throw Error('SOURCE_NOT_FOUND');
    phase='open_review';await page.getByRole('button',{name:`Hiệu đính OCR ${target.title}`,exact:true}).click();
    phase='render_original';await page.getByLabel('Trang PDF',{exact:true}).selectOption('3');await page.getByText('Đã hiển thị trang PDF gốc',{exact:true}).waitFor({timeout:30000});
    const original=await context.request.get(`${state.origin}/api/staging/ocr-review?document=${target.id}&file=original`);
    if(original.status()!==200)throw Error('ORIGINAL_UNAVAILABLE');
    if(manual){
      emit({status:'AWAITING_ADMIN_REVIEW',stagingOnly:true,reviewerAccount:'isolated_staging_admin',automatedApproval:false,productionChanged:false});
      // User controls this visible browser. Do not watch/capture their edits or click approval.
      await new Promise(resolveClose=>browser.on('disconnected',resolveClose));return;
    }
    phase='security';const route=`${state.origin}/api/staging/ocr-review?document=${target.id}`;
    const anonymousContext=await browser.newContext();
    const anonymous=await anonymousContext.request.get(route);await anonymousContext.close();
    if(anonymous.status()!==401)throw Error('ANONYMOUS_NOT_BLOCKED');
    const read=await(await context.request.get(route)).json();
    const creates=await context.request.post(route,{headers:{Origin:state.origin},data:{action:'create',sourceHash:read.document.sourceHash,baseRevision:read.document.baseRevision,approved:true}});
    if(creates.status()!==400)throw Error('CLIENT_APPROVAL_NOT_BLOCKED');
    const baseline=await page.getByLabel('Nội dung hiệu đính trang',{exact:true}).inputValue();
    if(!baseline||await page.getByLabel('Nội dung hiệu đính trang',{exact:true}).getAttribute('readonly')===null)throw Error('BASELINE_UNAVAILABLE');
    // Staging-only draft persistence test. Save byte-equivalent baseline, NEVER approve content.
    phase='create_draft';await page.getByRole('button',{name:'Tạo bản nháp riêng',exact:true}).click();
    await page.getByText(/Trạng thái: draft/).waitFor();
    const editor=page.getByLabel('Nội dung hiệu đính trang',{exact:true});
    await editor.fill(baseline+'\n');await editor.fill(baseline);
    phase='save_unchanged_draft';await page.getByRole('button',{name:'Lưu bản nháp',exact:true}).click();
    await page.getByText(/lần lưu 2/).waitFor();
    if(!await page.getByRole('button',{name:'Phê duyệt nội dung đã đối chiếu',exact:true}).isDisabled())throw Error('APPROVAL_AUTOMATIC');
    const after=await(await context.request.get(route)).json();
    if(after.document.baseRevision!==read.document.baseRevision||after.document.sourceHash!==read.document.sourceHash)throw Error('LIVE_SOURCE_CHANGED');
    const dir=resolve('.cache/advisor-app-staging/review-browser-results');mkdirSync(dir,{recursive:true});
    await page.screenshot({path:resolve(dir,'desktop.png')});
    emit({phase:'review_ui_desktop',result:'PASS',originalPdfHttp:200,physicalPage:3,sideBySide:true,autoOcrDisplayed:true,anonymousHttp:401,clientApprovedRejected:400,pageErrors:errors.length,unchangedDraftSaved:true,noApprovalPerformed:true,liveRevisionUnchanged:true});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(dir,'mobile.png')});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    if(overflow||errors.length)throw Error('UI_REGRESSION');
    emit({phase:'review_ui_mobile',result:'PASS',width:390,horizontalOverflow:false,pageErrors:0});
  }finally{if(browser.isConnected())await browser.close();}
}
main().catch(error=>{emit({phase,result:'BLOCKED',reason:/^[A-Z_]+$/.test(error.message)?error.message:error.name,productionChanged:false,credentialsPrinted:false});process.exitCode=1;});
