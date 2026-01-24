create or replace function public.get_smart_rank(
    p_semester text,
    p_gpa double precision,
    p_drl integer,
    p_credits integer
)
returns integer
language plpgsql
as $$
declare
    matched_rank integer;
    better_count integer;
    v_user_scholarship_score integer;
begin
    v_user_scholarship_score := case
        when p_credits >= 15 and p_gpa >= 3.6 and p_drl >= 90 then 3
        when p_credits >= 15 and p_gpa >= 3.2 and p_drl >= 80 then 2
        else 1
    end;

    select min(student_rank)
    into matched_rank
    from public.benchmark_rankings
    where semester = p_semester
      and gpa = p_gpa
      and credits = p_credits
      and training_score = p_drl
      and case
            when scholarship_status = 'Xuất sắc' then 3
            when scholarship_status = 'Giỏi' then 2
            else 1
          end = v_user_scholarship_score;

    if matched_rank is not null then
        return matched_rank;
    end if;

    select count(*)
    into better_count
    from public.benchmark_rankings
    where semester = p_semester
      and (
        case
            when scholarship_status = 'Xuất sắc' then 3
            when scholarship_status = 'Giỏi' then 2
            else 1
        end > v_user_scholarship_score
        or (
            case
                when scholarship_status = 'Xuất sắc' then 3
                when scholarship_status = 'Giỏi' then 2
                else 1
            end = v_user_scholarship_score
            and gpa > p_gpa
        )
        or (
            case
                when scholarship_status = 'Xuất sắc' then 3
                when scholarship_status = 'Giỏi' then 2
                else 1
            end = v_user_scholarship_score
            and gpa = p_gpa
            and training_score > p_drl
        )
        or (
            case
                when scholarship_status = 'Xuất sắc' then 3
                when scholarship_status = 'Giỏi' then 2
                else 1
            end = v_user_scholarship_score
            and gpa = p_gpa
            and training_score = p_drl
            and credits > p_credits
        )
      );

    return coalesce(better_count, 0) + 1;
end;
$$;
