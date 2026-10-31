export const ANNOUNCEMENT_DEPARTMENTS = [
  ['phongdaotao', 'Phòng Đào tạo'], ['phongktdbcl', 'Phòng Khảo thí và ĐBCL'],
  ['scc.hub.edu.vn', 'Trung tâm SV và QHDN'], ['clc.hub.edu.vn', 'Ban quản lý CLC'],
  ['phongqlcntt', 'Phòng Quản lý CNTT'], ['phongtstt', 'Phòng Tuyển sinh TT'],
  ['phongtochuc', 'Phòng Tổ chức'], ['phongketoan', 'Phòng Kế toán'], ['online.hub.edu.vn', 'HUB Portal'],
] as const;
export type AnnouncementPushState = 'none' | 'queued' | 'processing' | 'retrying' | 'sent' | 'failed' | 'skipped' | 'suppressed';
export const ANNOUNCEMENT_PUSH_LABELS: Record<AnnouncementPushState, string> = {
  none:'Chưa gửi', queued:'Chờ gửi', processing:'Đang xử lý', retrying:'Chờ thử lại',
  sent:'Đã gửi', failed:'Lỗi gửi', skipped:'Không có lượt gửi thành công', suppressed:'Đã bỏ qua',
};
export interface AdminSchoolAnnouncement {
  id:number; title:string; link:string; date:string; department:string;
  is_hidden:boolean; is_highlighted:boolean; source_kind:'crawler'|'manual'; admin_revision:number;
  push_state:AnnouncementPushState; push_sent_count:number; push_failed_count:number; push_skipped_count:number;
  push_sent_at:string|null; push_last_error:string|null;
}
