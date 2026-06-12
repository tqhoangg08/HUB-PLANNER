create or replace function public.profile_private_data_has_subjects(payload jsonb)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(payload->'semesters') = 'array' then payload->'semesters'
        else '[]'::jsonb
      end
    ) as semester(item)
    where jsonb_array_length(
      case
        when jsonb_typeof(semester.item->'subjects') = 'array' then semester.item->'subjects'
        else '[]'::jsonb
      end
    ) > 0
  );
$$;

create or replace function public.guard_profile_private_data_from_empty_overwrite()
returns trigger
language plpgsql
as $$
begin
  new.data := coalesce(new.data, '{}'::jsonb);

  if tg_op = 'UPDATE'
    and old.data is distinct from new.data
    and public.profile_private_data_has_subjects(old.data)
    and not public.profile_private_data_has_subjects(new.data)
  then
    new.data := jsonb_set(new.data, '{semesters}', old.data->'semesters', true);
  end if;

  if tg_op = 'UPDATE'
    and old.data is distinct from new.data
    and public.is_meaningful_profile_private_data(old.data)
    and not public.is_meaningful_profile_private_data(new.data)
  then
    new.data := old.data;
  end if;

  return new;
end;
$$;
