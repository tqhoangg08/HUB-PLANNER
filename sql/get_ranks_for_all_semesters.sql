create or replace function public.get_ranks_for_all_semesters(
    p_gpa double precision,
    p_credits integer,
    p_drl integer,
    p_semesters text[]
)
returns table (semester_name text, rank integer)
language sql
as $$
    select
        semester_list.semester as semester_name,
        coalesce(
            (
                select min(student_rank)
                from public.benchmark_rankings
                where semester = semester_list.semester
                  and gpa = p_gpa
                  and credits = p_credits
                  and training_score = p_drl
            ),
            (
                select count(*)
                from public.benchmark_rankings
                where semester = semester_list.semester
                  and (
                    gpa > p_gpa
                    or (gpa = p_gpa and credits > p_credits)
                    or (gpa = p_gpa and credits = p_credits and training_score > p_drl)
                  )
            ) + 1
        ) as rank
    from unnest(p_semesters) as semester_list(semester);
$$;
