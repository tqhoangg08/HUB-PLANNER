-- Cấp quyền mở kho đề Pro cho 1 user.
-- Thay USER_UUID bằng auth.users.id của sinh viên.
-- expires_at để null nghĩa là không hết hạn.

insert into public.practice_pro_access (user_id, expires_at, note)
values ('USER_UUID', null, 'manual pro access')
on conflict (user_id) do update
set
  expires_at = excluded.expires_at,
  note = excluded.note,
  updated_at = now();
