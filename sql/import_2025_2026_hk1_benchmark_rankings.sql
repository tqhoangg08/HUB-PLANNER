-- Import checklist for benchmark ranking data 2025-2026_HK1.
-- 1) Export Excel as CSV UTF-8.
-- 2) Import CSV into public.benchmark_rankings with these columns:
--    semester, student_code, gpa, credits, training_score,
--    scholarship_status, class_code, major
-- 3) Leave rank columns empty, then run:

select public.recalculate_benchmark_rankings('2025-2026_HK1');

-- Verify total/class/major ranks after recalculation.
select
  student_code,
  student_rank,
  rank_in_class,
  total_in_class,
  class_code,
  rank_in_major,
  total_in_major,
  major,
  gpa,
  credits,
  training_score,
  scholarship_status
from public.benchmark_rankings
where semester = '2025-2026_HK1'
order by student_rank, student_code
limit 50;
