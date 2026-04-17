# MangaDesk — Hướng dẫn deploy

## Tổng quan stack

```
GitHub Pages  →  static host (HTML/JS/CSS)
Supabase      →  PostgreSQL (metadata + text chapters)
Google Drive  →  File ảnh + PDF (2TB sẵn có)
Apps Script   →  Proxy để list folder + fetch PDF
```

---

## Về tên miền

### Dùng tên miền GitHub Pages luôn — hoàn toàn được

GitHub Pages cấp sẵn tên miền miễn phí:

```
https://USERNAME.github.io/mangadesk
```

Không cần mua tên miền ngoài, HTTPS miễn phí, không cần cấu hình DNS gì thêm.
Chỉ cần nhớ cập nhật URL này vào Supabase ở Bước 5.

### Nếu sau này muốn tên miền riêng

Chỉ cần thêm CNAME record tại DNS provider và cập nhật GitHub Pages Settings.
Không cần đổi code gì.

---

## Bước 1: Bảo mật config.js trước khi push Git

`js/config.js` chứa Supabase credentials — **không được commit lên repo public**.

### 1a. Tạo .gitignore

Tạo file `.gitignore` ở thư mục gốc:

```
# .gitignore
js/config.js
```

### 1b. Tạo config.example.js để người khác biết cần điền gì

```js
// js/config.example.js  ← file này commit bình thường
window.SUPABASE_URL  = 'https://YOUR_PROJECT_ID.supabase.co';
window.SUPABASE_ANON = 'YOUR_ANON_KEY';
```

### 1c. Dùng GitHub Actions để tự inject credentials khi deploy

Tạo file `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Tạo config.js từ GitHub Secrets (không lưu trong code)
      - name: Create config.js
        run: |
          cat > js/config.js << EOF
          window.SUPABASE_URL  = '${{ secrets.SUPABASE_URL }}';
          window.SUPABASE_ANON = '${{ secrets.SUPABASE_ANON }}';
          EOF

      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - uses: actions/deploy-pages@v4
```

### 1d. Thêm Secrets vào GitHub repo

1. Repo → **Settings → Secrets and variables → Actions**
2. Nhấn **New repository secret**, thêm 2 secret:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_ANON` | `eyJh...` (anon key) |

Từ giờ mỗi lần push code, GitHub Actions tự build và inject credentials — `config.js` không bao giờ xuất hiện trong repo.

---

## Bước 2: Tạo Supabase project

1. Vào [supabase.com](https://supabase.com) → **New project**
2. Chọn region: **Southeast Asia (Singapore)** — gần VN nhất
3. Đặt mật khẩu database → lưu lại
4. Chờ ~2 phút để project khởi tạo

### Tạo bảng

- Vào **Database → SQL Editor → New query**
- Copy toàn bộ nội dung file `data/supabase-schema.sql`
- Nhấn **Run**

### Lấy credentials

- Vào **Project Settings → API**
- Copy **Project URL**
- Copy **anon / public key**

→ Lưu 2 giá trị này vào GitHub Secrets (Bước 1d)

---

## Bước 3: Bật Authentication trong Supabase

Vào **Authentication → Providers**:

**Email** (mặc định đã bật):
- Tắt "Confirm email" nếu muốn đăng ký xong dùng ngay không cần xác nhận

**Google OAuth** (tùy chọn):
1. Vào [Google Cloud Console](https://console.cloud.google.com) → Create project
2. APIs & Services → Credentials → Create OAuth 2.0 Client ID
3. Application type: **Web application**
4. Authorized redirect URIs:
   ```
   https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback
   ```
5. Copy Client ID và Client Secret → dán vào Supabase → Google provider

---

## Bước 4: Tạo GitHub repository và push code

```bash
# Trong thư mục mangadesk/
git init
git add .
git commit -m "Initial MangaDesk"

# Tạo repo trên github.com trước, sau đó:
git remote add origin https://github.com/USERNAME/mangadesk.git
git push -u origin main
```

Vì `.gitignore` đã có `js/config.js`, file đó sẽ không bị push lên.

---

## Bước 5: Bật GitHub Pages

Có 2 cách:

### Cách A — Dùng GitHub Actions (khuyến nghị, vì có inject config.js)

1. Repo → **Settings → Pages**
2. Source: **GitHub Actions**
3. Push code → Actions tự chạy → site live tại:
   ```
   https://USERNAME.github.io/mangadesk
   ```

### Cách B — Deploy từ branch (đơn giản hơn nhưng cần config.js public)

> ⚠ Chỉ dùng nếu repo là **private**

1. Settings → Pages → Source: **Deploy from branch** → `main` / `root`
2. Tạo `js/config.js` thủ công, xóa khỏi `.gitignore`

---

## Bước 6: Cập nhật Supabase URL

Vào Supabase → **Authentication → URL Configuration**:

```
Site URL:
  https://USERNAME.github.io

Redirect URLs (thêm cả 2):
  https://USERNAME.github.io/**
  https://USERNAME.github.io/mangadesk/**
```

> Nếu dùng tên miền riêng sau này, thêm URL đó vào danh sách này.

---

## Bước 7: Cấu hình Apps Script

Script Drive cũ vẫn dùng được. Lưu URL web app vào app tại **Cài đặt → Google Drive Apps Script URL**.

---

## Cập nhật code sau này

```bash
git add .
git commit -m "Mô tả thay đổi"
git push
# GitHub Actions tự deploy trong ~1 phút
```

---

## Cấu trúc thư mục nên có trong repo

```
mangadesk/
  .gitignore              ← chứa js/config.js
  .github/
    workflows/
      deploy.yml          ← GitHub Actions
  DEPLOY.md
  index.html
  data/
    README.md
    supabase-schema.sql
  js/
    config.example.js     ← template, commit bình thường
    state.js
    auth.js
    db.js
    translate.js
    pdf-module.js
    gdrive.js
    admin-form.js
    admin.js
    reader.js
    text-editor.js
    text-reader.js
    app.js
```

---

## Tóm tắt giới hạn free tier

| Dịch vụ | Giới hạn | Ghi chú |
|---------|----------|---------|
| GitHub Pages | Unlimited | Miễn phí vĩnh viễn |
| GitHub Actions | 2000 phút/tháng | ~2000 lần deploy, dư dùng |
| Supabase DB | 500MB | Đủ cho hàng trăm bộ truyện metadata |
| Supabase Auth | 50,000 users | Dư cho dùng nội bộ |
| Google Drive | 2TB | File ảnh + PDF |

---

## Backup định kỳ

Trong app → **Cài đặt → Export JSON** → lưu file vào máy tính.

File export gồm: metadata truyện + nội dung chương chữ.
File ảnh/PDF không cần backup vì đã ở Drive.
