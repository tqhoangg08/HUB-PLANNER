alter table public.profiles
  add column if not exists class_name_overridden boolean not null default false;

create or replace function public.get_default_class_name_for_student(p_student_code text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_class_name text;
begin
  if p_student_code is null or btrim(p_student_code) = '' then
    return null;
  end if;

  if to_regclass('public.v_drl_ranking') is null then
    return null;
  end if;

  begin
    execute
      'select class_name
         from public.v_drl_ranking
        where student_code = $1
          and nullif(btrim(class_name), '''') is not null
        order by semester_id desc nulls last
        limit 1'
      into v_class_name
      using p_student_code;
  exception
    when undefined_column then
      execute
        'select class_name
           from public.v_drl_ranking
          where student_code = $1
            and nullif(btrim(class_name), '''') is not null
          limit 1'
        into v_class_name
        using p_student_code;
    when undefined_table then
      return null;
  end;

  return nullif(btrim(v_class_name), '');
end;
$$;

create or replace function public.apply_default_profile_class_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default_class_name text;
begin
  if coalesce(new.class_name_overridden, false) = false then
    v_default_class_name := public.get_default_class_name_for_student(new.student_code);

    if v_default_class_name is not null and nullif(btrim(coalesce(new.class_name, '')), '') is null then
      new.class_name := v_default_class_name;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_apply_default_profile_class_name on public.profiles;

create trigger trigger_apply_default_profile_class_name
before insert or update of student_code, class_name, class_name_overridden
on public.profiles
for each row
execute function public.apply_default_profile_class_name();

update public.profiles
set class_name_overridden = true
where nullif(btrim(coalesce(class_name, '')), '') is not null;

update public.profiles p
set
  class_name = public.get_default_class_name_for_student(p.student_code),
  updated_at = now()
where coalesce(p.class_name_overridden, false) = false
  and nullif(btrim(coalesce(p.class_name, '')), '') is null
  and public.get_default_class_name_for_student(p.student_code) is not null;
