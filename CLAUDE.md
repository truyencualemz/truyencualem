# MangaDesk — truyencualem

Nền tảng quản lý và đọc truyện tranh / truyện chữ đa ngôn ngữ. Pure static frontend, không có build step.

## Stack

```
GitHub Pages  →  static host (HTML/JS, no npm/bundler)
Supabase      →  PostgreSQL + Auth (metadata + text chapters)
Google Drive  →  File ảnh + PDF (2TB)
Apps Script   →  Proxy để list folder Drive + fetch PDF
GitHub Actions → inject js/config.js (credentials) lúc deploy
```

## Cấu trúc file

```
index.html              ← Trang người dùng (đọc truyện, "MangaDesk — Đọc Truyện")
adminmanagement.html    ← Trang admin (quản lý truyện, chương, users, cài đặt)
js/
  config.js             ← GITIGNORED — điền Supabase credentials (copy từ config.example.js)
  config.example.js     ← Template credentials
  state.js              ← Global state: window.App (view, comics, reader state...)
  app.js                ← UI helpers, routing, nav, Supabase init — dùng ở adminmanagement.html
  auth.js               ← Supabase Auth, roles (admin/publisher/user)
  db.js                 ← Supabase data layer (window.DB)
  admin.js              ← Admin views: library, chapters, analytics, users, settings
  admin-form.js         ← Admin forms: thêm/sửa comic và chapter
  reader.js             ← Đọc chương ảnh (dùng ở adminmanagement.html)
  text-editor.js        ← Soạn/sửa chương chữ (window.TextEditor)
  text-reader.js        ← Đọc chương chữ
  pdf-module.js         ← PDF handling
  gdrive.js             ← Google Drive integration (admin only)
  translate.js          ← UI dịch
  theme.js              ← Dark/light theme (window.Theme)
  user-app.js           ← App phía người đọc — dùng ở index.html
  user-db.js            ← DB layer phía người đọc
  comments.js           ← Bình luận per chương: nested reply 1 cấp, emoji reactions, xóa mềm (cả 2 trang)
  announce.js           ← Thông báo (cả 2 trang)
  donate.js             ← Quyên góp: cấu hình Momo/QR (publisher/admin), nút ☕ trong reader (cả 2 trang)
  follow.js             ← Theo dõi truyện (index.html)
  infinite-scroll.js    ← Scroll vô hạn (index.html)
  reader-enhance.js     ← Cải tiến reader (index.html)
data/
  supabase-schema.sql       ← Schema chính (comics, chapters, text_chaps + RLS)
  supabase-user-schema.sql  ← Schema phía user
  admin-management.sql      ← Schema quản lý admin
  publisher-patch.sql       ← Patch thêm role publisher
.github/workflows/deploy.yml ← GitHub Actions: tạo config.js từ Secrets → deploy Pages
```

## Database schema (Supabase)

| Bảng | Mô tả |
|---|---|
| `comics` | Metadata truyện: id, title_vi/en, desc_vi/en, genre, status, cover (URL), sort_order |
| `chapters` | Metadata chương: comic_id, num, title, type (image\|text), languages[], pages (JSONB) |
| `text_chaps` | Nội dung chương chữ: chap_id, segments (JSONB) |
| `comments` | Bình luận per chương: user_id, comic_id, chap_id, parent_id, body, is_deleted |
| `comment_reactions` | Reaction emoji: user_id, comment_id, emoji |
| `profiles` | Profile user: display_name, avatar_url, role, donate_momo, donate_qr_url, donate_note, is_blocked |

RLS bật — mỗi user chỉ đọc/sửa dữ liệu của mình.

> ⚠ Bảng `comments` và `comment_reactions` chưa có trong các file SQL ở `data/` — cần tạo thủ công trong Supabase Dashboard.

### Cấu trúc pages (chương ảnh)
```json
[{"id":"p1","note":"","vi":{"type":"drive","url":"...","name":"..."},"en":{...}}]
```

### Cấu trúc segments (chương chữ)
```json
[{"id":"s1","note":"","content":{"vi":"...","en":"...","ja":"..."},"annotations":[{"id":"a1","phrase":{"vi":"...","en":"..."}}]}]
```

## Roles

| Role | Quyền |
|---|---|
| `admin` | Toàn quyền — thấy tất cả views, quản lý users |
| `publisher` | Chỉ thấy/sửa truyện do mình tạo (`created_by = uid`) |
| user thường | Chỉ đọc — vào `index.html`, không vào admin |

Role lưu trong `window.CURRENT_ROLE`, được set sau khi Auth.init() kiểm tra Supabase.

## Ngôn ngữ hỗ trợ

`vi` · `en` · `ja` · `zh` · `ko` · `fr` · `de` · `es`

## Global objects

Tất cả module dùng `window.*`, không có import/export:

- `window.App` — state toàn cục (view, comics, selComicId, editingChapId...)
- `window.UI` — DOM helpers (el, div, mkBtn, esc, showLoading, renderAll...)
- `window.DB` — Supabase data API (loadMeta, saveComic, saveChapter, loadTextChap...)
- `window.Auth` — auth API (init, getUser, getUserId, signOut, showAuthUI...)
- `window._sb` — Supabase client instance
- `window.Theme` — theme toggle
- `window.TextEditor` — text chapter form builder
- `window.CURRENT_ROLE` — 'admin' | 'publisher' | null

## Routing (App.go)

`App.go(view, opts)` set `App.view` và gọi `UI.renderAll()`. Các view:

`library` · `add-comic` · `edit-comic` · `chapters` · `add-chapter` · `edit-chapter` · `add-text-chapter` · `edit-text-chapter` · `analytics` · `users` · `settings`

## Bảo mật credentials

`js/config.js` có trong `.gitignore` — không bao giờ commit. GitHub Actions inject từ Secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON`

Chạy local: copy `js/config.example.js` → `js/config.js` rồi điền thật.

## Deploy

Push lên `main` → GitHub Actions tự build và deploy lên GitHub Pages trong ~1 phút.
Xem hướng dẫn đầy đủ tại [js/DEPLOY.md](js/DEPLOY.md).
