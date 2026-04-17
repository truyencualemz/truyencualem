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

  nav.appendChild(Object.assign(UI.div('ns'), { textContent: 'Hệ thống' }));
  const si = UI.div('nv'+(App.view==='settings'?' active':''));
  si.innerHTML = `<svg class="nic" viewBox="0 0 16 16" fill="currentColor"><path d="M7 1a1 1 0 0 0-1 1v.5A5.5 5.5 0 0 0 4.6 3.08l-.35-.35a1 1 0 1 0-1.42 1.42l.35.35A5.5 5.5 0 0 0 2.5 6H2a1 1 0 0 0 0 2h.5c.09.5.25.97.48 1.4l-.35.35a1 1 0 1 0 1.42 1.42l.35-.35c.43.23.9.39 1.4.48V12a1 1 0 0 0 2 0v-.5c.5-.09.97-.25 1.4-.48l.35.35a1 1 0 1 0 1.42-1.42l-.35-.35c.23-.43.39-.9.48-1.4H12a1 1 0 0 0 0-2h-.5a5.5 5.5 0 0 0-.48-1.4l.35-.35a1 1 0 1 0-1.42-1.42l-.35.35A5.5 5.5 0 0 0 8 2.5V2a1 1 0 0 0-1-1zm0 4a3 3 0 1 1 0 6A3 3 0 0 1 7 5z"/></svg>Cài đặt`;
  si.addEventListener('click', () => App.go('settings')); nav.appendChild(si);

  // User info + sign out at bottom
  const user = Auth.getUser();
  if (user) {
    nav.appendChild(Object.assign(UI.div('ns'), { textContent: 'Tài khoản' }));
    const email = UI.div(); email.style.cssText='padding:8px 18px;font-size:10px;color:#555;word-break:break-all';
    email.textContent = user.email || 'Đã đăng nhập';
    nav.appendChild(email);
    const so = UI.div('nv'); so.innerHTML='<svg class="nic" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2H2v12h4v-1H3V3h3V2zm4.5 3.5l3 2.5-3 2.5V9H5V7h5.5V5.5z"/></svg>Đăng xuất';
    so.addEventListener('click', async () => { if (confirm('Đăng xuất?')) await Auth.signOut(); });
    nav.appendChild(so);
  }
}

/* ── TOPBAR ── */
function buildTopbar() {
  const T = { library:'Thư viện','add-comic':'Thêm truyện mới',chapters:'Chương / Tập','add-chapter':'Thêm chương tranh','edit-chapter':'Sửa chương tranh','add-text-chapter':'Thêm chương chữ','edit-text-chapter':'Sửa chương chữ',settings:'Cài đặt' };
  const S = { library:'Quản lý truyện song ngữ','add-comic':'Điền thông tin truyện',chapters:'Danh sách chương','add-chapter':'Upload trang ảnh / PDF','edit-chapter':'Chỉnh sửa trang','add-text-chapter':'Soạn nội dung đoạn văn','edit-text-chapter':'Chỉnh sửa đoạn văn',settings:'Cấu hình' };
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
  switch (App.view) {
    case 'library':            c.appendChild(Admin.viewLibrary());     break;
    case 'add-comic':          c.appendChild(Admin.viewAddComic());    break;
    case 'chapters':           c.appendChild(Admin.viewChapters());    break;
    case 'add-chapter':        c.appendChild(Admin.viewAddChapter());  break;
    case 'edit-chapter':       c.appendChild(Admin.viewEditChapter()); break;
    case 'add-text-chapter':   c.appendChild(TextEditor.buildForm(false)); break;
    case 'edit-text-chapter':  c.appendChild(TextEditor.buildForm(true));  break;
    case 'settings':           Admin.viewSettings(c);                  break;
  }
}

/* ── INIT ── */
async function init() {
  UI.showLoading('Đang khởi động...');

  // 1. Khởi tạo Supabase client
  window._sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON);

  // 2. Kiểm tra session
  const user = await Auth.init();

  if (!user) {
    UI.hideLoading();
    Auth.showAuthUI();
    return;
  }

  // 3. Load dữ liệu
  try {
    await DB.loadMeta();
  } catch(e) {
    console.error('loadMeta failed:', e);
  }

  UI.hideLoading();
  UI.renderAll();
}
