/* ── AUTH.JS ──────────────────────────────────────────────
   Authentication via Supabase.
   - Email/Password (không cần xác thực email nếu tắt trong Dashboard)
   - Google OAuth (redirect URL fix cho GitHub Pages subdirectory)
   - Quên mật khẩu
   - Xem/sửa thông tin tài khoản
──────────────────────────────────────────────────────────── */
window.Auth = (() => {
  let _user = null;

  function getUser()   { return _user; }
  function getUserId() { return _user?.id || null; }

  /* Tạo redirect URL đúng — dùng full href thay vì chỉ origin
     Quan trọng khi host tại: https://user.github.io/mangadesk/  */
  function currentPageURL() {
    return window.location.href.split('?')[0].split('#')[0];
  }

  /* ── Khởi tạo ── */
  async function init() {
    const { data: { session } } = await window._sb.auth.getSession();
    _user = session?.user || null;

    // Lắng nghe thay đổi auth state (đăng nhập mới, token refresh, đăng xuất)
    window._sb.auth.onAuthStateChange(async (event, session) => {
      const prevId = _user?.id;
      _user = session?.user || null;

      if (event === 'SIGNED_OUT') { onSignedOut(); return; }
      if (event === 'PASSWORD_RECOVERY') { showResetPasswordUI(); return; }

      // SIGNED_IN: đăng nhập mới (không phải reload)
      // TOKEN_REFRESHED: token tự refresh — chỉ re-render nếu chưa có UI
      if (event === 'SIGNED_IN' && _user && prevId !== _user.id) {
        await onSignedIn();
      }
    });

    return _user;
  }

  async function onSignedIn() {
    document.getElementById('auth-overlay')?.remove();

    const isUserPage = typeof loadUserUI === 'function'
      && window.location.pathname.includes('user');

    if (isUserPage) {
      // user-app.js: gọi loadUserUI khi đăng nhập mới
      if (_user) await loadUserUI(_user);
      return;
    }

    if (!window.UI) return;

    // Kiểm tra quyền admin — lúc này JWT đã sẵn sàng
    let isAdmin = false;
    try {
      isAdmin = await checkIsAdmin();
    } catch(e) {
      console.warn('Admin check skipped (schema chưa chạy?):', e.message);
      isAdmin = true;
    }

    if (!isAdmin) {
      UI.hideLoading();
      if (window.showAccessDenied) showAccessDenied(_user?.email || '');
      return;
    }

    UI.showLoading('Đang tải dữ liệu...');

    // Load profile → sets CURRENT_PROFILE + CURRENT_ROLE globals
    await getProfile();

    // Cập nhật role label trong sidebar
    const roleEl = document.getElementById('role-label');
    if (roleEl) {
      const labels = { admin: 'Song Ngữ Admin', publisher: 'Publisher', user: 'User' };
      roleEl.textContent = labels[window.CURRENT_ROLE] || 'Song Ngữ Admin';
    }

    try { await DB.loadMeta(); } catch(e) { console.error('loadMeta:', e); }
    UI.hideLoading();
    UI.renderAll();
  }

  function onSignedOut() {
    if (window.App) App.comics = [];
    showAuthUI();
  }

  /* Gọi khi trang load mà đã có session sẵn (reload trang).
     app.js và user-app.js gọi hàm này thay vì đợi onAuthStateChange. */
  async function handleExistingSession() {
    if (!_user) return;
    await onSignedIn();
  }

  /* ── Đăng nhập / Đăng ký ── */
  async function signInEmail(email, password) {
    const { error } = await window._sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUpEmail(email, password) {
    const { data, error } = await window._sb.auth.signUp({
      email, password,
      options: {
        // Redirect sau khi click link xác nhận email
        emailRedirectTo: currentPageURL(),
      },
    });
    if (error) throw error;
    // Nếu identities rỗng = email đã đăng ký rồi
    if (data?.user?.identities?.length === 0) {
      throw new Error('Email này đã được đăng ký. Hãy đăng nhập.');
    }
    return data;
  }

  async function signInGoogle() {
    const { error } = await window._sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Dùng full URL của trang hiện tại để Supabase redirect về đúng chỗ
        // Hoạt động cả với: localhost, github.io/mangadesk, tên miền riêng
        redirectTo: currentPageURL(),
      },
    });
    if (error) throw error;
  }

  async function signOut() {
    await window._sb.auth.signOut();
  }

  /* ── Kiểm tra quyền admin ── */
  async function checkIsAdmin() {
    const uid = getUserId(); if (!uid) return false;
    const { data, error } = await window._sb
      .from('profiles')
      .select('role, is_blocked')
      .eq('id', uid)
      .single();
    if (error || !data) return false;
    return (data.role === 'admin' || data.role === 'publisher') && !data.is_blocked;
  }

  /* ── Lấy profile của user hiện tại ── */
  async function getProfile() {
    const uid = getUserId(); if (!uid) return null;
    const { data } = await window._sb
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single();
    // Lưu vào global để các module khác dùng
    if (data) {
      window.CURRENT_PROFILE = data;
      window.CURRENT_ROLE    = data.role || 'user';
    }
    return data || null;
  }
  async function sendPasswordReset(email) {
    const { error } = await window._sb.auth.resetPasswordForEmail(email, {
      redirectTo: currentPageURL(),
    });
    if (error) throw error;
  }

  /* Cập nhật mật khẩu mới (sau khi click link reset) */
  async function updatePassword(newPassword) {
    const { error } = await window._sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  /* ── Cập nhật profile ── */
  async function updateProfile({ displayName, avatarUrl }) {
    const metadata = {};
    if (displayName !== undefined) metadata.full_name    = displayName;
    if (avatarUrl   !== undefined) metadata.avatar_url   = avatarUrl;
    const { error } = await window._sb.auth.updateUser({ data: metadata });
    if (error) throw error;
    // Reload user
    const { data: { user } } = await window._sb.auth.getUser();
    _user = user;
    return user;
  }

  /* ══════════════════════════════════════════════════════
     AUTH UI
  ══════════════════════════════════════════════════════ */
  function showAuthUI() {
    document.getElementById('auth-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:#0f0f11;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';

    const box = document.createElement('div');
    box.style.cssText = 'background:#18181c;border:1px solid #2a2a30;border-radius:12px;padding:28px 32px;width:340px;max-width:100%';

    const isUserPage = window.location.pathname.includes('user');
    const subtitle   = isUserPage ? 'Đọc truyện' : 'Admin';

    // Render login form by default
    renderLoginForm(box, subtitle);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  /* ── Form đăng nhập ── */
  function renderLoginForm(box, subtitle = 'Admin') {
    box.innerHTML = `
<div style="font-family:monospace;font-size:13px;color:#c8a96e;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px">MangaDesk</div>
<div style="font-size:11px;color:#444;margin-bottom:22px">${subtitle}</div>
<div id="auth-msg" style="display:none;border-radius:6px;padding:9px 12px;font-size:11px;margin-bottom:14px"></div>

<div style="margin-bottom:10px">
  <label style="font-size:10px;color:#666;letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px">Email</label>
  <input id="auth-email" type="email" placeholder="you@example.com" autocomplete="email"
    style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;outline:none;font-family:inherit;transition:border-color .15s"
    onfocus="this.style.borderColor='#c8a96e'" onblur="this.style.borderColor='#2a2a30'">
</div>
<div style="margin-bottom:6px">
  <label style="font-size:10px;color:#666;letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px">Mật khẩu</label>
  <input id="auth-pass" type="password" placeholder="••••••••" autocomplete="current-password"
    style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;outline:none;font-family:inherit;transition:border-color .15s"
    onfocus="this.style.borderColor='#c8a96e'" onblur="this.style.borderColor='#2a2a30'">
</div>
<div style="text-align:right;margin-bottom:16px">
  <button id="auth-forgot-btn" style="background:none;border:none;color:#555;font-size:11px;cursor:pointer;padding:0;font-family:inherit">Quên mật khẩu?</button>
</div>

<button id="auth-login-btn"
  style="width:100%;background:#c8a96e;color:#18181c;border:none;border-radius:6px;padding:11px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:8px;font-family:inherit;transition:background .15s">
  Đăng nhập
</button>
<button id="auth-register-btn"
  style="width:100%;background:transparent;color:#888;border:1px solid #2a2a30;border-radius:6px;padding:10px;font-size:12px;cursor:pointer;margin-bottom:16px;font-family:inherit;transition:all .15s">
  Tạo tài khoản mới
</button>

<div style="position:relative;text-align:center;margin-bottom:14px">
  <span style="font-size:10px;color:#333;background:#18181c;padding:0 8px;position:relative;z-index:1">hoặc</span>
  <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:#2a2a30"></div>
</div>
<button id="auth-google-btn"
  style="width:100%;background:#111;color:#ccc;border:1px solid #2a2a30;border-radius:6px;padding:10px;font-size:12px;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;transition:border-color .15s">
  <svg width="15" height="15" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.6 2.2 30.1 0 24 0 14.6 0 6.6 5.5 2.6 13.5l7.8 6C12.3 13.1 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.9-10 6.9-17z"/><path fill="#FBBC05" d="M10.4 28.5c-.5-1.5-.8-3-.8-4.5s.3-3 .8-4.5l-7.8-6C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.5l7.8-6z"/><path fill="#34A853" d="M24 48c6.1 0 11.2-2 14.9-5.4l-7.5-5.8c-2 1.4-4.6 2.2-7.4 2.2-6.3 0-11.7-3.6-13.6-9l-7.8 6C6.6 42.5 14.6 48 24 48z"/></svg>
  Đăng nhập với Google
</button>`;

    const showMsg = (msg, isErr = true) => {
      const el = box.querySelector('#auth-msg');
      el.textContent = msg;
      el.style.display = 'block';
      el.style.background = isErr ? '#2a1515' : '#1a2e1a';
      el.style.border     = isErr ? '1px solid #5a2020' : '1px solid #2a3f2a';
      el.style.color      = isErr ? '#e05555' : '#4caf50';
    };

    const setLoading = (btn, loading, defaultText) => {
      btn.disabled = loading;
      btn.textContent = loading ? 'Đang xử lý...' : defaultText;
    };

    // Đăng nhập
    box.querySelector('#auth-login-btn').addEventListener('click', async () => {
      const email = box.querySelector('#auth-email').value.trim();
      const pass  = box.querySelector('#auth-pass').value;
      if (!email || !pass) { showMsg('Nhập email và mật khẩu'); return; }
      const btn = box.querySelector('#auth-login-btn');
      setLoading(btn, true, 'Đăng nhập');
      try {
        await signInEmail(email, pass);
      } catch(e) {
        let msg = e.message;
        if (msg.includes('Invalid login')) msg = 'Email hoặc mật khẩu không đúng';
        if (msg.includes('Email not confirmed')) msg = 'Email chưa được xác nhận. Kiểm tra hộp thư hoặc liên hệ admin để được kích hoạt.';
        showMsg(msg);
        setLoading(btn, false, 'Đăng nhập');
      }
    });

    // Đăng ký
    box.querySelector('#auth-register-btn').addEventListener('click', async () => {
      const email = box.querySelector('#auth-email').value.trim();
      const pass  = box.querySelector('#auth-pass').value;
      if (!email || !pass) { showMsg('Nhập email và mật khẩu'); return; }
      if (pass.length < 6) { showMsg('Mật khẩu ít nhất 6 ký tự'); return; }
      const btn = box.querySelector('#auth-register-btn');
      setLoading(btn, true, 'Tạo tài khoản mới');
      try {
        const data = await signUpEmail(email, pass);
        // Nếu Supabase không yêu cầu xác nhận email → đăng nhập luôn
        if (data?.session) {
          showMsg('✓ Đăng ký thành công!', false);
        } else {
          showMsg('✓ Đã gửi email xác nhận. Kiểm tra hộp thư (kể cả spam) rồi click link để kích hoạt tài khoản.', false);
        }
        setLoading(btn, false, 'Tạo tài khoản mới');
      } catch(e) {
        showMsg(e.message);
        setLoading(btn, false, 'Tạo tài khoản mới');
      }
    });

    // Quên mật khẩu
    box.querySelector('#auth-forgot-btn').addEventListener('click', () => {
      renderForgotForm(box, subtitle);
    });

    // Google
    box.querySelector('#auth-google-btn').addEventListener('click', async () => {
      try {
        box.querySelector('#auth-google-btn').textContent = 'Đang chuyển hướng...';
        await signInGoogle();
      } catch(e) {
        showMsg(e.message);
        box.querySelector('#auth-google-btn').innerHTML = `<svg width="15" height="15" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.6 2.2 30.1 0 24 0 14.6 0 6.6 5.5 2.6 13.5l7.8 6C12.3 13.1 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.9-10 6.9-17z"/><path fill="#FBBC05" d="M10.4 28.5c-.5-1.5-.8-3-.8-4.5l-7.8-6C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.5l7.8-6z"/><path fill="#34A853" d="M24 48c6.1 0 11.2-2 14.9-5.4l-7.5-5.8c-2 1.4-4.6 2.2-7.4 2.2-6.3 0-11.7-3.6-13.6-9l-7.8 6C6.6 42.5 14.6 48 24 48z"/></svg> Đăng nhập với Google`;
      }
    });

    // Enter key
    [box.querySelector('#auth-email'), box.querySelector('#auth-pass')].forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') box.querySelector('#auth-login-btn').click(); });
    });

    box.querySelector('#auth-email')?.focus();
  }

  /* ── Form quên mật khẩu ── */
  function renderForgotForm(box, subtitle = '') {
    box.innerHTML = `
<div style="font-family:monospace;font-size:13px;color:#c8a96e;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px">MangaDesk</div>
<div style="font-size:11px;color:#444;margin-bottom:22px">Đặt lại mật khẩu</div>
<div id="auth-msg" style="display:none;border-radius:6px;padding:9px 12px;font-size:11px;margin-bottom:14px"></div>
<p style="font-size:12px;color:#888;margin-bottom:14px;line-height:1.6">Nhập email đã đăng ký. Chúng tôi sẽ gửi link để đặt lại mật khẩu.</p>
<div style="margin-bottom:16px">
  <label style="font-size:10px;color:#666;letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px">Email</label>
  <input id="auth-email" type="email" placeholder="you@example.com"
    style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;outline:none;font-family:inherit;transition:border-color .15s"
    onfocus="this.style.borderColor='#c8a96e'" onblur="this.style.borderColor='#2a2a30'">
</div>
<button id="auth-reset-btn"
  style="width:100%;background:#c8a96e;color:#18181c;border:none;border-radius:6px;padding:11px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px;font-family:inherit">
  Gửi link đặt lại mật khẩu
</button>
<button id="auth-back-btn"
  style="width:100%;background:transparent;color:#666;border:1px solid #2a2a30;border-radius:6px;padding:9px;font-size:12px;cursor:pointer;font-family:inherit">
  ← Quay lại đăng nhập
</button>`;

    const showMsg = (msg, isErr = true) => {
      const el = box.querySelector('#auth-msg');
      el.textContent = msg; el.style.display = 'block';
      el.style.background = isErr ? '#2a1515' : '#1a2e1a';
      el.style.border     = isErr ? '1px solid #5a2020' : '1px solid #2a3f2a';
      el.style.color      = isErr ? '#e05555' : '#4caf50';
    };

    box.querySelector('#auth-reset-btn').addEventListener('click', async () => {
      const email = box.querySelector('#auth-email').value.trim();
      if (!email) { showMsg('Nhập email'); return; }
      const btn = box.querySelector('#auth-reset-btn');
      btn.disabled = true; btn.textContent = 'Đang gửi...';
      try {
        await sendPasswordReset(email);
        showMsg('✓ Đã gửi! Kiểm tra hộp thư (kể cả spam) và click vào link trong email.', false);
        btn.textContent = 'Đã gửi';
      } catch(e) {
        showMsg(e.message); btn.disabled = false; btn.textContent = 'Gửi link đặt lại mật khẩu';
      }
    });

    box.querySelector('#auth-back-btn').addEventListener('click', () => renderLoginForm(box, subtitle));
    box.querySelector('#auth-email')?.focus();
  }

  /* ── Form đặt mật khẩu mới (sau khi click link reset) ── */
  function showResetPasswordUI() {
    document.getElementById('auth-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:#0f0f11;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    const box = document.createElement('div');
    box.style.cssText = 'background:#18181c;border:1px solid #2a2a30;border-radius:12px;padding:28px 32px;width:340px;max-width:100%';
    box.innerHTML = `
<div style="font-family:monospace;font-size:13px;color:#c8a96e;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px">MangaDesk</div>
<div style="font-size:11px;color:#444;margin-bottom:22px">Đặt mật khẩu mới</div>
<div id="reset-msg" style="display:none;border-radius:6px;padding:9px 12px;font-size:11px;margin-bottom:14px"></div>
<div style="margin-bottom:14px">
  <label style="font-size:10px;color:#666;letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px">Mật khẩu mới</label>
  <input id="new-pass" type="password" placeholder="Ít nhất 6 ký tự"
    style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;outline:none;font-family:inherit">
</div>
<div style="margin-bottom:18px">
  <label style="font-size:10px;color:#666;letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px">Xác nhận mật khẩu</label>
  <input id="new-pass-confirm" type="password" placeholder="Nhập lại mật khẩu"
    style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;outline:none;font-family:inherit">
</div>
<button id="set-pass-btn"
  style="width:100%;background:#c8a96e;color:#18181c;border:none;border-radius:6px;padding:11px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
  Lưu mật khẩu mới
</button>`;

    const showMsg = (msg, isErr = true) => {
      const el = box.querySelector('#reset-msg');
      el.textContent = msg; el.style.display = 'block';
      el.style.background = isErr ? '#2a1515' : '#1a2e1a';
      el.style.border     = isErr ? '1px solid #5a2020' : '1px solid #2a3f2a';
      el.style.color      = isErr ? '#e05555' : '#4caf50';
    };

    box.querySelector('#set-pass-btn').addEventListener('click', async () => {
      const p1 = box.querySelector('#new-pass').value;
      const p2 = box.querySelector('#new-pass-confirm').value;
      if (p1.length < 6) { showMsg('Mật khẩu ít nhất 6 ký tự'); return; }
      if (p1 !== p2)     { showMsg('Mật khẩu không khớp'); return; }
      const btn = box.querySelector('#set-pass-btn');
      btn.disabled = true; btn.textContent = 'Đang lưu...';
      try {
        await updatePassword(p1);
        showMsg('✓ Đã đổi mật khẩu thành công!', false);
        setTimeout(() => { overlay.remove(); }, 1500);
      } catch(e) {
        showMsg(e.message); btn.disabled = false; btn.textContent = 'Lưu mật khẩu mới';
      }
    });

    overlay.appendChild(box); document.body.appendChild(overlay);
    box.querySelector('#new-pass')?.focus();
  }

  /* ══════════════════════════════════════════════════════
     PROFILE MODAL — gọi từ user page hoặc admin
  ══════════════════════════════════════════════════════ */
  function showProfileModal() {
    document.getElementById('profile-modal')?.remove();
    const user = getUser();
    if (!user) return;

    const meta     = user.user_metadata || {};
    const email    = user.email || '';
    const name     = meta.full_name || meta.name || '';
    const avatar   = meta.avatar_url || meta.picture || '';
    const provider = user.app_metadata?.provider || 'email';

    const overlay = document.createElement('div');
    overlay.id = 'profile-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';

    const box = document.createElement('div');
    box.style.cssText = 'background:#18181c;border:1px solid #2a2a30;border-radius:12px;padding:28px 32px;width:380px;max-width:100%';

    box.innerHTML = `
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
  <div style="font-family:monospace;font-size:13px;color:#c8a96e">Thông tin tài khoản</div>
  <button id="profile-close" style="background:none;border:none;color:#555;font-size:16px;cursor:pointer;padding:0;line-height:1">✕</button>
</div>

<!-- Avatar + email -->
<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid #2a2a30">
  <div style="width:52px;height:52px;border-radius:50%;background:#2a2a30;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px">
    ${avatar ? `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover">` : `<span>${(name||email).charAt(0).toUpperCase()||'?'}</span>`}
  </div>
  <div style="min-width:0">
    <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name||'Chưa đặt tên'}</div>
    <div style="font-size:11px;color:#555;margin-top:2px">${email}</div>
    <div style="font-size:10px;color:#444;margin-top:3px">Đăng nhập qua: <b style="color:#666">${provider}</b></div>
  </div>
</div>

<div id="profile-msg" style="display:none;border-radius:6px;padding:9px 12px;font-size:11px;margin-bottom:14px"></div>

<!-- Tên hiển thị -->
<div style="margin-bottom:14px">
  <label style="font-size:10px;color:#666;letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px">Tên hiển thị</label>
  <input id="profile-name" type="text" value="${name.replace(/"/g,'&quot;')}" placeholder="Tên của bạn"
    style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;outline:none;font-family:inherit;transition:border-color .15s"
    onfocus="this.style.borderColor='#c8a96e'" onblur="this.style.borderColor='#2a2a30'">
</div>

<!-- Đổi mật khẩu (chỉ hiện nếu đăng nhập bằng email) -->
${provider === 'email' ? `
<div style="border-top:1px solid #2a2a30;padding-top:16px;margin-top:4px;margin-bottom:14px">
  <div style="font-size:10px;color:#666;letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px">Đổi mật khẩu</div>
  <input id="profile-pass-new" type="password" placeholder="Mật khẩu mới (để trống nếu không đổi)"
    style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;outline:none;font-family:inherit;margin-bottom:8px;transition:border-color .15s"
    onfocus="this.style.borderColor='#c8a96e'" onblur="this.style.borderColor='#2a2a30'">
  <input id="profile-pass-confirm" type="password" placeholder="Xác nhận mật khẩu mới"
    style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;outline:none;font-family:inherit;transition:border-color .15s"
    onfocus="this.style.borderColor='#c8a96e'" onblur="this.style.borderColor='#2a2a30'">
</div>` : ''}

<div style="display:flex;gap:8px">
  <button id="profile-save"
    style="flex:1;background:#c8a96e;color:#18181c;border:none;border-radius:6px;padding:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">
    Lưu thay đổi
  </button>
  <button id="profile-signout"
    style="background:transparent;color:#888;border:1px solid #2a2a30;border-radius:6px;padding:10px 14px;font-size:12px;cursor:pointer;font-family:inherit">
    Đăng xuất
  </button>
</div>`;

    const showMsg = (msg, isErr = true) => {
      const el = box.querySelector('#profile-msg');
      el.textContent = msg; el.style.display = 'block';
      el.style.background = isErr ? '#2a1515' : '#1a2e1a';
      el.style.border     = isErr ? '1px solid #5a2020' : '1px solid #2a3f2a';
      el.style.color      = isErr ? '#e05555' : '#4caf50';
    };

    box.querySelector('#profile-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    box.querySelector('#profile-save').addEventListener('click', async () => {
      const btn  = box.querySelector('#profile-save');
      const name = box.querySelector('#profile-name').value.trim();
      const p1   = box.querySelector('#profile-pass-new')?.value || '';
      const p2   = box.querySelector('#profile-pass-confirm')?.value || '';

      if (p1 && p1.length < 6) { showMsg('Mật khẩu ít nhất 6 ký tự'); return; }
      if (p1 && p1 !== p2)     { showMsg('Mật khẩu xác nhận không khớp'); return; }

      btn.disabled = true; btn.textContent = 'Đang lưu...';
      try {
        await updateProfile({ displayName: name });
        if (p1) await updatePassword(p1);
        showMsg('✓ Đã lưu thay đổi', false);
        // Cập nhật tên hiển thị trên header nếu có
        const headerName = document.getElementById('user-display-name');
        if (headerName) headerName.textContent = name || email;
        btn.disabled = false; btn.textContent = 'Lưu thay đổi';
      } catch(e) {
        showMsg(e.message); btn.disabled = false; btn.textContent = 'Lưu thay đổi';
      }
    });

    box.querySelector('#profile-signout').addEventListener('click', async () => {
      overlay.remove(); await signOut();
    });

    overlay.appendChild(box); document.body.appendChild(overlay);
  }

  return {
    init, getUser, getUserId, signOut,
    handleExistingSession,
    showAuthUI, showProfileModal,
    sendPasswordReset, updatePassword, updateProfile,
    checkIsAdmin, getProfile,
  };
})();
