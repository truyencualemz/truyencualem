-- ══════════════════════════════════════════════════════════════════
-- MangaDesk — Quản lý Admin
-- Chạy từng khối trong: Supabase Dashboard → Database → SQL Editor
-- ══════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- XEM DANH SÁCH HIỆN TẠI
-- ════════════════════════════════════════════════════════════════════

-- Xem tất cả tài khoản và role
select
  p.email,
  p.display_name,
  p.role,
  p.is_blocked,
  p.created_at,
  u.last_sign_in_at
from public.profiles p
join auth.users u on u.id = p.id
order by p.role, p.created_at;


-- ════════════════════════════════════════════════════════════════════
-- CẤP QUYỀN ADMIN
-- ════════════════════════════════════════════════════════════════════

-- Cách 1: Cấp theo email (thay email thật vào)
insert into public.profiles (id, email, role, is_blocked)
select id, email, 'admin', false
from auth.users
where email = 'YOUR_EMAIL@gmail.com'        -- ← đổi email vào đây
on conflict (id) do update
  set role = 'admin', is_blocked = false;

-- ── Xác nhận đã cấp thành công ──
select email, role, is_blocked
from public.profiles
where email = 'YOUR_EMAIL@gmail.com';       -- ← đổi email vào đây


-- ════════════════════════════════════════════════════════════════════
-- THU HỒI QUYỀN ADMIN (hạ về user thường)
-- ════════════════════════════════════════════════════════════════════

update public.profiles
set role = 'user'
where email = 'YOUR_EMAIL@gmail.com';       -- ← đổi email vào đây


-- ════════════════════════════════════════════════════════════════════
-- KHÓA / MỞ KHÓA TÀI KHOẢN
-- ════════════════════════════════════════════════════════════════════

-- Khóa tài khoản (vẫn giữ role, nhưng không đăng nhập được vào admin)
update public.profiles
set is_blocked = true
where email = 'YOUR_EMAIL@gmail.com';       -- ← đổi email vào đây

-- Mở khóa
update public.profiles
set is_blocked = false
where email = 'YOUR_EMAIL@gmail.com';       -- ← đổi email vào đây


-- ════════════════════════════════════════════════════════════════════
-- XÓA TÀI KHOẢN HOÀN TOÀN
-- (cascade: xóa lịch sử đọc, bookmark, profile)
-- ════════════════════════════════════════════════════════════════════

-- Xem trước để chắc chắn đúng người
select id, email, role from auth.users
where email = 'YOUR_EMAIL@gmail.com';       -- ← đổi email vào đây

-- Xóa profile (lịch sử + bookmark tự xóa theo cascade)
delete from public.profiles
where email = 'YOUR_EMAIL@gmail.com';       -- ← đổi email vào đây

-- Xóa khỏi auth.users (cần service_role — chạy trong SQL Editor với quyền cao)
-- Hoặc xóa thủ công trong: Authentication → Users → chọn user → Delete
delete from auth.users
where email = 'YOUR_EMAIL@gmail.com';       -- ← đổi email vào đây


-- ════════════════════════════════════════════════════════════════════
-- SỬA THÔNG TIN TÀI KHOẢN
-- ════════════════════════════════════════════════════════════════════

update public.profiles
set display_name = 'Tên mới'               -- ← đổi tên vào đây
where email = 'YOUR_EMAIL@gmail.com';       -- ← đổi email vào đây


-- ════════════════════════════════════════════════════════════════════
-- TẠO PROFILE THỦ CÔNG
-- (dùng khi tài khoản đăng ký trước khi có trigger)
-- ════════════════════════════════════════════════════════════════════

insert into public.profiles (id, email, display_name, role, is_blocked)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  'admin',                                  -- ← 'admin' hoặc 'user'
  false
from auth.users u
where u.email = 'YOUR_EMAIL@gmail.com'      -- ← đổi email vào đây
on conflict (id) do update
  set role       = excluded.role,
      email      = excluded.email,
      is_blocked = false;


-- ════════════════════════════════════════════════════════════════════
-- ĐỒNG BỘ: tạo profile cho tất cả user chưa có profile
-- (chạy 1 lần sau khi thêm trigger, để backfill tài khoản cũ)
-- ════════════════════════════════════════════════════════════════════

insert into public.profiles (id, email, display_name, avatar_url, role, is_blocked)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', ''),
  'user',
  false
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- Xác nhận kết quả
select count(*) as tong_user from auth.users;
select count(*) as tong_profile from public.profiles;
select count(*) as tong_admin from public.profiles where role = 'admin';


-- ════════════════════════════════════════════════════════════════════
-- CẤP / THU HỒI QUYỀN PUBLISHER
-- ════════════════════════════════════════════════════════════════════

-- Cấp publisher
insert into public.profiles (id, email, role, is_blocked)
select id, email, 'publisher', false
from auth.users
where email = 'YOUR_EMAIL@gmail.com'        -- ← đổi email vào đây
on conflict (id) do update
  set role = 'publisher', is_blocked = false;

-- Thu hồi publisher (hạ về user)
update public.profiles
set role = 'user'
where email = 'YOUR_EMAIL@gmail.com';       -- ← đổi email vào đây
