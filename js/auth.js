/* ── AUTH.JS ───────────────────────────────────────────────
   Xử lý đăng nhập / đăng xuất / kiểm tra quyền.
   Hỗ trợ role: admin | publisher | user
──────────────────────────────────────────────────────────── */
window.Auth = (() => {
  let _user = null;

  /* ── Lấy user hiện tại ── */
  function getUser()   { return _user; }
  function getUserId() { return _user?.id || null; }

  /* ── Khởi tạo: lấy session hiện có ── */
  async function init() {
    const { data: { session } } = await window._sb.auth.getSession();
    _user = session?.user || null;

    // Lắng nghe thay đổi auth state (đăng nhập mới / đăng xuất)
    window._sb.auth.onAuthStateChange(async (event, session) => {
      const prevId = _user?.id;
      _user = session?.user || null;

      if (event === 'SIGNED_IN' && _user?.id !== prevId) {
        await onSignedIn();
      }
      if (event === 'SIGNED_OUT') {
        window.CURRENT_ROLE    = null;
        window.CURRENT_PROFILE = null;
        document.getElementById('auth-overlay')?.remove();
        UI.showLoading('Đang đăng xuất...');
        setTimeout(() => location.reload(), 500);
      }
    });

    return _user;
  }

  /* ── Gọi khi đã có session (reload trang hoặc vừa đăng nhập) ── */
  async function handleExistingSession() {
    if (!_user) return;
    await onSignedIn();
  }

  /* ── Xử lý sau khi xác nhận có session ── */
  async function onSignedIn() {
    document.getElementById('auth-overlay')?.remove();

    // Nếu đang ở trang user thì bỏ qua (user-app.js tự xử lý)
    const isUserPage = typeof initUser === 'function'
      && window.location.pathname.includes('user');
    if (isUserPage) return;

    if (!window.UI) return;

    // Kiểm tra quyền: admin hoặc publisher mới được vào
    let profile = null;
    try {
      profile = await getProfile();
    } catch(e) {
      console.warn('Profile check skipped (schema chưa chạy?):', e.message);
    }

    const role      = profile?.role      || null;
    const isBlocked = profile?.is_blocked || false;
    const allowed   = ['admin', 'publisher'].includes(role) && !isBlocked;

    if (!allowed) {
      UI.hideLoading();
      if (window.showAccessDenied) showAccessDenied(_user?.email || '');
      return;
    }

    // Lưu role + profile vào window để app.js / admin.js dùng
    window.CURRENT_ROLE    = role;
    window.CURRENT_PROFILE = { ...profile, id: _user.id };

    UI.showLoading('Đang tải dữ liệu...');
    try { await DB.loadMeta(); } catch(e) { console.error('loadMeta:', e); }
    UI.hideLoading();
    UI.renderAll();
  }

  /* ── Đăng xuất ── */
  async function signOut() {
    await window._sb.auth.signOut();
  }

  /* ── Kiểm tra quyền admin (dùng cho fallback nếu cần) ── */
  async function checkIsAdmin() {
    const uid = getUserId(); if (!uid) return false;
    const { data, error } = await window._sb
      .from('profiles')
      .select('role, is_blocked')
      .eq('id', uid)
      .single();
    if (error || !data) return false;
    return data.role === 'admin' && !data.is_blocked;
  }

  /* ── Lấy profile đầy đủ của user hiện tại ── */
  async function getProfile() {
    const uid = getUserId(); if (!uid) return null;
    const { data } = await window._sb
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single();
    return data || null;
  }

  /* ── Hiển thị form đăng nhập ── */
  function showAuthUI() {
    if (document.getElementById('auth-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:#0f0f11;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
<div style="max-width:360px;width:100%;background:#18181c;border:1px solid #2a2a30;border-radius:12px;padding:32px 28px">
  <div style="font-family:monospace;font-size:13px;color:#c8a96e;letter-spacing:2px;margin-bottom:4px;text-align:center">MANGADESK</div>
  <div style="font-size:11px;color:#444;margin-bottom:24px;text-align:center">Đăng nhập để tiếp tục</div>

  <div id="auth-msg" style="display:none;margin-bottom:12px;padding:8px 12px;border-radius:6px;font-size:12px"></div>

  <div style="margin-bottom:12px">
    <label style="font-size:11px;color:#666;display:block;margin-bottom:5px">Email</label>
    <input id="auth-email" type="email" placeholder="your@email.com"
      style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;font-family:inherit;outline:none">
  </div>
  <div style="margin-bottom:20px">
    <label style="font-size:11px;color:#666;display:block;margin-bottom:5px">Mật khẩu</label>
    <input id="auth-pass" type="password" placeholder="••••••••"
      style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;font-family:inherit;outline:none">
  </div>

  <button id="auth-btn" onclick="Auth._doSignIn()"
    style="width:100%;background:#c8a96e;color:#18181c;border:none;border-radius:6px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
    Đăng nhập
  </button>

  <div style="margin-top:14px;text-align:center">
    <span style="font-size:11px;color:#555;cursor:pointer" onclick="Auth._showForgot()">Quên mật khẩu?</span>
  </div>
</div>`;

    // Cho phép nhấn Enter để đăng nhập
    overlay.addEventListener('keydown', e => { if (e.key === 'Enter') Auth._doSignIn(); });
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
  }

  function _showAuthMsg(msg, isError = true) {
    const el = document.getElementById('auth-msg');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.style.background  = isError ? '#2a1515' : '#152a15';
    el.style.color       = isError ? '#e05555' : '#55c055';
    el.style.border      = isError ? '1px solid #5a2020' : '1px solid #205a20';
  }

  async function _doSignIn() {
    const email = document.getElementById('auth-email')?.value?.trim();
    const pass  = document.getElementById('auth-pass')?.value;
    if (!email || !pass) { _showAuthMsg('Vui lòng điền đầy đủ email và mật khẩu.'); return; }

    const btn = document.getElementById('auth-btn');
    if (btn) { btn.textContent = 'Đang đăng nhập...'; btn.disabled = true; }

    const { error } = await window._sb.auth.signInWithPassword({ email, password: pass });

    if (error) {
      _showAuthMsg('Sai email hoặc mật khẩu.');
      if (btn) { btn.textContent = 'Đăng nhập'; btn.disabled = false; }
    }
    // Nếu thành công, onAuthStateChange → SIGNED_IN → onSignedIn() tự chạy
  }

  function _showForgot() {
    const overlay = document.getElementById('auth-overlay');
    if (!overlay) return;
    overlay.querySelector('div').innerHTML = `
      <div style="font-family:monospace;font-size:13px;color:#c8a96e;letter-spacing:2px;margin-bottom:4px;text-align:center">MANGADESK</div>
      <div style="font-size:11px;color:#444;margin-bottom:24px;text-align:center">Đặt lại mật khẩu</div>
      <div id="auth-msg" style="display:none;margin-bottom:12px;padding:8px 12px;border-radius:6px;font-size:12px"></div>
      <div style="margin-bottom:16px">
        <label style="font-size:11px;color:#666;display:block;margin-bottom:5px">Email</label>
        <input id="auth-email" type="email" placeholder="your@email.com"
          style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;font-family:inherit;outline:none">
      </div>
      <button onclick="Auth._doForgot()"
        style="width:100%;background:#c8a96e;color:#18181c;border:none;border-radius:6px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
        Gửi link đặt lại
      </button>
      <div style="margin-top:14px;text-align:center">
        <span style="font-size:11px;color:#555;cursor:pointer" onclick="Auth.showAuthUI();document.getElementById('auth-overlay').remove()">← Quay lại đăng nhập</span>
      </div>`;
    setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
  }

  async function _doForgot() {
    const email = document.getElementById('auth-email')?.value?.trim();
    if (!email) { _showAuthMsg('Vui lòng nhập email.'); return; }
    const { error } = await window._sb.auth.resetPasswordForEmail(email);
    if (error) _showAuthMsg('Lỗi: ' + error.message);
    else _showAuthMsg('Đã gửi link đặt lại mật khẩu. Kiểm tra email.', false);
  }

  async function sendPasswordReset(email) {
    return window._sb.auth.resetPasswordForEmail(email);
  }

  async function updatePassword(newPass) {
    return window._sb.auth.updateUser({ password: newPass });
  }

  /* ── Modal hồ sơ cá nhân ── */
  function showProfileModal() {
    const user    = _user; if (!user) return;
    const meta    = user.user_metadata || {};
    const name    = meta.full_name || meta.name || '';
    const existing = document.getElementById('profile-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'profile-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
<div style="max-width:360px;width:100%;background:#18181c;border:1px solid #2a2a30;border-radius:12px;padding:28px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <span style="font-size:13px;font-weight:600">Hồ sơ tài khoản</span>
    <span style="cursor:pointer;color:#555;font-size:18px;line-height:1" onclick="document.getElementById('profile-modal').remove()">✕</span>
  </div>
  <div id="prof-msg" style="display:none;margin-bottom:12px;padding:8px 12px;border-radius:6px;font-size:12px"></div>
  <div style="margin-bottom:12px">
    <label style="font-size:11px;color:#666;display:block;margin-bottom:5px">Email</label>
    <div style="padding:9px 12px;background:#111;border:1px solid #2a2a30;border-radius:6px;font-size:12px;color:#555">${user.email}</div>
  </div>
  <div style="margin-bottom:12px">
    <label style="font-size:11px;color:#666;display:block;margin-bottom:5px">Tên hiển thị</label>
    <input id="prof-name" type="text" value="${name}"
      style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;font-family:inherit;outline:none">
  </div>
  <div style="margin-bottom:20px">
    <label style="font-size:11px;color:#666;display:block;margin-bottom:5px">Đổi mật khẩu mới (bỏ trống nếu không đổi)</label>
    <input id="prof-pass" type="password" placeholder="Mật khẩu mới..."
      style="width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px;color:#e8e6e0;font-size:13px;font-family:inherit;outline:none">
  </div>
  <div style="display:flex;gap:8px">
    <button onclick="Auth._saveProfile()"
      style="flex:1;background:#c8a96e;color:#18181c;border:none;border-radius:6px;padding:9px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">
      Lưu
    </button>
    <button onclick="document.getElementById('profile-modal').remove()"
      style="padding:9px 16px;background:transparent;color:#666;border:1px solid #2a2a30;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit">
      Huỷ
    </button>
  </div>
</div>`;
    document.body.appendChild(overlay);
  }

  async function updateProfile(displayName) {
    return window._sb.auth.updateUser({ data: { full_name: displayName } });
  }

  async function _saveProfile() {
    const name = document.getElementById('prof-name')?.value?.trim();
    const pass = document.getElementById('prof-pass')?.value;
    const msg  = (txt, err=true) => {
      const el = document.getElementById('prof-msg');
      if (!el) return;
      el.textContent = txt; el.style.display = 'block';
      el.style.background = err ? '#2a1515' : '#152a15';
      el.style.color      = err ? '#e05555' : '#55c055';
      el.style.border     = err ? '1px solid #5a2020' : '1px solid #205a20';
    };
    try {
      if (name) await updateProfile(name);
      if (pass) {
        if (pass.length < 6) { msg('Mật khẩu phải ít nhất 6 ký tự.'); return; }
        const { error } = await updatePassword(pass);
        if (error) { msg('Lỗi đổi mật khẩu: ' + error.message); return; }
      }
      msg('Đã lưu thành công!', false);
      setTimeout(() => document.getElementById('profile-modal')?.remove(), 1500);
    } catch(e) {
      msg('Lỗi: ' + e.message);
    }
  }

  return {
    init,
    getUser,
    getUserId,
    signOut,
    handleExistingSession,
    showAuthUI,
    showProfileModal,
    sendPasswordReset,
    updatePassword,
    updateProfile,
    checkIsAdmin,
    getProfile,
    // internal (dùng inline onclick)
    _doSignIn,
    _doForgot,
    _showForgot,
    _saveProfile,
  };
})();
