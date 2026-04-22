/* ── APP.JS ────────────────────────────────────────────────
   UI helpers + routing + Supabase init + auth.
──────────────────────────────────────────────────────────── */
window.UI = {
  el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; },
  div(cls)     { return this.el('div', cls); },
  mkBtn(cls, text, fn) {
    const b = this.el('button', 'btn ' + cls);
    b.textContent = text; b.addEventListener('click', fn); return b;
  },
  esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; },
  showLoading(msg = 'Đang xử lý...') {
    document.getElementById('loading-msg').textContent = msg;
    document.getElementById('loading').style.display = 'flex';
  },
  hideLoading() { document.getElementById('loading').style.display = 'none'; },
  renderAll()     { this.renderNav(); this.renderTopbar(); this.renderContent(); },
  renderNav()     { buildNav(); },
  renderTopbar()  { buildTopbar(); },
  renderContent() { buildContent(); },
};

const TEXT_VIEWS = ['add-text-chapter','edit-text-chapter'];
const IMG_VIEWS  = ['add-chapter','edit-chapter'];
const CHAP_VIEWS = [...TEXT_VIEWS, ...IMG_VIEWS];

/* ── NAV ── */
function buildNav() {
  const nav = document.getElementById('nav'); nav.innerHTML = '';
  nav.appendChild(Object.assign(UI.div('ns'), { textContent: 'Quản lý' }));
  [
    ['library',  'Thư viện',     '<path d="M2 2h4v12H2zm5 0h4v12H7zm5 0h2v12h-2z"/>'],
    ['chapters', 'Chương / Tập', '<path d="M2 2h12v2H2zm0 4h12v2H2zm0 4h8v2H2z"/>'],
  ].forEach(([v, label, icon]) => {
    const active = App.view===v||(v==='library'&&App.view==='add-comic')||(v==='chapters'&&CHAP_VIEWS.includes(App.view));
    const it = UI.div('nv'+(active?' active':''));
    it.innerHTML = `<svg class="nic" viewBox="0 0 16 16" fill="currentColor">${icon}</svg>${label}`;
    it.addEventListener('click', () => App.go(v)); nav.appendChild(it);
  });

  // Mục "Hệ thống" chỉ hiện với Admin
  if (window.CURRENT_ROLE !== 'publisher') {
    nav.appendChild(Object.assign(UI.div('ns'), { textContent: 'Hệ thống' }));

    const an = UI.div('nv'+(App.view==='analytics'?' active':''));
    an.innerHTML = `<svg class="nic" viewBox="0 0 16 16" fill="currentColor"><path d="M0 13h1V6h3v7h1V4h3v9h1V8h3v5h1v1H0z"/></svg>Thống kê`;
    an.addEventListener('click', () => App.go('analytics')); nav.appendChild(an);

    const un = UI.div('nv'+(App.view==='users'?' active':''));
    un.innerHTML = `<svg class="nic" viewBox="0 0 16 16" fill="currentColor"><path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM2.5 14s-1 0-1-1 1-4 6.5-4 6.5 3 6.5 4-1 1-1 1H2.5z"/></svg>Users`;
    un.addEventListener('click', () => App.go('users')); nav.appendChild(un);

    const si = UI.div('nv'+(App.view==='settings'?' active':''));
    si.innerHTML = `<svg class="nic" viewBox="0 0 16 16" fill="currentColor"><path d="M7 1a1 1 0 0 0-1 1v.5A5.5 5.5 0 0 0 4.6 3.08l-.35-.35a1 1 0 1 0-1.42 1.42l.35.35A5.5 5.5 0 0 0 2.5 6H2a1 1 0 0 0 0 2h.5c.09.5.25.97.48 1.4l-.35.35a1 1 0 1 0 1.42 1.42l.35-.35c.43.23.9.39 1.4.48V12a1 1 0 0 0 2 0v-.5c.5-.09.97-.25 1.4-.48l.35.35a1 1 0 1 0 1.42-1.42l-.35-.35c.23-.43.39-.9.48-1.4H12a1 1 0 0 0 0-2h-.5a5.5 5.5 0 0 0-.48-1.4l.35-.35a1 1 0 1 0-1.42-1.42l-.35.35A5.5 5.5 0 0 0 8 2.5V2a1 1 0 0 0-1-1zm0 4a3 3 0 1 1 0 6A3 3 0 0 1 7 5z"/></svg>Cài đặt`;
    si.addEventListener('click', () => App.go('settings')); nav.appendChild(si);
  }

  // Badge role
  const roleBadge = UI.div();
  roleBadge.style.cssText = 'margin:4px 12px 0;padding:4px 10px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:.5px;text-align:center';
  if (window.CURRENT_ROLE === 'publisher') {
    roleBadge.style.cssText += ';background:#0d2a35;color:#7eb8c8;border:1px solid #1a4a5a';
    roleBadge.textContent = '📝 PUBLISHER';
  } else {
    roleBadge.style.cssText += ';background:#2a1e0d;color:#c8a96e;border:1px solid #4a3a1a';
    roleBadge.textContent = '🔑 ADMIN';
  }
  nav.appendChild(roleBadge);

  // User info + sign out at bottom
  const user = Auth.getUser();
  if (user) {
    nav.appendChild(Object.assign(UI.div('ns'), { textContent: 'Tài khoản' }));
    const meta  = user.user_metadata || {};
    const name  = meta.full_name || meta.name || user.email || '';
    const email = UI.div(); email.style.cssText='padding:6px 18px 2px;font-size:10px;color:#555;word-break:break-all'; email.textContent=name||user.email;
    nav.appendChild(email);
    const pf = UI.div('nv'); pf.innerHTML='<svg class="nic" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm4 1.5a4 4 0 0 1 .5 1.9V12H3.5v-.6c0-.7.2-1.4.5-1.9A4.5 4.5 0 0 1 8 7.5a4.5 4.5 0 0 1 4 2z"/></svg>Tài khoản';
    pf.addEventListener('click', () => Auth.showProfileModal()); nav.appendChild(pf);
    const so = UI.div('nv'); so.innerHTML='<svg class="nic" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2H2v12h4v-1H3V3h3V2zm4.5 3.5l3 2.5-3 2.5V9H5V7h5.5V5.5z"/></svg>Đăng xuất';
    so.addEventListener('click', async () => { if (confirm('Đăng xuất?')) await Auth.signOut(); });
    nav.appendChild(so);
  }
}

/* ── TOPBAR ── */
function buildTopbar() {
  const T = { library:'Thư viện','add-comic':'Thêm truyện mới',chapters:'Chương / Tập','add-chapter':'Thêm chương tranh','edit-chapter':'Sửa chương tranh','add-text-chapter':'Thêm chương chữ','edit-text-chapter':'Sửa chương chữ',settings:'Cài đặt' };
  const S = { library: window.CURRENT_ROLE==='publisher' ? 'Truyện của bạn' : 'Quản lý truyện song ngữ','add-comic':'Điền thông tin truyện',chapters:'Danh sách chương','add-chapter':'Upload trang ảnh / PDF','edit-chapter':'Chỉnh sửa trang','add-text-chapter':'Soạn nội dung đoạn văn','edit-text-chapter':'Chỉnh sửa đoạn văn',settings:'Cấu hình' };
  document.querySelector('#topbar-left .tt').textContent = T[App.view] || '';
  document.querySelector('#topbar-left .ts').textContent = S[App.view] || '';
  const right = document.getElementById('topbar-right'); right.innerHTML = '';
  if (App.view==='library')
    right.appendChild(UI.mkBtn('btn-primary','+ Thêm truyện',()=>{ App.coverData=null; App.go('add-comic'); }));
  else if (['add-comic',...CHAP_VIEWS].includes(App.view))
    right.appendChild(UI.mkBtn('btn-ghost','← Quay lại',()=>App.go('chapters')));
}

/* ── CONTENT ── */
function buildContent() {
  const c = document.getElementById('content'); c.innerHTML = '';
  // Chặn Publisher truy cập trang admin-only
  const adminOnly = ['analytics', 'users', 'settings'];
  if (window.CURRENT_ROLE === 'publisher' && adminOnly.includes(App.view)) {
    App.go('library');
    return;
  }
  switch (App.view) {
    case 'library':            c.appendChild(Admin.viewLibrary());     break;
    case 'add-comic':          c.appendChild(Admin.viewAddComic());    break;
    case 'chapters':           c.appendChild(Admin.viewChapters());    break;
    case 'add-chapter':        c.appendChild(Admin.viewAddChapter());  break;
    case 'edit-chapter':       c.appendChild(Admin.viewEditChapter()); break;
    case 'add-text-chapter':   c.appendChild(TextEditor.buildForm(false)); break;
    case 'edit-text-chapter':  c.appendChild(TextEditor.buildForm(true));  break;
    case 'analytics':          Admin.viewAnalytics(c);                break;
    case 'users':              Admin.viewUsers(c);                    break;
    case 'settings':           Admin.viewSettings(c);                  break;
  }
}

/* ── INIT ── */
async function init() {
  UI.showLoading('Đang khởi động...');

  // 1. Kiểm tra config.js đã được load chưa
  if (!window.SUPABASE_URL || window.SUPABASE_URL.includes('YOUR_PROJECT_ID')
   || !window.SUPABASE_ANON || window.SUPABASE_ANON.includes('YOUR_ANON_KEY')) {
    UI.hideLoading();
    showConfigError();
    return;
  }

  // 2. Khởi tạo Supabase client
  try {
    window._sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON);
  } catch(e) {
    UI.hideLoading();
    showConfigError('Không thể khởi tạo Supabase: ' + e.message);
    return;
  }

  // 3. Kiểm tra session
  let user;
  try {
    user = await Auth.init();
  } catch(e) {
    UI.hideLoading();
    showConfigError('Lỗi kết nối Supabase: ' + e.message);
    return;
  }

  if (!user) {
    UI.hideLoading();
    Auth.showAuthUI();
    return;
  }

  // Có session rồi → chạy admin check + load ngay
  // (không đợi onAuthStateChange vì reload trang không fire SIGNED_IN)
  UI.hideLoading();
  await Auth.handleExistingSession();
}

/* Màn hình từ chối truy cập cho user thường */
function showAccessDenied(email) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#0f0f11;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
<div style="max-width:420px;width:100%;background:#18181c;border:1px solid #2a2a30;border-radius:12px;padding:32px 28px;text-align:center">
  <div style="font-size:32px;margin-bottom:16px">🔒</div>
  <div style="font-family:monospace;font-size:13px;color:#c8a96e;letter-spacing:2px;margin-bottom:8px">MANGADESK</div>
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">Không có quyền truy cập</div>
  <div style="font-size:11px;color:#555;margin-bottom:20px;line-height:1.7">
    Tài khoản <b style="color:#888">${email||''}</b> không có quyền vào trang Admin.<br>
    Trang này chỉ dành cho <b style="color:#c8a96e">Admin</b> và <b style="color:#7eb8c8">Publisher</b>.
  </div>
  <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
    <a href="user.html" style="padding:9px 20px;background:#c8a96e;color:#18181c;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;font-family:inherit">
      → Trang đọc truyện
    </a>
    <button onclick="Auth.signOut()" style="padding:9px 16px;background:transparent;color:#666;border:1px solid #2a2a30;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit">
      Đăng xuất
    </button>
  </div>
</div>`;
  document.body.appendChild(overlay);
}

/* Hiển thị hướng dẫn khi config.js chưa được thiết lập */
function showConfigError(extraMsg) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#0f0f11;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
<div style="max-width:480px;width:100%;background:#18181c;border:1px solid #2a2a30;border-radius:12px;padding:32px 28px">
  <div style="font-family:monospace;font-size:13px;color:#c8a96e;letter-spacing:2px;margin-bottom:4px">MANGADESK</div>
  <div style="font-size:11px;color:#444;margin-bottom:24px">Cấu hình chưa hoàn tất</div>

  <div style="background:#2a1515;border:1px solid #5a2020;border-radius:8px;padding:12px 16px;font-size:12px;color:#e05555;margin-bottom:20px">
    ⚠ File <code style="background:#1a0a0a;padding:1px 5px;border-radius:3px">js/config.js</code> không tìm thấy hoặc chưa được điền.
    ${extraMsg ? '<br><span style="color:#c04040;font-size:11px">' + extraMsg + '</span>' : ''}
  </div>

  <div style="font-size:12px;color:#888;line-height:1.9">
    <b style="color:#aaa">Nếu dùng GitHub Pages + GitHub Actions:</b><br>
    1. Vào repo → <b style="color:#ccc">Settings → Secrets → Actions</b><br>
    2. Thêm 2 secrets: <code style="background:#1a1a1e;padding:1px 5px;border-radius:3px;color:#9ae">SUPABASE_URL</code>
       và <code style="background:#1a1a1e;padding:1px 5px;border-radius:3px;color:#9ae">SUPABASE_ANON</code><br>
    3. Vào tab <b style="color:#ccc">Actions → chọn workflow → Re-run all jobs</b><br>
    <br>
    <b style="color:#aaa">Nếu chạy local:</b><br>
    Copy file <code style="background:#1a1a1e;padding:1px 5px;border-radius:3px;color:#9ae">js/config.example.js</code>
    → đổi tên thành <code style="background:#1a1a1e;padding:1px 5px;border-radius:3px;color:#9ae">js/config.js</code>
    → điền URL và anon key từ Supabase Dashboard.
  </div>

  <div style="margin-top:20px;padding-top:16px;border-top:1px solid #2a2a30;font-size:11px;color:#555">
    Supabase Dashboard → Project Settings → API → Project URL + anon key
  </div>
</div>`;
  document.body.appendChild(overlay);
}
