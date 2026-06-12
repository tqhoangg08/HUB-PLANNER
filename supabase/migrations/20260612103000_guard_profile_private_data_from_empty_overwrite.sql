create or replace function public.is_meaningful_profile_private_data(payload jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    nullif(btrim(payload->>'studentName'), '') is not null
    or nullif(btrim(payload->>'cohort'), '') is not null
    or nullif(btrim(payload->>'programName'), '') is not null
    or nullif(btrim(payload->>'majorName'), '') is not null
    or nullif(btrim(payload->>'specializationName'), '') is not null
    or exists (
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
      or (
        semester.item ? 'trainingScore'
        and semester.item->'trainingScore' is not null
        and semester.item->>'trainingScore' <> 'null'
      )
      or (
        nullif(btrim(semester.item->>'name'), '') is not null
        and not (
          jsonb_array_length(
            case
              when jsonb_typeof(payload->'semesters') = 'array' then payload->'semesters'
              else '[]'::jsonb
            end
          ) = 1
          and semester.item->>'name' like '%1%'
          and semester.item->>'name' like '%2025-2026%'
        )
      )
    ),
    false
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
    and public.is_meaningful_profile_private_data(old.data)
    and not public.is_meaningful_profile_private_data(new.data)
  then
    new.data := old.data;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_private_data_from_empty_overwrite on public.profile_private_data;

create trigger trg_guard_profile_private_data_from_empty_overwrite
before insert or update of data on public.profile_private_data
for each row
execute function public.guard_profile_private_data_from_empty_overwrite();
