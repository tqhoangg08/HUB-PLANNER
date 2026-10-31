import { requireBetterAuthStaff, BetterAuthIdentityError, type BetterAuthIdentityEnv } from './better-auth-identity.ts';
import { enqueueSchoolAnnouncementPush, type NotificationCronEnv } from './notification-cron.ts';
import { ANNOUNCEMENT_DEPARTMENTS } from '../../../shared/schoolAnnouncements.ts';

export interface AdminAnnouncementsEnv extends BetterAuthIdentityEnv, NotificationCronEnv { NOTIFICATION_JOBS_MODE?:string; }
export class AdminAnnouncementError extends Error {
  readonly status:400|403|404|405|409|413|415|503;
  constructor(status:AdminAnnouncementError['status'], message:string) { super(message); this.status=status; }
}
const departmentSql = `CASE WHEN a.department!='' THEN a.department ${ANNOUNCEMENT_DEPARTMENTS.map(([host,label])=>`WHEN instr(lower(a.link),'${host}')>0 THEN '${label}'`).join(' ')} ELSE 'HUB' END`;
const departmentSearchSql = `CASE WHEN a.department!='' THEN a.department_search ${ANNOUNCEMENT_DEPARTMENTS.map(([host,label])=>`WHEN instr(lower(a.link),'${host}')>0 THEN '${label.toLocaleLowerCase('vi-VN')}'`).join(' ')} ELSE 'hub' END`;
const pushSql = `CASE WHEN q.id IS NULL THEN 'none'
  WHEN q.last_error LIKE 'PRE_CUTOVER_SUPP%' THEN 'suppressed'
  WHEN q.failed_at IS NOT NULL THEN 'failed'
  WHEN q.sent_at IS NOT NULL THEN CASE WHEN q.sent_count>0 THEN 'sent' ELSE 'skipped' END
  WHEN q.next_retry_at IS NOT NULL THEN 'retrying'
  WHEN q.lease_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 'processing' ELSE 'queued' END`;
const columns = `a.id,a.title,a.link,a.date,${departmentSql} AS department,a.is_hidden,a.is_highlighted,
  a.source_kind,a.admin_revision,${pushSql} AS push_state,q.sent_at AS push_sent_at,q.last_error AS push_last_error,
  COALESCE(q.sent_count,0) AS push_sent_count,COALESCE(q.failed_count,0) AS push_failed_count,COALESCE(q.skipped_count,0) AS push_skipped_count`;
const from = 'FROM school_announcements a LEFT JOIN school_announcement_push_queue q ON q.announcement_id=a.id';
const publicRow = (row:Record<string,unknown>) => ({...row,date:typeof row.date==='string'?row.date:'',is_hidden:Boolean(row.is_hidden),is_highlighted:Boolean(row.is_highlighted)});
const idOf = (value:unknown) => {
  const id=Number(value); if(!Number.isSafeInteger(id)||id<=0) throw new AdminAnnouncementError(400,'ID thông báo không hợp lệ.'); return id;
};
const validDate = (value:unknown):value is string => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !value.startsWith('0000') && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
const rowById = (env:AdminAnnouncementsEnv,id:number) => env.DB.prepare(`SELECT ${columns} ${from} WHERE a.id=? AND a.is_deleted=0`).bind(id).first<Record<string,unknown>>();
const bodyOf = async (request:Request) => {
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json') throw new AdminAnnouncementError(415,'Yêu cầu phải là JSON.');
  if(Number(request.headers.get('Content-Length'))>8192) throw new AdminAnnouncementError(413,'Dữ liệu quá lớn.');
  const reader=request.body?.getReader(); if(!reader) throw new AdminAnnouncementError(400,'Thiếu dữ liệu.');
  const chunks:Uint8Array[]=[];let size=0;
  try { for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new AdminAnnouncementError(413,'Dữ liệu quá lớn.');}chunks.push(value);} }
  finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try { const body=JSON.parse(new TextDecoder().decode(bytes));if(!body||Array.isArray(body)||typeof body!=='object')throw Error();return body as Record<string,unknown>; }
  catch {throw new AdminAnnouncementError(400,'Dữ liệu không hợp lệ.');}
};
const revisionOf = (body:Record<string,unknown>) => { const revision=body.expectedRevision;if(typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<0)throw new AdminAnnouncementError(400,'Thiếu phiên bản thông báo.');return revision; };

export const handleAdminAnnouncements = async (request:Request, url:URL, env:AdminAnnouncementsEnv) => {
  const staff=await requireBetterAuthStaff(request,env);
  if(request.method==='GET') {
    if(url.searchParams.has('id')) {const row=await rowById(env,idOf(url.searchParams.get('id')));if(!row)throw new AdminAnnouncementError(404,'Không tìm thấy thông báo.');return {data:publicRow(row),role:staff.role};}
    const size=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||20));
    const rawOffset=Number(url.searchParams.get('offset')||0);
    if(!Number.isSafeInteger(rawOffset)||rawOffset<0)throw new AdminAnnouncementError(400,'Trang dữ liệu không hợp lệ.');
    const offset=rawOffset;
    const where=['a.is_deleted=0'];const args:Array<string|number>=[];
    const search=String(url.searchParams.get('search')||'').trim().slice(0,200).toLocaleLowerCase('vi-VN');
    if(search){where.push(`(a.title_search LIKE ? OR lower(a.link) LIKE ? OR (${departmentSearchSql}) LIKE ?)`);args.push(...Array(3).fill(`%${search}%`));}
    const department=url.searchParams.get('department');if(department){where.push(`(${departmentSql})=?`);args.push(department);}
    const visibility=url.searchParams.get('visibility');if(visibility==='visible'||visibility==='hidden'){where.push('a.is_hidden=?');args.push(visibility==='hidden'?1:0);}
    if(url.searchParams.get('highlighted')==='true')where.push('a.is_highlighted=1');
    for(const [key,op]of [['startDate','>='],['endDate','<=']]as const){const date=url.searchParams.get(key);if(date){if(!validDate(date))throw new AdminAnnouncementError(400,'Ngày lọc không hợp lệ.');where.push(`a.date${op}?`);args.push(date);}}
    const push=url.searchParams.get('push');if(push){if(!['none','queued','processing','retrying','sent','failed','skipped','suppressed'].includes(push))throw new AdminAnnouncementError(400,'Trạng thái push không hợp lệ.');where.push(`(${pushSql})=?`);args.push(push);}
    const order=url.searchParams.get('sort')==='asc'?'ASC':'DESC';const predicate=where.join(' AND ');
    const [rows,count,units]=await Promise.all([
      env.DB.prepare(`SELECT ${columns} ${from} WHERE ${predicate} ORDER BY a.date ${order},a.id ${order} LIMIT ? OFFSET ?`).bind(...args,Math.floor(size),offset).all<Record<string,unknown>>(),
      env.DB.prepare(`SELECT COUNT(*) AS total ${from} WHERE ${predicate}`).bind(...args).first<{total:number}>(),
      env.DB.prepare(`SELECT DISTINCT ${departmentSql} AS department FROM school_announcements a WHERE a.is_deleted=0 ORDER BY department`).all<{department:string}>(),
    ]);
    return {data:rows.results.map(publicRow),total:Number(count?.total||0),departments:units.results.map(row=>row.department),role:staff.role};
  }
  if(staff.role!=='admin')throw new AdminAnnouncementError(403,'Chỉ admin được thay đổi thông báo.');
  if(!['POST','PATCH','DELETE'].includes(request.method))throw new AdminAnnouncementError(405,'Phương thức không được hỗ trợ.');
  const body=await bodyOf(request);
  if(request.method==='POST' && body.action==='push') {
    const id=idOf(body.id), row=await rowById(env,id);
    if(!row)throw new AdminAnnouncementError(404,'Không tìm thấy thông báo.');
    if(row.is_hidden)throw new AdminAnnouncementError(409,'Cần hiển thị thông báo trước khi gửi push.');
    if(env.NOTIFICATION_JOBS_ENABLED!=='true'||env.NOTIFICATION_JOBS_MODE!=='enabled')throw new AdminAnnouncementError(503,'Hệ thống push đang tạm dừng.');
    const queued=await enqueueSchoolAnnouncementPush(env,{id,title:String(row.title),link:String(row.link)});
    const current=await rowById(env,id);
    if(!current||current.push_state==='none')throw new AdminAnnouncementError(409,'Thông báo vừa thay đổi. Vui lòng tải lại.');
    return {data:publicRow(current),inserted:queued.inserted,signaled:queued.signaled,deduplicated:!queued.inserted};
  }
  const fields:Record<string,unknown>={};
  for(const field of ['title','link','department','date','is_hidden','is_highlighted'])if(Object.hasOwn(body,field))fields[field]=body[field];
  for(const field of ['title','link','department']as const)if(field in fields){if(typeof fields[field]!=='string'||(field!=='department'&&!String(fields[field]).trim())||String(fields[field]).length>(field==='link'?2048:field==='title'?500:160))throw new AdminAnnouncementError(400,'Tiêu đề, liên kết hoặc đơn vị không hợp lệ.');fields[field]=String(fields[field]).trim();}
  if('department'in fields)fields.department_search=String(fields.department).toLocaleLowerCase('vi-VN');
  if('link'in fields){try{const link=new URL(String(fields.link));if(!['http:','https:'].includes(link.protocol)||link.username||link.password)throw Error();}catch{throw new AdminAnnouncementError(400,'URL nguồn phải là HTTP hoặc HTTPS hợp lệ.');}}
  if('date'in fields&&!validDate(fields.date))throw new AdminAnnouncementError(400,'Ngày đăng không hợp lệ.');
  for(const key of ['is_hidden','is_highlighted'])if(key in fields){if(typeof fields[key]!=='boolean')throw new AdminAnnouncementError(400,'Trạng thái không hợp lệ.');fields[key]=fields[key]?1:0;}
  const now=new Date().toISOString();let id:number;
  if(request.method==='POST') {
    if(!fields.title||!fields.link||!fields.date)throw new AdminAnnouncementError(400,'Cần tiêu đề, URL nguồn và ngày đăng.');
    const inserted=await env.DB.prepare(`INSERT INTO school_announcements
      (id,title,title_search,link,date,is_new,created_at,is_hidden,updated_at,department,department_search,is_highlighted,source_kind)
      SELECT (SELECT last_id+1 FROM announcement_id_sequence WHERE singleton=1),?,?,?,?,0,?,?,?,?,?,?,'manual'
      WHERE NOT EXISTS(SELECT 1 FROM school_announcements WHERE link=?) RETURNING id`)
      .bind(fields.title,String(fields.title).toLocaleLowerCase('vi-VN'),fields.link,fields.date,now,fields.is_hidden||0,now,fields.department||'',fields.department_search||'',fields.is_highlighted||0,fields.link).first<{id:number}>();
    if(!inserted)throw new AdminAnnouncementError(409,'URL này đã có thông báo.');id=inserted.id;
  } else {
    id=idOf(body.id);const revision=revisionOf(body);
    const existing=await rowById(env,id);
    if(!existing)throw new AdminAnnouncementError(404,'Không tìm thấy thông báo.');
    if(existing.source_kind==='crawler'&&'link'in fields&&fields.link!==existing.link)throw new AdminAnnouncementError(409,'URL của tin crawler là định danh nguồn và không thể thay đổi.');
    if(request.method==='DELETE'){fields.is_deleted=1;fields.is_hidden=1;}
    if(!Object.keys(fields).length)throw new AdminAnnouncementError(400,'Không có thay đổi.');
    if('title'in fields)fields.title_search=String(fields.title).toLocaleLowerCase('vi-VN');
    if(('title'in fields&&fields.title!==existing.title)||('date'in fields&&fields.date!==existing.date))fields.content_overridden=1;
    if('link'in fields){const duplicate=await env.DB.prepare('SELECT id FROM school_announcements WHERE link=? AND id!=?').bind(fields.link,id).first();if(duplicate)throw new AdminAnnouncementError(409,'URL này đã có thông báo.');}
    const entries=Object.entries(fields);
    const changed=await env.DB.prepare(`UPDATE school_announcements SET ${entries.map(([key])=>`${key}=?`).join(',')},updated_at=?,admin_revision=admin_revision+1 WHERE id=? AND is_deleted=0 AND admin_revision=? RETURNING id`)
      .bind(...entries.map(([,value])=>value as string|number),now,id,revision).first();
    if(!changed)throw new AdminAnnouncementError(409,'Thông báo vừa được sửa ở nơi khác. Vui lòng tải lại.');
  }
  return {data:request.method==='DELETE'?null:publicRow((await rowById(env,id))!),deleted:request.method==='DELETE'};
};
export const adminAnnouncementErrorStatus = (error:unknown) => error instanceof AdminAnnouncementError || error instanceof BetterAuthIdentityError ? error.status : 500;
