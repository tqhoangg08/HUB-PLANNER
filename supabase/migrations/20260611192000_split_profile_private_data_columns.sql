alter table public.profile_private_data
  add column if not exists student_name text,
  add column if not exists cohort text,
  add column if not exists major_name text,
  add column if not exists specialization_name text,
  add column if not exists program_name text,
  add column if not exists semesters jsonb,
  add column if not exists target_gpa numeric,
  add column if not exists total_credits_required integer,
  add column if not exists has_onboarded boolean,
  add column if not exists student_code text,
  add column if not exists lookback_seen jsonb;

create or replace function public.sync_profile_private_data_columns()
returns trigger
language plpgsql
as $$
begin
  if new.data is not null then
    new.student_name := nullif(new.data->>'studentName', '');
    new.cohort := nullif(new.data->>'cohort', '');
    new.major_name := nullif(new.data->>'majorName', '');
    new.specialization_name := nullif(new.data->>'specializationName', '');
    new.program_name := nullif(new.data->>'programName', '');
    new.semesters := new.data->'semesters';
    new.target_gpa := case
      when (new.data->>'targetGPA') ~ '^[0-9]+(\.[0-9]+)?$' then (new.data->>'targetGPA')::numeric
      else null
    end;
    new.total_credits_required := case
      when (new.data->>'totalCreditsRequired') ~ '^[0-9]+$' then (new.data->>'totalCreditsRequired')::integer
      else null
    end;
    new.has_onboarded := case
      when new.data ? 'hasOnboarded' then (new.data->>'hasOnboarded')::boolean
      else null
    end;
    new.student_code := nullif(new.data->>'studentCode', '');
    new.lookback_seen := new.data->'lookbackSeen';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_private_data_columns on public.profile_private_data;

create trigger trg_sync_profile_private_data_columns
before insert or update of data on public.profile_private_data
for each row
execute function public.sync_profile_private_data_columns();

update public.profile_private_data
set
  student_name = nullif(data->>'studentName', ''),
  cohort = nullif(data->>'cohort', ''),
  major_name = nullif(data->>'majorName', ''),
  specialization_name = nullif(data->>'specializationName', ''),
  program_name = nullif(data->>'programName', ''),
  semesters = data->'semesters',
  target_gpa = case
    when (data->>'targetGPA') ~ '^[0-9]+(\.[0-9]+)?$' then (data->>'targetGPA')::numeric
    else null
  end,
  total_credits_required = case
    when (data->>'totalCreditsRequired') ~ '^[0-9]+$' then (data->>'totalCreditsRequired')::integer
    else null
  end,
  has_onboarded = case
    when data ? 'hasOnboarded' then (data->>'hasOnboarded')::boolean
    else null
  end,
  student_code = nullif(data->>'studentCode', ''),
  lookback_seen = data->'lookbackSeen'
where data is not null;
