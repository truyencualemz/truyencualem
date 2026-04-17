# MangaDesk — Hướng dẫn deploy

## Tổng quan stack

```
GitHub Pages  →  static host (HTML/JS/CSS)
Supabase      →  PostgreSQL (metadata + text chapters)
Google Drive  →  File ảnh + PDF (2TB sẵn có)
Apps Script   →  Proxy để list folder + fetch PDF
Custom domain →  Mượn tên miền, trỏ vào GitHub Pages
```

---

## Bước 1: Tạo Supabase project

1. Vào [supabase.com](https://supabase.com) → New project
2. Chọn region gần nhất (Singapore cho VN)
3. Đặt mật khẩu database (lưu lại)
4. Chờ ~2 phút để project khởi tạo

### Tạo bảng

- Vào **Database → SQL Editor → New query**
- Copy toàn bộ nội dung file `data/supabase-schema.sql`
- Nhấn **Run**

### Lấy credentials

- Vào **Project Settings → API**
- Copy **Project URL** (dạng `https://xxxx.supabase.co`)
- Copy **anon / public key**

---

## Bước 2: Điền credentials vào code

Mở file `js/config.js`:

```js
window.SUPABASE_URL  = 'https://YOUR_PROJECT_ID.supabase.co';
window.SUPABASE_ANON = 'YOUR_ANON_KEY';
```

Thay bằng giá trị thực của bạn.

---

## Bước 3: Bật Authentication

Trong Supabase Dashboard:

1. **Authentication → Providers**
2. Bật **Email** (đã bật mặc định)
3. Bật **Google** (tùy chọn):
   - Cần tạo OAuth credentials tại [Google Cloud Console](https://console.cloud.google.com)
   - Project → APIs & Services → Credentials → Create OAuth 2.0 Client
   - Authorized redirect URIs: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`

---

## Bước 4: Deploy lên GitHub Pages

### Tạo repository

```bash
git init
git add .
git commit -m "Initial MangaDesk"
git remote add origin https://github.com/USERNAME/mangadesk.git
git push -u origin main
```

### Bật GitHub Pages

1. Repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `root`
4. Save → chờ ~1 phút

URL mặc định: `https://USERNAME.github.io/mangadesk`

---

## Bước 5: Gắn tên miền

### Tại GitHub Pages

1. Settings → Pages → Custom domain
2. Nhập tên miền (vd: `manga.yourdomain.com`)
3. Tick "Enforce HTTPS"

### Tại DNS provider (nơi mua tên miền)

Thêm CNAME record:
```
Type:  CNAME
Name:  manga        (hoặc @ nếu dùng root domain)
Value: USERNAME.github.io
TTL:   3600
```

Chờ 5-30 phút để DNS propagate.

---

## Bước 6: Cập nhật Supabase redirect URLs

Vào **Authentication → URL Configuration**:

```
Site URL:        https://manga.yourdomain.com
Redirect URLs:   https://manga.yourdomain.com/**
```

---

## Bước 7: Apps Script (đã có, cập nhật URL)

Script cũ vẫn dùng được. Chỉ cần đảm bảo URL web app đã lưu trong **Cài đặt** của app.

---

## Workflow thêm truyện tranh

```
1. Tạo folder trong Google Drive:
   /MangaDesk/TenTruyen/Chapter1-VI/
   /MangaDesk/TenTruyen/Chapter1-EN/

2. Upload ảnh/PDF vào folder (đặt tên 001.jpg, 002.jpg...)

3. Share folder: chuột phải → Share → Anyone with link

4. Trong MangaDesk → Thêm chương → Import từ Google Drive
   → Paste link folder → Lấy danh sách → Import vào VI/EN
```

---

## Cập nhật code

```bash
# Sau khi sửa code
git add .
git commit -m "Update feature XYZ"
git push

# GitHub Pages tự deploy trong ~1 phút
```

---

## Giới hạn free tier

| Dịch vụ | Giới hạn | Ước tính dùng được |
|---------|----------|-------------------|
| GitHub Pages | Unlimited | Mãi mãi |
| Supabase DB | 500MB | Hàng trăm bộ truyện |
| Supabase Auth | 50,000 users | Mãi mãi (dùng nội bộ) |
| Google Drive | 2TB | ~250 bộ truyện full JPG |

---

## Backup định kỳ

Trong app → **Cài đặt → Export JSON** → lưu file vào máy tính
(Không bao gồm file ảnh/PDF — những file này đã ở Drive rồi)
