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
    matched_rank integer;
    better_count integer;
begin
    -- BƯỚC 1: XÁC ĐỊNH CỤM (CLUSTER) CỦA USER HIỆN TẠI
    -- Logic: Phải đạt đủ cả 3 điều kiện (Tín chỉ, GPA, ĐRL) mới được vào cụm cao.
    -- Nếu thiếu 1 trong 3 -> Rớt xuống cụm dưới hoặc cụm 1 (Không đạt).
    
    if p_credits >= 15 and p_gpa >= 3.6 and p_drl >= 90 then
        v_user_cluster := 3; -- Cụm 1 (Cao nhất - Xuất sắc)
    elsif p_credits >= 15 and p_gpa >= 3.2 and p_drl >= 80 then
        v_user_cluster := 2; -- Cụm 2 (Giỏi)
    else
        v_user_cluster := 1; -- Cụm 3 (Thấp nhất - Không đạt)
    end if;

    -- BƯỚC 2: (CÁCH 1) TÌM XEM CÓ AI Y HỆT KHÔNG?
    -- Nếu trong database đã có người y hệt điểm số và cụm này, lấy rank của họ luôn cho nhanh.
    select min(student_rank)
    into matched_rank
    from public.benchmark_rankings
    where semester = p_semester
      and abs(gpa - p_gpa) < 0.001 -- So sánh số thực an toàn
      and credits = p_credits
      and training_score = p_drl
      and (
          case 
              when scholarship_status = 'Xuất sắc' then 3
              when scholarship_status = 'Giỏi' then 2
              else 1 
          end
      ) = v_user_cluster;

    if matched_rank is not null then
        return matched_rank;
    end if;

    -- BƯỚC 3: (CÁCH 2) ĐẾM SỐ NGƯỜI GIỎI HƠN (BETTER COUNT)
    -- Logic so sánh thác đổ (Cascading): Ưu tiên 1 -> 2 -> 3 -> 4
    
    select count(*)
    into better_count
    from public.benchmark_rankings
    where semester = p_semester
    and (
        -- Ưu tiên 1: So sánh Cụm (Học bổng)
        -- Người có Cụm cao hơn thì Rank cao hơn (Bất kể GPA, ĐRL)
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
            (
                case 
                    when scholarship_status = 'Xuất sắc' then 3
                    when scholarship_status = 'Giỏi' then 2
                    else 1 
                end
            ) = v_user_cluster
            AND gpa > p_gpa
        )

        OR

        -- Ưu tiên 3: Cùng Cụm, Cùng GPA -> So sánh ĐRL
        (
            (
                case 
                    when scholarship_status = 'Xuất sắc' then 3
                    when scholarship_status = 'Giỏi' then 2
                    else 1 
                end
            ) = v_user_cluster
            AND abs(gpa - p_gpa) < 0.001
            AND training_score > p_drl
        )

        OR

        -- Ưu tiên 4: Cùng Cụm, Cùng GPA, Cùng ĐRL -> So sánh Tín chỉ
        (
            (
                case 
                    when scholarship_status = 'Xuất sắc' then 3
                    when scholarship_status = 'Giỏi' then 2
                    else 1 
                end
            ) = v_user_cluster
            AND abs(gpa - p_gpa) < 0.001
            AND training_score = p_drl
            AND credits > p_credits
        )
    );

    -- Rank của bạn = Số người giỏi hơn bạn + 1
    return coalesce(better_count, 0) + 1;
end;
$$;
