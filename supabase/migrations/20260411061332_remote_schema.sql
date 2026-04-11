


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE OR REPLACE FUNCTION "public"."calculate_scholarship"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Logic xếp loại dựa trên yêu cầu của bạn
    NEW.scholarship_status := CASE
        -- 1. Điều kiện cần (Vòng gửi xe)
        -- Nếu thiếu tín chỉ HOẶC GPA thấp HOẶC ĐRL thấp -> Loại ngay
        WHEN NEW.credits < 15 OR NEW.gpa < 3.2 OR NEW.training_score < 80 THEN 'Không đạt'
        
        -- 2. Xét loại Xuất sắc (Khi đã qua vòng gửi xe)
        -- GPA >= 3.6 VÀ ĐRL >= 90
        WHEN NEW.gpa >= 3.6 AND NEW.training_score >= 90 THEN 'Xuất sắc'
        
        -- 3. Xét loại Giỏi
        -- Trường hợp 1: GPA >= 3.6 nhưng ĐRL chỉ từ 80-89
        -- Trường hợp 2: GPA từ 3.2 đến dưới 3.6 (và ĐRL >= 80)
        -- Tóm lại: Nếu đã ĐỦ điều kiện cần và KHÔNG phải xuất sắc -> Thì là Giỏi
        ELSE 'Giỏi'
    END;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_scholarship"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_my_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Lệnh này sẽ xóa triệt để tài khoản của người dùng đang đăng nhập khỏi hệ thống
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."delete_my_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_semesters"() RETURNS TABLE("semester" "text")
    LANGUAGE "sql"
    AS $$
  select distinct semester 
  from public.benchmark_rankings 
  order by semester desc;
$$;


ALTER FUNCTION "public"."get_available_semesters"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  -- Hàm này sẽ chạy vào bảng user_roles để xem user hiện tại là 'admin' hay 'ctv'
select role from public.user_roles where id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_semesters"() RETURNS TABLE("semester" "text")
    LANGUAGE "sql"
    AS $$
  select distinct semester from public.benchmark_rankings order by semester desc;
$$;


ALTER FUNCTION "public"."get_semesters"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_smart_rank"("p_semester" "text", "p_gpa" double precision, "p_drl" integer, "p_credits" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
declare
    v_user_cluster integer; -- 3: Xuất sắc, 2: Giỏi, 1: Không đạt
    better_count integer;
begin
    -- 1. XÁC ĐỊNH CỤM (CLUSTER)
    -- Nếu ĐRL < 80 thì auto về Cụm 1 (Không đạt)
    if p_credits >= 15 and p_gpa >= 3.6 and p_drl >= 90 then
        v_user_cluster := 3; -- Xuất sắc
    elsif p_credits >= 15 and p_gpa >= 3.2 and p_drl >= 80 then
        v_user_cluster := 2; -- Giỏi
    else
        v_user_cluster := 1; -- Không đạt/Khá
    end if;

    -- 2. ĐẾM SỐ NGƯỜI GIỎI HƠN BẠN
    -- Logic: Chỉ những ai thỏa mãn các điều kiện "hơn" dưới đây mới được đếm
    select count(*)
    into better_count
    from public.benchmark_rankings
    where semester = p_semester
    and (
        -- Trường hợp 1: Họ ở Cụm cao hơn hẳn (Ví dụ họ Xuất sắc, bạn Giỏi) -> Họ thắng.
        (
            case 
                when scholarship_status ILIKE '%Xuất sắc%' then 3
                when scholarship_status ILIKE '%Giỏi%' then 2
                else 1 
            end
        ) > v_user_cluster

        OR 

        -- Trường hợp 2: Cùng Cụm, nhưng GPA họ cao hơn -> Họ thắng.
        (
            (case when scholarship_status ILIKE '%Xuất sắc%' then 3 when scholarship_status ILIKE '%Giỏi%' then 2 else 1 end) = v_user_cluster
            AND gpa > p_gpa
        )

        OR

        -- Trường hợp 3: Cùng Cụm, Cùng GPA, nhưng ĐRL họ cao hơn -> Họ thắng.
        (
            (case when scholarship_status ILIKE '%Xuất sắc%' then 3 when scholarship_status ILIKE '%Giỏi%' then 2 else 1 end) = v_user_cluster
            AND abs(gpa - p_gpa) < 0.001 -- So sánh số lẻ an toàn
            AND training_score > p_drl
        )

        OR

        -- Trường hợp 4: Cùng Cụm, Cùng GPA, Cùng ĐRL, nhưng Tín chỉ họ nhiều hơn -> Họ thắng.
        (
            (case when scholarship_status ILIKE '%Xuất sắc%' then 3 when scholarship_status ILIKE '%Giỏi%' then 2 else 1 end) = v_user_cluster
            AND abs(gpa - p_gpa) < 0.001
            AND training_score = p_drl
            AND credits > p_credits 
        )
    );

    -- Rank của bạn = (Số người giỏi hơn bạn) + 1
    -- Ví dụ: Nhóm Rank 42 (23 tín) THUA bạn (25 tín), nên họ không được tính vào better_count.
    -- Bạn sẽ xếp trên họ.
    return coalesce(better_count, 0) + 1;
end;
$$;


ALTER FUNCTION "public"."get_smart_rank"("p_semester" "text", "p_gpa" double precision, "p_drl" integer, "p_credits" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_follow"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.notifications (receiver_id, actor_id, type)
  VALUES (NEW.following_id, NEW.follower_id, 'follow');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_follow"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$begin
  -- 1. CHẶN NGAY NẾU KHÔNG PHẢI EMAIL TRƯỜNG
  -- Nếu email không chứa đuôi @st.buh.edu.vn thì báo lỗi và dừng lại
  if new.email not like '%@st.buh.edu.vn' then
    raise exception 'Chỉ chấp nhận email sinh viên HUB (@st.buh.edu.vn)!';
  end if;

  -- 2. ĐOẠN CODE CŨ CỦA BẠN (GIỮ NGUYÊN)
  insert into public.profiles (id, full_name, avatar_url, email, student_code)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    new.email,
    split_part(new.email, '@', 1) -- Tự tách MSSV
  );
  return new;
end;$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_hub_email"("email" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN email LIKE '%@st.buh.edu.vn';
END;
$$;


ALTER FUNCTION "public"."is_hub_email"("email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_user_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  current_user_role text; -- Biến để lưu chức vụ
  user_email_text text;
  action_type text;
  headers jsonb;
  client_ip text;
  client_device text;
BEGIN
  -- 1. KIỂM TRA QUYỀN (LỌC): Nếu không phải Admin/CTV thì DỪNG NGAY
  -- Lấy role của user hiện tại
  SELECT role INTO current_user_role FROM public.user_roles WHERE id = auth.uid();
  
  -- Nếu role không phải admin hoặc ctv (hoặc là khách vãng lai), thì không ghi log
  IF current_user_role IS NULL OR current_user_role NOT IN ('admin', 'ctv') THEN
      RETURN NEW; -- Thoát luôn, không làm gì cả
  END IF;

  -- ==========================================================
  -- NẾU LÀ ADMIN/CTV THÌ MỚI CHẠY TIẾP ĐOẠN DƯỚI ĐÂY
  -- ==========================================================

  -- 2. Lấy email
  SELECT email INTO user_email_text FROM auth.users WHERE id = auth.uid();
  
  -- 3. Lấy IP & Device
  BEGIN
    headers := current_setting('request.headers', true)::jsonb;
    client_ip := headers ->> 'cf-connecting-ip';
    IF client_ip IS NULL THEN client_ip := headers ->> 'x-forwarded-for'; END IF;
    client_device := headers ->> 'user-agent';
    IF client_ip IS NULL THEN client_ip := 'Server/Dashboard'; END IF;
    IF client_device IS NULL THEN client_device := 'Server/Dashboard'; END IF;
  EXCEPTION WHEN OTHERS THEN
    client_ip := 'Unknown';
    client_device := 'Unknown';
  END;

  -- 4. Xác định hành động
  IF (TG_OP = 'INSERT') THEN
    action_type := 'TẠO MỚI';
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.is_deleted = false AND NEW.is_deleted = true) THEN
      action_type := 'XÓA MỀM';
    ELSE
      action_type := 'CẬP NHẬT';
    END IF;
  ELSE
    action_type := 'XÓA VĨNH VIỄN';
  END IF;

  -- 5. Ghi log
  INSERT INTO public.activity_logs (
    created_at, user_email, action, target_table, target_id, 
    details, ip_address, device_info
  )
  VALUES (
    now(),
    user_email_text, -- Chắc chắn là có email vì là Admin/CTV
    action_type,
    TG_TABLE_NAME,
    NEW.id::text,
    jsonb_build_object('old', row_to_json(OLD), 'new', row_to_json(NEW)),
    client_ip,
    client_device
  );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_user_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) RETURNS TABLE("id" bigint, "content" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  select
    hub_documents.id,
    hub_documents.content,
    1 - (hub_documents.embedding <=> query_embedding) as similarity
  from hub_documents
  where 1 - (hub_documents.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;


ALTER FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_code_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (OLD.student_code IS NOT NULL AND NEW.student_code IS DISTINCT FROM OLD.student_code) THEN
      RAISE EXCEPTION 'Không được phép thay đổi Mã số sinh viên.';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_code_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_lost_found_item"("p_title" "text", "p_description" "text", "p_location" "text", "p_contact_info" "text", "p_user_name" "text", "p_image_url" "text", "p_type" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.lost_found_items (
    title, description, location, contact_info, user_name, image_url, type, status, created_at
  ) values (
    p_title, p_description, p_location, p_contact_info, p_user_name, p_image_url, p_type, 'pending', now()
  );
end;
$$;


ALTER FUNCTION "public"."submit_lost_found_item"("p_title" "text", "p_description" "text", "p_location" "text", "p_contact_info" "text", "p_user_name" "text", "p_image_url" "text", "p_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_secure_comment"("p_content" "text", "p_post_id" "text", "p_parent_id" bigint, "p_is_anonymous" boolean, "p_device_ip" "text", "p_display_name" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_ban_record RECORD;
    v_recent_count INT;
    v_last_comment_time TIMESTAMP;
BEGIN
    -- (Logic kiểm tra Spam giữ nguyên...)
    -- A. KIỂM TRA LỆNH CẤM
    SELECT * INTO v_ban_record FROM public.spam_logs 
    WHERE user_id = v_user_id OR device_ip = p_device_ip;

    IF v_ban_record.banned_until > now() THEN
        RAISE EXCEPTION 'Bạn đang bị cấm bình luận đến % do spam.', v_ban_record.banned_until;
    END IF;

    -- B. KIỂM TRA 10 GIÂY
    SELECT created_at INTO v_last_comment_time FROM public.comments
    WHERE (user_id = v_user_id OR context_id = p_device_ip)
    ORDER BY created_at DESC LIMIT 1;

    IF v_last_comment_time > (now() - INTERVAL '10 seconds') THEN
        RAISE EXCEPTION 'Vui lòng chờ 10 giây giữa các lần bình luận.';
    END IF;

    -- C. INSERT VÀO BẢNG (Bổ sung user_display_name)
    INSERT INTO public.comments (
        content, post_id, parent_id, is_anonymous, user_id, context_id, user_display_name
    )
    VALUES (
        p_content, p_post_id, p_parent_id, p_is_anonymous, v_user_id, p_device_ip, p_display_name
    );

    RETURN json_build_object('status', 'success');
END;
$$;


ALTER FUNCTION "public"."submit_secure_comment"("p_content" "text", "p_post_id" "text", "p_parent_id" bigint, "p_is_anonymous" boolean, "p_device_ip" "text", "p_display_name" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "user_email" "text",
    "action" "text",
    "ip_address" "text",
    "device_info" "text",
    "location_guess" "text",
    "target_table" "text",
    "target_id" "text",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "details" "jsonb",
    "user_id" "uuid"
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


ALTER TABLE "public"."activity_logs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."activity_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ai_chat_logs" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "user_id" "uuid",
    "user_message" "text" NOT NULL,
    "bot_reply" "text" NOT NULL,
    "is_helpful" boolean,
    "metadata" "jsonb",
    "title" "text",
    "is_deleted" boolean DEFAULT false,
    "is_pinned" boolean DEFAULT false
);


ALTER TABLE "public"."ai_chat_logs" OWNER TO "postgres";


ALTER TABLE "public"."ai_chat_logs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."ai_chat_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."auth_trigger_errors" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "email" "text",
    "stage" "text",
    "error" "text"
);


ALTER TABLE "public"."auth_trigger_errors" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."auth_trigger_errors_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."auth_trigger_errors_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."auth_trigger_errors_id_seq" OWNED BY "public"."auth_trigger_errors"."id";



CREATE TABLE IF NOT EXISTS "public"."benchmark_rankings" (
    "id" bigint NOT NULL,
    "semester" "text" NOT NULL,
    "student_rank" integer,
    "gpa" double precision,
    "credits" integer,
    "training_score" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "scholarship_status" "text"
);


ALTER TABLE "public"."benchmark_rankings" OWNER TO "postgres";


ALTER TABLE "public"."benchmark_rankings" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."benchmark_rankings_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."bug_reports" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "error_location" "text" NOT NULL,
    "description" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."bug_reports" OWNER TO "postgres";


ALTER TABLE "public"."bug_reports" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."bug_reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."comment_history" (
    "id" bigint NOT NULL,
    "comment_id" bigint,
    "old_content" "text" NOT NULL,
    "archived_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."comment_history" OWNER TO "postgres";


ALTER TABLE "public"."comment_history" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."comment_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."comment_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "comment_id" bigint,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "is_anonymous" boolean DEFAULT true
);


ALTER TABLE "public"."comment_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" bigint NOT NULL,
    "post_id" "text" NOT NULL,
    "content" "text" NOT NULL,
    "user_display_name" "text" NOT NULL,
    "is_anonymous" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone,
    "context_id" "text",
    "parent_id" bigint,
    "like_count" integer DEFAULT 0,
    "user_id" "uuid"
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


ALTER TABLE "public"."comments" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."comments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."course_reports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "course_code" "text" NOT NULL,
    "subject_name" "text" NOT NULL,
    "error_description" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid"
);


ALTER TABLE "public"."course_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_code" "text" NOT NULL,
    "subject_name" "text" NOT NULL,
    "credits" integer DEFAULT 3,
    "shift" "text",
    "day_of_week" "text",
    "weeks" "text",
    "room" "text",
    "exam_date" "text",
    "exam_shift" "text",
    "phase" "text",
    "cohort" "text",
    "major" "text",
    "academic_program" "text",
    "campus" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "semester" "text" DEFAULT 'HK2_2025_2026'::"text",
    "instructor" "text" DEFAULT ''::"text",
    "is_user_added" boolean DEFAULT false
);


ALTER TABLE "public"."course_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ctv_requests" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "full_name" "text" NOT NULL,
    "student_batch" "text" NOT NULL,
    "major" "text" NOT NULL,
    "contact_info" "text" NOT NULL,
    "user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text"
);


ALTER TABLE "public"."ctv_requests" OWNER TO "postgres";


ALTER TABLE "public"."ctv_requests" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."ctv_requests_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."donations" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "name" "text" NOT NULL,
    "student_id" "text",
    "message" "text",
    "amount" numeric NOT NULL
);


ALTER TABLE "public"."donations" OWNER TO "postgres";


ALTER TABLE "public"."donations" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."donations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."event_reports" (
    "id" bigint NOT NULL,
    "event_id" bigint,
    "event_name" "text" NOT NULL,
    "organizer" "text",
    "issue_description" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."event_reports" OWNER TO "postgres";


ALTER TABLE "public"."event_reports" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."event_reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "title" "text" NOT NULL,
    "organizer" "text",
    "category" "text",
    "criteria" "text",
    "points" "text",
    "format" "text",
    "deadline" "date",
    "link" "text",
    "location_type" "text" DEFAULT 'Trong trường'::"text",
    "status" "text" DEFAULT 'Sắp diễn ra'::"text",
    "is_manually_closed" boolean DEFAULT false,
    "contribution_link" "text",
    "contributor_note" "text",
    "section" "text",
    "score" numeric,
    "description" "text",
    "classification" "text",
    "is_deleted" boolean DEFAULT false,
    "event_date" "date",
    "event_time" time without time zone,
    "deadline_time" "text",
    "close_on_full" boolean DEFAULT false
);


ALTER TABLE "public"."events" OWNER TO "postgres";


ALTER TABLE "public"."events" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "contact" "text",
    "status" "text" DEFAULT 'new'::"text",
    "user_id" "uuid"
);


ALTER TABLE "public"."feedback" OWNER TO "postgres";


ALTER TABLE "public"."feedback" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."feedback_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."follows" (
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "no_self_follow" CHECK (("follower_id" <> "following_id"))
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lost_found_items" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "location" "text",
    "contact_info" "text",
    "user_name" "text",
    "image_url" "text",
    "type" "text",
    "status" "text" DEFAULT 'approved'::"text",
    "is_deleted" boolean DEFAULT false,
    "user_id" "uuid"
);


ALTER TABLE "public"."lost_found_items" OWNER TO "postgres";


ALTER TABLE "public"."lost_found_items" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."lost_found_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "receiver_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "type" "text" NOT NULL,
    "content" "text",
    "is_read" boolean DEFAULT false,
    "link" "text"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "student_code" "text",
    "avatar_url" "text",
    "data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "bio" "text",
    "class_name" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_announcements" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "link" "text" NOT NULL,
    "date" "text",
    "is_new" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_hidden" boolean DEFAULT false
);


ALTER TABLE "public"."school_announcements" OWNER TO "postgres";


ALTER TABLE "public"."school_announcements" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."school_announcements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."spam_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "device_ip" "text",
    "violation_level" integer DEFAULT 0,
    "banned_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."spam_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_knowledge" (
    "id" integer DEFAULT 1 NOT NULL,
    "content" "text"
);


ALTER TABLE "public"."system_knowledge" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_course_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "subject_name" "text" NOT NULL,
    "course_code" "text" NOT NULL,
    "instructor" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid"
);


ALTER TABLE "public"."user_course_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_participations" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "event_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_participations" OWNER TO "postgres";


ALTER TABLE "public"."user_participations" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_participations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "course_id" "uuid",
    "semester" "text" DEFAULT 'HK2_2025_2026'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_schedules" OWNER TO "postgres";


ALTER TABLE ONLY "public"."auth_trigger_errors" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."auth_trigger_errors_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_chat_logs"
    ADD CONSTRAINT "ai_chat_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_trigger_errors"
    ADD CONSTRAINT "auth_trigger_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."benchmark_rankings"
    ADD CONSTRAINT "benchmark_rankings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bug_reports"
    ADD CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comment_history"
    ADD CONSTRAINT "comment_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_comment_id_user_id_key" UNIQUE ("comment_id", "user_id");



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_reports"
    ADD CONSTRAINT "course_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_schedules"
    ADD CONSTRAINT "course_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ctv_requests"
    ADD CONSTRAINT "ctv_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_reports"
    ADD CONSTRAINT "event_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id", "following_id");



ALTER TABLE ONLY "public"."lost_found_items"
    ADD CONSTRAINT "lost_found_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_student_code_key" UNIQUE ("student_code");



ALTER TABLE ONLY "public"."school_announcements"
    ADD CONSTRAINT "school_announcements_link_key" UNIQUE ("link");



ALTER TABLE ONLY "public"."school_announcements"
    ADD CONSTRAINT "school_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_announcements"
    ADD CONSTRAINT "school_announcements_title_key" UNIQUE ("title");



ALTER TABLE ONLY "public"."spam_logs"
    ADD CONSTRAINT "spam_logs_device_ip_key" UNIQUE ("device_ip");



ALTER TABLE ONLY "public"."spam_logs"
    ADD CONSTRAINT "spam_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spam_logs"
    ADD CONSTRAINT "spam_logs_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."system_knowledge"
    ADD CONSTRAINT "system_knowledge_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_schedules"
    ADD CONSTRAINT "unique_course_per_semester" UNIQUE ("course_code", "semester");



ALTER TABLE ONLY "public"."user_course_requests"
    ADD CONSTRAINT "user_course_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_participations"
    ADD CONSTRAINT "user_participations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_participations"
    ADD CONSTRAINT "user_participations_user_id_event_id_key" UNIQUE ("user_id", "event_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_schedules"
    ADD CONSTRAINT "user_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_schedules"
    ADD CONSTRAINT "user_schedules_user_id_course_id_key" UNIQUE ("user_id", "course_id");



CREATE INDEX "comments_context_id_idx" ON "public"."comments" USING "btree" ("context_id");



CREATE INDEX "idx_benchmark_semester_gpa" ON "public"."benchmark_rankings" USING "btree" ("semester", "gpa");



CREATE INDEX "profiles_student_code_idx" ON "public"."profiles" USING "btree" ("student_code");



CREATE OR REPLACE TRIGGER "on_event_change" AFTER INSERT OR UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."log_user_activity"();



CREATE OR REPLACE TRIGGER "on_follow_created" AFTER INSERT ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_follow"();



CREATE OR REPLACE TRIGGER "on_lost_found_change" AFTER INSERT OR UPDATE ON "public"."lost_found_items" FOR EACH ROW EXECUTE FUNCTION "public"."log_user_activity"();



CREATE OR REPLACE TRIGGER "thông báo cho admin" AFTER INSERT ON "public"."course_reports" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://hook.eu1.make.com/j7d7lazz6xd8pbl6fgkv54iiw4fr93go', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "thông báo cho admin" AFTER INSERT ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://hook.eu1.make.com/j7d7lazz6xd8pbl6fgkv54iiw4fr93go', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "thông báo cho admin" AFTER INSERT ON "public"."feedback" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://hook.eu1.make.com/j7d7lazz6xd8pbl6fgkv54iiw4fr93go', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "thông báo cho admin" AFTER INSERT ON "public"."lost_found_items" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://hook.eu1.make.com/j7d7lazz6xd8pbl6fgkv54iiw4fr93go', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "thông báo cho admin" AFTER INSERT ON "public"."user_course_requests" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://hook.eu1.make.com/j7d7lazz6xd8pbl6fgkv54iiw4fr93go', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "trigger_prevent_code_change" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_code_change"();



CREATE OR REPLACE TRIGGER "trigger_update_scholarship" BEFORE INSERT OR UPDATE ON "public"."benchmark_rankings" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_scholarship"();



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_chat_logs"
    ADD CONSTRAINT "ai_chat_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bug_reports"
    ADD CONSTRAINT "bug_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."comment_history"
    ADD CONSTRAINT "comment_history_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_reports"
    ADD CONSTRAINT "course_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ctv_requests"
    ADD CONSTRAINT "ctv_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."event_reports"
    ADD CONSTRAINT "event_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lost_found_items"
    ADD CONSTRAINT "lost_found_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spam_logs"
    ADD CONSTRAINT "spam_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_course_requests"
    ADD CONSTRAINT "user_course_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_participations"
    ADD CONSTRAINT "user_participations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_participations"
    ADD CONSTRAINT "user_participations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_schedules"
    ADD CONSTRAINT "user_schedules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."course_schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_schedules"
    ADD CONSTRAINT "user_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin duoc sua bug_reports" ON "public"."bug_reports" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Admin duoc sua course_reports" ON "public"."course_reports" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Admin duoc sua feedback" ON "public"."feedback" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Admin duoc xem course_reports" ON "public"."course_reports" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Admin duoc xem feedback" ON "public"."feedback" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Admin duoc xoa bug_reports" ON "public"."bug_reports" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Admin duoc xoa course_reports" ON "public"."course_reports" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Admin duoc xoa feedback" ON "public"."feedback" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Admin duyet don" ON "public"."ctv_requests" FOR UPDATE TO "authenticated" USING ((( SELECT "user_roles"."role"
   FROM "public"."user_roles"
  WHERE ("user_roles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"text", 'ctv'::"text"])));



CREATE POLICY "Admin toàn quyền" ON "public"."events" USING ((( SELECT "user_roles"."role"
   FROM "public"."user_roles"
  WHERE ("user_roles"."id" = "auth"."uid"())) = 'admin'::"text")) WITH CHECK ((( SELECT "user_roles"."role"
   FROM "public"."user_roles"
  WHERE ("user_roles"."id" = "auth"."uid"())) = 'admin'::"text"));



CREATE POLICY "Admin xem toan bo don" ON "public"."ctv_requests" FOR SELECT TO "authenticated" USING ((( SELECT "user_roles"."role"
   FROM "public"."user_roles"
  WHERE ("user_roles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"text", 'ctv'::"text"])));



CREATE POLICY "Admin được quyền xem tất cả skien" ON "public"."user_participations" FOR SELECT TO "authenticated" USING ((("auth"."jwt"() ->> 'email'::"text") = 'tqhoangg2@gmail.com'::"text"));



CREATE POLICY "Admin được quyền xem tất cả tkb" ON "public"."user_schedules" FOR SELECT TO "authenticated" USING ((("auth"."jwt"() ->> 'email'::"text") = 'tqhoangg2@gmail.com'::"text"));



CREATE POLICY "Admin_CTV_Edit_LostFound" ON "public"."lost_found_items" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ctv'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ctv'::"text"])));



CREATE POLICY "Admin_Full_Access" ON "public"."lost_found_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Admin_Quan_Ly_Ranking" ON "public"."benchmark_rankings" TO "service_role" USING (true);



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));



CREATE POLICY "Ai cũng xem được like" ON "public"."comment_likes" FOR SELECT USING (true);



CREATE POLICY "Allow admin read all, user read own" ON "public"."activity_logs" FOR SELECT TO "authenticated" USING (((( SELECT "user_roles"."role"
   FROM "public"."user_roles"
  WHERE ("user_roles"."id" = "auth"."uid"())) = 'admin'::"text") OR ("user_email" = "auth"."email"())));



CREATE POLICY "Allow all users to insert logs" ON "public"."activity_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow anonymous inserts to bug_reports" ON "public"."bug_reports" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow insert for all" ON "public"."activity_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow read access for authenticated users" ON "public"."bug_reports" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow system to read roles" ON "public"."user_roles" FOR SELECT USING (true);



CREATE POLICY "Anyone can insert history" ON "public"."comment_history" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can view history" ON "public"."comment_history" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can follow" ON "public"."follows" FOR INSERT WITH CHECK (("auth"."uid"() = "follower_id"));



CREATE POLICY "Authenticated users can unfollow" ON "public"."follows" FOR DELETE USING (("auth"."uid"() = "follower_id"));



CREATE POLICY "Bảo vệ dữ liệu điểm (Cá nhân & Admin)" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "id") OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));



CREATE POLICY "Cho phep tat ca moi nguoi gui don" ON "public"."ctv_requests" FOR INSERT WITH CHECK (true);



CREATE POLICY "Cho phep user gui don" ON "public"."ctv_requests" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Cho phép user doc quyen cua minh" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Cho phép Admin/CTV cập nhật báo cáo" ON "public"."event_reports" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Cho phép Admin/CTV xóa báo cáo" ON "public"."event_reports" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Cho phép gửi báo cáo" ON "public"."course_reports" FOR INSERT WITH CHECK (true);



CREATE POLICY "Cho phép gửi yêu cầu tạo môn" ON "public"."user_course_requests" FOR INSERT WITH CHECK (true);



CREATE POLICY "Cho phép người đã đăng nhập xem báo cáo" ON "public"."event_reports" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Cho phép sinh viên thêm môn mới" ON "public"."course_schedules" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Cho phép tất cả mọi người gửi báo cáo" ON "public"."event_reports" FOR INSERT WITH CHECK (true);



CREATE POLICY "Cho phép tất cả mọi người đọc thông báo" ON "public"."school_announcements" FOR SELECT USING (true);



CREATE POLICY "Cho phép user đóng góp sự kiện chờ duyệt" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK (("status" = 'pending'::"text"));



CREATE POLICY "Cho phép xem role" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Cho phép xem sự kiện" ON "public"."events" FOR SELECT USING (true);



CREATE POLICY "Cho_Phep_Xem_Ranking" ON "public"."benchmark_rankings" FOR SELECT USING (true);



CREATE POLICY "Chỉ sửa profile của chính mình" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Chỉ tạo profile của chính mình" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Chỉ xem role của chính mình" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Chỉ xóa profile của chính mình" ON "public"."profiles" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Editor được sửa sự kiện" ON "public"."events" FOR UPDATE USING ((( SELECT "user_roles"."role"
   FROM "public"."user_roles"
  WHERE ("user_roles"."id" = "auth"."uid"())) = 'editor'::"text")) WITH CHECK ((( SELECT "user_roles"."role"
   FROM "public"."user_roles"
  WHERE ("user_roles"."id" = "auth"."uid"())) = 'editor'::"text"));



CREATE POLICY "Editor được thêm sự kiện" ON "public"."events" FOR INSERT WITH CHECK ((( SELECT "user_roles"."role"
   FROM "public"."user_roles"
  WHERE ("user_roles"."id" = "auth"."uid"())) = 'editor'::"text"));



CREATE POLICY "Enable all access for everyone" ON "public"."comments" USING (true) WITH CHECK (true);



CREATE POLICY "Enable delete for users based on id" ON "public"."profiles" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Enable delete for users based on user_id" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Enable delete for users based on user_id" ON "public"."user_participations" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable delete for users based on user_id" ON "public"."user_schedules" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Enable insert for everyone" ON "public"."feedback" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable select for service role only" ON "public"."feedback" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Only Admin can view logs" ON "public"."activity_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));



CREATE POLICY "Only_Admin_Delete_LostFound" ON "public"."lost_found_items" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "Owner_Update_LostFound" ON "public"."lost_found_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Public insert access" ON "public"."donations" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public read access" ON "public"."donations" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."follows" FOR SELECT USING (true);



CREATE POLICY "Public_Insert" ON "public"."ai_chat_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public_Insert_Pending" ON "public"."lost_found_items" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public_Select" ON "public"."ai_chat_logs" FOR SELECT USING (true);



CREATE POLICY "Public_Update" ON "public"."ai_chat_logs" FOR UPDATE USING (true);



CREATE POLICY "Public_View_Approved" ON "public"."lost_found_items" FOR SELECT USING (("status" = 'approved'::"text"));



CREATE POLICY "Sinh viên xem thông tin môn học" ON "public"."course_schedules" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Thêm môn vào TKB" ON "public"."user_schedules" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Thêm sự kiện tham gia" ON "public"."user_participations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "User đã login được gửi comment" ON "public"."comments" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "User đã login được like" ON "public"."comment_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "User được unlike của chính mình" ON "public"."comment_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "receiver_id"));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "receiver_id"));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "receiver_id"));



CREATE POLICY "Xem TKB của mình" ON "public"."user_schedules" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Xem sự kiện tham gia" ON "public"."user_participations" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Xóa môn TKB" ON "public"."user_schedules" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Xóa sự kiện tham gia" ON "public"."user_participations" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_chat_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auth_trigger_errors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."benchmark_rankings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bug_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comment_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comment_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ctv_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lost_found_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."school_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spam_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_knowledge" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_course_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_participations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_schedules" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_scholarship"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_scholarship"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_scholarship"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_semesters"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_semesters"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_semesters"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_semesters"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_semesters"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_semesters"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_smart_rank"("p_semester" "text", "p_gpa" double precision, "p_drl" integer, "p_credits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_smart_rank"("p_semester" "text", "p_gpa" double precision, "p_drl" integer, "p_credits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_smart_rank"("p_semester" "text", "p_gpa" double precision, "p_drl" integer, "p_credits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_follow"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_follow"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_follow"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_hub_email"("email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_hub_email"("email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_hub_email"("email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_user_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_user_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_user_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_code_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_code_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_code_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_lost_found_item"("p_title" "text", "p_description" "text", "p_location" "text", "p_contact_info" "text", "p_user_name" "text", "p_image_url" "text", "p_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_lost_found_item"("p_title" "text", "p_description" "text", "p_location" "text", "p_contact_info" "text", "p_user_name" "text", "p_image_url" "text", "p_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_lost_found_item"("p_title" "text", "p_description" "text", "p_location" "text", "p_contact_info" "text", "p_user_name" "text", "p_image_url" "text", "p_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_secure_comment"("p_content" "text", "p_post_id" "text", "p_parent_id" bigint, "p_is_anonymous" boolean, "p_device_ip" "text", "p_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_secure_comment"("p_content" "text", "p_post_id" "text", "p_parent_id" bigint, "p_is_anonymous" boolean, "p_device_ip" "text", "p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_secure_comment"("p_content" "text", "p_post_id" "text", "p_parent_id" bigint, "p_is_anonymous" boolean, "p_device_ip" "text", "p_display_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";












GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";















GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."activity_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."activity_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."activity_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ai_chat_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_chat_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_chat_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ai_chat_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ai_chat_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ai_chat_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."auth_trigger_errors" TO "anon";
GRANT ALL ON TABLE "public"."auth_trigger_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_trigger_errors" TO "service_role";



GRANT ALL ON SEQUENCE "public"."auth_trigger_errors_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."auth_trigger_errors_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."auth_trigger_errors_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."benchmark_rankings" TO "anon";
GRANT ALL ON TABLE "public"."benchmark_rankings" TO "authenticated";
GRANT ALL ON TABLE "public"."benchmark_rankings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."benchmark_rankings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."benchmark_rankings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."benchmark_rankings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bug_reports" TO "anon";
GRANT ALL ON TABLE "public"."bug_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."bug_reports" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bug_reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bug_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bug_reports_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."comment_history" TO "anon";
GRANT ALL ON TABLE "public"."comment_history" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."comment_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."comment_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."comment_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."comment_likes" TO "anon";
GRANT ALL ON TABLE "public"."comment_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_likes" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."comments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."comments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."comments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."course_reports" TO "anon";
GRANT ALL ON TABLE "public"."course_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."course_reports" TO "service_role";



GRANT ALL ON TABLE "public"."course_schedules" TO "anon";
GRANT ALL ON TABLE "public"."course_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."course_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."ctv_requests" TO "anon";
GRANT ALL ON TABLE "public"."ctv_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."ctv_requests" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ctv_requests_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ctv_requests_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ctv_requests_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."donations" TO "anon";
GRANT ALL ON TABLE "public"."donations" TO "authenticated";
GRANT ALL ON TABLE "public"."donations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."donations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."donations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."donations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."event_reports" TO "anon";
GRANT ALL ON TABLE "public"."event_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."event_reports" TO "service_role";



GRANT ALL ON SEQUENCE "public"."event_reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."event_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."event_reports_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."feedback" TO "anon";
GRANT ALL ON TABLE "public"."feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback" TO "service_role";



GRANT ALL ON SEQUENCE "public"."feedback_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."feedback_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."feedback_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."follows" TO "anon";
GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";



GRANT ALL ON TABLE "public"."lost_found_items" TO "anon";
GRANT ALL ON TABLE "public"."lost_found_items" TO "authenticated";
GRANT ALL ON TABLE "public"."lost_found_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lost_found_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lost_found_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lost_found_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."school_announcements" TO "anon";
GRANT ALL ON TABLE "public"."school_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."school_announcements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."school_announcements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."school_announcements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."school_announcements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."spam_logs" TO "anon";
GRANT ALL ON TABLE "public"."spam_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."spam_logs" TO "service_role";



GRANT ALL ON TABLE "public"."system_knowledge" TO "anon";
GRANT ALL ON TABLE "public"."system_knowledge" TO "authenticated";
GRANT ALL ON TABLE "public"."system_knowledge" TO "service_role";



GRANT ALL ON TABLE "public"."user_course_requests" TO "anon";
GRANT ALL ON TABLE "public"."user_course_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."user_course_requests" TO "service_role";



GRANT ALL ON TABLE "public"."user_participations" TO "anon";
GRANT ALL ON TABLE "public"."user_participations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_participations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_participations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_participations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_participations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_schedules" TO "anon";
GRANT ALL ON TABLE "public"."user_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."user_schedules" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































