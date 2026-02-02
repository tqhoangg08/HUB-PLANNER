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
    v_user_cluster integer; -- 3: Xuất sắc, 2: Giỏi, 1: Không đạt
    better_count integer;
begin
    -- 1. PHÂN LOẠI CỤM (CLUSTER)
    -- Đây là bước quan trọng nhất để chặn ĐRL thấp.
    -- Nếu ĐRL = 0 thì không thỏa điều kiện >= 90 hay >= 80 -> Rớt xuống ELSE (Cụm 1)
    
    if p_credits >= 15 and p_gpa >= 3.6 and p_drl >= 90 then
        v_user_cluster := 3; -- Cụm 1 (Xuất sắc)
    elsif p_credits >= 15 and p_gpa >= 3.2 and p_drl >= 80 then
        v_user_cluster := 2; -- Cụm 2 (Giỏi)
    else
        v_user_cluster := 1; -- Cụm 3 (Không đạt)
    end if;

    -- 2. TÍNH RANK (ĐẾM SỐ NGƯỜI GIỎI HƠN)
    -- Logic so sánh 4 tầng (Cascading)
    
    select count(*)
    into better_count
    from public.benchmark_rankings
    where semester = p_semester
    and (
        -- Ưu tiên 1: So sánh Cụm (Học bổng)
        -- Người có Cụm cao hơn thì Rank cao hơn
        (
            case 
                when scholarship_status = 'Xuất sắc' then 3
                when scholarship_status = 'Giỏi' then 2
                else 1 
            end
        ) > v_user_cluster

        OR 

        -- Ưu tiên 2: Cùng Cụm -> So sánh GPA
        (
            (case when scholarship_status = 'Xuất sắc' then 3 when scholarship_status = 'Giỏi' then 2 else 1 end) = v_user_cluster
            AND gpa > p_gpa
        )

        OR

        -- Ưu tiên 3: Cùng Cụm, Cùng GPA -> So sánh ĐRL
        (
            (case when scholarship_status = 'Xuất sắc' then 3 when scholarship_status = 'Giỏi' then 2 else 1 end) = v_user_cluster
            AND abs(gpa - p_gpa) < 0.001
            AND training_score > p_drl
        )

        OR

        -- Ưu tiên 4: Cùng Cụm, Cùng GPA, Cùng ĐRL -> So sánh Tín chỉ
        (
            (case when scholarship_status = 'Xuất sắc' then 3 when scholarship_status = 'Giỏi' then 2 else 1 end) = v_user_cluster
            AND abs(gpa - p_gpa) < 0.001
            AND training_score = p_drl
            AND credits > p_credits
        )
    );

    -- Rank = Số người trên mình + 1
    return coalesce(better_count, 0) + 1;
end;
$$;