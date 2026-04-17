-- ══════════════════════════════════════════════════════════
-- MangaDesk — Supabase Schema
-- Chạy toàn bộ file này trong Supabase SQL Editor
-- (Database → SQL Editor → New query → Paste → Run)
-- ══════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── 1. Bảng comics ─────────────────────────────────────────
create table if not exists public.comics (
  id          text primary key,          -- client-generated: 'c' + timestamp
  user_id     uuid references auth.users(id) on delete cascade,
  title_vi    text not null,
  title_en    text default '',
  desc_vi     text default '',
  desc_en     text default '',
  genre       text default 'action',
  status      text default 'published',
  cover       text default '',           -- URL ảnh bìa (Drive hoặc Imgur)
  sort_order  int  default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── 2. Bảng chapters ───────────────────────────────────────
-- Lưu metadata chương. pages là JSON array của page metadata
-- (URL Drive, không lưu binary ở đây)
create table if not exists public.chapters (
  id          text primary key,          -- client-generated: 'ch' + timestamp
  comic_id    text references public.comics(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  num         int  not null,
  title       text default '',
  type        text default 'image',      -- 'image' | 'text'
  languages   jsonb default '[]',        -- ['vi','en','ja']
  pages       jsonb default '[]',        -- [{id,note,vi:{type,url,name},en:...}]
  sort_order  int  default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── 3. Bảng text_chaps ─────────────────────────────────────
-- Nội dung truyện chữ (có thể lớn — jsonb hiệu quả hơn text)
create table if not exists public.text_chaps (
  chap_id     text primary key references public.chapters(id) on delete cascade,
  comic_id    text references public.comics(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  languages   jsonb default '[]',
  segments    jsonb default '[]',        -- [{id,note,content:{vi,en},annotations:[]}]
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── 4. Row Level Security ───────────────────────────────────
-- Mỗi user chỉ đọc/sửa được dữ liệu của mình

alter table public.comics     enable row level security;
alter table public.chapters   enable row level security;
alter table public.text_chaps enable row level security;

-- Comics
create policy "comics: user owns" on public.comics
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Chapters
create policy "chapters: user owns" on public.chapters
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Text chaps
create policy "text_chaps: user owns" on public.text_chaps
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 5. Indexes ──────────────────────────────────────────────
create index if not exists idx_comics_user     on public.comics(user_id, sort_order);
create index if not exists idx_chapters_comic  on public.chapters(comic_id, num);
create index if not exists idx_textchaps_comic on public.text_chaps(comic_id);

-- ── 6. Auto-update updated_at ───────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger comics_updated_at
  before update on public.comics
  for each row execute function public.set_updated_at();

create trigger chapters_updated_at
  before update on public.chapters
  for each row execute function public.set_updated_at();

create trigger text_chaps_updated_at
  before update on public.text_chaps
  for each row execute function public.set_updated_at();

-- ══════════════════════════════════════════════════════════
-- Xong! Tiếp theo:
-- 1. Vào Authentication → Providers → bật Email và/hoặc Google
-- 2. Copy Project URL + anon key vào js/config.js
-- ══════════════════════════════════════════════════════════
