/* ── AUTH.JS ──────────────────────────────────────────────
   Quản lý authentication qua Supabase.
   Hỗ trợ: Email/Password + Google OAuth
──────────────────────────────────────────────────────────── */
window.Auth = (() => {
  let _user = null;

  function getUser() { return _user; }
  function getUserId() { return _user?.id || null; }

  /* ── Khởi tạo — gọi trong init() ── */
  async function init() {
    const { data: { session } } = await window._sb.auth.getSession();
    _user = session?.user || null;

    // Lắng nghe thay đổi auth state
    window._sb.auth.onAuthStateChange((event, session) => {
      _user = session?.user || null;
      if (event === 'SIGNED_IN')  onSignedIn();
      if (event === 'SIGNED_OUT') onSignedOut();
    });

    return _user;
  }

  async function onSignedIn() {
    document.getElementById('auth-overlay')?.remove();
    UI.showLoading('Đang tải dữ liệu...');
    await DB.loadMeta();
    UI.hideLoading();
    UI.renderAll();
  }

  function onSignedOut() {
    App.comics = [];
    // Hiển thị màn hình login
    showAuthUI();
  }

  /* ── Login / Register ── */
  async function signInEmail(email, password) {
    const { error } = await window._sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUpEmail(email, password) {
    const { error } = await window._sb.auth.signUp({ email, password });
    if (error) throw error;
  }

  async function signInGoogle() {
    const { error } = await window._sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }

  async function signOut() {
    await window._sb.auth.signOut();
  }

  /* ── Auth UI overlay ── */
  function showAuthUI() {
    // Remove existing
    document.getElementById('auth-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;background:#0f0f11;z-index:9999',
      'display:flex;align-items:center;justify-content:center',
    ].join(';');

    const box = document.createElement('div');
    box.style.cssText = [
      'background:#18181c;border:1px solid #2a2a30;border-radius:12px',
      'padding:32px 36px;width:340px;max-width:92vw',
    ].join(';');

    box.innerHTML = `
<div style="font-family:monospace;font-size:14px;color:#c8a96e;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">MangaDesk</div>
<div style="font-size:11px;color:#444;margin-bottom:24px">Song Ngữ Admin</div>
<div id="auth-error" style="display:none;background:#2a1515;border:1px solid #5a2020;border-radius:6px;padding:9px 12px;font-size:11px;color:#e05555;margin-bottom:14px"></div>
<div style="margin-bottom:10px">
  <label style="font-size:10px;color:#666;letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px">Email</label>
  <input id="auth-email" type="email" placeholder="you@example.com"
    style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;outline:none;font-family:inherit">
</div>
<div style="margin-bottom:18px">
  <label style="font-size:10px;color:#666;letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px">Mật khẩu</label>
  <input id="auth-pass" type="password" placeholder="••••••••"
    style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;outline:none;font-family:inherit">
</div>
<button id="auth-login-btn"
  style="width:100%;background:#c8a96e;color:#18181c;border:none;border-radius:6px;padding:11px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:8px;font-family:inherit">
  Đăng nhập
</button>
<button id="auth-register-btn"
  style="width:100%;background:transparent;color:#888;border:1px solid #2a2a30;border-radius:6px;padding:10px;font-size:12px;cursor:pointer;margin-bottom:14px;font-family:inherit">
  Tạo tài khoản mới
</button>
<div style="position:relative;text-align:center;margin-bottom:14px">
  <span style="font-size:10px;color:#333;background:#18181c;padding:0 8px;position:relative;z-index:1">hoặc</span>
  <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:#2a2a30"></div>
</div>
<button id="auth-google-btn"
  style="width:100%;background:#111;color:#ccc;border:1px solid #2a2a30;border-radius:6px;padding:10px;font-size:12px;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">
  <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.6 2.2 30.1 0 24 0 14.6 0 6.6 5.5 2.6 13.5l7.8 6C12.3 13.1 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.9-10 6.9-17z"/><path fill="#FBBC05" d="M10.4 28.5c-.5-1.5-.8-3-.8-4.5s.3-3 .8-4.5l-7.8-6C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.5l7.8-6z"/><path fill="#34A853" d="M24 48c6.1 0 11.2-2 14.9-5.4l-7.5-5.8c-2 1.4-4.6 2.2-7.4 2.2-6.3 0-11.7-3.6-13.6-9l-7.8 6C6.6 42.5 14.6 48 24 48z"/></svg>
  Đăng nhập với Google
</button>`;

    // Wire up events
    const showErr = msg => {
      const el = box.querySelector('#auth-error');
      el.textContent = msg; el.style.display = 'block';
    };

    box.querySelector('#auth-login-btn').addEventListener('click', async () => {
      const email = box.querySelector('#auth-email').value.trim();
      const pass  = box.querySelector('#auth-pass').value;
      if (!email || !pass) { showErr('Nhập email và mật khẩu'); return; }
      try {
        box.querySelector('#auth-login-btn').textContent = 'Đang đăng nhập...';
        await signInEmail(email, pass);
      } catch(e) {
        showErr(e.message);
        box.querySelector('#auth-login-btn').textContent = 'Đăng nhập';
      }
    });

    box.querySelector('#auth-register-btn').addEventListener('click', async () => {
      const email = box.querySelector('#auth-email').value.trim();
      const pass  = box.querySelector('#auth-pass').value;
      if (!email || !pass) { showErr('Nhập email và mật khẩu'); return; }
      if (pass.length < 6) { showErr('Mật khẩu ít nhất 6 ký tự'); return; }
      try {
        box.querySelector('#auth-register-btn').textContent = 'Đang tạo...';
        await signUpEmail(email, pass);
        showErr('✓ Đã gửi email xác nhận. Kiểm tra hộp thư.');
        box.querySelector('#auth-register-btn').textContent = 'Tạo tài khoản mới';
      } catch(e) {
        showErr(e.message);
        box.querySelector('#auth-register-btn').textContent = 'Tạo tài khoản mới';
      }
    });

    box.querySelector('#auth-google-btn').addEventListener('click', async () => {
      try { await signInGoogle(); }
      catch(e) { showErr(e.message); }
    });

    // Enter key
    [box.querySelector('#auth-email'), box.querySelector('#auth-pass')].forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key==='Enter') box.querySelector('#auth-login-btn').click(); });
    });

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.querySelector('#auth-email').focus();
  }

  return { init, getUser, getUserId, signOut, showAuthUI };
})();
