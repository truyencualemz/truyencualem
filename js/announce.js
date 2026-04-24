/* ── ANNOUNCE.JS ──────────────────────────────────────────
   Thông báo hệ thống:
   - User: hiện banner cố định đầu trang, có thể đóng
   - Admin: CRUD thông báo trong trang Cài đặt
──────────────────────────────────────────────────────────── */
window.Announce = (() => {
  const sb       = () => window._sb;
  const LS_KEY   = 'md_dismissed_ann'; // localStorage: set of dismissed IDs

  /* ── Lấy IDs đã bị đóng ── */
  function getDismissed() {
    try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')); }
    catch { return new Set(); }
  }
  function dismiss(id) {
    const s = getDismissed(); s.add(id);
    localStorage.setItem(LS_KEY, JSON.stringify([...s]));
  }

  /* ── Load thông báo active ── */
  async function loadActive() {
    const { data } = await sb()
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('created_at', { ascending: false });
    return (data || []).filter(a => !getDismissed().has(a.id));
  }

  /* ── Render banner trên user page ── */
  async function renderBanners(container) {
    const items = await loadActive();
    if (!items.length) return;

    const wrap = document.createElement('div');
    wrap.id = 'ann-banners';
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:0';

    const TYPE_STYLE = {
      info:    { bg: 'var(--accent-dim)', border: 'var(--accent)', icon: 'ℹ️', color: 'var(--accent)' },
      warning: { bg: '#e0a03011', border: '#e0a030', icon: '⚠️', color: '#e0a030' },
      success: { bg: '#4caf5011', border: '#4caf50', icon: '✅', color: '#4caf50' },
    };

    items.forEach(ann => {
      const st = TYPE_STYLE[ann.type] || TYPE_STYLE.info;
      const bar = document.createElement('div');
      bar.style.cssText = `
        display:flex;align-items:center;gap:10px;padding:9px 16px;
        background:${st.bg};border-bottom:1px solid ${st.border};
        font-size:12px;line-height:1.5;
      `;

      const icon = document.createElement('span'); icon.textContent = st.icon; icon.style.flexShrink = '0';
      const body = document.createElement('div'); body.style.cssText = `flex:1;color:var(--text-primary)`;
      if (ann.title) {
        const t = document.createElement('b'); t.style.color = st.color; t.textContent = ann.title + ' ';
        body.appendChild(t);
      }
      body.appendChild(document.createTextNode(ann.body));

      // Expire label
      if (ann.expires_at) {
        const exp = document.createElement('span');
        exp.style.cssText = 'font-size:10px;color:var(--text-muted);margin-left:8px;white-space:nowrap';
        const d = new Date(ann.expires_at);
        exp.textContent = `hết hạn ${d.toLocaleDateString('vi-VN')}`;
        body.appendChild(exp);
      }

      const closeBtn = document.createElement('button');
      closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-muted);padding:0 2px;flex-shrink:0;line-height:1';
      closeBtn.textContent = '×';
      closeBtn.title = 'Đóng thông báo';
      closeBtn.addEventListener('click', () => {
        dismiss(ann.id);
        bar.style.maxHeight = bar.offsetHeight + 'px';
        bar.style.transition = 'max-height .25s ease, opacity .2s ease, padding .25s ease';
        requestAnimationFrame(() => {
          bar.style.maxHeight = '0'; bar.style.opacity = '0'; bar.style.padding = '0 16px';
        });
        setTimeout(() => bar.remove(), 280);
      });

      [icon, body, closeBtn].forEach(e => bar.appendChild(e));
      wrap.appendChild(bar);
    });

    // Insert before first child of container
    if (container.firstChild) container.insertBefore(wrap, container.firstChild);
    else container.appendChild(wrap);
  }

  /* ═══════════════════════════════════════════════════════
     ADMIN CRUD
  ═══════════════════════════════════════════════════════ */
  async function loadAll() {
    const { data } = await sb()
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });
    return data || [];
  }

  async function create({ title, body, type, expiresAt }) {
    const uid = Auth.getUserId(); if (!uid) return;
    const { data, error } = await sb().from('announcements').insert({
      user_id:    uid,
      title:      title || '',
      body:       body  || '',
      type:       type  || 'info',
      expires_at: expiresAt || null,
      is_active:  true,
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function toggle(id, isActive) {
    await sb().from('announcements').update({ is_active: isActive }).eq('id', id);
  }

  async function remove(id) {
    await sb().from('announcements').delete().eq('id', id);
  }

  /* ── Admin UI: render trong viewSettings ── */
  function buildAdminSection() {
    const U = () => ({ div: (c) => { const e=document.createElement('div');if(c)e.className=c;return e; },
                       el:  (t,c) => { const e=document.createElement(t);if(c)e.className=c;return e; },
                       btn: (c,t,fn) => { const b=document.createElement('button');b.className='btn '+c;b.textContent=t;b.addEventListener('click',fn);return b; } });
    const u = U();

    const card = document.createElement('div'); card.className = 'sc'; card.style.marginBottom = '14px';
    card.innerHTML = '<div class="sl" style="margin-bottom:10px">📢 Thông báo hệ thống</div>';

    // Create form
    const form = u.div(); form.style.cssText = 'background:#111;border-radius:7px;padding:12px;margin-bottom:12px';

    const r1 = u.div(); r1.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
    const titleInp = u.el('input','fi'); titleInp.placeholder='Tiêu đề (tùy chọn)'; titleInp.style.flex='1';
    const typeSelEl = u.el('select','fi'); typeSelEl.style.cssText='width:auto;font-size:12px;padding:7px 8px';
    [['info','ℹ️ Thông tin'],['warning','⚠️ Cảnh báo'],['success','✅ Tốt']].forEach(([v,l])=>{
      const o=u.el('option');o.value=v;o.textContent=l;typeSelEl.appendChild(o);
    });
    r1.appendChild(titleInp); r1.appendChild(typeSelEl); form.appendChild(r1);

    const bodyInp = u.el('textarea','fi'); bodyInp.placeholder='Nội dung thông báo...'; bodyInp.rows=2; bodyInp.style.marginBottom='8px';
    form.appendChild(bodyInp);

    const r2 = u.div(); r2.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    const expLbl = u.div(); expLbl.style.cssText='font-size:11px;color:var(--text-muted)'; expLbl.textContent='Hết hạn:';
    const expInp = u.el('input','fi'); expInp.type='datetime-local'; expInp.style.cssText='width:auto;font-size:11px;padding:5px 8px';
    expInp.title='Để trống = không hết hạn';
    const createBtn = u.btn('btn-primary btn-xs','+ Đăng thông báo', async()=>{
      if (!bodyInp.value.trim()) { alert('Nhập nội dung thông báo'); return; }
      createBtn.disabled=true; createBtn.textContent='Đang đăng...';
      try {
        await create({
          title: titleInp.value.trim(),
          body:  bodyInp.value.trim(),
          type:  typeSelEl.value,
          expiresAt: expInp.value ? new Date(expInp.value).toISOString() : null,
        });
        titleInp.value=''; bodyInp.value=''; expInp.value='';
        await refreshList();
      } catch(e) { alert('Lỗi: '+e.message); }
      createBtn.disabled=false; createBtn.textContent='+ Đăng thông báo';
    });
    [expLbl, expInp, createBtn].forEach(e=>r2.appendChild(e));
    form.appendChild(r2); card.appendChild(form);

    // List
    const listEl = u.div(); listEl.id='ann-admin-list'; card.appendChild(listEl);

    async function refreshList() {
      listEl.innerHTML='<div style="font-size:11px;color:var(--text-muted);padding:6px 0">Đang tải...</div>';
      const items = await loadAll();
      listEl.innerHTML='';
      if (!items.length) {
        listEl.innerHTML='<div style="font-size:11px;color:var(--text-muted)">Chưa có thông báo nào.</div>';
        return;
      }
      const TYPE_ICON = { info:'ℹ️', warning:'⚠️', success:'✅' };
      items.forEach(ann => {
        const row = u.div(); row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-secondary);border-radius:6px;margin-bottom:6px';
        const icon = u.div(); icon.textContent=TYPE_ICON[ann.type]||'ℹ️'; icon.style.flexShrink='0';
        const info = u.div(); info.style.flex='1';
        info.innerHTML=`<div style="font-size:12px;font-weight:500">${ann.title||''}<span style="font-size:10px;font-weight:400;color:var(--text-muted);margin-left:5px">${ann.body.slice(0,60)}${ann.body.length>60?'...':''}</span></div>
<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${ann.expires_at?'Hết hạn: '+new Date(ann.expires_at).toLocaleDateString('vi-VN'):'Không hết hạn'}</div>`;

        const tog = u.el('button'); tog.style.cssText='background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-size:10px;cursor:pointer;color:var(--text-muted);font-family:monospace';
        tog.textContent = ann.is_active ? '👁 Ẩn' : '👁 Hiện';
        tog.addEventListener('click', async()=>{ await toggle(ann.id,!ann.is_active); await refreshList(); });

        const del = u.btn('btn-danger btn-xxs','🗑',async()=>{ if(confirm('Xóa thông báo?')){await remove(ann.id);await refreshList();} });
        [icon,info,tog,del].forEach(e=>row.appendChild(e));
        listEl.appendChild(row);
      });
    }
    refreshList();
    return card;
  }

  return { renderBanners, buildAdminSection, loadActive, create, toggle, remove };
})();
