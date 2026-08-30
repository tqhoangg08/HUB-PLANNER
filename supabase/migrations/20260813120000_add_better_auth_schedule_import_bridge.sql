begin;

create or replace function public.replace_user_schedule_import_source_server(
  p_user_id uuid,
  p_semester text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  item jsonb;
  course jsonb;
  selected_course_id uuid;
  selected_course_ids uuid[] := array[]::uuid[];
  course_code text;
  subject_name text;
  credits integer;
begin
  if p_user_id is null
     or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception using errcode = '42501', message = 'SCHEDULE_IMPORT_FORBIDDEN';
  end if;
  if p_semester is null
     or p_semester <> btrim(p_semester)
     or p_semester !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception using errcode = '22023', message = 'INVALID_SCHEDULE_IMPORT';
  end if;
  if p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) > 100 then
    raise exception using errcode = '22023', message = 'INVALID_SCHEDULE_IMPORT';
  end if;

  for item in select value from jsonb_array_elements(p_rows) as rows(value)
  loop
    selected_course_id := null;
    if jsonb_typeof(item) <> 'object'
       or exists (
         select 1 from jsonb_object_keys(item) as key
          where key not in ('systemCourseId', 'course')
       ) then
      raise exception using errcode = '22023', message = 'INVALID_SCHEDULE_IMPORT';
    end if;

    if item ? 'systemCourseId' then
      if item ? 'course'
         or jsonb_typeof(item->'systemCourseId') <> 'string'
         or (item->>'systemCourseId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode = '22023', message = 'INVALID_SCHEDULE_IMPORT';
      end if;
      select existing.id
        into selected_course_id
        from public.course_schedules as existing
       where existing.id = (item->>'systemCourseId')::uuid
         and existing.semester = p_semester
         and existing.is_user_added is distinct from true;
      if selected_course_id is null then
        raise exception using errcode = '22023', message = 'INVALID_SCHEDULE_IMPORT';
      end if;
    else
      course := item->'course';
      if course is null
         or jsonb_typeof(course) <> 'object'
         or exists (
           select 1 from jsonb_object_keys(course) as key
            where key not in (
              'course_code', 'subject_name', 'credits', 'instructor',
              'day_of_week', 'shift', 'room', 'campus', 'weeks', 'phase'
            )
         ) then
        raise exception using errcode = '22023', message = 'INVALID_SCHEDULE_IMPORT';
      end if;
      course_code := btrim(course->>'course_code');
      subject_name := btrim(course->>'subject_name');
      if course_code is null or length(course_code) not between 1 and 120
         or subject_name is null or length(subject_name) not between 1 and 200 then
        raise exception using errcode = '22023', message = 'INVALID_SCHEDULE_IMPORT';
      end if;
      credits := case
        when coalesce(course->>'credits', '') ~ '^\d{1,2}$'
          then greatest(0, least((course->>'credits')::integer, 30))
        else 0
      end;
      insert into public.course_schedules (
        course_code, subject_name, credits, instructor, day_of_week, shift,
        room, campus, weeks, semester, phase, is_user_added
      ) values (
        course_code,
        subject_name,
        credits,
        left(coalesce(course->>'instructor', ''), 160),
        left(coalesce(course->>'day_of_week', ''), 30),
        left(coalesce(course->>'shift', ''), 60),
        left(coalesce(course->>'room', ''), 120),
        left(coalesce(course->>'campus', 'TD'), 60),
        left(coalesce(course->>'weeks', ''), 500),
        p_semester,
        left(coalesce(course->>'phase', '1'), 20),
        true
      ) returning id into selected_course_id;
    end if;

    if not selected_course_id = any(selected_course_ids) then
      selected_course_ids := array_append(selected_course_ids, selected_course_id);
    end if;
  end loop;

  delete from public.user_schedules
   where user_id = p_user_id and semester = p_semester;

  insert into public.user_schedules (user_id, course_id, semester)
  select p_user_id, course_id, p_semester
    from unnest(selected_course_ids) as selected(course_id);

  return jsonb_build_object(
    'count', cardinality(selected_course_ids),
    'courseIds', to_jsonb(selected_course_ids)
  );
end;
$$;

revoke all on function public.replace_user_schedule_import_source_server(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.replace_user_schedule_import_source_server(uuid, text, jsonb)
  to service_role;

comment on function public.replace_user_schedule_import_source_server(uuid, text, jsonb) is
  'Server-only atomic Better Auth schedule import. The trusted caller supplies an identity already resolved from the host-only session cookie.';

commit;
