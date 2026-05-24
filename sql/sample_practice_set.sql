-- Mẫu metadata cho 1 bộ đề free/public.
-- Nội dung câu hỏi nằm trong file JSON trên Cloudflare R2, Supabase chỉ lưu metadata.

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
  'Nguyên lý kế toán',
  'ACC',
  'Chương 1',
  'chuong-1',
  'Ôn tập Nguyên lý kế toán - Chương 1',
  'Bộ đề public lưu nội dung JSON trên Cloudflare R2.',
  'easy',
  'public',
  'r2',
  'https://YOUR_PUBLIC_R2_DOMAIN/free/nguyen-ly-ke-toan/chuong-1/de-001.json',
  'free/nguyen-ly-ke-toan/chuong-1/de-001.json',
  3,
  5
);
