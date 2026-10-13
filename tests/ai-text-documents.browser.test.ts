import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {textFixture,TEXT_ORIGIN} from './fixtures/ai-text-documents.ts';

test('Text-first real browser: draft, table preview, full index, explicit publish, edit history and 390px',{timeout:120000},async()=>{
  const executable=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
  assert.ok(executable,'A Chrome executable is required; no silently skipped browser acceptance.');
  // Bundle the actual component without PWA/dev proxy; reuse the real built CSS.
  const bundled=await build({entryPoints:['tests/browser/ai-text-document-entry.tsx'],bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic'});
  const cssFile=readdirSync('dist/assets').find(name=>name.endsWith('.css'));assert.ok(cssFile,'Run frontend build before browser acceptance.');
  const css=readFileSync(`dist/assets/${cssFile}`),javascript=bundled.outputFiles[0].text;
  const server=createServer((req,res)=>{
    if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(javascript);}
    else if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css);}
    else if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="vi"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');}
    else{res.statusCode=404;res.end();}
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(5197,'127.0.0.1',resolve);});
  const fixture=textFixture(),browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();page.setDefaultTimeout(20000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.name));
    await page.route('**/api/admin/v1/ai-text-documents**',async route=>{
      const request=route.request(),url=new URL(request.url());
      try{const data=await fixture.call(request.method()==='POST'?request.postDataJSON():undefined,url.searchParams.get('id')||undefined);
        await route.fulfill({status:200,json:data});}
      catch(e){await route.fulfill({status:(e as {status?:number}).status||500,json:{error:e instanceof Error?e.message:'Unavailable'}});}
    });
    await page.goto(TEXT_ORIGIN,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Tạo tài liệu',exact:true}).click();
    await page.getByLabel('Tên tài liệu *',{exact:true}).fill('Quy chế kiểm thử Text-first');
    await page.getByLabel('Phạm vi khi công bố').selectOption('public');
    const raw='Điều 3. Học phí\n\n| Khóa | Học phí |\n|---|---|\n|39|25.600.000 đồng/năm|\n\nMục 2. Phạm vi\n\nKhông suy đoán số liệu.';
    await page.getByLabel('Nội dung tài liệu',{exact:true}).fill(raw);
    await page.getByRole('button',{name:'Xem trước văn bản và bảng'}).click();
    await page.getByRole('cell',{name:'25.600.000 đồng/năm',exact:true}).waitFor();
    await page.getByRole('button',{name:'Lưu bản nháp',exact:true}).click();
    await page.waitForFunction(()=>document.body.textContent?.includes('v1: Bản nháp'));
    assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS n FROM ai_documents').get()?.n,0);
    assert.equal(fixture.uploads,0);
    await page.getByRole('button',{name:'Lưu và lập chỉ mục AI',exact:true}).click();
    await page.getByRole('button',{name:'Kiểm tra đủ index'}).waitFor();
    await page.getByRole('button',{name:'Kiểm tra đủ index'}).click();
    assert.equal(await page.getByRole('button',{name:'Công bố revision đã kiểm tra'}).count(),0);
    for(const item of fixture.receipts.values())item.status='completed';
    await page.getByRole('button',{name:'Kiểm tra đủ index'}).click();
    const publish=page.getByRole('button',{name:'Công bố revision đã kiểm tra'});await publish.waitFor();assert.equal(await publish.isDisabled(),true);
    await page.getByRole('checkbox').check();await publish.click();
    await page.waitForFunction(()=>document.body.textContent?.includes('v1: Đã công bố'));
    assert.equal(fixture.sql.prepare("SELECT COUNT(*) AS n FROM ai_documents WHERE indexing_status='completed'").get()?.n,1);
    await page.getByRole('button',{name:'Soạn thảo',exact:true}).click();await page.getByLabel('Nội dung tài liệu',{exact:true}).fill(raw+'\n\nĐiều 4. Revision mới');
    await page.getByRole('button',{name:'Lưu bản nháp',exact:true}).click();await page.waitForFunction(()=>document.body.textContent?.includes('v2: Bản nháp'));
    assert.equal(fixture.sql.prepare("SELECT COUNT(*) AS n FROM ai_documents WHERE indexing_status='completed'").get()?.n,1);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    assert.equal(await page.getByRole('button',{name:'Lưu và lập chỉ mục AI',exact:true}).isVisible(),true);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();fixture.sql.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
