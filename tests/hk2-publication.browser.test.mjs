import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright-core';
import {acceptancePlugin} from './mobile-overlay-acceptance-plugin.mjs';
import {publicationFixture,USER} from './hk2-publication-fixture.mjs';
import {handleCourses} from '../cloudflare/worker/src/courses.ts';

test('actual desktop/mobile components ignore stale HK2 pages; real client + local D1 keep partial imports hidden including PWA fetches',{timeout:240000},async t=>{
  const fixture=await publicationFixture();t.after(()=>fixture.mf.dispose());await fixture.migrate();await fixture.insertTo(1);
  const requests=[];
  const plugin={name:'local-hk2-publication-transport',configureServer(server){server.middlewares.use(async(req,res,next)=>{
    const url=new URL(req.url,'http://fixture.local');
    if(url.pathname==='/courses'||url.pathname==='/api/courses'){
      const result=await handleCourses(url,{DB:fixture.db});requests.push({query:url.search,total:result.payload.total});
      res.statusCode=result.status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(result.payload));return;
    }
    if(!url.pathname.startsWith('/api/'))return next();
    let payload={success:true,data:[],revisions:{},total:0};
    if(url.pathname==='/api/auth/get-session')payload={session:{id:'fixture-session',userId:USER,expiresAt:'2099-01-01'},user:{id:USER,email:'fixture@example.invalid',name:'Fixture student'}};
    if(url.pathname==='/api/private/v1/me')payload={userId:USER,email:'fixture@example.invalid',role:'user'};
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(payload));
  });}};
  const server=await createServer({configFile:false,envDir:false,plugins:[plugin,acceptancePlugin(),react()],cacheDir:'node_modules/.vite-hk2-gate-acceptance',
    server:{host:'127.0.0.1',port:0,hmr:false,watch:null},optimizeDeps:{entries:['tests/hk2-publication-browser.html']},logLevel:'error'});
  t.after(()=>server.close());await server.listen();const origin=server.resolvedUrls.local[0];
  await server.environments.client.warmupRequest('/tests/hk2-publication-browser.tsx');
  await server.environments.client.warmupRequest('/index.css');
  await server.waitForRequestsIdle();
  const executable=process.env.CHROME_PATH||['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
  assert.ok(executable,'Installed Chrome required for browser acceptance');
  const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});t.after(()=>browser.close());
  await mkdir('.cache/hk2-publication-browser',{recursive:true});
  for(const [surface,width,height]of[['desktop',1366,900],['mobile',390,844]]){
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:'allow'});const page=await context.newPage();
    page.setDefaultTimeout(60_000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await context.route(url=>!url.href.startsWith(origin),route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
    await page.addInitScript(()=>{localStorage.setItem('hub_schedule_board_update_notice_hidden_v1','true');localStorage.setItem('push_prompt_dismissed:11111111-1111-4111-8111-111111111111','true');});
    await page.goto(`${origin}tests/hk2-publication-browser.html?surface=${surface}`,{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForFunction(()=>window.gateClient&&window.acceptanceState&&document.getElementById('root')?.childElementCount>0,null,{timeout:120000});
    const cacheResult=await page.evaluate(async()=>{
      const client=window.gateClient,scope=JSON.stringify({semester:'HK2_2026_2027'});
      const fake={data:[{id:'stale-unpublished',subject_name:'UNPUBLISHED-CACHE-LEAK'}],total:25,hasMore:true,cachedAt:Date.now()};
      localStorage.setItem(client.getScheduleCoursePageCacheKey(scope,0),JSON.stringify(fake));
      localStorage.setItem('hub_schedule_course_page_v1:old:0',JSON.stringify(fake));
      const cached=client.readScheduleCoursePageCache(scope,0);
      await navigator.serviceWorker.register('/hub-sw.js');await navigator.serviceWorker.ready;
      const response=await client.fetchPublicCourses('/courses?semester=HK2_2026_2027');
      return{cached,payload:await response.json(),cacheControl:response.headers.get('Cache-Control')};
    });
    assert.equal(cacheResult.cached,null);assert.equal(cacheResult.payload.total,0);assert.equal(cacheResult.cacheControl,'no-store');
    const nextResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/courses'&&!new URL(r.url()).searchParams.has('resource')&&new URL(r.url()).searchParams.getAll('semester').includes('HK2_2026_2027'));
    await page.evaluate(surface=>window.acceptanceState(`components/${surface==='desktop'?'ScheduleBoard':'MobileSchedule'}.tsx`,surface==='desktop'
      ?{selectedFilterSemesters:['HK2_2026_2027'],searchTerm:'AI',isCourseResultsOpen:true}
      :{selectedSemester:'HK2_2026_2027',searchTerm:'AI'}),surface);
    const loaded=await nextResponse;assert.equal((await loaded.json()).total,0);
    assert.ok(!(await page.locator('body').innerText()).includes('UNPUBLISHED-CACHE-LEAK'));
    const hk1=await page.evaluate(async()=>await(await window.gateClient.fetchPublicCourses('/courses?semester=HK1_2026_2027')).json());
    assert.equal(hk1.total,1);assert.equal(hk1.data[0].subject_name,'HK1 unchanged');
    assert.deepEqual(errors,[]);await page.screenshot({path:`.cache/hk2-publication-browser/${surface}.png`,fullPage:false});
    await context.close();
  }
  assert.ok(requests.some(r=>r.query.includes('HK2_2026_2027')&&r.total===0));
});
