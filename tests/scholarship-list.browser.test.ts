import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {existsSync, readFileSync, readdirSync, mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {handleAdminScholarships} from '../cloudflare/worker/src/scholarship-admin.ts';
import {handlePublicScholarships, scholarshipErrorStatus} from '../cloudflare/worker/src/scholarships.ts';
import {SCHOLARSHIP_MIGRATIONS} from '../scripts/scholarship-release-schema.mjs';
import {syntheticEligibility} from './fixtures/scholarship-eligibility.ts';

test('actual list browser + SQLite API: 12 approved columns, AND program filter, URL/paging/reset, drawer, empty/error at five sizes', {timeout:180000}, async () => {
  const executablePath=process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
  assert.ok(executablePath,'Chrome required');
  const sqlite=new DatabaseSync(':memory:');
  for(const file of SCHOLARSHIP_MIGRATIONS) sqlite.exec(readFileSync('cloudflare/migrations/'+file,'utf8'));
  const prepare=(sql:string)=>{
    let values:any[]=[];
    const statement={bind(...bound:any[]){values=bound;return statement;},async first(){return sqlite.prepare(sql).get(...values) ?? null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){return {success:true,meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}};}};
    return statement;
  };
  const DB={prepare,async batch(statements:ReturnType<typeof prepare>[]){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const env={DB,AUTH_SERVICE:{fetch:async()=>Response.json({userId:'11111111-1111-4111-8111-111111111111',email:'000000000001@st.buh.edu.vn',role:'admin'})}};
  const syntheticOrigin='https://example.test', slug='synthetic-eligibility';
  const admin=async(suffix:string,body:any)=>{
    const request=new Request(syntheticOrigin+'/api/admin/v1/scholarships/campaigns'+suffix,{method:'POST',headers:{Origin:syntheticOrigin,Cookie:'synthetic=session','Content-Type':'application/json'},body:JSON.stringify(body)});
    return handleAdminScholarships(request,new URL(request.url),env as never) as Promise<any>;
  };
  const data=syntheticEligibility();
  await admin('',{slug,title:'Danh sách xét học bổng kiểm thử',schoolYear:'2025-2026',semester:'HK2'});
  const preview=await admin('/'+slug+'/imports/preview',data), batchId=preview.receipt.batchId;
  await admin('/'+slug+'/imports/apply',{batchId,expectedRevision:0});
  await admin('/'+slug+'/approve',{batchId,expectedRevision:1,sourceSha256:data.sourceSha256,officialSource:{title:'Nguồn tổng hợp kiểm thử',reference:'SYNTHETIC ONLY',url:null},
    approvedFields:['studentCode','fullName','awardType','sourceOrdinal','className','major','cohort','trainingProgram','scholarshipRank','scores.gpa','scores.trainingScore','scores.credits','scores.amountVnd'],republicationConfirmed:true});
  await admin('/'+slug+'/publish',{batchId,expectedRevision:2});
  const bundled=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import {ScholarshipList} from './features/scholarships/ScholarshipList';createRoot(document.getElementById('root')).render(<BrowserRouter><ScholarshipList/></BrowserRouter>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',outdir:'.cache/scholarship-list/browser',plugins:[{name:'synthetic-anonymous',setup(builder){builder.onResolve({filter:/hooks\/useUserRole$/},()=>({path:'role',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useUserRole(){return {session:null,isAdmin:false,loading:false,bootstrapUnavailable:false};}'}));}}]});
  const javascript=bundled.outputFiles.find(file=>file.path.endsWith('.js'))!;
  const css=Buffer.concat(readdirSync('dist/assets').filter(name=>name.endsWith('.css')).map(name=>readFileSync('dist/assets/'+name)));
  let unavailable=false, paused=false;
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url!,'http://localhost');
    if(url.pathname.startsWith('/api/')) {
      if(unavailable){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Dịch vụ học bổng chưa sẵn sàng.'}));return;}
      if(paused) await new Promise(resolve=>setTimeout(resolve,350));
      try {const request=new Request(url.href);const result=await handlePublicScholarships(request,url,env as never);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));}
      catch(error){res.writeHead(scholarshipErrorStatus(error),{'Content-Type':'application/json'});res.end(JSON.stringify({error:error instanceof Error?error.message:'Unavailable'}));}return;
    }
    if(url.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(javascript.contents);}
    else if(url.pathname==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css);}
    else if(url.pathname.startsWith('/assets/') && existsSync('dist/assets/'+url.pathname.split('/').pop()))res.end(readFileSync('dist/assets/'+url.pathname.split('/').pop()));
    else if(url.pathname==='/logoapp.png')res.end(readFileSync('public/logoapp.png'));
    else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  mkdirSync('.cache/scholarship-list',{recursive:true});
  let browser;
  try {
    browser=await chromium.launch({executablePath,headless:true});
    for(const width of [360,390,768,1280,1440]) {
      const context=await browser.newContext({viewport:{width,height:960}}), page=await context.newPage(), errors:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(12000);
      await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      await page.goto(origin+'/scholarships');
      await page.getByText('Tổng số: 1.059 kết quả',{exact:true}).waitFor();
      assert.deepEqual(await page.locator('thead th').allTextContents(),['STT','MSSV','Họ tên','Mã Lớp SV','Ngành học','Khóa','Chương trình đào tạo','Điểm TB HB','Điểm RL','Số TC','Xếp loại HB','Thành tiền']);
      assert.match(await page.locator('h1').innerText(),/Danh sách (đủ điều kiện|xét)/);
      assert.match(await page.locator('main').evaluate(el=>getComputedStyle(el).fontFamily),/Inter/);
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.evaluate(()=>document.fonts.check('12px Inter')),true);
      assert.equal(await page.locator('tbody tr').count(),20);
      await page.getByRole('button',{name:'Sau',exact:true}).click();
      await page.getByText('Trang 2 / 53',{exact:true}).waitFor();
      assert.equal(await page.locator('tbody tr').first().locator('td').first().innerText(),'21');
      if(width<=780) await page.getByRole('button',{name:'Mở bộ lọc',exact:true}).click();
      paused=true;
      await page.getByLabel('Chương trình đào tạo',{exact:true}).selectOption('Chương trình kiểm thử A');
      await page.locator('.scholarship-skeleton').waitFor();paused=false;
      await page.getByText('Tổng số: 847 kết quả',{exact:true}).waitFor();
      assert.equal(new URL(page.url()).searchParams.has('page'),false);
      await page.getByLabel('Khóa',{exact:true}).selectOption('K24');
      const expected=data.rows.filter(({values})=>values['Chương trình đào tạo']==='Chương trình kiểm thử A'&&values['Khóa']==='K24');
      await page.getByText(`Tổng số: ${expected.length} kết quả`,{exact:true}).waitFor();
      await page.reload();await page.getByText(`Tổng số: ${expected.length} kết quả`,{exact:true}).waitFor();
      if(width<=780) await page.getByRole('button',{name:'Mở bộ lọc',exact:true}).click();
      assert.equal(await page.getByLabel('Chương trình đào tạo',{exact:true}).inputValue(),'Chương trình kiểm thử A');
      await page.getByRole('button',{name:'Thu gọn bộ lọc',exact:true}).click();
      const search=page.getByRole('searchbox',{name:'Họ tên / MSSV',exact:true});await search.fill('Không có sinh viên phù hợp');
      await page.getByText('Không tìm thấy sinh viên phù hợp với bộ lọc.',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Xóa bộ lọc',exact:true}).filter({visible:true}).click();
      await page.getByText('Tổng số: 1.059 kết quả',{exact:true}).waitFor();
      if(width<=780) {
        const menu=page.getByRole('button',{name:'Mở menu học bổng',exact:true});
        await menu.click();await page.keyboard.press('Escape');
      }
      const scroll=page.locator('.scholarship-table-scroll');
      if(width<1440) assert.equal(await scroll.evaluate(el=>el.scrollWidth>el.clientWidth),true,'narrow views scroll inside table');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:`.cache/scholarship-list/list-${width}.png`,fullPage:true,animations:'disabled'});
      await page.getByRole('button',{name:'Mở bộ lọc',exact:true}).click();
      await page.screenshot({path:`.cache/scholarship-list/list-expanded-${width}.png`,fullPage:true,animations:'disabled'});
      unavailable=true;await page.reload();await page.getByRole('button',{name:'Thử lại',exact:true}).waitFor();
      assert.doesNotMatch(await page.locator('main').innerText(),/Chưa có danh sách học bổng được công bố/);
      unavailable=false;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await page.getByText('Tổng số: 1.059 kết quả',{exact:true}).waitFor();
      assert.deepEqual(errors,[]);await context.close();
    }
  } finally {await browser?.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));sqlite.close();}
});
