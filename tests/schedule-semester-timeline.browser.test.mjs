import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright-core';
import {acceptancePlugin} from './mobile-overlay-acceptance-plugin.mjs';

const semesters=['HK1_2026_2027','HK2_2026_2027','HKHE_2026_2027'];
const labels=['HK1 (2026-2027)','HK2 (2026-2027)','Hè (2026-2027)'];
const course=(id,semester,credits=3)=>({id,semester,credits,course_code:id,subject_name:id,instructor:null,
  shift:'S',day_of_week:'2',weeks:'1-22',room:'LỚP ẢO',campus:'Fixture',phase:'1',major:'Fixture',cohort:'K52',
  academic_program:'Chính quy chuẩn',exam_date:'',exam_shift:''});
const personal=semesters.map((s,i)=>course(`Official ${i+1}`,s));
const plans={A:[course('Plan A HK1',semesters[0]),course('Plan A HK2',semesters[1],4)],B:[],
  C:[course('Plan C HK2',semesters[1],2),course('Plan C summer',semesters[2])]};
const catalog=[...personal,...Object.values(plans).flat(),course('Unselected catalogue course',semesters[1])];
const planKey='hub_schedule_plans_v1:fixture-user';
const server=await createServer({configFile:false,envDir:false,plugins:[acceptancePlugin(),react()],
  cacheDir:'node_modules/.vite-schedule-semester-timeline',optimizeDeps:{entries:['tests/schedule-filter-collapse-harness.html']},
  server:{host:'127.0.0.1',port:0,hmr:false,watch:null},logLevel:'error'});
await server.listen();
const base=server.resolvedUrls.local[0];
const executable=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
assert.ok(executable,'Installed Chrome required');
const browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox']});
test.after(async()=>{await browser.close();await server.close();});

async function fixture(width,legacy=false){
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Ho_Chi_Minh'});
  await context.addInitScript(({plans,planKey,legacy})=>{
    if(legacy)Object.defineProperty(navigator,'standalone',{value:true});
    localStorage.setItem('hub_schedule_board_update_notice_hidden_v1','true');
    localStorage.setItem('hub_timetable_filter_sidebar_expanded_v1','true');
    localStorage.setItem('hub_ai_third_party_consent_fixture-user','accepted');
    if(!sessionStorage.getItem('timeline-seeded')){
      localStorage.setItem(planKey,JSON.stringify(plans));sessionStorage.setItem('timeline-seeded','true');
    }
  },{plans,planKey,legacy});
  const writes=[],errors=[],reads=[];
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===new URL(base).origin&&!['fetch','xhr'].includes(request.resourceType()))return route.continue();
    if(request.method()!=='GET'){writes.push(url.pathname);return route.fulfill({status:400,json:{error:'Unexpected write'}});}
    reads.push(url.pathname+url.search);
    if(url.pathname==='/api/auth/get-session')return route.fulfill({json:{session:{id:'fixture-session'},user:{id:'fixture-user',email:'fixture@example.invalid',name:'Fixture'}}});
    if(url.pathname==='/api/private/v1/me')return route.fulfill({json:{userId:'fixture-user',role:'user'}});
    if(url.pathname==='/api/user/v1/schedules')return route.fulfill({json:{success:true,data:personal,revisions:Object.fromEntries(semesters.map(s=>[s,1]))}});
    if(url.pathname.endsWith('/courses')){
      if(url.searchParams.get('resource')==='filter-options')return route.fulfill({json:{subjectNameOptions:catalog.map(c=>c.subject_name),academicProgramOptions:['Chính quy chuẩn'],majorOptions:['Fixture'],cohortOptions:['K52'],groupNameOptions:[]}});
      const filters=url.searchParams.getAll('semester');
      const data=catalog.filter(c=>!filters.length||filters.includes(c.semester));
      return route.fulfill({json:{success:true,data,total:data.length,hasMore:false}});
    }
    return route.fulfill({json:{success:true,data:[],total:0,count:0,notifications:[],unread_count:0,sessions:[]}});
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-24T05:00:00Z'));
  await page.goto(`${base}tests/schedule-filter-collapse-harness.html?role=student${legacy?'&appPreview=1':''}`,{waitUntil:'networkidle',timeout:120000});
  await page.waitForFunction(()=>typeof window.acceptanceState==='function');
  if(!legacy)await page.getByRole('heading',{name:'Thời khóa biểu',exact:true}).waitFor();
  const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),planKey);
  assert.deepEqual(before,plans);
  return {page,context,writes,errors,reads};
}
const calendar=page=>page.locator('[data-schedule-calendar]');
const period=page=>page.locator('.timetable-period-trigger');
const frame=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function term(page,width,index){
  if(width<1024){
    await page.locator('button[aria-controls="timetable-filter-sidebar"]').click();
    const sheet=page.getByRole('dialog',{name:'Bộ lọc lớp học phần',exact:true});
    await sheet.getByRole('checkbox',{name:labels[index],exact:true}).check();
    for(let i=0;i<labels.length;i++)if(i!==index)await sheet.getByRole('checkbox',{name:labels[i],exact:true}).uncheck();
    await sheet.getByRole('button',{name:'Đóng bộ lọc lớp học phần',exact:true}).click();
  }else{
    const sidebar=page.locator('#timetable-filter-sidebar');
    await sidebar.getByRole('checkbox',{name:labels[index],exact:true}).check();
    for(let i=0;i<labels.length;i++)if(i!==index)await sidebar.getByRole('checkbox',{name:labels[i],exact:true}).uncheck();
  }
  await page.getByRole('region',{name:`Lịch ${labels[index]}`,exact:true}).waitFor();
  await frame(page);
}
async function assertWeek(page,week,start,end){
  assert.equal((await period(page).textContent()).trim(),`Tuần ${week}`);
  const text=await calendar(page).innerText();assert.ok(text.includes(start),text.slice(0,250));assert.ok(text.includes(end),text.slice(0,250));
}
async function mode(page,width,value){
  if(width<360)await page.getByRole('combobox',{name:'Chế độ xem lịch'}).selectOption(value);
  else await page.getByRole('button',{name:value==='week'?'Tuần':'Tháng',exact:true}).click();
}

for(const width of [1440,390,320])for(const planMode of [false,true]){
  test(`${width}px ${planMode?'plans A/B/C':'personal'}: HK1 → HK2 → summer, navigation, Today and persistence`,{timeout:180000},async t=>{
    const f=await fixture(width);t.after(()=>f.context.close());const p=f.page;
    if(planMode)await p.getByRole('button',{name:'Kế hoạch',exact:true}).click();
    // Reproduce the reported HK1 week 22 state, then use only real filter controls.
    await p.evaluate(()=>window.acceptanceState('components/ScheduleBoard.tsx',{selectedWeek:22,selectedMonthIndex:6}));
    await assertWeek(p,22,'25/01','31/01');
    const originalBox=await calendar(p).boundingBox();
    await period(p).click();
    assert.ok(await p.getByRole('button',{name:'Hiển thị Tổng quát',exact:true}).isVisible());
    await term(p,width,1);
    await assertWeek(p,1,'15/02','21/02');
    const nextBox=await calendar(p).boundingBox();
    for(const key of ['x','y','width'])assert.ok(Math.abs(originalBox[key]-nextBox[key])<1,`unchanged calendar ${key}`);
    assert.equal(await p.getByRole('button',{name:'Hiển thị Tổng quát',exact:true}).count(),0,'old week dropdown closed');
    assert.ok((await calendar(p).innerText()).includes(planMode?'Plan A HK2':'Official 2'));
    assert.ok(!(await calendar(p).innerText()).includes('Unselected catalogue course'));
    await p.getByRole('button',{name:'Tuần sau',exact:true}).click();await assertWeek(p,2,'22/02','28/02');
    await p.getByRole('button',{name:'Tuần trước',exact:true}).click();await assertWeek(p,1,'15/02','21/02');
    await mode(p,width,'month');assert.equal((await period(p).innerText()).trim(),'Tháng 2/2027');
    await p.getByRole('button',{name:'Tháng sau',exact:true}).click();assert.equal((await period(p).innerText()).trim(),'Tháng 3/2027');
    await p.getByRole('button',{name:'Tháng trước',exact:true}).click();
    await period(p).click();await term(p,width,2);
    assert.equal((await period(p).innerText()).trim(),'Tháng 7/2027');
    assert.equal(await p.getByRole('button',{name:'Tháng 9/2027',exact:true}).count(),0,'old month dropdown closed');
    await mode(p,width,'week');await assertWeek(p,1,'19/07','25/07');
    await term(p,width,0);await assertWeek(p,1,'31/08','06/09');
    await term(p,width,1);
    if(width>=1024){
      const sidebar=p.locator('#timetable-filter-sidebar');
      await sidebar.getByRole('checkbox',{name:labels[0],exact:true}).check();
      assert.equal(await calendar(p).getAttribute('aria-label'),`Lịch ${labels[1]}`,'multi-selection retains its selected anchor');
      await sidebar.getByRole('checkbox',{name:labels[1],exact:true}).uncheck();
      await assertWeek(p,1,'31/08','06/09');
      await term(p,width,1);
    }
    // A date in HK1 must not silently switch the single HK2 filter back to HK1.
    await p.getByRole('button',{name:'Hôm nay',exact:true}).click();await assertWeek(p,1,'15/02','21/02');
    assert.equal(await p.locator('.timetable-semester-chip').count(),1);
    assert.equal(await p.locator('.timetable-semester-chip').getAttribute('title'),labels[1]);
    await p.clock.setFixedTime(new Date('2027-03-16T05:00:00Z'));
    await p.getByRole('button',{name:'Hôm nay',exact:true}).click();await assertWeek(p,5,'15/03','21/03');
    await mode(p,width,'month');assert.equal((await period(p).innerText()).trim(),'Tháng 3/2027');
    await p.locator('.timetable-semester-chip').click();
    assert.equal(await p.locator('.timetable-semester-chip').count(),0);
    await p.getByRole('button',{name:'Hôm nay',exact:true}).click();
    assert.equal(await calendar(p).getAttribute('aria-label'),`Lịch ${labels[1]}`,'empty filters do not reinterpret the timeline');
    assert.equal((await period(p).innerText()).trim(),'Tháng 3/2027');
    if(planMode){
      const picker=p.getByRole('combobox',{name:'Phương án xếp lịch',exact:true});
      assert.match(await p.locator('.timetable-plan-summary').innerText(),/1 môn • 4 TC/);
      await picker.selectOption('B');assert.match(await p.locator('.timetable-plan-summary').innerText(),/0 môn • 0 TC/);
      assert.ok(!(await calendar(p).innerText()).includes('Plan A HK2'));
      assert.ok(!(await calendar(p).innerText()).includes('Official 2'));
      await picker.selectOption('C');assert.match(await p.locator('.timetable-plan-summary').innerText(),/1 môn • 2 TC/);
      await mode(p,width,'week');assert.ok((await calendar(p).innerText()).includes('Plan C HK2'));
      await p.getByRole('button',{name:'Lịch cá nhân',exact:true}).click();
      assert.ok((await calendar(p).innerText()).includes('Official 2'));
      await p.getByRole('button',{name:'Kế hoạch',exact:true}).click();assert.equal(await picker.inputValue(),'C');
    }
    assert.deepEqual(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),planKey),plans,'all saved plans survive filter/navigation/mode changes');
    await mkdir('.cache/schedule-semester-sync',{recursive:true});
    await p.screenshot({path:`.cache/schedule-semester-sync/${width}-${planMode?'plans':'personal'}.png`});
    assert.deepEqual(f.writes,[]);assert.deepEqual(f.errors,[]);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  });
}

test('week/month boundaries, advanced semester selector, multi-filter Today and reset retain the correct calendar',{timeout:120000},async t=>{
  const f=await fixture(1440);t.after(()=>f.context.close());const p=f.page;
  await term(p,1440,2);
  await period(p).click();await p.getByRole('button',{name:/^Tuần 7\s/}).click();
  await assertWeek(p,7,'30/08','05/09');
  await p.getByRole('button',{name:'Tuần sau',exact:true}).click();await assertWeek(p,7,'30/08','05/09');
  await p.getByRole('button',{name:'Tuần trước',exact:true}).click();await assertWeek(p,6,'23/08','29/08');
  await mode(p,1440,'month');assert.equal((await period(p).innerText()).trim(),'Tháng 7/2027');
  await p.getByRole('button',{name:'Tháng trước',exact:true}).click();assert.equal((await period(p).innerText()).trim(),'Tháng 7/2027');
  await period(p).click();await p.getByRole('button',{name:'Tháng 9/2027',exact:true}).click();
  await p.getByRole('button',{name:'Tháng sau',exact:true}).click();assert.equal((await period(p).innerText()).trim(),'Tháng 9/2027');
  await p.locator('#timetable-filter-sidebar').getByRole('button',{name:'Bộ lọc nâng cao',exact:true}).click();
  const advanced=p.getByRole('dialog',{name:'Bộ lọc nâng cao',exact:true});
  const select=advanced.locator('select').filter({has:p.locator('option[value="HK2_2026_2027"]')});
  await select.selectOption(semesters[1]);await advanced.getByRole('button',{name:'Đóng bộ lọc',exact:true}).click();
  assert.equal((await period(p).innerText()).trim(),'Tháng 2/2027');
  await mode(p,1440,'week');await assertWeek(p,1,'15/02','21/02');
  await p.getByRole('button',{name:'Tuần trước',exact:true}).click();assert.equal((await period(p).innerText()).trim(),'Tổng quát');
  await p.getByRole('button',{name:'Tuần trước',exact:true}).click();assert.equal((await period(p).innerText()).trim(),'Tổng quát');
  await p.getByRole('button',{name:'Tuần sau',exact:true}).click();await assertWeek(p,1,'15/02','21/02');
  await p.locator('#timetable-filter-sidebar').getByRole('checkbox',{name:labels[0],exact:true}).check();
  await p.clock.setFixedTime(new Date('2027-03-16T05:00:00Z'));
  await p.getByRole('button',{name:'Hôm nay',exact:true}).click();await assertWeek(p,5,'15/03','21/03');
  assert.equal(await p.locator('.timetable-semester-chip').count(),2);
  await p.locator('#timetable-filter-sidebar').getByRole('button',{name:'Bộ lọc nâng cao',exact:true}).click();
  await advanced.getByRole('button',{name:'Đặt lại',exact:true}).click();
  await advanced.getByRole('button',{name:'Đóng bộ lọc',exact:true}).click();
  assert.equal(await p.locator('.timetable-semester-chip').count(),0);await assertWeek(p,5,'15/03','21/03');
  assert.equal(await calendar(p).getAttribute('aria-label'),`Lịch ${labels[1]}`);
  assert.deepEqual(f.writes,[]);assert.deepEqual(f.errors,[]);
});

test('legacy MobileSchedule also resets a 22-week term to summer week 1 and closes its old dropdown',{timeout:120000},async t=>{
  const f=await fixture(390,true);t.after(()=>f.context.close());const p=f.page;
  await p.waitForFunction(()=>document.getElementById('mode')?.textContent==='standalone');
  await p.evaluate(()=>window.acceptanceState('components/MobileSchedule.tsx',{selectedWeek:22,selectedMonthIndex:6,isWeekDropdownOpen:true}));
  const select=p.locator('select').filter({has:p.locator('option[value="HKHE_2026_2027"]')}).first();
  await select.selectOption('HKHE_2026_2027');await frame(p);
  assert.equal(await p.getByText('Tổng quát',{exact:true}).count(),0,'old week dropdown closed');
  assert.ok(await p.getByRole('button',{name:'Tuần 1',exact:true}).count());
  assert.ok((await p.locator('body').innerText()).includes('19/07'));
  await select.selectOption('HK2_2026_2027');await frame(p);
  assert.ok((await p.locator('body').innerText()).includes('15/02'));
  assert.deepEqual(f.writes,[]);assert.deepEqual(f.errors,[]);
});
