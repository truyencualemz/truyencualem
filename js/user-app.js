/* ── USER-APP.JS ──────────────────────────────────────────
   Trang đọc truyện cho user.
   - Khám phá: browse thư viện public
   - Tiếp tục đọc: lịch sử, nhấn 1 click vào đúng chương
   - Bookmark: danh sách đã đánh dấu
   - Reader: ảnh (single/split) + truyện chữ, tự lưu lịch sử
──────────────────────────────────────────────────────────── */

/* ── UI helpers (tối giản) ── */
const U = {
  el: (t,c) => { const e=document.createElement(t); if(c)e.className=c; return e; },
  div: (c) => U.el('div',c),
  btn: (c,t,fn) => { const b=U.el('button','btn '+c); b.textContent=t; b.addEventListener('click',fn); return b; },
  esc: (s) => { const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; },
};

function showLoading(msg='Đang tải...') { document.getElementById('loading-msg').textContent=msg; document.getElementById('loading').style.display='flex'; }
function hideLoading() { document.getElementById('loading').style.display='none'; }
function fmtDate(iso) {
  const d=new Date(iso), now=new Date();
  const diff=Math.floor((now-d)/60000);
  if(diff<60) return diff<=1?'Vừa xong':diff+'p trước';
  if(diff<1440) return Math.floor(diff/60)+'g trước';
  return Math.floor(diff/1440)+'d trước';
}

/* ── Tab routing ── */
let activeTab = 'home';
let allComics = [];
let searchQ   = '';
let activeGenre = 'all';
let _libraryPager = null; // infinite scroll instance for home tab

/* ── Reader state ── */
let rComic=null, rChapIdx=0, rMode='single', rLang='vi', rZoom=100;
let rTextData=null, rTextSelLangs=[], rTextTooltipLangs=[];

const GENRES = [
  ['all','Tất cả'],['action','Hành động'],['romance','Tình cảm'],
  ['comedy','Hài hước'],['mystery','Trinh thám'],['fantasy','Kỳ ảo'],
];

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
async function initUser() {
  // Áp dụng theme ngay (Theme đã load từ theme.js)
  // Wire up theme button — không dùng inline onclick vì scripts load sau DOM
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    Theme.cycle();
    Theme.updateButtons();
  });
  Theme.updateButtons(); // sync label ngay khi load
  showLoading('Đang khởi động...');

  if (!window.SUPABASE_URL || window.SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
    hideLoading();
    document.getElementById('content').innerHTML = '<div style="padding:40px;text-align:center;color:#e05555">⚠ Chưa cấu hình Supabase. Xem file js/config.js</div>';
    return;
  }
  window._sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON);

  const user = await Auth.init();
  if (!user) { hideLoading(); Auth.showAuthUI(); return; }

  // Có session → khởi tạo UI ngay (reload trang không fire SIGNED_IN)
  await loadUserUI(user);
}

async function loadUserUI(user) {
  const meta        = user.user_metadata || {};
  const displayName = meta.full_name || meta.name || user.email || '';
  const avatarUrl   = meta.avatar_url || meta.picture || '';

  const nameEl = document.getElementById('user-display-name');
  if (nameEl) nameEl.textContent = displayName;
  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) {
    if (avatarUrl) avatarEl.innerHTML = `<img src="${U.esc(avatarUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    else avatarEl.textContent = displayName.charAt(0).toUpperCase() || '?';
  }

  // Profile button → mở tab Tài khoản
  document.getElementById('profile-btn')?.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tab="account"]')?.classList.add('active');
    activeTab = 'account'; renderTab('account');
  });

  // Tab click
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      renderTab(activeTab);
    });
  });

  // Load GD Script URL for PDF rendering
  window.GD_SCRIPT_URL = localStorage.getItem('gd_script_url') || '';

  // Load public comics — có thể lỗi nếu RLS chưa cấu hình
  try {
    allComics = await UserDB.loadPublicComics();
  } catch(e) {
    hideLoading();
    const c = document.getElementById('content');
    if (e.message === 'RLS_NOT_CONFIGURED') {
      c.innerHTML = `<div style="padding:40px;max-width:500px;margin:0 auto">
<div style="color:#e0a030;font-size:14px;font-weight:500;margin-bottom:12px">⚠ Chưa cấu hình quyền truy cập</div>
<div style="font-size:12px;color:var(--text-muted);line-height:1.9">
  Cần chạy file <code style="background:var(--bg-tertiary);padding:1px 6px;border-radius:3px;color:#9ae">data/supabase-user-schema.sql</code>
  trong Supabase SQL Editor để cho phép user đọc truyện.<br><br>
  <b style="color:var(--text-secondary)">Cách thực hiện:</b><br>
  1. Vào Supabase Dashboard → Database → SQL Editor<br>
  2. Tạo New query<br>
  3. Paste toàn bộ nội dung file <code style="background:var(--bg-tertiary);padding:1px 6px;border-radius:3px;color:#9ae">supabase-user-schema.sql</code><br>
  4. Nhấn Run<br>
  5. Reload trang này
</div></div>`;
    } else {
      c.innerHTML = `<div style="padding:40px;text-align:center;color:#e05555;font-size:13px">
Lỗi tải truyện: ${U.esc(e.message)}<br>
<button onclick="location.reload()" style="margin-top:14px;padding:8px 18px;background:var(--accent);color:var(--bg-primary);border:none;border-radius:6px;cursor:pointer;font-size:12px">Thử lại</button></div>`;
    }
    // Vẫn render tab khác được (continue, bookmarks, account)
    document.querySelectorAll('.tab-btn').forEach(b => {
      if (b.dataset.tab !== 'home') b.style.display = '';
    });
    return;
  }

  hideLoading();
  // Hiển thị thông báo hệ thống (nếu có)
  try { await Announce.renderBanners(document.getElementById('app')); } catch(e) { /* ignore */ }
  renderTab('home');
}

/* ══════════════════════════════════════════════════════════
   TAB RENDER
══════════════════════════════════════════════════════════ */
async function renderTab(tab) {
  const c = document.getElementById('content'); c.innerHTML = '';
  if (tab === 'home')           renderHome(c);
  else if (tab === 'continue')  await renderContinue(c);
  else if (tab === 'bookmarks') await renderBookmarks(c);
  else if (tab === 'account')   renderAccount(c);
  else if (tab === 'follows')   window.Follow?.renderFollowTab(c, allComics, openChapModal);
}

/* ── Home: browse library ── */
function renderHome(container) {
  // Search
  const sb = U.div('search-bar');
  const si = U.el('span','search-icon'); si.textContent='🔍';
  const inp = U.el('input'); inp.placeholder='Tìm tên truyện...'; inp.value=searchQ;
  inp.style.cssText='width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:9px 12px 9px 34px;color:var(--text-primary);font-size:13px;outline:none;font-family:inherit';
  inp.addEventListener('input', () => { searchQ=inp.value; refreshGrid(container); });
  inp.addEventListener('focus', () => inp.style.borderColor='var(--accent)');
  inp.addEventListener('blur',  () => inp.style.borderColor='var(--border)');
  sb.appendChild(si); sb.appendChild(inp); container.appendChild(sb);

  // Genre pills
  const gp = U.div('genre-pills');
  GENRES.forEach(([v,l]) => {
    const p = U.el('button','genre-pill'+(activeGenre===v?' active':'')); p.textContent=l;
    p.addEventListener('click', () => { activeGenre=v; refreshGrid(container); });
    gp.appendChild(p);
  });
  container.appendChild(gp);

  const gridWrap = U.div(); gridWrap.id='comic-grid-wrap'; container.appendChild(gridWrap);
  buildGrid(gridWrap);
}

function refreshGrid(container) {
  const old = document.getElementById('comic-grid-wrap'); if(!old)return;
  const nw  = U.div(); nw.id='comic-grid-wrap'; buildGrid(nw); old.replaceWith(nw);
  // Update genre pills
  container.querySelectorAll('.genre-pill').forEach(p => {
    const v = GENRES.find(g=>g[1]===p.textContent)?.[0];
    p.classList.toggle('active', v===activeGenre);
  });
}

function buildGrid(container) {
  let list = allComics.slice();
  const q = searchQ.toLowerCase().trim();
  if (q) list = list.filter(m => m.titleVI?.toLowerCase().includes(q)||m.titleEN?.toLowerCase().includes(q));
  if (activeGenre !== 'all') list = list.filter(m => m.genre === activeGenre);

  const info = U.div(); info.style.cssText='font-size:11px;color:var(--text-muted);margin-bottom:10px';
  info.textContent = (q||activeGenre!=='all') ? `${list.length} / ${allComics.length} truyện` : `${allComics.length} truyện`;
  container.appendChild(info);

  const grid = U.div('comic-grid'); container.appendChild(grid);
  if (!list.length) {
    const em = U.div('empty-state');
    em.innerHTML = q ? `Không tìm thấy "<b>${U.esc(q)}</b>"` : 'Không có truyện nào.';
    grid.appendChild(em); return;
  }

  if (window.InfiniteScroll) {
    _libraryPager = InfiniteScroll.create({
      container: grid,
      pageSize: 20,
      load: async (pg) => list.slice(pg * 20, (pg+1) * 20),
      render: buildComicCard,
      empty: q ? `Không tìm thấy "<b>${U.esc(q)}</b>"` : 'Không có truyện nào.',
    });
  } else {
    list.forEach(m => { const el=buildComicCard(m); if(el)grid.appendChild(el); });
  }
}

function buildComicCard(m) {
  const card = U.div('comic-card');
  const genreLabel = GENRES.find(g=>g[0]===m.genre)?.[1]||'';
  const q = searchQ.toLowerCase().trim();
  const titleVI = q
    ? U.esc(m.titleVI).replace(new RegExp(`(${U.esc(q).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'), '<mark style="background:var(--accent-dim);color:var(--accent);border-radius:2px">$1</mark>')
    : U.esc(m.titleVI);
  card.innerHTML = `<div class="comic-thumb">${m.cover
    ? `<img src="${U.esc(m.cover)}" loading="lazy">`
    : '<span class="comic-thumb-icon">📚</span>'}</div>
<div class="comic-info">
  <div class="comic-title">${titleVI}</div>
  <div class="comic-meta">
    ${genreLabel ? `<span class="badge badge-genre">${U.esc(genreLabel)}</span>` : ''}
    <span>${m.chapters?.length||0} ch</span>
  </div>
</div>`;
  card.addEventListener('click', () => openChapModal(m));
  return card;
}


/* ── Chapter list modal ── */
async function openChapModal(comic) {
  const modal   = document.getElementById('chap-modal');
  const box     = document.getElementById('chap-modal-box');
  const history = await UserDB.getHistory(comic.id);
  box.innerHTML = '';

  // Header
  const hdr = U.div('chap-modal-hdr');
  const title = U.div('chap-modal-title'); title.textContent=comic.titleVI;
  const closeBtn = U.btn('btn-ghost btn-xs','✕',()=>{ modal.style.display='none'; });
  hdr.appendChild(title); hdr.appendChild(closeBtn); box.appendChild(hdr);

  // Follow button in modal
  const followRow = U.div(); followRow.style.cssText='padding:8px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px';
  if (window.Follow) {
    await Follow.loadCache();
    followRow.appendChild(Follow.buildFollowBtn(comic.id, { onToggle: Follow.updateBadge }));
  }
  box.appendChild(followRow);

  // Continue reading shortcut
  if (history) {
    const cont = U.div(); cont.style.cssText='padding:10px 12px;border-bottom:1px solid var(--border);background:var(--color-info-bg)';
    const idx = comic.chapters.findIndex(c=>c.id===history.chap_id);
    cont.innerHTML = `<div style="font-size:10px;color:var(--text-muted);margin-bottom:5px">Đang đọc</div>
<div style="font-size:13px;color:var(--accent);font-weight:500">Ch.${history.chap_num}: ${U.esc(history.chap_title||'')}</div>`;
    const goBtn = U.btn('btn-primary btn-sm','▶ Tiếp tục',()=>{
      modal.style.display='none';
      openReader(comic, idx>=0?idx:0);
    });
    goBtn.style.marginTop='8px';
    cont.appendChild(goBtn); box.appendChild(cont);
  }

  // Chapter list
  const list = U.div('chap-modal-list');
  (comic.chapters||[]).forEach((ch,idx) => {
    const isLast = history?.chap_id===ch.id;
    const item = U.div('chap-item'+(isLast?' last-read':''));
    item.innerHTML = `<span class="chap-num">Ch.${ch.num}</span>
<span class="chap-title">${U.esc(ch.title||'Chương '+ch.num)}</span>
<span class="chap-type">${ch.type==='text'?'Chữ':'Ảnh'}</span>`;
    if (isLast) item.innerHTML += `<span style="font-size:9px;color:var(--accent);margin-left:6px">← đang đọc</span>`;
    item.addEventListener('click', () => { modal.style.display='none'; openReader(comic, idx); });
    list.appendChild(item);
  });
  box.appendChild(list);
  modal.style.display = 'flex';
  modal.addEventListener('click', e => { if(e.target===modal) modal.style.display='none'; }, {once:true});
}

/* ── Continue reading ── */
async function renderContinue(container) {
  showLoading('Đang tải lịch sử...');
  const history = await UserDB.loadHistory();
  hideLoading();

  const st = U.div('section-title'); st.innerHTML='▶ Tiếp tục đọc <span>chương đọc gần nhất</span>';
  container.appendChild(st);

  if (!history.length) {
    const em=U.div('empty-state'); em.innerHTML='Chưa có lịch sử đọc.<br>Bắt đầu đọc truyện từ tab <b>Khám phá</b>.';
    container.appendChild(em); return;
  }

  const list = U.div('continue-list');
  history.forEach(h => {
    const comic = allComics.find(m=>m.id===h.comic_id) || h.comics;
    if (!comic) return;
    const title = comic.titleVI || comic.title_vi || '';
    const cover = comic.cover;
    const chapIdx = (allComics.find(m=>m.id===h.comic_id)?.chapters||[]).findIndex(c=>c.id===h.chap_id);

    const card = U.div('continue-card');
    const thumb = cover
      ? Object.assign(U.el('img','continue-thumb'),{src:cover,loading:'lazy'})
      : Object.assign(U.div('continue-thumb-icon'),{textContent:'📚'});
    const info = U.div('continue-info');
    info.innerHTML = `<div class="continue-title">${U.esc(title)}</div>
<div class="continue-chap">Ch.${h.chap_num}: ${U.esc(h.chap_title||'')}</div>
<div class="continue-time">${fmtDate(h.updated_at)}</div>`;
    const acts = U.div('continue-actions');
    const goBtn = U.btn('btn-primary btn-sm','▶ Đọc tiếp', e => {
      e.stopPropagation();
      openReader(allComics.find(m=>m.id===h.comic_id)||{...comic,id:h.comic_id,chapters:[]}, chapIdx>=0?chapIdx:0);
    });
    const delBtn = U.btn('btn-ghost btn-xs','✕',async(e)=>{
      e.stopPropagation(); await UserDB.deleteHistory(h.comic_id); renderTab('continue');
    });
    acts.appendChild(goBtn); acts.appendChild(delBtn);
    card.appendChild(thumb); card.appendChild(info); card.appendChild(acts);
    // Chỉ 1 click handler trên card — không thêm handler riêng trên button để tránh double fire
    card.addEventListener('click', ()=>{
      openReader(allComics.find(m=>m.id===h.comic_id)||{...comic,id:h.comic_id,chapters:[]}, chapIdx>=0?chapIdx:0);
    });
    list.appendChild(card);
  });
  container.appendChild(list);
}

/* ── Bookmarks ── */
async function renderBookmarks(container) {
  showLoading('Đang tải bookmark...');
  const bks = await UserDB.loadBookmarks();
  hideLoading();

  const st = U.div('section-title'); st.innerHTML='🔖 Bookmark <span>chương đã đánh dấu</span>';
  container.appendChild(st);

  if (!bks.length) {
    const em=U.div('empty-state'); em.innerHTML='Chưa có bookmark nào.<br>Nhấn 🔖 khi đang đọc để thêm.';
    container.appendChild(em); return;
  }

  const list = U.div('bookmark-list');
  bks.forEach(bk => {
    const comic = allComics.find(m=>m.id===bk.comic_id) || bk.comics;
    const title = comic?.titleVI || comic?.title_vi || bk.comic_id;
    const chapIdx = (allComics.find(m=>m.id===bk.comic_id)?.chapters||[]).findIndex(c=>c.id===bk.chap_id);

    const card = U.div('bookmark-card');
    const info = U.div('bk-info');
    info.innerHTML = `<div class="bk-comic">${U.esc(title)}</div>
<div class="bk-chap">Ch.${bk.chap_num}: ${U.esc(bk.chap_title||'')}</div>
${bk.note?`<div class="bk-note">${U.esc(bk.note)}</div>`:''}`;
    const acts = U.div('bk-actions');
    const goBtn = U.btn('btn-primary btn-xs','▶ Đọc', e => {
      e.stopPropagation();
      openReader(allComics.find(m=>m.id===bk.comic_id)||{id:bk.comic_id,chapters:[]}, chapIdx>=0?chapIdx:0);
    });
    const delBtn = U.btn('btn-danger btn-xs','🗑',async()=>{
      await UserDB.removeBookmark(bk.comic_id, bk.chap_id);
      renderTab('bookmarks');
    });
    acts.appendChild(goBtn); acts.appendChild(delBtn);
    card.appendChild(info); card.appendChild(acts);
    list.appendChild(card);
  });
  container.appendChild(list);
}

/* ── Account settings ── */
function renderAccount(container) {
  const user = Auth.getUser();
  const meta = user?.user_metadata || {};
  const email = user?.email || '';
  const displayName = meta.full_name || meta.name || '';
  const avatarUrl   = meta.avatar_url || meta.picture || '';
  const provider    = user?.app_metadata?.provider || 'email';

  const wrap = U.div(); wrap.style.maxWidth = '480px';

  // Avatar + info card
  const infoCard = U.div(); infoCard.style.cssText = 'background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:14px;display:flex;align-items:center;gap:16px';
  const avi = U.div(); avi.style.cssText = 'width:56px;height:56px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;overflow:hidden';
  if (avatarUrl) {
    avi.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover">`;
  } else {
    avi.textContent = (displayName || email).charAt(0).toUpperCase() || '?';
  }
  const infoRight = U.div(); infoRight.style.minWidth = '0';
  infoRight.innerHTML = `<div style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${U.esc(displayName||'Chưa đặt tên')}</div>
<div style="font-size:11px;color:var(--text-muted);margin-top:3px">${U.esc(email)}</div>
<div style="font-size:10px;color:var(--text-muted);margin-top:3px">Đăng nhập qua: <b style="color:var(--text-muted)">${provider}</b></div>`;
  infoCard.appendChild(avi); infoCard.appendChild(infoRight);
  wrap.appendChild(infoCard);

  // Message area
  const msgEl = U.div(); msgEl.id='acc-msg'; msgEl.style.display='none'; msgEl.style.cssText='border-radius:6px;padding:9px 12px;font-size:12px;margin-bottom:12px';
  const showMsg = (msg, ok=false) => { msgEl.textContent=msg; msgEl.style.display='block'; msgEl.style.background=ok?'#1a2e1a':'#2a1515'; msgEl.style.border=ok?'1px solid #2a3f2a':'1px solid #5a2020'; msgEl.style.color=ok?'#4caf50':'#e05555'; };
  wrap.appendChild(msgEl);

  // Edit profile card
  const editCard = U.div(); editCard.style.cssText = 'background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:14px';
  editCard.innerHTML = '<div style="font-size:12px;font-weight:500;margin-bottom:14px;color:var(--accent)">Thông tin cá nhân</div>';

  const nameLbl = U.el('label'); nameLbl.style.cssText='font-size:10px;color:var(--text-muted);letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px'; nameLbl.textContent='Tên hiển thị';
  const nameInp = U.el('input','fi'); nameInp.value=displayName; nameInp.placeholder='Tên của bạn';
  nameInp.addEventListener('focus',()=>nameInp.style.borderColor='var(--accent)');
  nameInp.addEventListener('blur', ()=>nameInp.style.borderColor='var(--border)');
  editCard.appendChild(nameLbl); editCard.appendChild(nameInp);
  editCard.style.paddingBottom='20px';

  const saveInfoBtn = U.btn('btn-primary btn-sm','Lưu thông tin', async()=>{
    saveInfoBtn.disabled=true; saveInfoBtn.textContent='Đang lưu...';
    try {
      await Auth.updateProfile({ displayName: nameInp.value.trim() });
      // Update header
      const nm=nameInp.value.trim();
      const nameEl=document.getElementById('user-display-name'); if(nameEl)nameEl.textContent=nm;
      const avEl=document.getElementById('user-avatar'); if(avEl&&!avatarUrl)avEl.textContent=nm.charAt(0).toUpperCase()||'?';
      showMsg('✓ Đã lưu thông tin', true);
    } catch(e){ showMsg(e.message); }
    saveInfoBtn.disabled=false; saveInfoBtn.textContent='Lưu thông tin';
  });
  saveInfoBtn.style.marginTop='12px';
  editCard.appendChild(saveInfoBtn);
  wrap.appendChild(editCard);

  // Change password (email provider only)
  if (provider === 'email') {
    const passCard = U.div(); passCard.style.cssText='background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:14px';
    passCard.innerHTML='<div style="font-size:12px;font-weight:500;margin-bottom:14px;color:var(--accent)">Đổi mật khẩu</div>';
    const fields = [['pass-new','Mật khẩu mới','Ít nhất 6 ký tự','password'],['pass-cfm','Xác nhận mật khẩu mới','Nhập lại mật khẩu mới','password']];
    const inputs = {};
    fields.forEach(([id,lbl,ph,type])=>{
      const l=U.el('label'); l.style.cssText='font-size:10px;color:var(--text-muted);letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px;margin-top:10px'; l.textContent=lbl;
      const inp=U.el('input','fi'); inp.id=id; inp.type=type; inp.placeholder=ph;
      inp.addEventListener('focus',()=>inp.style.borderColor='var(--accent)');
      inp.addEventListener('blur', ()=>inp.style.borderColor='var(--border)');
      inputs[id]=inp; passCard.appendChild(l); passCard.appendChild(inp);
    });
    const changePassBtn=U.btn('btn-primary btn-sm','Đổi mật khẩu',async()=>{
      const p1=inputs['pass-new'].value, p2=inputs['pass-cfm'].value;
      if(p1.length<6){showMsg('Mật khẩu ít nhất 6 ký tự');return;}
      if(p1!==p2){showMsg('Mật khẩu xác nhận không khớp');return;}
      changePassBtn.disabled=true; changePassBtn.textContent='Đang lưu...';
      try{ await Auth.updatePassword(p1); showMsg('✓ Đã đổi mật khẩu thành công',true); inputs['pass-new'].value=''; inputs['pass-cfm'].value=''; }
      catch(e){ showMsg(e.message); }
      changePassBtn.disabled=false; changePassBtn.textContent='Đổi mật khẩu';
    });
    changePassBtn.style.marginTop='12px';
    passCard.appendChild(changePassBtn);
    wrap.appendChild(passCard);
  }

  // Donate section (chỉ cho publisher/admin)
  if (window.Donate && (window.CURRENT_ROLE === 'admin' || window.CURRENT_ROLE === 'publisher')) {
    const donateWrap = U.div();
    wrap.appendChild(donateWrap);
    Auth.getProfile?.().then(profile => {
      donateWrap.appendChild(Donate.buildAdminDonateSection(profile));
    });
  }

  // Danger zone
  const dangerCard = U.div(); dangerCard.style.cssText='background:var(--bg-primary);border:1px solid #3a2020;border-radius:10px;padding:20px';
  dangerCard.innerHTML='<div style="font-size:12px;font-weight:500;margin-bottom:12px;color:#e05555">Đăng xuất</div>';
  const soBtn=U.btn('btn-danger btn-sm','Đăng xuất khỏi tài khoản',async()=>{
    if(confirm('Đăng xuất?')) await Auth.signOut();
  });
  dangerCard.appendChild(soBtn);
  wrap.appendChild(dangerCard);
  container.appendChild(wrap);
}

/* ══════════════════════════════════════════════════════════
   READER — dùng lại logic từ admin reader.js / text-reader
   nhưng tích hợp saveHistory + bookmark
══════════════════════════════════════════════════════════ */
let _readerOpening = false;
async function openReader(comic, chapIdx) {
  if (_readerOpening) return;
  _readerOpening = true;
  try {
    // Luôn load mode/lang từ localStorage — đảm bảo đúng preference dù đóng/mở lại
    rComic   = comic;
    rChapIdx = chapIdx;
    rMode    = localStorage.getItem('md_rmode') || 'single';
    rLang    = localStorage.getItem('md_rlang') || 'vi';
    // Chỉ reset zoom khi mở truyện mới hoàn toàn (không reset khi chuyển chương cùng truyện)
    if (!rZoom || rZoom < 30) rZoom = 100;

  const chap = comic.chapters?.[chapIdx];
  if (!chap) return;

  if (chap.type === 'text') {
    showLoading('Đang tải chương chữ...');
    rTextData = await UserDB.loadPublicTextChap(chap.id);
    rTextSelLangs = (rTextData?.languages||[]).slice(0,2);
    rTextTooltipLangs = rTextData?.languages?.slice()||[];
    hideLoading();
    if (!rTextData) { alert('Không tìm thấy nội dung chương'); return; }
  }

  await UserDB.saveHistory(comic.id, chap);

  const rd = document.getElementById('reader');
  rd.innerHTML = ''; rd.style.display = 'flex'; rd.style.flexDirection = 'column';
  renderReader();
  if (chap.type !== 'text') PDFModule.prefetch(comic.id, chapIdx);
  } finally {
    // Unlock sau một tick để tránh click nhanh liên tiếp
    setTimeout(() => { _readerOpening = false; }, 300);
  }
}

async function renderReader() {
  const rd = document.getElementById('reader');
  // Không clear ở đây — openReader đã clear rồi, chỉ clear khi switch mode/lang
  rd.innerHTML = '';
  const chap = rComic.chapters?.[rChapIdx]; if(!chap){closeReader();return;}
  const isText = chap.type==='text';

  /* Top bar */
  const bar = U.div('rbar');
  const closeBtn = U.btn('btn-ghost btn-sm','← Đóng', () => {
    ReaderEnhance.destroy(); closeReader();
  });

  const rt = U.div('rtitle'); rt.textContent=`${rComic.titleVI} · Ch.${chap.num}: ${chap.title||''}`;
  bar.appendChild(closeBtn); bar.appendChild(rt);

  /* Fullscreen button */
  if (window.ReaderEnhance) bar.appendChild(ReaderEnhance.buildFsBtn());

  /* Donate button */
  if (window.Donate && !isText) bar.appendChild(Donate.buildDonateBtn(rComic.id));

  /* Bookmark button */
  const bkBtn = U.el('button','bk-btn'); bkBtn.textContent='🔖';
  bkBtn.title='Bookmark chương này';
  let isBk = await UserDB.isBookmarked(rComic.id, chap.id);
  if (isBk) bkBtn.classList.add('active');
  bkBtn.addEventListener('click', async () => {
    if (isBk) {
      await UserDB.removeBookmark(rComic.id, chap.id);
      isBk=false; bkBtn.classList.remove('active'); bkBtn.title='Bookmark chương này';
    } else {
      await UserDB.addBookmark(rComic.id, chap);
      isBk=true; bkBtn.classList.add('active'); bkBtn.title='Đã bookmark — click để xóa';
    }
  });
  bar.appendChild(bkBtn);

  if (!isText) {
    const mt = U.div('mtog');
    [['single','Đơn'],['split','Song song']].forEach(([m,l])=>{
      const b=U.el('button','mbtn'+(rMode===m?' active':'')); b.textContent=l;
      b.addEventListener('click',()=>{
        rMode=m;
        localStorage.setItem('md_rmode', m);
        renderReader();
      }); mt.appendChild(b);
    }); bar.appendChild(mt);
    if(rMode==='single'){
      const lt=U.div('ltog');
      [['vi','🇻🇳 VI'],['en','🇬🇧 EN']].forEach(([l,lbl])=>{
        const b=U.el('button','lbtn'+(rLang===l?' active':'')); b.textContent=lbl;
        b.addEventListener('click',()=>{
          rLang=l;
          localStorage.setItem('md_rlang', l);
          renderReader();
        }); lt.appendChild(b);
      }); bar.appendChild(lt);
    }
    const zw=U.div('zoom-wrap'), zlbl=U.div('zoom-label'); zlbl.textContent='Size:';
    const sld=U.el('input'); sld.type='range';sld.className='zoom-slider';sld.min=30;sld.max=200;sld.step=5;sld.value=rZoom;
    sld.style.setProperty('--p',((rZoom-30)/170*100)+'%');
    const zv=U.div('zoom-val'); zv.textContent=rZoom+'%';
    sld.addEventListener('input',()=>{const v=+sld.value;sld.style.setProperty('--p',((v-30)/170*100)+'%');zv.textContent=v+'%';applyZoom(v);});
    [zlbl,sld,zv].forEach(e=>zw.appendChild(e)); bar.appendChild(zw);
  } else {
    const zw=U.div('zoom-wrap'), zlbl=U.div('zoom-label'); zlbl.textContent='Chữ:';
    const sld=U.el('input'); sld.type='range';sld.className='zoom-slider';sld.min=12;sld.max=22;sld.step=1;sld.value=15;
    sld.style.setProperty('--p','20%');
    const zv=U.div('zoom-val'); zv.textContent='15px';
    sld.addEventListener('input',()=>{const v=+sld.value;sld.style.setProperty('--p',((v-12)/10*100)+'%');zv.textContent=v+'px';document.querySelectorAll('#reader .tseg-content').forEach(e=>e.style.fontSize=v+'px');});
    [zlbl,sld,zv].forEach(e=>zw.appendChild(e)); bar.appendChild(zw);
  }
  rd.appendChild(bar);

  /* Nav */
  const chaps=rComic.chapters||[];
  const nav=U.div('rnav');
  const pb=U.btn('btn-ghost btn-sm','← Trước',async()=>{
    if(rChapIdx>0){ rChapIdx--; await openReader(rComic, rChapIdx); }
  });
  pb.disabled=rChapIdx===0;
  const ni=U.div('rni'); ni.textContent=`Ch ${rChapIdx+1} / ${chaps.length}`;
  const nb=U.btn('btn-ghost btn-sm','Sau →',async()=>{
    if(rChapIdx<chaps.length-1){ rChapIdx++; await openReader(rComic, rChapIdx); }
  });
  nb.disabled=rChapIdx>=chaps.length-1;
  [pb,ni,nb].forEach(x=>nav.appendChild(x));
  rd.appendChild(nav);

  /* Body */
  const body = U.div(); body.style.cssText='display:flex;flex:1;overflow:hidden;flex-direction:column';
  let mainScroll = null;
  if (isText) {
    body.appendChild(buildTextLangBar());
    body.appendChild(buildTextCols());
  } else if (rMode==='single') {
    mainScroll = U.div('rscroll'); body.appendChild(mainScroll);
    loadSingleImages(mainScroll, chap, rLang);
  } else {
    const grid = U.div();
    grid.style.cssText = 'flex:1;overflow-y:auto;background:var(--reader-bg)';
    body.appendChild(grid);
    mainScroll = grid;  // gán để ReaderEnhance có thể save/restore scroll
    renderSplitGrid(grid, chap);
  }
  rd.appendChild(body);

  /* Comment panel — cuộn cùng với body, sau khi body render xong */
  if (window.Comments && chap && !isText) {
    const commentWrap = U.div();
    commentWrap.style.cssText = 'flex-shrink:0;border-top:1px solid var(--border);max-height:45vh;overflow-y:auto;background:var(--bg-app)';
    const toggleBtn = U.el('button','btn btn-ghost btn-xs');
    toggleBtn.style.cssText='margin:8px 16px;font-size:11px';
    toggleBtn.textContent='💬 Bình luận';
    let opened=false;
    const panelEl=U.div();
    toggleBtn.addEventListener('click',async()=>{
      opened=!opened;
      if(opened){
        toggleBtn.textContent='💬 Ẩn bình luận';
        await Comments.renderPanel(chap.id, rComic.id, panelEl);
      } else {
        toggleBtn.textContent='💬 Bình luận';
        panelEl.innerHTML='';
      }
    });
    commentWrap.appendChild(toggleBtn);
    commentWrap.appendChild(panelEl);
    rd.appendChild(commentWrap);
  }

  /* ReaderEnhance: init keyboard + scroll save */
  if (window.ReaderEnhance) {
    ReaderEnhance.init(rComic.id, chap.id);
    ReaderEnhance.setupKeyboard({
      prev: async () => { if(rChapIdx > 0) { await openReader(rComic, rChapIdx - 1); } },
      next: async () => { const chaps=rComic.chapters||[]; if(rChapIdx<chaps.length-1){ await openReader(rComic, rChapIdx + 1); } },
      bookmark: () => { document.querySelector('.bk-btn')?.click(); },
      zoomIn:   () => { rZoom=Math.min(200,rZoom+10); applyZoom(rZoom); },
      zoomOut:  () => { rZoom=Math.max(30, rZoom-10); applyZoom(rZoom); },
      close:    () => { ReaderEnhance.destroy(); closeReader(); },
    });
    if (mainScroll) {
      if (rMode === 'split') {
        ReaderEnhance.attachScrollSaveDelayed(mainScroll, 800);
      } else {
        ReaderEnhance.attachScrollSave(mainScroll);
      }
    }
  }
}

function closeReader() {
  const rd = document.getElementById('reader');
  rd.style.display = 'none';
  rd.innerHTML = '';
  rComic = null; // reset để lần mở sau luôn load localStorage
}

function applyZoom(zoom) {
  rZoom=zoom;
  document.querySelectorAll('#reader .rpiw').forEach(w=>{w.style.width=zoom+'%';w.style.maxWidth='none';});
  document.querySelectorAll('#reader .split-page > img, #reader .split-page > .pdf-pages').forEach(e=>{e.style.width=zoom+'%';e.style.maxWidth='none';});
}

async function loadSingleImages(container, chap, lang) {
  const pages = chap.pages || [];
  if (!pages.length) {
    const ph = U.div('rnoph');
    ph.style.cssText = 'padding:40px;text-align:center;font-size:13px;color:var(--text-muted)';
    ph.textContent = 'Chương này chưa có trang nào hoặc chỉ dành cho bản đọc từ Drive. Kiểm tra lại cấu hình Apps Script URL trong phần cài đặt.';
    container.appendChild(ph);
    return;
  }
  for(let i=0;i<pages.length;i++){
    const p=pages[i];
    const lbl=U.div('rpl'); lbl.textContent=`Trang ${i+1}${p.note?' · '+p.note:''}`; container.appendChild(lbl);
    const d=p[lang]; if(!d){const ph=U.div('rnoph');ph.textContent=`[bản ${lang.toUpperCase()} chưa có]`;container.appendChild(ph);continue;}
    const ws=rZoom!==100?rZoom+'%':null;
    const w=U.div('rpiw'); if(ws){w.style.width=ws;w.style.maxWidth='none';}
    const pageEl=await PDFModule.buildPageEl(d,chap.id,p.id,lang,ws);
    if(pageEl){w.appendChild(pageEl);container.appendChild(w);}
    else{const ph=U.div('rnoph');ph.textContent='[lỗi tải trang]';container.appendChild(ph);}
  }
}

function loadSplitImages(viScroll, enScroll, chap) {
  // Không dùng 2 cột độc lập nữa.
  // renderSplitGrid() xử lý toàn bộ — viScroll/enScroll không dùng ở đây.
}

/* ── Split view dạng bảng: mỗi row = 1 cặp VI + EN ── */
function renderSplitGrid(container, chap) {
  const pages = chap.pages || [];
  container.innerHTML = '';
  // padding bên trong, overflow được set bởi parent
  container.style.padding = '0';

  if (!pages.length) {
    const ph = U.div('rnoph');
    ph.textContent = 'Chương này chưa có trang nào.';
    container.appendChild(ph);
    return;
  }

  // Wrapper có padding để sticky header hoạt động đúng
  const inner = U.div();
  inner.style.cssText = 'padding:8px;min-height:100%';

  // Header — sticky relative to scroll container
  const hdr = U.div();
  hdr.style.cssText = [
    'display:grid;grid-template-columns:1fr 1fr;gap:4px',
    'margin-bottom:4px;position:sticky;top:0;z-index:10',
    'background:var(--reader-bg);padding:4px 0',
  ].join(';');
  ['VI 🇻🇳','EN 🇬🇧'].forEach(lbl => {
    const c = U.div();
    c.style.cssText = 'text-align:center;font-size:10px;font-family:monospace;color:var(--text-muted);padding:2px 0';
    c.textContent = lbl;
    hdr.appendChild(c);
  });
  inner.appendChild(hdr);

  pages.forEach((p, i) => {
    const row = U.div();
    row.className = 'grid-row';   // dùng để scroll restore
    row.dataset.page = i;         // 0-indexed
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:4px;align-items:start';

    ['vi', 'en'].forEach(lang => {
      const cell = U.div();
      cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;min-height:40px';

      const lbl = U.div('spl');
      lbl.textContent = `P${i+1}`;
      cell.appendChild(lbl);

      const d = p[lang];
      if (!d) {
        const ph = U.div('spblank');
        ph.textContent = `[${lang.toUpperCase()} trống]`;
        cell.appendChild(ph);
      } else {
        const spin = U.div('pdf-spin'); spin.textContent = ' '; cell.appendChild(spin);
        PDFModule.buildPageEl(d, chap.id, p.id, lang, null).then(el => {
          if (cell.contains(spin)) cell.removeChild(spin);
          if (el) {
            el.style.cssText = 'width:100%;height:auto;display:block';
            cell.appendChild(el);
          } else {
            const ph = U.div('spno'); ph.textContent = '[lỗi]'; cell.appendChild(ph);
          }
        });
      }

      row.appendChild(cell);
    });

    inner.appendChild(row);
  });

  container.appendChild(inner);
}

/* ── Text chapter reader ── */
function buildTextLangBar(){
  const allLangs=rTextData?.languages||[];
  const bar=U.div('tbar-langs');
  const lbl=U.div();lbl.style.cssText='font-size:10px;color:var(--text-muted);white-space:nowrap;flex-shrink:0';lbl.textContent='Cột đọc:';
  bar.appendChild(lbl);
  allLangs.forEach(lang=>{
    const pill=U.el('label','lang-pill');
    const cb=U.el('input');cb.type='checkbox';cb.value=lang;cb.style.accentColor='var(--accent)';
    cb.checked=rTextSelLangs.includes(lang);
    cb.addEventListener('change',()=>{
      if(cb.checked){if(rTextSelLangs.length>=3){cb.checked=false;return;}if(!rTextSelLangs.includes(lang))rTextSelLangs.push(lang);}
      else{if(rTextSelLangs.length<=1){cb.checked=true;return;}rTextSelLangs=rTextSelLangs.filter(l=>l!==lang);}
      document.getElementById('text-cols')?.replaceWith(buildTextCols());
    });
    const meta=Translate.getLangMeta(lang);
    pill.appendChild(cb);pill.appendChild(document.createTextNode(' '+meta.flag+' '+meta.label));
    bar.appendChild(pill);
  });
  return bar;
}

function buildTextCols(){
  const n=Math.max(1,rTextSelLangs.length);
  const wrap=U.div();wrap.id='text-cols';wrap.style.cssText=`flex:1;display:grid;grid-template-columns:repeat(${n},1fr);overflow:hidden`;
  const scrollEls=[];
  rTextSelLangs.forEach((lang,i)=>{
    const col=U.div('text-col-wrap');if(i===n-1)col.style.borderRight='none';
    const hdr=U.div('text-col-hdr');const meta=Translate.getLangMeta(lang);
    hdr.innerHTML=`<span style="font-size:15px">${meta.flag}</span><span style="color:var(--text-secondary);font-size:11px">${meta.label}</span>`;
    col.appendChild(hdr);
    const scroll=U.div('text-col');scroll.dataset.lang=lang;
    renderTextSegs(scroll,lang);scrollEls.push(scroll);col.appendChild(scroll);wrap.appendChild(col);
  });
  setTimeout(()=>setupTextSync(scrollEls),120);
  return wrap;
}

function renderTextSegs(container,lang){
  const segs=rTextData?.segments||[];
  const allOther=(rTextData?.languages||[]).filter(l=>l!==lang);
  segs.forEach((seg,i)=>{
    const wrap=U.div('tseg');wrap.dataset.idx=i;
    if(seg.note){const n=U.div('tseg-note');n.textContent=seg.note;wrap.appendChild(n);}
    const textEl=U.div('tseg-content');
    const content=seg.content?.[lang];
    if(content){textEl.appendChild(annotateTextUser(content,seg.annotations||[],lang,allOther));}
    else{textEl.style.color='var(--text-muted)';textEl.textContent=`[Chưa có bản ${Translate.getLangLabel(lang)}]`;}
    wrap.appendChild(textEl);container.appendChild(wrap);
  });
}

function annotateTextUser(text,annotations,viewLang,allOther){
  const frag=document.createDocumentFragment();
  if(!annotations?.length){frag.appendChild(document.createTextNode(text));return frag;}
  const ranges=[];
  for(const anno of annotations){const phrase=anno.phrase?.[viewLang];if(!phrase?.trim())continue;let pos=0;while(true){const idx=text.indexOf(phrase,pos);if(idx<0)break;ranges.push({start:idx,end:idx+phrase.length,anno});pos=idx+phrase.length;}}
  if(!ranges.length){frag.appendChild(document.createTextNode(text));return frag;}
  ranges.sort((a,b)=>a.start-b.start);const clean=[];let last=0;
  for(const r of ranges){if(r.start>=last){clean.push(r);last=r.end;}}
  let cursor=0;
  for(const r of clean){
    if(r.start>cursor)frag.appendChild(document.createTextNode(text.slice(cursor,r.start)));
    const span=document.createElement('span');span.className='anno-phrase';span.textContent=text.slice(r.start,r.end);
    const allTips={};allOther.forEach(l=>{if(r.anno.phrase?.[l])allTips[l]=r.anno.phrase[l];});
    span.addEventListener('mouseenter',e=>showAnnoTooltip(e,allTips,viewLang));
    span.addEventListener('mouseleave',hideAnnoTooltip);
    span.addEventListener('click',e=>{e.stopPropagation();const tt=document.getElementById('anno-tooltip');if(tt?.style.display==='block'){hideAnnoTooltip();return;}showAnnoTooltip(e,allTips,viewLang);});
    frag.appendChild(span);cursor=r.end;
  }
  if(cursor<text.length)frag.appendChild(document.createTextNode(text.slice(cursor)));
  return frag;
}

function showAnnoTooltip(e,allTips,srcLang){
  const el=document.getElementById('anno-tooltip');if(!el)return;
  el.innerHTML='';
  const visible=rTextTooltipLangs.filter(l=>l!==srcLang&&allTips[l]);
  if(!visible.length)return;
  const src=document.createElement('div');src.className='anno-tooltip-src';src.textContent=Translate.getLangLabel(srcLang);el.appendChild(src);
  visible.forEach(lang=>{const row=document.createElement('div');row.className='anno-tooltip-row';const lbl=document.createElement('div');lbl.className='anno-tooltip-lang';lbl.textContent=Translate.getLangLabel(lang);const val=document.createElement('div');val.className='anno-tooltip-text';val.textContent=allTips[lang];row.appendChild(lbl);row.appendChild(val);el.appendChild(row);});
  el.style.left=Math.min(e.clientX+14,window.innerWidth-280)+'px';
  el.style.top=Math.min(e.clientY+14,window.innerHeight-130)+'px';
  el.style.display='block';
}
function hideAnnoTooltip(){const el=document.getElementById('anno-tooltip');if(el)el.style.display='none';}

function setupTextSync(els){
  if(els.length<2)return;let syncing=false;
  const segs=el=>Array.from(el.querySelectorAll('.tseg'));
  function curIdx(el){const ps=segs(el),top=el.scrollTop;let idx=0;for(let i=0;i<ps.length;i++){if(ps[i].offsetTop<=top+4)idx=i;else break;}return idx;}
  function ratio(el,idx){const ps=segs(el);if(!ps[idx])return 0;return Math.max(0,Math.min(1,(el.scrollTop-ps[idx].offsetTop)/(ps[idx].offsetHeight||1)));}
  function syncTo(src,dsts){if(syncing)return;syncing=true;const idx=curIdx(src),r=ratio(src,idx);dsts.forEach(dst=>{const ps=segs(dst);if(ps[idx])dst.scrollTop=ps[idx].offsetTop+r*(ps[idx].offsetHeight||0);});requestAnimationFrame(()=>{syncing=false;});}
  els.forEach(el=>el.addEventListener('scroll',()=>syncTo(el,els.filter(e=>e!==el)),{passive:true}));
}

document.addEventListener('click', hideAnnoTooltip);
