-- Mẫu metadata cho 1 bộ đề Pro/private.
-- content_url để null để frontend bắt buộc gọi Supabase Edge Function practice-content.

insert into public.practice_sets (
  source_type,
  subject_name,
  course_code,
  chapter_title,
  chapter_code,
  title,
  description,
  difficulty,
  visibility,
  storage_provider,
  content_url,
  content_key,
  question_count,
  estimated_minutes
)
values (
  'admin',
  'Quản trị nhân sự',
  'HRM',
  'Chương 3',
  'chuong-3',
  'Ôn tập Quản trị nhân sự - Chương 3',
  'Bộ đề Pro/private lưu nội dung JSON trong R2 private.',
  'medium',
  'pro',
  'r2',
  null,
  'pro/quan-tri-nhan-su/chuong-3/de-001.json',
  20,
  20
);
