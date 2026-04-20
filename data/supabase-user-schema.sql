-- ══════════════════════════════════════════════════════════
-- MangaDesk — User Features Schema
-- Chạy trong Supabase SQL Editor (bổ sung thêm vào schema cũ)
-- ══════════════════════════════════════════════════════════

-- ── 1. Lịch sử đọc ─────────────────────────────────────────
-- Mỗi user chỉ có 1 record per comic (chương đọc gần nhất)
create table if not exists public.reading_history (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  comic_id    text references public.comics(id) on delete cascade,
  chap_id     text references public.chapters(id) on delete cascade,
  chap_num    int  default 0,
  chap_title  text default '',
  updated_at  timestamptz default now(),
  unique(user_id, comic_id)  -- 1 record per comic, luôn cập nhật
);

-- ── 2. Bookmarks ────────────────────────────────────────────
create table if not exists public.bookmarks (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  comic_id    text references public.comics(id) on delete cascade,
  chap_id     text references public.chapters(id) on delete cascade,
  chap_num    int  default 0,
  chap_title  text default '',
  note        text default '',
  created_at  timestamptz default now(),
  unique(user_id, comic_id, chap_id)  -- không bookmark trùng
);

-- ── 3. Row Level Security ────────────────────────────────────
alter table public.reading_history enable row level security;
alter table public.bookmarks       enable row level security;

create policy "history: user owns"
  on public.reading_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "bookmarks: user owns"
  on public.bookmarks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admin đọc được mọi user (để analytics) — chỉ SELECT
-- Thay YOUR_ADMIN_EMAIL bằng email admin thực tế
-- create policy "history: admin read all"
--   on public.reading_history for select
--   using (auth.email() = 'YOUR_ADMIN_EMAIL');

-- ── 4. Indexes ───────────────────────────────────────────────
create index if not exists idx_history_user    on public.reading_history(user_id, updated_at desc);
create index if not exists idx_history_comic   on public.reading_history(comic_id);
create index if not exists idx_bookmarks_user  on public.bookmarks(user_id, created_at desc);
create index if not exists idx_bookmarks_comic on public.bookmarks(comic_id);

-- ── 5. Auto-update updated_at cho reading_history ────────────
create trigger history_updated_at
  before update on public.reading_history
  for each row execute function public.set_updated_at();

-- ── 6. Cho phép user đọc comics/chapters của người khác ──────
-- (comics hiện tại chỉ user_id=owner mới đọc được — cần mở rộng)
-- Drop policy cũ, tạo lại cho phép read public comics
drop policy if exists "comics: user owns" on public.comics;
drop policy if exists "chapters: user owns" on public.chapters;

-- Admin: toàn quyền dữ liệu của mình
create policy "comics: owner full"
  on public.comics for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- User khác: chỉ đọc comics có status='published'
create policy "comics: reader select published"
  on public.comics for select
  using (status = 'published');

-- Chapters: owner toàn quyền
create policy "chapters: owner full"
  on public.chapters for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- User khác: đọc chapters của comics published
create policy "chapters: reader select"
  on public.chapters for select
  using (
    exists (
      select 1 from public.comics c
      where c.id = comic_id and c.status = 'published'
    )
  );

-- text_chaps: tương tự
drop policy if exists "text_chaps: user owns" on public.text_chaps;

create policy "text_chaps: owner full"
  on public.text_chaps for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "text_chaps: reader select"
  on public.text_chaps for select
  using (
    exists (
      select 1 from public.chapters ch
      join public.comics c on c.id = ch.comic_id
      where ch.id = chap_id and c.status = 'published'
    )
  );
