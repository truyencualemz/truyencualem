/* ── ADMIN-FORM.JS ────────────────────────────────────────
   Chapter form: pages table, upload helpers, source card.
   Used by both add-chapter and edit-chapter views.
──────────────────────────────────────────────────────────── */
window.AdminForm = (() => {
  const U = () => window.UI;

  /* ── Pages table ──────────────────────────────────────── */
  function buildPagesCard() {
    const card = U().div('fc'); card.id = 'pages-card';
    card.innerHTML = '<div class="fct">📋 Bảng ghép trang song ngữ</div>';
    const pages = App.pendingPages;

    if (!pages.length) {
      const h = U().div(); h.style.cssText = 'text-align:center;padding:24px;color:#555;font-size:12px';
      h.textContent = 'Upload ảnh/PDF hoặc nhập URL bên trên để bắt đầu';
      card.appendChild(h); return card;
    }

    const viC = pages.filter(p => p.vi).length;
    const enC = pages.filter(p => p.en).length;
    const mis = pages.filter(p => !!p.vi !== !!p.en).length;

    const ab  = U().div('abar');
    const dot = U().div('adot'); dot.style.background = mis ? '#e0a030' : '#4caf50'; ab.appendChild(dot);
    const msg = U().div(); msg.style.flex = '1';
    msg.innerHTML = mis
      ? `<span style="color:#e0a030">⚠ ${mis} trang lệch</span> — VI ${viC} · EN ${enC}`
      : `<span style="color:#4caf50">✓ Khớp</span> — ${pages.length} trang`;
    ab.appendChild(msg);
    ab.appendChild(U().mkBtn('btn-ghost btn-xs', 'Tự động căn', autoAlign));
    const ap = U().mkBtn('btn-ghost btn-xs', '+ Trang', () => {
      pages.push({ id: 'p' + Date.now(), vi: null, en: null, note: '' });
      refreshTable();
    }); ap.style.marginLeft = '5px'; ab.appendChild(ap);
    card.appendChild(ab);

    const tbl = U().el('table', 'pt');
    tbl.innerHTML = '<thead><tr><th>#</th><th><span class="lt lvi">VI</span></th><th><span class="lt len">EN</span></th><th>Ghi chú</th><th>Căn lệch</th><th></th></tr></thead>';
    const tb = U().el('tbody');

    pages.forEach((p, i) => {
      const tr = U().el('tr', !!p.vi !== !!p.en ? 'mis' : '');
      const td0 = U().el('td', 'pn'); td0.textContent = i + 1; tr.appendChild(td0);
      tr.appendChild(makeThumbCell(p, 'vi', i));
      tr.appendChild(makeThumbCell(p, 'en', i));

      const tdn = U().el('td');
      const ni = U().el('input', 'fi'); ni.style.cssText = 'padding:4px 7px;font-size:10px';
      ni.placeholder = 'ghi chú...'; ni.value = p.note || '';
      ni.addEventListener('input', () => { p.note = ni.value; });
      tdn.appendChild(ni); tr.appendChild(tdn);

      const tda = U().el('td');
      tda.innerHTML = `<div style="display:flex;flex-direction:column;gap:2px">
<div style="font-size:8px;color:#555;margin-bottom:1px">Chèn trắng:</div>
<div style="display:flex;gap:3px">
<button class="btn btn-ghost btn-xxs bvi"><span class="lt lvi" style="font-size:7px">VI</span>↓</button>
<button class="btn btn-ghost btn-xxs ben"><span class="lt len" style="font-size:7px">EN</span>↓</button>
</div></div>`;
      tda.querySelector('.bvi').addEventListener('click', () => insertBlank(i, 'vi'));
      tda.querySelector('.ben').addEventListener('click', () => insertBlank(i, 'en'));
      tr.appendChild(tda);

      const tdd = U().el('td');
      tdd.appendChild(U().mkBtn('btn-danger btn-xxs', '✕', () => { pages.splice(i, 1); refreshTable(); }));
      tr.appendChild(tdd);
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); card.appendChild(tbl);
    return card;
  }

  function makeThumbCell(p, lang, idx) {
    const td = U().el('td', 'tc'); const d = p[lang]; const w = U().div('uic');
    let th;
    if (!d)             { th = U().div('tempty'); th.textContent = '+'; }
    else if (d.type === 'pdf') {
      th = U().div('tpdf');
      th.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>PDF</span>';
    } else { th = U().el('img', 'tmini'); th.src = d.previewURL || d.url || ''; th.alt = ''; }

    const inp = U().el('input'); inp.type = 'file'; inp.accept = 'image/*,application/pdf';
    inp.addEventListener('change', e => singleUpload(e, idx, lang));
    w.appendChild(th); w.appendChild(inp); td.appendChild(w); return td;
  }

  function refreshTable() {
    const old = document.getElementById('pages-card');
    if (old?.parentNode) old.parentNode.replaceChild(buildPagesCard(), old);
  }

  /* ── Blank insertion (align VI/EN) ────────────────────── */
  function insertBlank(idx, lang) {
    const pages = App.pendingPages;
    for (let i = idx; i < pages.length; i++) {
      if (!pages[i][lang]) {
        for (let j = i; j > idx; j--) pages[j][lang] = pages[j - 1][lang];
        pages[idx][lang] = null; refreshTable(); return;
      }
    }
    const p = { id: 'p' + Date.now() + Math.random(), vi: null, en: null, note: '' };
    pages.splice(idx, 0, p); refreshTable();
  }

  function autoAlign() {
    const pages = App.pendingPages;
    const viC = pages.filter(p => p.vi).length;
    const enC = pages.filter(p => p.en).length;
    for (let i = 0; i < Math.abs(viC - enC); i++)
      pages.push({ id: 'p' + Date.now() + Math.random(), vi: null, en: null, note: '' });
    refreshTable();
  }

  /* ── Upload helpers ───────────────────────────────────── */
  function bulkUpload(e, lang) {
    const files = Array.from(e.target.files); let done = 0;
    files.forEach(f => {
      const r = new FileReader(); r.onload = ev => {
        const ab = ev.target.result, type = f.type === 'application/pdf' ? 'pdf' : 'image';
        const previewURL = type === 'image' ? URL.createObjectURL(new Blob([ab], { type: f.type })) : null;
        const obj = { type, name: f.name, arrayBuffer: ab, previewURL };
        let placed = false;
        for (let j = 0; j < App.pendingPages.length; j++) {
          if (!App.pendingPages[j][lang]) { App.pendingPages[j][lang] = obj; placed = true; break; }
        }
        if (!placed) {
          const p = { id: 'p' + Date.now() + Math.random(), vi: null, en: null, note: '' };
          p[lang] = obj; App.pendingPages.push(p);
        }
        done++; if (done === files.length) refreshTable();
      }; r.readAsArrayBuffer(f);
    }); e.target.value = '';
  }

  function singleUpload(e, idx, lang) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => {
      const ab = ev.target.result, type = f.type === 'application/pdf' ? 'pdf' : 'image';
      const previewURL = type === 'image' ? URL.createObjectURL(new Blob([ab], { type: f.type })) : null;
      const obj = { type, name: f.name, arrayBuffer: ab, previewURL };
      while (App.pendingPages.length <= idx)
        App.pendingPages.push({ id: 'p' + Date.now() + Math.random(), vi: null, en: null, note: '' });
      App.pendingPages[idx][lang] = obj; refreshTable();
    }; r.readAsArrayBuffer(f); e.target.value = '';
  }

  function addURLRow(lang) {
    const ul = document.getElementById('ul-' + lang); if (!ul) return;
    const row = U().div('urlrow');
    const inp = U().el('input', 'fi'); inp.placeholder = lang === 'vi' ? 'https://... URL ảnh hoặc PDF' : 'Image/PDF URL';
    const doAdd = () => {
      const raw = inp.value.trim(); if (!raw) { inp.classList.add('err'); inp.focus(); return; }
      // normalize Google Drive share link
      const src = raw.replace(/drive\.google\.com\/file\/d\/([^\/\?]+).*/, 'drive.google.com/uc?export=view&id=$1')
                     .replace(/^(?!https?:\/\/)/, 'https://');
      const obj = { type: src.toLowerCase().includes('.pdf') ? 'pdf' : 'image', name: src.split('/').pop().slice(0, 30), url: src, previewURL: src.includes('.pdf') ? null : src };
      let placed = false;
      for (let j = 0; j < App.pendingPages.length; j++) {
        if (!App.pendingPages[j][lang]) { App.pendingPages[j][lang] = obj; placed = true; break; }
      }
      if (!placed) {
        const p = { id: 'p' + Date.now() + Math.random(), vi: null, en: null, note: '' };
        p[lang] = obj; App.pendingPages.push(p);
      }
      row.remove(); refreshTable();
    };
    const addBtn = U().mkBtn('btn-primary btn-xs', lang === 'vi' ? 'Thêm' : 'Add', doAdd);
    const delBtn = U().mkBtn('btn-danger btn-xs', '✕', () => row.remove());
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
    [inp, addBtn, delBtn].forEach(e => row.appendChild(e));
    ul.appendChild(row); inp.focus();
  }

  /* ── Source card ──────────────────────────────────────── */
  function buildSourceCard() {
    const sc = U().div('fc');
    sc.innerHTML = '<div class="fct">📂 Nguồn trang truyện</div>';

    // Google Drive section
    const gdSec = U().div();
    gdSec.style.cssText = 'margin-bottom:16px;border-bottom:1px solid #2a2a30;padding-bottom:16px';
    const gdHdr = U().div();
    gdHdr.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;display:flex;align-items:center;gap:6px';
    gdHdr.innerHTML = `<svg width="13" height="13" viewBox="0 0 87.3 78" fill="none">
<path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
<path d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9 9 0 0 0 0 53h27.5z" fill="#00ac47"/>
<path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.8L73.55 76.8z" fill="#ea4335"/>
<path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
<path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
<path d="M73.4 26.5l-13.05-22.6c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
</svg>Import từ Google Drive Folder`;
    gdSec.appendChild(gdHdr);
    gdSec.appendChild(GDrive.buildUI());
    sc.appendChild(gdSec);

    // Per-language upload/URL
    const sg = U().div(); sg.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:14px';
    ['vi', 'en'].forEach(lang => {
      const col = U().div();
      col.innerHTML = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:7px">
<span class="lt l${lang}">${lang.toUpperCase()}</span>
<span style="font-size:11px;color:#777">${lang === 'vi' ? 'Upload / URL riêng lẻ VI' : 'Upload / URL riêng lẻ EN'}</span></div>`;
      const stabs = U().div('stabs');
      const t1 = U().el('button', 'stab active'); t1.textContent = '⬆ Upload';
      const t2 = U().el('button', 'stab');        t2.textContent = '🔗 URL';
      const up = U().div(), urlp = U().div(); urlp.style.display = 'none';
      t1.addEventListener('click', () => { t1.className='stab active'; t2.className='stab'; up.style.display=''; urlp.style.display='none'; });
      t2.addEventListener('click', () => { t2.className='stab active'; t1.className='stab'; urlp.style.display=''; up.style.display='none'; });
      stabs.appendChild(t1); stabs.appendChild(t2); col.appendChild(stabs);

      const uz = U().div('uz');
      uz.innerHTML = `<input type="file" accept="image/*,application/pdf" multiple><div class="uzi">📄</div><div class="uzt">${lang === 'vi' ? 'Kéo thả / click' : 'Drag & drop / click'}</div><div class="uzh">Ảnh hoặc PDF</div>`;
      uz.querySelector('input').addEventListener('change', e => bulkUpload(e, lang));
      up.appendChild(uz); col.appendChild(up);

      const uh = U().div('urlhint');
      uh.innerHTML = '<b>Google Drive:</b> Share link → paste<br><b>Imgur / khác:</b> URL trực tiếp đến ảnh/PDF';
      const ul = U().div(); ul.id = 'ul-' + lang; ul.style.marginTop = '7px';
      const ab = U().mkBtn('btn-ghost btn-xs', lang === 'vi' ? '+ Thêm URL' : '+ Add URL', () => addURLRow(lang));
      ab.style.cssText = 'margin-top:5px;width:100%';
      urlp.appendChild(uh); urlp.appendChild(ul); urlp.appendChild(ab);
      col.appendChild(urlp); sg.appendChild(col);
    });
    sc.appendChild(sg); return sc;
  }

  /* ── Save helpers ─────────────────────────────────────── */
  async function persistPages(comicId, chapId) {
    const meta = [];
    for (const p of App.pendingPages) {
      const pm = { id: p.id, note: p.note || '', vi: null, en: null };
      for (const lang of ['vi', 'en']) {
        const d = p[lang]; if (!d) continue;
        if (d.arrayBuffer) {
          await DB.savePage(comicId, chapId, p.id, lang, d.type, d.arrayBuffer, d.name);
          pm[lang] = { type: d.type, name: d.name, idb: true };
        } else if (d.idb) {
          pm[lang] = { type: d.type, name: d.name, idb: true };
        } else if (d.url) {
          pm[lang] = { type: d.type, name: d.name, url: d.url };
        }
      }
      meta.push(pm);
    }
    return meta;
  }

  async function deleteRemovedPages(chapId, oldPages, newPageIds) {
    for (const op of oldPages) {
      if (!newPageIds.has(op.id)) {
        for (const lang of ['vi', 'en'])
          if (op[lang]?.idb) await DB.deletePage(chapId, op.id, lang);
      }
    }
  }

  return { buildPagesCard, buildSourceCard, refreshTable, persistPages, deleteRemovedPages };
})();
