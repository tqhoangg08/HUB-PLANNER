INSERT OR REPLACE INTO scholarship_campaigns (
  slug, title, school_year, semester, source_title, source_url, status,
  public_data_approved, public_scores_approved, published_at, revision
) VALUES (
  'hk2-2024-2025',
  'Học bổng Khuyến khích học tập HK2 2024-2025',
  '2024-2025',
  'HK2',
  'Quyết định số 1234/QĐ-ĐHNH ngày 15/09/2026',
  'https://hub.edu.vn/quyet-dinh-1234',
  'published',
  1,
  1,
  '2026-09-15 08:00:00',
  3
);

INSERT OR REPLACE INTO scholarship_import_batches (
  id, campaign_slug, source_sha256, source_filename, expected_rows, accepted_rows, rejected_rows,
  status, performed_by_user_id, mapping_json, approved_fields_json, approval_document_json, approved_by, approved_at
) VALUES (
  'batch-synthetic-01',
  'hk2-2024-2025',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'danh-sach-hoc-bong-hk2.csv',
  5,
  5,
  0,
  'previewed',
  '11111111-1111-4111-8111-111111111111',
  '{"studentCode":"MSSV","fullName":"Họ và tên","awardType":"Loại học bổng","className":"Lớp","scores":[{"key":"gpa","column":"ĐTB HK","label":"Điểm TBHK"},{"key":"drl","column":"ĐRL HK","label":"Điểm Rèn luyện"}]}',
  '["studentCode","fullName","awardType","className","scores:gpa","scores:drl"]',
  '{"title":"Quyết định số 1234/QĐ-ĐHNH","reference":"1234/QĐ-ĐHNH","url":"https://hub.edu.vn/quyet-dinh-1234"}',
  'admin-user-01',
  '2026-09-15 08:00:00'
);

INSERT OR REPLACE INTO scholarship_snapshot_rows (
  batch_id, source_row_number, student_code, full_name, full_name_search, class_name, major, award_type, scores_json, source_row_sha256
) VALUES
  ('batch-synthetic-01', 1, '030138210001', 'Nguyễn Văn An', 'nguyen van an', 'ĐH38NH01', 'Tài chính - Ngân hàng', 'Xuất sắc', '{"gpa":3.92,"drl":95}', 'sha1'),
  ('batch-synthetic-01', 2, '030138210002', 'Trần Thị Bích', 'tran thi bich', 'ĐH38KT02', 'Kế toán', 'Giỏi', '{"gpa":3.68,"drl":88}', 'sha2'),
  ('batch-synthetic-01', 3, '030138210003', 'Lê Hoàng Cường', 'le hoang cuong', 'ĐH38QT01', 'Quản trị kinh doanh', 'Giỏi', '{"gpa":3.55,"drl":85}', 'sha3'),
  ('batch-synthetic-01', 4, '030138210004', 'Phạm Minh Đức', 'pham minh duc', 'ĐH38HT01', 'Hệ thống thông tin quản lý', 'Khá', '{"gpa":3.32,"drl":82}', 'sha4'),
  ('batch-synthetic-01', 5, '030138210005', 'Võ Thảo My', 'vo thao my', 'ĐH38LU01', 'Luật kinh tế', 'Xuất sắc', '{"gpa":3.88,"drl":92}', 'sha5');

UPDATE scholarship_import_batches SET status='applied' WHERE id='batch-synthetic-01';

UPDATE scholarship_campaigns SET active_batch_id='batch-synthetic-01' WHERE slug='hk2-2024-2025';
