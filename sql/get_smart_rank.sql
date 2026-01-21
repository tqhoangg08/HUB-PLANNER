create or replace function public.get_smart_rank(
    p_semester text,
    p_gpa double precision,
    p_credits integer,
    p_drl integer
)
returns integer
language plpgsql
as $$
declare
    matched_rank integer;
    better_count integer;
begin
    select min(student_rank)
    into matched_rank
    from public.benchmark_rankings
    where semester = p_semester
      and gpa = p_gpa
      and credits = p_credits
      and training_score = p_drl;

    if matched_rank is not null then
        return matched_rank;
    end if;

    select count(*)
    into better_count
    from public.benchmark_rankings
    where semester = p_semester
      and (
        gpa > p_gpa
        or (gpa = p_gpa and credits > p_credits)
        or (gpa = p_gpa and credits = p_credits and training_score > p_drl)
      );

    return coalesce(better_count, 0) + 1;
end;
$$;
