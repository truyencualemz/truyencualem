-- ══════════════════════════════════════════════════════════════════
-- MangaDesk — Publisher Role Patch
-- Chạy trong Supabase Dashboard → Database → SQL Editor
-- An toàn để chạy nhiều lần
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Thêm cột created_by vào comics ──────────────────────────────
-- created_by = user_id của publisher/admin đã tạo truyện
alter table public.comics
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Backfill: truyện cũ chưa có created_by → gán = user_id (owner)
update public.comics
set created_by = user_id
where created_by is null;

create index if not exists idx_comics_created_by on public.comics(created_by);

-- ── 2. Helper functions ────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_blocked = false
  )
$$;

create or replace function public.is_publisher()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','publisher') and is_blocked = false
  )
$$;

-- ── 3. Xóa tất cả policy cũ rồi tạo lại ───────────────────────────
do $drop$ begin
  drop policy if exists "comics: owner full"         on public.comics;
  drop policy if exists "comics: read published"     on public.comics;
  drop policy if exists "comics: publisher manage"   on public.comics;
  drop policy if exists "chapters: owner full"       on public.chapters;
  drop policy if exists "chapters: read published"   on public.chapters;
  drop policy if exists "chapters: publisher manage" on public.chapters;
  drop policy if exists "text_chaps: owner full"       on public.text_chaps;
  drop policy if exists "text_chaps: read published"   on public.text_chaps;
  drop policy if exists "text_chaps: publisher manage" on public.text_chaps;
end $drop$;

-- ── 4. RLS: comics ─────────────────────────────────────────────────

-- Admin: toàn quyền tất cả comics
create policy "comics: admin full"
  on public.comics for all
  using  (public.is_admin())
  with check (public.is_admin());

-- Publisher: chỉ quản lý truyện mình tạo ra (created_by = mình)
create policy "comics: publisher manage own"
  on public.comics for all
  using  (auth.uid() = created_by and public.is_publisher())
  with check (auth.uid() = created_by and public.is_publisher());

-- Tất cả user đã đăng nhập: đọc published comics
create policy "comics: read published"
  on public.comics for select
  using (status = 'published' and auth.role() = 'authenticated');

-- ── 5. RLS: chapters ───────────────────────────────────────────────

-- Admin: toàn quyền
create policy "chapters: admin full"
  on public.chapters for all
  using  (public.is_admin())
  with check (public.is_admin());

-- Publisher: quản lý chapters của truyện mình tạo
create policy "chapters: publisher manage own"
  on public.chapters for all
  using (
    public.is_publisher()
    and exists (
      select 1 from public.comics c
      where c.id = comic_id and c.created_by = auth.uid()
    )
  )
  with check (
    public.is_publisher()
    and exists (
      select 1 from public.comics c
      where c.id = comic_id and c.created_by = auth.uid()
    )
  );

-- User: đọc chapters của published comics
create policy "chapters: read published"
  on public.chapters for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.comics c
      where c.id = comic_id and c.status = 'published'
    )
  );

-- ── 6. RLS: text_chaps ─────────────────────────────────────────────

-- Admin: toàn quyền
create policy "text_chaps: admin full"
  on public.text_chaps for all
  using  (public.is_admin())
  with check (public.is_admin());

-- Publisher: quản lý text_chaps của truyện mình tạo
create policy "text_chaps: publisher manage own"
  on public.text_chaps for all
  using (
    public.is_publisher()
    and exists (
      select 1 from public.comics c
      where c.id = comic_id and c.created_by = auth.uid()
    )
  )
  with check (
    public.is_publisher()
    and exists (
      select 1 from public.comics c
      where c.id = comic_id and c.created_by = auth.uid()
    )
  );

-- User: đọc
create policy "text_chaps: read published"
  on public.text_chaps for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.chapters ch
      join public.comics c on c.id = ch.comic_id
      where ch.id = chap_id and c.status = 'published'
    )
  );

-- ── 7. Thêm cột donate vào profiles ──────────────────────────────
alter table public.profiles
  add column if not exists donate_momo    text default '',
  add column if not exists donate_qr_url  text default '',
  add column if not exists donate_note    text default '';

-- Cho phép user đã đăng nhập đọc thông tin donate của tác giả
alter table public.profiles enable row level security;

drop policy if exists "profiles: public read donate" on public.profiles;
create policy "profiles: public read donate"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- ── 8. Cấp role publisher ──────────────────────────────────────────
-- Chạy riêng dòng này để cấp publisher cho tài khoản:
-- update public.profiles set role = 'publisher' where email = 'publisher@email.com';

-- ══════════════════════════════════════════════════════════════════
-- Xong! Sau khi chạy:
-- 1. Publisher đăng nhập vào adminmanagement.html
-- 2. Chỉ thấy truyện của mình + không có mục Users/Cài đặt
-- 3. Admin/Publisher có thể cấu hình donate trong Cài đặt → ☕
-- ══════════════════════════════════════════════════════════════════
