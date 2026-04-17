/* ── READER.JS ────────────────────────────────────────────
   Single scroll + two-column split với page-based sync.
   Sync theo PAGE INDEX + tỉ lệ trong trang → trang N VI
   luôn khớp trang N EN, không drift dù chiều cao khác nhau.
──────────────────────────────────────────────────────────── */
window.Reader = (() => {
  function open(comicId, chapIdx, mode, lang) {
    App.rComicId = comicId; App.rChapIdx = chapIdx;
    App.rMode = mode; App.rLang = lang; App.rZoom = 100;
    const rd = document.getElementById('reader');
    rd.innerHTML = ''; rd.style.display = 'flex'; rd.style.flexDirection = 'column';
    render();
    PDFModule.prefetch(comicId, chapIdx);
  }

  function close() {
    const rd = document.getElementById('reader');
    rd.style.display = 'none'; rd.innerHTML = '';
  }

  function render() {
    const rd = document.getElementById('reader'); rd.innerHTML = '';
    const comic = App.comics.find(c => c.id === App.rComicId);
    if (!comic) { close(); return; }
    const chaps = comic.chapters || [], chap = chaps[App.rChapIdx];
    if (!chap) { close(); return; }

    /* top bar */
    const bar = UI.div('rbar');
    bar.appendChild(UI.mkBtn('btn-ghost btn-sm', '← Đóng', close));
    const rt = UI.div('rtitle');
    rt.textContent = `${comic.titleVI} · Ch.${chap.num}: ${chap.title || ''}`;
    bar.appendChild(rt);

    const mt = UI.div('mtog');
    [['single','Đơn'],['split','Song song']].forEach(([mode, label]) => {
      const b = UI.el('button', 'mbtn' + (App.rMode === mode ? ' active' : ''));
      b.textContent = label;
      b.addEventListener('click', () => { App.rMode = mode; render(); });
      mt.appendChild(b);
    });
    bar.appendChild(mt);

    const lgt = UI.div('ltog'); lgt.style.display = App.rMode === 'single' ? '' : 'none';
    [['vi','🇻🇳 VI'],['en','🇬🇧 EN']].forEach(([lang, label]) => {
      const b = UI.el('button', 'lbtn' + (App.rLang === lang ? ' active' : ''));
      b.textContent = label;
      b.addEventListener('click', () => { App.rLang = lang; render(); });
      lgt.appendChild(b);
    });
    bar.appendChild(lgt);

    const zw = UI.div('zoom-wrap');
    const zlbl = UI.div('zoom-label'); zlbl.textContent = 'Size:';
    const slider = UI.el('input'); slider.type = 'range'; slider.className = 'zoom-slider';
    slider.min = 30; slider.max = 200; slider.step = 5; slider.value = App.rZoom;
    slider.style.setProperty('--p', ((App.rZoom - 30) / 170 * 100) + '%');
    const zval = UI.div('zoom-val'); zval.textContent = App.rZoom + '%';
    slider.addEventListener('input', () => {
      const v = +slider.value;
      slider.style.setProperty('--p', ((v - 30) / 170 * 100) + '%');
      zval.textContent = v + '%';
      applyZoom(v);
    });
    [zlbl, slider, zval].forEach(e => zw.appendChild(e));
    bar.appendChild(zw);
    rd.appendChild(bar);

    /* chapter nav */
    const nav = UI.div('rnav');
    const pb = UI.mkBtn('btn-ghost btn-sm', '← Trước', () => {
      if (App.rChapIdx > 0) { App.rChapIdx--; render(); PDFModule.prefetch(App.rComicId, App.rChapIdx); }
    });
    pb.disabled = App.rChapIdx === 0;
    const ni = UI.div('rni'); ni.textContent = `Ch ${App.rChapIdx + 1} / ${chaps.length}`;
    const nb = UI.mkBtn('btn-ghost btn-sm', 'Sau →', () => {
      if (App.rChapIdx < chaps.length - 1) { App.rChapIdx++; render(); PDFModule.prefetch(App.rComicId, App.rChapIdx); }
    });
    nb.disabled = App.rChapIdx >= chaps.length - 1;
    const jw = UI.div('rj'), jl = UI.div('rjl'); jl.textContent = 'Đến chương:';
    const ji = UI.el('input', 'rji'); ji.type = 'number'; ji.value = chap.num; ji.min = 1;
    const jb = UI.mkBtn('btn-ghost btn-xs', 'Đi', () => {
      const n = parseInt(ji.value), idx = chaps.findIndex(c => c.num === n);
      if (idx < 0) { alert(`Không tìm thấy chương ${n}`); return; }
      App.rChapIdx = idx; render(); PDFModule.prefetch(App.rComicId, App.rChapIdx);
    });
    ji.addEventListener('keydown', e => { if (e.key === 'Enter') jb.click(); });
    [jl, ji, jb].forEach(x => jw.appendChild(x));
    [pb, ni, nb, jw].forEach(x => nav.appendChild(x));
    rd.appendChild(nav);

    /* body */
    const body = UI.div();
    body.style.cssText = 'display:flex;flex:1;overflow:hidden;flex-direction:column';

    if (App.rMode === 'single') {
      const scroll = UI.div('rscroll'); body.appendChild(scroll);
      loadSingle(scroll, chap, App.rLang);
    } else {
      const sp = UI.div('rsplit'); body.appendChild(sp);
      const scrollEls = {};
      ['vi', 'en'].forEach(lang => {
        const col = UI.div('rcol');
        const hdr = UI.div('rchdr');
        hdr.innerHTML = `<span class="lt l${lang}">${lang.toUpperCase()}</span>
<span style="font-size:10px;color:#555;margin-left:4px">${lang === 'vi' ? 'Tiếng Việt' : 'English'}</span>`;
        const scroll = UI.div('rcs');
        // VI: ảnh căn phải (áp sát đường giữa khi zoom out)
        // EN: ảnh căn trái (áp sát đường giữa)
        scroll.style.cssText = `align-items:${lang === 'vi' ? 'flex-end' : 'flex-start'}`;
        scrollEls[lang] = scroll;
        col.appendChild(hdr); col.appendChild(scroll); sp.appendChild(col);
      });
      loadTwoColumns(scrollEls.vi, scrollEls.en, chap);
    }
    rd.appendChild(body);
  }

  /* ── Zoom ── */
  function applyZoom(zoom) {
    App.rZoom = zoom;
    const pct = zoom + '%';
    document.querySelectorAll('#reader .rpiw').forEach(w => {
      w.style.width = pct; w.style.maxWidth = 'none';
    });
    document.querySelectorAll('#reader .split-page > img, #reader .split-page > .pdf-pages').forEach(e => {
      e.style.width = pct; e.style.maxWidth = 'none';
    });
  }

  /* ── Single ── */
  async function loadSingle(container, chap, lang) {
    for (let i = 0; i < chap.pages.length; i++) {
      const p = chap.pages[i];
      const lbl = UI.div('rpl');
      lbl.textContent = `Trang ${i + 1}${p.note ? ' · ' + p.note : ''}`;
      container.appendChild(lbl);
      const d = p[lang];
      if (!d) {
        const ph = UI.div('rnoph');
        ph.textContent = `[bản ${lang.toUpperCase()} chưa có]`;
        container.appendChild(ph); continue;
      }
      const ws = App.rZoom !== 100 ? App.rZoom + '%' : null;
      const w = UI.div('rpiw');
      if (ws) { w.style.width = ws; w.style.maxWidth = 'none'; }
      const pageEl = await PDFModule.buildPageEl(d, chap.id, p.id, lang, ws);
      if (pageEl) { w.appendChild(pageEl); container.appendChild(w); }
      else { const ph = UI.div('rnoph'); ph.textContent = '[lỗi tải trang]'; container.appendChild(ph); }
    }
  }

  /* ── Two-column split ──────────────────────────────────────
     Mỗi trang gói trong .split-page để dễ track vị trí.
     Sau khi render xong, setupPageSync kết nối 2 cột.
  ──────────────────────────────────────────────────────────── */
  function loadTwoColumns(viScroll, enScroll, chap) {
    chap.pages.forEach((p, i) => {
      ['vi', 'en'].forEach(lang => {
        const scrollEl = lang === 'vi' ? viScroll : enScroll;
        const wrap = UI.div('split-page');
        const lbl = UI.div('spl'); lbl.textContent = `P${i + 1}`; wrap.appendChild(lbl);
        const d = p[lang];
        if (!d) {
          const ph = UI.div('spblank');
          ph.textContent = `[${lang.toUpperCase()} trống]`;
          wrap.appendChild(ph);
        } else {
          const spin = UI.div('pdf-spin'); spin.textContent = ' '; wrap.appendChild(spin);
          PDFModule.buildPageEl(d, chap.id, p.id, lang, null).then(pageEl => {
            if (wrap.contains(spin)) wrap.removeChild(spin);
            if (pageEl) {
              pageEl.style.width = App.rZoom + '%';
              pageEl.style.maxWidth = 'none';
              wrap.appendChild(pageEl);
            } else {
              const ph = UI.div('spno'); ph.textContent = '[lỗi]'; wrap.appendChild(ph);
            }
          });
        }
        scrollEl.appendChild(wrap);
      });
    });

    setTimeout(() => setupPageSync(viScroll, enScroll), 150);
  }

  /* ── Page-based scroll sync ─────────────────────────────────
     Thay vì sync theo ratio tổng (gây drift khi 2 cột cao khác nhau),
     sync theo:
       1. PAGE INDEX: tìm trang đang ở đỉnh viewport
       2. INTRA-PAGE RATIO: đã cuộn bao nhiêu % trong trang đó
     → scroll cột kia đến đúng page + đúng tỉ lệ.
  ──────────────────────────────────────────────────────────── */
  function setupPageSync(viEl, enEl) {
    let syncing = false;

    const pages = el => Array.from(el.querySelectorAll('.split-page'));

    function currentPageIdx(scrollEl) {
      const ps = pages(scrollEl);
      if (!ps.length) return 0;
      const top = scrollEl.scrollTop;
      let idx = 0;
      for (let i = 0; i < ps.length; i++) {
        // offsetTop là vị trí tương đối với scroll container
        if (ps[i].offsetTop <= top + 4) idx = i;
        else break;
      }
      return idx;
    }

    function intraPageRatio(scrollEl, idx) {
      const ps = pages(scrollEl);
      if (!ps[idx]) return 0;
      const pageTop = ps[idx].offsetTop;
      const pageH   = ps[idx].offsetHeight || 1;
      return Math.max(0, Math.min(1, (scrollEl.scrollTop - pageTop) / pageH));
    }

    function syncTo(src, dst) {
      if (syncing) return;
      syncing = true;
      const idx   = currentPageIdx(src);
      const ratio = intraPageRatio(src, idx);
      const dstPs = pages(dst);
      if (dstPs[idx]) {
        dst.scrollTop = dstPs[idx].offsetTop + ratio * (dstPs[idx].offsetHeight || 0);
      }
      requestAnimationFrame(() => { syncing = false; });
    }

    viEl.addEventListener('scroll', () => syncTo(viEl, enEl), { passive: true });
    enEl.addEventListener('scroll', () => syncTo(enEl, viEl), { passive: true });
  }

  return { open, close };
})();
