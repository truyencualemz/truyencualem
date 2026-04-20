/* ── TEXT-READER.JS ───────────────────────────────────────
   Đọc truyện chữ: tối đa 3 ngôn ngữ song song.
   selLangs    → cột đọc (pill bar, như cũ)
   tooltipLangs → ngôn ngữ hiện trong tooltip (dropdown riêng)
──────────────────────────────────────────────────────────── */
window.TextReader = (() => {
  let chapData     = null;
  let chapMeta     = null;
  let comicData    = null;
  let chapIdx      = 0;
  let selLangs     = [];  // cột đọc song song (tối đa 3)
  let tooltipLangs = [];  // ngôn ngữ hiện trong tooltip
  const tip = () => document.getElementById('anno-tooltip');

  /* ── Open ── */
  async function open(comicId, idx) {
    comicData = App.comics.find(c => c.id === comicId);
    chapIdx   = idx;
    chapMeta  = comicData?.chapters?.[idx];
    if (!chapMeta) return;

    UI.showLoading('Đang tải...');
    chapData = await DB.getTextChap(chapMeta.id);
    UI.hideLoading();
    if (!chapData) { alert('Không tìm thấy nội dung chương'); return; }

    const langs = chapData.languages || [];
    selLangs     = langs.slice(0, 2);   // mặc định 2 cột
    tooltipLangs = langs.slice();        // mặc định tooltip hiện tất cả

    const rd = document.getElementById('reader');
    rd.innerHTML = ''; rd.style.display = 'flex'; rd.style.flexDirection = 'column';
    render();
  }

  function close() {
    document.getElementById('reader').style.display = 'none';
    document.getElementById('reader').innerHTML = '';
    hideTooltip();
  }

  /* ── Tooltip ──────────────────────────────────────────── */
  function showTooltip(e, allTips, srcLang) {
    const el = tip(); if (!el) return;
    el.innerHTML = '';

    // Filter: chỉ hiện ngôn ngữ trong tooltipLangs, bỏ ngôn ngữ nguồn
    const visible = tooltipLangs.filter(l => l !== srcLang && allTips[l]);
    if (!visible.length) return;

    const src = document.createElement('div'); src.className = 'anno-tooltip-src';
    src.textContent = Translate.getLangLabel(srcLang);
    el.appendChild(src);

    visible.forEach(lang => {
      const row = document.createElement('div'); row.className = 'anno-tooltip-row';
      const lbl = document.createElement('div'); lbl.className = 'anno-tooltip-lang';
      lbl.textContent = Translate.getLangLabel(lang);
      const val = document.createElement('div'); val.className = 'anno-tooltip-text';
      val.textContent = allTips[lang];
      row.appendChild(lbl); row.appendChild(val); el.appendChild(row);
    });

    const x = Math.min(e.clientX + 14, window.innerWidth  - 280);
    const y = Math.min(e.clientY + 14, window.innerHeight - 130);
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.display = 'block';
  }

  function hideTooltip() { const el = tip(); if (el) el.style.display = 'none'; }

  /* ── Render ── */
  function render() {
    const rd = document.getElementById('reader'); rd.innerHTML = '';

    /* Top bar */
    const bar = UI.div('rbar');
    bar.appendChild(UI.mkBtn('btn-ghost btn-sm', '← Đóng', close));
    const rt = UI.div('rtitle');
    rt.textContent = `${comicData.titleVI} · Ch.${chapMeta.num}: ${chapMeta.title || ''}`;
    bar.appendChild(rt);

    const zw = UI.div('zoom-wrap');
    const zlbl = UI.div('zoom-label'); zlbl.textContent = 'Chữ:';
    const sld = UI.el('input'); sld.type='range'; sld.className='zoom-slider';
    sld.min=12; sld.max=22; sld.step=1; sld.value=15;
    sld.style.setProperty('--p','20%');
    const zv = UI.div('zoom-val'); zv.textContent='15px';
    sld.addEventListener('input', () => {
      const v = +sld.value;
      sld.style.setProperty('--p', ((v-12)/10*100)+'%');
      zv.textContent = v+'px';
      document.querySelectorAll('#reader .tseg-content').forEach(e => e.style.fontSize = v+'px');
    });
    [zlbl, sld, zv].forEach(e => zw.appendChild(e)); bar.appendChild(zw);
    rd.appendChild(bar);

    /* Chapter nav */
    const chaps = comicData.chapters || [];
    const nav = UI.div('rnav');
    const pb = UI.mkBtn('btn-ghost btn-sm', '← Trước', async () => {
      if (chapIdx > 0) { chapIdx--; const m = chaps[chapIdx]; if (m?.type==='text') await open(comicData.id, chapIdx); }
    }); pb.disabled = chapIdx === 0;
    const ni = UI.div('rni'); ni.textContent = `Ch ${chapIdx+1} / ${chaps.length}`;
    const nb = UI.mkBtn('btn-ghost btn-sm', 'Sau →', async () => {
      if (chapIdx < chaps.length-1) { chapIdx++; const m = chaps[chapIdx]; if (m?.type==='text') await open(comicData.id, chapIdx); }
    }); nb.disabled = chapIdx >= chaps.length-1;
    [pb, ni, nb].forEach(x => nav.appendChild(x));
    rd.appendChild(nav);

    rd.appendChild(buildLangBar());

    const body = UI.div(); body.style.cssText='flex:1;overflow:hidden;display:flex;flex-direction:column';
    body.appendChild(buildColumns());
    rd.appendChild(body);
  }

  /* ── Lang bar ──────────────────────────────────────────
     Trái: pill chọn cột (như cũ, giữ nguyên UX)
     Phải: dropdown chọn ngôn ngữ tooltip
  ──────────────────────────────────────────────────────── */
  function buildLangBar() {
    const allLangs = chapData.languages || [];
    const bar = UI.div('tbar-langs');

    /* Phần 1: Cột đọc — pill bar giống cũ */
    const colLbl = UI.div();
    colLbl.style.cssText = 'font-size:10px;color:#555;white-space:nowrap;flex-shrink:0';
    colLbl.textContent = 'Cột đọc:';
    bar.appendChild(colLbl);

    allLangs.forEach(lang => {
      const pill = UI.el('label', 'lang-pill');
      const cb   = UI.el('input'); cb.type='checkbox'; cb.value=lang; cb.style.accentColor='#c8a96e';
      cb.checked = selLangs.includes(lang);
      cb.addEventListener('change', () => {
        if (cb.checked) {
          if (selLangs.length >= 3) { cb.checked=false; return; }
          if (!selLangs.includes(lang)) selLangs.push(lang);
        } else {
          if (selLangs.length <= 1) { cb.checked=true; return; }
          selLangs = selLangs.filter(l => l !== lang);
        }
        document.getElementById('text-cols')?.replaceWith(buildColumns());
      });
      const meta = Translate.getLangMeta(lang);
      pill.appendChild(cb);
      pill.appendChild(document.createTextNode(' ' + meta.flag + ' ' + meta.label));
      bar.appendChild(pill);
    });

    /* Divider */
    const sep = UI.div();
    sep.style.cssText = 'width:1px;height:16px;background:#2a2a30;margin:0 8px;flex-shrink:0';
    bar.appendChild(sep);

    /* Phần 2: Tooltip ngôn ngữ — dropdown */
    const tipLbl = UI.div();
    tipLbl.style.cssText = 'font-size:10px;color:#555;white-space:nowrap;flex-shrink:0';
    tipLbl.textContent = 'Tooltip:';
    bar.appendChild(tipLbl);

    bar.appendChild(buildTooltipDropdown(allLangs));
    return bar;
  }

  /* Dropdown chỉ ảnh hưởng tooltipLangs — không rebuild cột */
  function buildTooltipDropdown(allLangs) {
    const dw = UI.div(); dw.style.cssText = 'position:relative;display:inline-block;flex-shrink:0';

    const trigger = UI.el('button', 'btn btn-ghost btn-xs');
    trigger.style.cssText = 'min-width:130px;justify-content:space-between;gap:6px;font-size:11px';

    function refreshTrigger() {
      trigger.innerHTML = '';
      const txt = document.createElement('span');
      txt.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px';
      if (tooltipLangs.length === 0)
        txt.textContent = '— ẩn —';
      else if (tooltipLangs.length === allLangs.length)
        txt.textContent = 'Tất cả (' + allLangs.length + ')';
      else
        txt.textContent = tooltipLangs.map(l => Translate.getLangMeta(l).flag).join(' ');
      const arr = document.createElement('span');
      arr.textContent = '▾'; arr.style.cssText = 'color:#555;flex-shrink:0';
      trigger.appendChild(txt); trigger.appendChild(arr);
    }
    refreshTrigger();

    /* Panel dùng position:fixed để thoát khỏi overflow:auto của tbar-langs */
    const panel = UI.div();
    panel.style.cssText = [
      'display:none;position:fixed;z-index:1000',
      'background:#1a1a1e;border:1px solid #3a3a44;border-radius:8px;padding:8px',
      'min-width:190px;box-shadow:0 8px 24px rgba(0,0,0,.7)',
    ].join('');
    document.body.appendChild(panel); // gắn vào body, không phải dw

    function positionPanel() {
      const r = trigger.getBoundingClientRect();
      // Hiện phía dưới trigger, căn trái
      let left = r.left;
      let top  = r.bottom + 5;
      // Tránh vượt right edge
      const panelW = 190;
      if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
      panel.style.left = left + 'px';
      panel.style.top  = top  + 'px';
    }

    const phint = document.createElement('div');
    phint.style.cssText = 'font-size:10px;color:#555;margin-bottom:8px;padding:0 2px';
    phint.textContent = 'Ngôn ngữ hiện trong tooltip khi hover từ'; panel.appendChild(phint);

    /* Nút Tất cả */
    const allRow = UI.el('label');
    allRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:5px;cursor:pointer;font-size:11px;color:#888;user-select:none;border-bottom:1px solid #2a2a30;margin-bottom:4px;padding-bottom:9px';
    allRow.addEventListener('mouseenter', () => allRow.style.background='#222226');
    allRow.addEventListener('mouseleave', () => allRow.style.background='');
    const allCb = UI.el('input'); allCb.type='checkbox'; allCb.style.accentColor='#c8a96e';
    allCb.checked = tooltipLangs.length === allLangs.length;
    const indivCbs = [];

    allCb.addEventListener('change', () => {
      tooltipLangs = allCb.checked ? allLangs.slice() : [];
      indivCbs.forEach(c => { c.checked = allCb.checked; });
      refreshTrigger();
    });
    allRow.appendChild(allCb);
    allRow.appendChild(document.createTextNode('  ✓ Tất cả ngôn ngữ'));
    panel.appendChild(allRow);

    /* Từng ngôn ngữ */
    allLangs.forEach(lang => {
      const row = UI.el('label');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:5px;cursor:pointer;font-size:12px;user-select:none';
      row.addEventListener('mouseenter', () => row.style.background='#222226');
      row.addEventListener('mouseleave', () => row.style.background='');
      const cb = UI.el('input'); cb.type='checkbox'; cb.style.accentColor='#c8a96e';
      cb.checked = tooltipLangs.includes(lang);
      indivCbs.push(cb);
      const meta = Translate.getLangMeta(lang);
      const flag = document.createElement('span'); flag.textContent = meta.flag; flag.style.fontSize='15px';
      const name = document.createElement('span'); name.textContent = meta.label; name.style.color='#ccc';

      cb.addEventListener('change', () => {
        if (cb.checked) { if (!tooltipLangs.includes(lang)) tooltipLangs.push(lang); }
        else             { tooltipLangs = tooltipLangs.filter(l => l !== lang); }
        allCb.checked = tooltipLangs.length === allLangs.length;
        allCb.indeterminate = tooltipLangs.length > 0 && tooltipLangs.length < allLangs.length;
        refreshTrigger();
      });
      [cb, flag, name].forEach(e => row.appendChild(e));
      panel.appendChild(row);
    });

    const note = document.createElement('div');
    note.style.cssText = 'font-size:9px;color:#3a3a44;margin-top:8px;padding:5px 6px;border-top:1px solid #2a2a30;line-height:1.5';
    note.textContent = 'Thay đổi có hiệu lực ngay.';
    panel.appendChild(note);

    /* Toggle — dùng fixed positioning */
    let isOpen = false;
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      isOpen = !isOpen;
      if (isOpen) { positionPanel(); panel.style.display = 'block'; }
      else          panel.style.display = 'none';
    });
    // Cleanup panel khi reader đóng
    const onOutside = (e) => {
      // Chỉ đóng khi click ra ngoài cả trigger lẫn panel
      if (panel.contains(e.target) || trigger.contains(e.target)) return;
      isOpen = false; panel.style.display = 'none';
    };
    const cleanup = () => { panel.remove(); document.removeEventListener('click', onOutside); };
    document.addEventListener('click', onOutside);

    // Khi reader re-render, panel cũ vẫn còn trong body → cleanup khi trigger bị remove
    const observer = new MutationObserver(() => {
      if (!document.contains(trigger)) { cleanup(); observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    dw.appendChild(trigger);
    return dw;
  }

  /* ── Columns ── */
  function buildColumns() {
    const n = Math.max(1, selLangs.length);
    const wrap = UI.div(); wrap.id='text-cols';
    wrap.style.cssText = `flex:1;display:grid;grid-template-columns:repeat(${n},1fr);overflow:hidden`;

    const scrollEls = [];
    selLangs.forEach((lang, i) => {
      const col = UI.div('text-col-wrap');
      if (i === n-1) col.style.borderRight='none';
      const hdr = UI.div('text-col-hdr');
      const meta = Translate.getLangMeta(lang);
      hdr.innerHTML = `<span style="font-size:15px">${meta.flag}</span>
<span style="color:#aaa;font-size:11px">${meta.label}</span>`;
      col.appendChild(hdr);
      const scroll = UI.div('text-col'); scroll.dataset.lang=lang;
      renderSegments(scroll, lang);
      scrollEls.push(scroll);
      col.appendChild(scroll); wrap.appendChild(col);
    });

    setTimeout(() => setupScrollSync(scrollEls), 120);
    return wrap;
  }

  /* ── Segments ── */
  function renderSegments(container, lang) {
    const segs = chapData.segments || [];
    // allOtherLangs = tất cả ngôn ngữ khác lang này
    // (tooltip sẽ tự filter theo tooltipLangs tại hover time)
    const allOtherLangs = (chapData.languages || []).filter(l => l !== lang);

    segs.forEach((seg, i) => {
      const wrap = UI.div('tseg'); wrap.dataset.idx=i;
      if (seg.note) {
        const note = UI.div('tseg-note'); note.textContent=seg.note; wrap.appendChild(note);
      }
      const textEl = UI.div('tseg-content');
      const content = seg.content?.[lang];
      if (content) {
        textEl.appendChild(annotateText(content, seg.annotations||[], lang, allOtherLangs));
      } else {
        textEl.style.color='#444';
        textEl.textContent=`[Chưa có bản ${Translate.getLangLabel(lang)}]`;
      }
      wrap.appendChild(textEl); container.appendChild(wrap);
    });
  }

  /* ── Annotate text ── */
  function annotateText(text, annotations, viewLang, allOtherLangs) {
    const frag = document.createDocumentFragment();
    if (!annotations?.length) { frag.appendChild(document.createTextNode(text)); return frag; }

    const ranges = [];
    for (const anno of annotations) {
      const phrase = anno.phrase?.[viewLang]; if (!phrase?.trim()) continue;
      let pos=0;
      while (true) {
        const idx=text.indexOf(phrase,pos); if (idx<0) break;
        ranges.push({start:idx, end:idx+phrase.length, anno}); pos=idx+phrase.length;
      }
    }
    if (!ranges.length) { frag.appendChild(document.createTextNode(text)); return frag; }

    ranges.sort((a,b)=>a.start-b.start);
    const clean=[]; let last=0;
    for (const r of ranges) { if (r.start>=last) { clean.push(r); last=r.end; } }

    let cursor=0;
    for (const r of clean) {
      if (r.start>cursor) frag.appendChild(document.createTextNode(text.slice(cursor,r.start)));
      const span=document.createElement('span'); span.className='anno-phrase';
      span.textContent=text.slice(r.start,r.end);

      // Lưu TẤT CẢ bản dịch — tooltip filter bằng tooltipLangs tại hover time
      const allTips={};
      allOtherLangs.forEach(l=>{ if (r.anno.phrase?.[l]) allTips[l]=r.anno.phrase[l]; });

      span.addEventListener('mouseenter', e=>showTooltip(e,allTips,viewLang));
      span.addEventListener('mouseleave', hideTooltip);
      span.addEventListener('click', e=>{
        e.stopPropagation();
        if (tip()?.style.display==='block') { hideTooltip(); return; }
        showTooltip(e,allTips,viewLang);
      });
      frag.appendChild(span); cursor=r.end;
    }
    if (cursor<text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
    return frag;
  }

  /* ── Scroll sync ── */
  function setupScrollSync(els) {
    if (els.length < 2) return;
    let syncing=false;
    const segs=el=>Array.from(el.querySelectorAll('.tseg'));
    function curIdx(el) {
      const ps=segs(el), top=el.scrollTop; let idx=0;
      for (let i=0;i<ps.length;i++){if(ps[i].offsetTop<=top+4)idx=i;else break;}
      return idx;
    }
    function ratio(el,idx) {
      const ps=segs(el); if(!ps[idx])return 0;
      return Math.max(0,Math.min(1,(el.scrollTop-ps[idx].offsetTop)/(ps[idx].offsetHeight||1)));
    }
    function syncTo(src,dsts) {
      if(syncing)return; syncing=true;
      const idx=curIdx(src),r=ratio(src,idx);
      dsts.forEach(dst=>{
        const ps=segs(dst);
        if(ps[idx]) dst.scrollTop=ps[idx].offsetTop+r*(ps[idx].offsetHeight||0);
      });
      requestAnimationFrame(()=>{syncing=false;});
    }
    els.forEach(el=>el.addEventListener('scroll',()=>syncTo(el,els.filter(e=>e!==el)),{passive:true}));
  }

  // Click outside to hide tooltip — bỏ qua click trong dropdown panel
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('tip-lang-panel');
    if (panel && panel.contains(e.target)) return;
    hideTooltip();
  });
  return { open, close };
})();
