alter table public.benchmark_rankings
  add column if not exists student_code text,
  add column if not exists class_code text,
  add column if not exists major text,
  add column if not exists rank_in_class integer,
  add column if not exists total_in_class integer,
  add column if not exists rank_in_major integer,
  add column if not exists total_in_major integer;

create unique index if not exists idx_benchmark_rankings_semester_student_code
  on public.benchmark_rankings (semester, student_code)
  where student_code is not null;

create index if not exists idx_benchmark_rankings_semester_class
  on public.benchmark_rankings (semester, class_code);

create index if not exists idx_benchmark_rankings_semester_major
  on public.benchmark_rankings (semester, major);

create or replace function public.recalculate_benchmark_rankings(p_semester text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with ranked as (
    select
      id,
      rank() over (
        partition by semester
        order by gpa desc nulls last, training_score desc nulls last, credits desc nulls last
      )::integer as overall_rank,
      case
        when nullif(btrim(coalesce(class_code, '')), '') is null then null
        else rank() over (
          partition by semester, class_code
          order by gpa desc nulls last, training_score desc nulls last, credits desc nulls last
        )::integer
      end as class_rank,
      case
        when nullif(btrim(coalesce(class_code, '')), '') is null then null
        else count(*) over (partition by semester, class_code)::integer
      end as class_total,
      case
        when nullif(btrim(coalesce(major, '')), '') is null then null
        else rank() over (
          partition by semester, major
          order by gpa desc nulls last, training_score desc nulls last, credits desc nulls last
        )::integer
      end as major_rank,
      case
        when nullif(btrim(coalesce(major, '')), '') is null then null
        else count(*) over (partition by semester, major)::integer
      end as major_total
    from public.benchmark_rankings
    where semester = p_semester
  )
  update public.benchmark_rankings b
  set
    student_rank = ranked.overall_rank,
    rank_in_class = ranked.class_rank,
    total_in_class = ranked.class_total,
    rank_in_major = ranked.major_rank,
    total_in_major = ranked.major_total
  from ranked
  where b.id = ranked.id;
end;
$$;

create or replace function public.get_benchmark_rank_for_student(
  p_semester text,
  p_student_code text
)
returns table (
  semester text,
  student_code text,
  student_rank integer,
  total_students integer,
  rank_in_class integer,
  total_in_class integer,
  class_code text,
  rank_in_major integer,
  total_in_major integer,
  major text,
  gpa double precision,
  credits integer,
  training_score integer,
  scholarship_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.semester,
    b.student_code,
    b.student_rank,
    (
      select count(*)::integer
      from public.benchmark_rankings x
      where x.semester = b.semester
    ) as total_students,
    b.rank_in_class,
    b.total_in_class,
    b.class_code,
    b.rank_in_major,
    b.total_in_major,
    b.major,
    b.gpa,
    b.credits,
    b.training_score,
    b.scholarship_status
  from public.benchmark_rankings b
  where b.semester = p_semester
    and b.student_code = p_student_code
  limit 1;
$$;

create or replace function public.get_smart_rank_details(
  p_semester text,
  p_gpa double precision,
  p_drl integer,
  p_credits integer,
  p_student_code text default null,
  p_class_code text default null,
  p_major text default null
)
returns table (
  rank integer,
  total_students integer,
  rank_in_class integer,
  total_in_class integer,
  class_code text,
  rank_in_major integer,
  total_in_major integer,
  major text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_exact record;
  v_class text;
  v_major text;
begin
  if nullif(btrim(coalesce(p_student_code, '')), '') is not null then
    select *
    into v_exact
    from public.get_benchmark_rank_for_student(p_semester, p_student_code);

    if found then
      return query
      select
        v_exact.student_rank,
        v_exact.total_students,
        v_exact.rank_in_class,
        v_exact.total_in_class,
        v_exact.class_code,
        v_exact.rank_in_major,
        v_exact.total_in_major,
        v_exact.major;
      return;
    end if;
  end if;

  v_class := nullif(btrim(coalesce(p_class_code, '')), '');
  v_major := nullif(btrim(coalesce(p_major, '')), '');

  return query
  select
    (
      select count(*)::integer + 1
      from public.benchmark_rankings b
      where b.semester = p_semester
        and (
          b.gpa > p_gpa
          or (b.gpa = p_gpa and b.training_score > p_drl)
          or (b.gpa = p_gpa and b.training_score = p_drl and b.credits > p_credits)
        )
    ) as rank,
    (
      select count(*)::integer
      from public.benchmark_rankings b
      where b.semester = p_semester
    ) as total_students,
    case when v_class is null then null else (
      select count(*)::integer + 1
      from public.benchmark_rankings b
      where b.semester = p_semester
        and b.class_code = v_class
        and (
          b.gpa > p_gpa
          or (b.gpa = p_gpa and b.training_score > p_drl)
          or (b.gpa = p_gpa and b.training_score = p_drl and b.credits > p_credits)
        )
    ) end as rank_in_class,
    case when v_class is null then null else (
      select count(*)::integer
      from public.benchmark_rankings b
      where b.semester = p_semester
        and b.class_code = v_class
    ) end as total_in_class,
    v_class as class_code,
    case when v_major is null then null else (
      select count(*)::integer + 1
      from public.benchmark_rankings b
      where b.semester = p_semester
        and b.major = v_major
        and (
          b.gpa > p_gpa
          or (b.gpa = p_gpa and b.training_score > p_drl)
          or (b.gpa = p_gpa and b.training_score = p_drl and b.credits > p_credits)
        )
    ) end as rank_in_major,
    case when v_major is null then null else (
      select count(*)::integer
      from public.benchmark_rankings b
      where b.semester = p_semester
        and b.major = v_major
    ) end as total_in_major,
    v_major as major;
end;
$$;

grant execute on function public.recalculate_benchmark_rankings(text) to service_role;
grant execute on function public.get_benchmark_rank_for_student(text, text) to anon, authenticated, service_role;
grant execute on function public.get_smart_rank_details(text, double precision, integer, integer, text, text, text) to anon, authenticated, service_role;
