import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir, unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {canEditCampaign, campaignFormError, checkedAdminPage} from '../utils/scholarshipAdminModel.ts';
import {fetchAdminCampaigns, fetchAdminImports, fetchAdminImportRows, fetchAdminAudit, updateAdminCampaign,
  scholarshipFetch, ScholarshipApiError, mapScholarshipErrorCode} from '../utils/scholarshipApi.ts';
import {portraitDimensions, portraitLimits, loadScholarshipPortrait} from '../utils/scholarshipPortrait.ts';
import {celebrationTextLayout} from '../utils/scholarshipCelebrationModel.ts';

test('Admin draft form rejects invalid metadata and never enables protected campaign states', () => {
  const fields={title:'Học bổng',schoolYear:'2026-2027',semester:'HK1'};
  assert.equal(campaignFormError(fields,'draft-1'),null);
  for (const slug of ['','-draft','UPPER','x'.repeat(65)]) assert.ok(campaignFormError(fields,slug));
  for (const [key,limit] of [['title',240],['schoolYear',80],['semester',80]] as const) {
    for (const value of ['', '  ', 'x'.repeat(limit+1), 'x\u0000']) assert.ok(campaignFormError({...fields,[key]:value}));
  }
  for (const status of ['validated','approved','published','archived','unknown']) assert.equal(canEditCampaign({status} as any),false);
  assert.equal(canEditCampaign({status:'draft'} as any),true);
  assert.equal(canEditCampaign(null),false);
  assert.throws(()=>checkedAdminPage({page:1,limit:20,total:-1},1));
  assert.throws(()=>checkedAdminPage({page:1,limit:20,total:30},2));
});

test('Admin modal, retry errors and pagination render accessible states with full totals', async t => {
  await mkdir('.cache',{recursive:true});
  const output=process.cwd()+'/.cache/scholarship-hardening-components.cjs';
  await build({entryPoints:['features/scholarships/ScholarshipAdminControls.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',outfile:output,logLevel:'silent'});
  t.after(()=>unlink(output));
  const {AdminModal,AdminErrorNotice,AdminPagination}=createRequire(import.meta.url)(output);
  const modal=renderToStaticMarkup(React.createElement(AdminModal,{title:'Sửa thông tin chiến dịch',busy:true,close:()=>{}},React.createElement('input',{value:'Giá trị hiện tại',disabled:true,readOnly:true})));
  assert.match(modal,/role="dialog"/); assert.match(modal,/aria-modal="true"/); assert.match(modal,/aria-busy="true"/); assert.match(modal,/Giá trị hiện tại/);
  const notice=renderToStaticMarkup(React.createElement(AdminErrorNotice,{message:'Phiên đăng nhập đã hết hạn.',retry:()=>{}}));
  assert.match(notice,/role="alert"/); assert.match(notice,/Thử lại/);
  const pager=renderToStaticMarkup(React.createElement(AdminPagination,{label:'Nhật ký',page:2,total:45,loading:false,onPage:()=>{}}));
  assert.match(pager,/45/); assert.match(pager,/Trang 2 \/ 3/); assert.match(pager,/aria-label="Nhật ký"/);
});

test('Admin API forwards real pagination and revision, and session/permission/conflict responses are localized', async t => {
  const original=globalThis.fetch; t.after(()=>{globalThis.fetch=original;});
  const requests: {url:string;init?:RequestInit}[]=[];
  globalThis.fetch=async (input,init)=>{requests.push({url:String(input),init});return Response.json({page:2,limit:20,total:42});};
  await fetchAdminCampaigns({page:2,limit:20}); await fetchAdminImports('synthetic',{page:2,limit:20});
  await fetchAdminImportRows('synthetic','a'.repeat(64),{page:2,limit:20}); await fetchAdminAudit('synthetic',{page:2,limit:20});
  for (const req of requests) {assert.match(req.url,/page=2&limit=20/);assert.equal(req.init?.credentials,'include');}
  await updateAdminCampaign('synthetic',{expectedRevision:7,title:'Học bổng'});
  assert.equal(requests[4].init?.method,'PATCH'); assert.equal(JSON.parse(String(requests[4].init?.body)).expectedRevision,7);
  for (const status of [401,403,409,503]) {
    globalThis.fetch=async()=>Response.json({error:'UNLISTED_SERVER_CODE'},{status});
    await assert.rejects(fetchAdminCampaigns(),error=>error instanceof ScholarshipApiError && error.status===status && !error.message.includes('UNLISTED_SERVER_CODE'));
  }
  assert.match(mapScholarshipErrorCode('EDIT_REQUIRES_DRAFT',409),/bản nháp/);
});

test('Scholarship requests time out across body reads, preserve explicit cancellation and never retry mutations', async t => {
  const original=globalThis.fetch; t.after(()=>{globalThis.fetch=original;}); let calls=0;
  globalThis.fetch=async (_input,init)=>{calls++; return new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));};
  await assert.rejects(scholarshipFetch('/synthetic',{method:'POST'},10),error=>error instanceof ScholarshipApiError && error.status===408);
  assert.equal(calls,1);
  const abort=new AbortController(); const pending=scholarshipFetch('/synthetic',{signal:abort.signal},1000); abort.abort();
  await assert.rejects(pending,{name:'AbortError'});
  globalThis.fetch=async (_input,init)=>new Response(new ReadableStream({start(controller){init?.signal?.addEventListener('abort',()=>controller.error(new DOMException('aborted','AbortError')));}}));
  await assert.rejects(scholarshipFetch('/synthetic',{},10),error=>error instanceof ScholarshipApiError && error.status===408);
});

const png=(width:number,height:number)=>{const b=new Uint8Array(45);b.set([137,80,78,71,13,10,26,10]);const v=new DataView(b.buffer);v.setUint32(8,13);b.set([73,72,68,82],12);v.setUint32(16,width);v.setUint32(20,height);b.set([73,69,78,68],37);return b;};
test('Portrait headers reject disguised, animated, truncated, oversized and excessive decoded dimensions before decoding', () => {
  assert.deepEqual(portraitDimensions(png(400,300),'image/png'),{width:400,height:300,type:'image/png'});
  for (const [w,h] of [[0,4],[4097,1],[4000,4000]]) assert.throws(()=>portraitDimensions(png(w,h),'image/png'));
  assert.throws(()=>portraitDimensions(png(1,1),'image/jpeg'));
  assert.throws(()=>portraitDimensions(new Uint8Array(11),'image/png'));
  assert.throws(()=>portraitDimensions(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),'image/png'));
  const animated=png(1,1);animated.set([97,99,84,76],37);assert.throws(()=>portraitDimensions(animated,'image/png'));
  const webp=Uint8Array.from([82,73,70,70,18,0,0,0,87,69,66,80,86,80,56,76,5,0,0,0,47,0,0,0,0,0]);
  assert.deepEqual(portraitDimensions(webp,'image/webp'),{width:1,height:1,type:'image/webp'});
  const bad=webp.slice();bad[4]=20;assert.throws(()=>portraitDimensions(bad,'image/webp'));
  const jpeg=Uint8Array.from([255,216,255,192,0,8,8,0,2,0,3,1,255,217]);
  assert.deepEqual(portraitDimensions(jpeg,'image/jpeg'),{width:3,height:2,type:'image/jpeg'});
});

test('Portrait loader handles decode failure, mismatched decoded size and cancellation and revokes resources', async t => {
  const originalImage=globalThis.Image, create=URL.createObjectURL, revoke=URL.revokeObjectURL;
  const urls:string[]=[], revoked:string[]=[]; let mode='valid';
  URL.createObjectURL=()=>{const url='blob:synthetic-'+urls.length;urls.push(url);return url;}; URL.revokeObjectURL=url=>revoked.push(url);
  class FakeImage {onload:(()=>void)|null=null;onerror:(()=>void)|null=null;naturalWidth=400;naturalHeight=300;
    set src(value:string){if(!value)return;if(mode==='pending')return;if(mode==='large')this.naturalWidth=5000;queueMicrotask(()=>mode==='bad'?this.onerror?.():this.onload?.());}}
  globalThis.Image=FakeImage as any;
  t.after(()=>{globalThis.Image=originalImage;URL.createObjectURL=create;URL.revokeObjectURL=revoke;});
  const file=new File([png(400,300)],'synthetic.png',{type:'image/png'});
  const valid=await loadScholarshipPortrait(file,new AbortController().signal); valid.dispose();assert.equal(revoked.length,1);
  for (mode of ['bad','large']) await assert.rejects(loadScholarshipPortrait(file,new AbortController().signal));
  mode='pending';const controller=new AbortController();const pending=loadScholarshipPortrait(file,controller.signal);setImmediate(()=>controller.abort());await assert.rejects(pending,{name:'AbortError'});
  assert.equal(revoked.length,urls.length);
  await assert.rejects(loadScholarshipPortrait(new File([new Uint8Array(portraitLimits.bytes+1)],'large.png'),new AbortController().signal));
});

test('Story/Feed long Vietnamese student and campaign text fits bounded lines without losing source characters', () => {
  for (const text of ['Nguyễn Thị '.repeat(16),'Quyết định học bổng '.repeat(12),'X'.repeat(240)]) {
    const layout=celebrationTextLayout(text,(value,size)=>Array.from(value).length*size*0.6,920,58,12,2);
    assert.ok(layout.lines.length<=2); assert.equal(layout.lines.join(''),text);
    assert.ok(layout.size>=12 && layout.size<=58);
  }
  const name='Sinh viên kiểm thử có họ tên rất dài '.repeat(8).slice(0,160).trim().toUpperCase();
  const layout=celebrationTextLayout(name,(text,size)=>Array.from(text).length*(size*0.65+1),920,58,24,3);
  assert.equal(layout.lines.join(''),name);
  assert.ok(layout.lines.length<=3 && layout.lines.every(line=>Array.from(line).length*(layout.size*0.65+1)<=920));
});
