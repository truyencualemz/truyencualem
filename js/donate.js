/* ── DONATE.JS ────────────────────────────────────────────
   Mời cafe / Donate per publisher:
   - User: nút donate trong reader + trang comic
   - Publisher/Admin: cấu hình trong phần tài khoản
──────────────────────────────────────────────────────────── */
window.Donate = (() => {
  const sb = () => window._sb;

  /* ── Load donate info của 1 user ── */
  async function loadDonateInfo(userId) {
    const { data } = await sb()
      .from('profiles')
      .select('display_name, donate_momo, donate_qr_url, donate_note')
      .eq('id', userId)
      .single();
    return data || null;
  }

  /* ── Save donate info (cho publisher/admin) ── */
  async function saveDonateInfo({ momo, qrUrl, note }) {
    const uid = Auth.getUserId(); if (!uid) return;
    const { error } = await sb().from('profiles').update({
      donate_momo:    momo    || '',
      donate_qr_url:  qrUrl   || '',
      donate_note:    note    || '',
    }).eq('id', uid);
    if (error) throw error;
  }

  /* ── Load donate info của owner một bộ comic ── */
  async function loadComicDonate(comicId) {
    const { data: comic } = await sb()
      .from('comics')
      .select('user_id')
      .eq('id', comicId)
      .single();
    if (!comic?.user_id) return null;

    const { data: profile } = await sb()
      .from('profiles')
      .select('display_name, donate_momo, donate_qr_url, donate_note')
      .eq('id', comic.user_id)
      .single();
    if (!profile) return null;
    return { userId: comic.user_id, ...profile };
  }

  /* ══ UI ════════════════════════════════════════════════ */

  /* Nút donate nhỏ hiển thị trong reader bar */
  function buildDonateBtn(comicId) {
    const btn = document.createElement('button');
    btn.className = 'bk-btn';
    btn.textContent = '☕';
    btn.title = 'Mời cafe tác giả';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const info = await loadComicDonate(comicId);
        if (!info || (!info.donate_momo && !info.donate_qr_url)) {
          alert('Tác giả chưa cấu hình thông tin nhận donate.');
          return;
        }
        showDonateModal(info);
      } catch(e) { console.error(e); }
      finally { btn.disabled = false; }
    });
    return btn;
  }

  /* Modal donate popup */
  function showDonateModal(info) {
    document.getElementById('donate-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'donate-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px';

    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-primary);border:1px solid var(--border);border-radius:12px;padding:24px;width:340px;max-width:100%;text-align:center';

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Title
    const t = document.createElement('div');
    t.style.cssText = 'font-size:20px;margin-bottom:4px';
    t.textContent = '☕ Mời cafe';
    box.appendChild(t);

    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:12px;color:var(--text-muted);margin-bottom:16px';
    sub.textContent = info.display_name ? `Ủng hộ ${info.display_name}` : 'Ủng hộ tác giả';
    box.appendChild(sub);

    // Note
    if (info.donate_note) {
      const note = document.createElement('div');
      note.style.cssText = 'font-size:12px;color:var(--text-secondary);background:var(--bg-secondary);border-radius:6px;padding:10px;margin-bottom:14px;line-height:1.6;text-align:left;white-space:pre-wrap';
      note.textContent = info.donate_note;
      box.appendChild(note);
    }

    // Momo button
    if (info.donate_momo) {
      const momoBtn = document.createElement('a');
      momoBtn.href = `https://me.momo.vn/${info.donate_momo}`;
      momoBtn.target = '_blank';
      momoBtn.rel = 'noopener noreferrer';
      momoBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;background:#ae2070;color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;margin-bottom:10px;transition:filter .15s';
      momoBtn.innerHTML = `
<svg width="22" height="22" viewBox="0 0 40 40" fill="none">
  <circle cx="20" cy="20" r="20" fill="#fff"/>
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#ae2070" font-size="14" font-weight="bold">M</text>
</svg>
Ủng hộ qua Momo`;
      momoBtn.addEventListener('mouseenter', () => momoBtn.style.filter = 'brightness(1.1)');
      momoBtn.addEventListener('mouseleave', () => momoBtn.style.filter = '');
      box.appendChild(momoBtn);
    }

    // QR Code
    if (info.donate_qr_url) {
      const qrWrap = document.createElement('div');
      qrWrap.style.cssText = 'margin-bottom:14px';
      const qrLbl = document.createElement('div');
      qrLbl.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:6px';
      qrLbl.textContent = 'Hoặc quét QR code';
      const qrImg = document.createElement('img');
      qrImg.src = info.donate_qr_url;
      qrImg.alt = 'QR donate';
      qrImg.style.cssText = 'width:180px;height:180px;object-fit:contain;border-radius:8px;border:1px solid var(--border);background:#fff';
      qrWrap.appendChild(qrLbl); qrWrap.appendChild(qrImg);
      box.appendChild(qrWrap);
    }

    // Close
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-ghost btn-sm';
    closeBtn.style.cssText = 'width:100%';
    closeBtn.textContent = 'Đóng';
    closeBtn.addEventListener('click', close);
    box.appendChild(closeBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  /* ── Admin UI: form cấu hình donate trong profile ── */
  function buildAdminDonateSection(currentProfile) {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:14px;margin-top:12px';

    const t = document.createElement('div');
    t.style.cssText = 'font-size:12px;font-weight:500;color:var(--text-primary);margin-bottom:12px';
    t.textContent = '☕ Thông tin nhận donate';
    card.appendChild(t);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:12px;line-height:1.6';
    hint.textContent = 'Sau khi cấu hình, độc giả sẽ thấy nút ☕ trong reader để ủng hộ bạn.';
    card.appendChild(hint);

    const fields = [
      { id: 'donate-momo',  label: 'Tên Momo (username)', placeholder: 'vd: truyencualemz', val: currentProfile?.donate_momo || '' },
      { id: 'donate-qr',   label: 'URL ảnh QR code (ngân hàng, Momo...)', placeholder: 'https://...', val: currentProfile?.donate_qr_url || '' },
    ];

    fields.forEach(f => {
      const row = document.createElement('div'); row.style.marginBottom = '10px';
      const lbl = document.createElement('label');
      lbl.style.cssText = 'font-size:10px;color:var(--text-muted);letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px';
      lbl.textContent = f.label;
      const inp = document.createElement('input');
      inp.id = f.id; inp.type = 'text'; inp.value = f.val; inp.placeholder = f.placeholder;
      inp.style.cssText = 'width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:8px 11px;color:var(--text-primary);font-size:12px;outline:none;font-family:inherit';
      inp.addEventListener('focus', () => inp.style.borderColor = 'var(--accent)');
      inp.addEventListener('blur',  () => inp.style.borderColor = 'var(--border)');
      row.appendChild(lbl); row.appendChild(inp);
      card.appendChild(row);
    });

    // Note textarea
    const noteRow = document.createElement('div'); noteRow.style.marginBottom = '12px';
    const noteLbl = document.createElement('label');
    noteLbl.style.cssText = 'font-size:10px;color:var(--text-muted);letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px';
    noteLbl.textContent = 'Lời nhắn cho độc giả';
    const noteTa = document.createElement('textarea');
    noteTa.id = 'donate-note'; noteTa.rows = 2;
    noteTa.value = currentProfile?.donate_note || '';
    noteTa.placeholder = 'vd: Cảm ơn bạn đã ủng hộ! ☕';
    noteTa.style.cssText = 'width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:8px 11px;color:var(--text-primary);font-size:12px;outline:none;font-family:inherit;resize:vertical';
    noteTa.addEventListener('focus', () => noteTa.style.borderColor = 'var(--accent)');
    noteTa.addEventListener('blur',  () => noteTa.style.borderColor = 'var(--border)');
    noteRow.appendChild(noteLbl); noteRow.appendChild(noteTa);
    card.appendChild(noteRow);

    const msgEl = document.createElement('div');
    msgEl.style.cssText = 'font-size:11px;margin-bottom:8px;display:none';
    card.appendChild(msgEl);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary btn-xs';
    saveBtn.textContent = '✓ Lưu thông tin donate';
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu...';
      try {
        await saveDonateInfo({
          momo:  document.getElementById('donate-momo')?.value.trim(),
          qrUrl: document.getElementById('donate-qr')?.value.trim(),
          note:  document.getElementById('donate-note')?.value.trim(),
        });
        msgEl.style.display = 'block';
        msgEl.style.color = '#4caf50';
        msgEl.textContent = '✓ Đã lưu!';
        setTimeout(() => msgEl.style.display = 'none', 2500);
      } catch(e) {
        msgEl.style.display = 'block';
        msgEl.style.color = '#e05555';
        msgEl.textContent = 'Lỗi: ' + e.message;
      }
      saveBtn.disabled = false; saveBtn.textContent = '✓ Lưu thông tin donate';
    });
    card.appendChild(saveBtn);

    return card;
  }

  return { loadComicDonate, saveDonateInfo, buildDonateBtn, buildAdminDonateSection, showDonateModal };
})();
