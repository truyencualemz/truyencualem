/* ── ADMIN.JS ─────────────────────────────────────────────
   All admin views: Library, Chapters, Comic form,
   Chapter form, Settings.
──────────────────────────────────────────────────────────── */
window.Admin = (() => {
  const U  = () => window.UI;
  const go = (...a) => App.go(...a);
  const fmtBytes = b => b < 1024**2 ? (b/1024).toFixed(0)+'KB' : b < 1024**3 ? (b/1024**2).toFixed(1)+'MB' : (b/1024**3).toFixed(1)+'GB';

  /* ════ LIBRARY ════════════════════════════════════════ */

  // Trạng thái tìm kiếm/lọc — giữ nguyên khi re-render
  const LibState = { q: '', genre: 'all', status: 'all', sort: 'title' };

  const GENRES = [
    ['all','Tất cả thể loại'],
    ['action','Hành động'],
    ['romance','Tình cảm'],
    ['comedy','Hài hước'],
    ['mystery','Trinh thám'],
    ['fantasy','Kỳ ảo'],
  ];

  function filterComics() {
    let list = App.comics.slice();
    // Tìm kiếm
    const q = LibState.q.toLowerCase().trim();
    if (q) list = list.filter(m =>
      m.titleVI?.toLowerCase().includes(q) ||
      m.titleEN?.toLowerCase().includes(q) ||
      m.descVI?.toLowerCase().includes(q)
    );
    // Lọc thể loại
    if (LibState.genre !== 'all') list = list.filter(m => m.genre === LibState.genre);
    // Lọc trạng thái
    if (LibState.status !== 'all') list = list.filter(m => m.status === LibState.status);
    // Sắp xếp
    list.sort((a, b) => {
      if (LibState.sort === 'title')   return (a.titleVI||'').localeCompare(b.titleVI||'');
      if (LibState.sort === 'chapters') return (b.chapters?.length||0) - (a.chapters?.length||0);
      if (LibState.sort === 'order')   return (a._order||0) - (b._order||0);
      return 0;
    });
    return list;
  }

  function viewLibrary() {
    const w = U().div();

    // Stats bar
    const sg = U().div('stats');
    [[App.comics.length,'Tổng truyện'],
     [App.comics.reduce((a,x)=>a+(x.chapters?.length||0),0),'Tổng chương'],
     [App.comics.filter(x=>x.status==='published').length,'Công khai'],
     [new Set(App.comics.flatMap(x=>x.chapters?.flatMap(c=>c.languages||[])||[])).size || 2,'Ngôn ngữ'],
    ].forEach(([v,l]) => {
      sg.innerHTML += `<div class="sc"><div class="sv">${v}</div><div class="sl">${l}</div></div>`;
    });
    w.appendChild(sg);

    // ── Thanh tìm kiếm + bộ lọc ──
    const toolbar = U().div(); toolbar.id = 'lib-toolbar';
    toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px';

    // Search input
    const searchWrap = U().div(); searchWrap.style.cssText = 'position:relative;flex:1;min-width:160px';
    const searchIcon = U().div(); searchIcon.style.cssText = 'position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#555;pointer-events:none;font-size:13px'; searchIcon.textContent = '🔍';
    const searchInp = U().el('input','fi'); searchInp.id='lib-search'; searchInp.placeholder='Tìm tên truyện...'; searchInp.value = LibState.q;
    searchInp.style.cssText = 'padding-left:30px;font-size:12px';
    searchInp.addEventListener('input', () => { LibState.q = searchInp.value; refreshGrid(w); });
    searchWrap.appendChild(searchIcon); searchWrap.appendChild(searchInp);
    toolbar.appendChild(searchWrap);

    // Genre filter
    const genreSel = U().el('select','fi'); genreSel.style.cssText = 'width:auto;font-size:12px;padding:7px 10px';
    GENRES.forEach(([v,l]) => { const o = U().el('option'); o.value=v; o.textContent=l; if(v===LibState.genre)o.selected=true; genreSel.appendChild(o); });
    genreSel.addEventListener('change', () => { LibState.genre = genreSel.value; refreshGrid(w); });
    toolbar.appendChild(genreSel);

    // Status filter
    const statusSel = U().el('select','fi'); statusSel.style.cssText = 'width:auto;font-size:12px;padding:7px 10px';
    [['all','Tất cả'],['published','Công khai'],['draft','Nháp']].forEach(([v,l]) => {
      const o = U().el('option'); o.value=v; o.textContent=l; if(v===LibState.status)o.selected=true; statusSel.appendChild(o);
    });
    statusSel.addEventListener('change', () => { LibState.status = statusSel.value; refreshGrid(w); });
    toolbar.appendChild(statusSel);

    // Sort
    const sortSel = U().el('select','fi'); sortSel.style.cssText = 'width:auto;font-size:12px;padding:7px 10px';
    [['title','Sắp xếp: Tên'],['chapters','Sắp xếp: Nhiều chương'],['order','Sắp xếp: Mặc định']].forEach(([v,l]) => {
      const o = U().el('option'); o.value=v; o.textContent=l; if(v===LibState.sort)o.selected=true; sortSel.appendChild(o);
    });
    sortSel.addEventListener('change', () => { LibState.sort = sortSel.value; refreshGrid(w); });
    toolbar.appendChild(sortSel);

    // Clear filters button (chỉ hiện khi có filter)
    if (LibState.q || LibState.genre !== 'all' || LibState.status !== 'all') {
      const clearBtn = U().mkBtn('btn-ghost btn-xs','✕ Xóa bộ lọc', () => {
        LibState.q=''; LibState.genre='all'; LibState.status='all';
        UI.renderContent();
      });
      toolbar.appendChild(clearBtn);
    }
    w.appendChild(toolbar);

    // Grid container — rebuilt by refreshGrid
    const gridWrap = U().div(); gridWrap.id = 'lib-grid'; w.appendChild(gridWrap);
    buildGrid(gridWrap);
    return w;
  }

  function refreshGrid(w) {
    const old = document.getElementById('lib-grid');
    if (!old) return;
    const newWrap = U().div(); newWrap.id = 'lib-grid';
    buildGrid(newWrap);
    old.replaceWith(newWrap);

    // Update clear button visibility
    const toolbar = document.getElementById('lib-toolbar');
    if (toolbar) {
      const existing = toolbar.querySelector('.clear-btn');
      if (existing) existing.remove();
      if (LibState.q || LibState.genre !== 'all' || LibState.status !== 'all') {
        const clearBtn = U().mkBtn('btn-ghost btn-xs clear-btn','✕ Xóa bộ lọc',() => {
          LibState.q=''; LibState.genre='all'; LibState.status='all';
          const si = document.getElementById('lib-search'); if(si) si.value='';
          refreshGrid(null);
          // also update dropdowns
          toolbar.querySelectorAll('select').forEach(s => {
            if(s===toolbar.querySelectorAll('select')[0]) s.value='all';
            if(s===toolbar.querySelectorAll('select')[1]) s.value='all';
          });
        });
        toolbar.appendChild(clearBtn);
      }
    }
  }

  function buildGrid(container) {
    const list = filterComics();
    const resultInfo = U().div(); resultInfo.style.cssText = 'font-size:11px;color:#555;margin-bottom:10px';
    const total = App.comics.length;
    if (LibState.q || LibState.genre !== 'all' || LibState.status !== 'all') {
      resultInfo.textContent = `${list.length} / ${total} truyện`;
    } else {
      resultInfo.textContent = `${total} truyện`;
    }
    container.appendChild(resultInfo);

    if (!list.length) {
      const empty = U().div(); empty.style.cssText = 'text-align:center;padding:48px 20px;color:#555;font-size:13px';
      empty.innerHTML = LibState.q
        ? `Không tìm thấy truyện nào với từ khóa "<b style="color:#888">${U().esc(LibState.q)}</b>"`
        : 'Không có truyện nào khớp bộ lọc.';
      container.appendChild(empty);
    }

    const grid = U().div('cg');
    list.forEach(m => {
      const card = U().div('cc');
      const chapCount = m.chapters?.length || 0;
      const textChaps = m.chapters?.filter(c=>c.type==='text').length || 0;
      const genreLabel = GENRES.find(g=>g[0]===m.genre)?.[1] || m.genre || '';
      const isDraft = m.status === 'draft';
      const titleVI = LibState.q
        ? U().esc(m.titleVI).replace(new RegExp(`(${U().esc(LibState.q)})`, 'gi'), '<mark style="background:#c8a96e33;color:#c8a96e;border-radius:2px">$1</mark>')
        : U().esc(m.titleVI);

      // Thumbnail
      const thumb = U().div('ct');
      if (isDraft) thumb.style.opacity = '0.5';
      thumb.innerHTML = m.cover
        ? `<img src="${m.cover}" alt="" loading="lazy">`
        : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="1.2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;

      // Info
      const info = U().div('ci');
      info.innerHTML = `<div class="cvi">${titleVI}</div>
<div class="cen">${U().esc(m.titleEN)||'—'}</div>
<div class="cm">
  <span class="badge ${isDraft?'bdr':'bok'}">${isDraft?'Nháp':'Công khai'}</span>
  ${genreLabel?`<span class="badge" style="background:#1e1e24;color:#777;border:1px solid #2a2a30">${genreLabel}</span>`:''}
  <span>${chapCount} ch${textChaps>0?` · ${textChaps} chữ`:''}</span>
</div>`;

      // Action bar (hiện khi hover)
      const acts = U().div(); acts.style.cssText = 'display:flex;gap:4px;padding:6px 8px;background:#111;border-top:1px solid #2a2a30;flex-shrink:0';

      // Nút ẩn/hiện
      const toggleBtn = U().el('button'); toggleBtn.style.cssText = 'flex:1;padding:4px 0;font-size:10px;border-radius:4px;border:1px solid #2a2a30;cursor:pointer;font-family:monospace;background:transparent;transition:all .12s;color:#888';
      toggleBtn.textContent = isDraft ? '👁 Công khai' : '🙈 Ẩn';
      toggleBtn.addEventListener('click', async e => {
        e.stopPropagation();
        toggleBtn.disabled = true;
        try {
          const newStatus = isDraft ? 'published' : 'draft';
          await DB.toggleComicStatus(m.id, newStatus);
          // Rebuild grid
          const gw = document.getElementById('lib-grid');
          if (gw) { const ng = U().div(); ng.id='lib-grid'; buildGrid(ng); gw.replaceWith(ng); }
        } catch(err) { alert('Lỗi: ' + err.message); toggleBtn.disabled = false; }
      });

      // Nút xóa
      const delBtn = U().el('button'); delBtn.style.cssText = 'padding:4px 8px;font-size:10px;border-radius:4px;border:1px solid #3a2020;cursor:pointer;font-family:monospace;background:transparent;color:#e05555;transition:all .12s';
      delBtn.textContent = '🗑';
      delBtn.title = 'Xóa truyện';
      delBtn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(`Xóa truyện "${m.titleVI}"?\n\nSẽ xóa tất cả chương, lịch sử đọc và bookmark của truyện này. Không thể hoàn tác.`)) return;
        delBtn.disabled = true; delBtn.textContent = '...';
        try {
          // Xóa text chapters trước
          for (const ch of (m.chapters||[]).filter(c=>c.type==='text')) {
            await DB.deleteTextChap(ch.id);
          }
          await DB.deleteComic(m.id);
          // Nếu đang xem chapters của truyện này → về library
          if (App.selComicId === m.id) App.selComicId = App.comics[0]?.id || null;
          UI.renderContent(); UI.renderNav();
        } catch(err) { alert('Lỗi xóa: ' + err.message); delBtn.disabled = false; delBtn.textContent = '🗑'; }
      });

      acts.appendChild(toggleBtn); acts.appendChild(delBtn);

      card.style.cssText += ';display:flex;flex-direction:column;cursor:pointer';
      card.appendChild(thumb); card.appendChild(info); card.appendChild(acts);
      card.addEventListener('click', () => go('chapters', { selComicId: m.id }));
      grid.appendChild(card);
    });

    // Add new button
    const ac = U().div('add-cc');
    ac.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg><span>Thêm truyện</span>`;
    ac.addEventListener('click', () => { App.coverData = null; go('add-comic'); });
    grid.appendChild(ac);
    container.appendChild(grid);
  }

  /* ════ ADD / EDIT COMIC ═══════════════════════════════ */
  function viewAddComic() {
    const w = U().div(); w.style.maxWidth = '820px';
    if (Object.keys(App.errors).length) {
      const eb = U().div('ebanner'); eb.textContent = '⚠ ' + Object.values(App.errors).join(' · '); w.appendChild(eb);
    }
    const card = U().div('fc'); card.innerHTML = '<div class="fct">📖 Thông tin truyện</div>';

    // Cover row
    const cr = U().div(); cr.style.cssText = 'display:flex;gap:14px;align-items:flex-start;margin-bottom:14px';
    const pv = U().div(); pv.style.flexShrink = '0';
    pv.innerHTML = `<div id="cprev" style="width:80px;height:120px;background:#111;border-radius:7px;border:1px dashed #2a2a30;display:flex;align-items:center;justify-content:center;font-size:24px;color:#333">📖</div>
<img id="cimg" style="display:none;width:80px;height:120px;object-fit:cover;border-radius:7px;border:1px solid #2a2a30" src="" alt="">`;
    const rs = U().div(); rs.style.flex = '1';
    const uz = U().div('uz');
    uz.innerHTML = `<input type="file" id="cf" accept="image/*"><div class="uzi">🖼️</div><div class="uzt">Click chọn ảnh bìa</div><div class="uzh">JPG PNG WebP</div>`;
    uz.querySelector('input').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader(); r.onload = ev => { App.coverData = ev.target.result; showCover(App.coverData); }; r.readAsDataURL(f);
    });
    const ui = U().el('input', 'fi'); ui.style.cssText = 'margin-top:7px;font-size:11px;padding:6px 9px'; ui.placeholder = 'Hoặc URL ảnh bìa';
    ui.addEventListener('change', () => { if (ui.value.trim()) { App.coverData = ui.value.trim(); showCover(App.coverData); } });
    rs.appendChild(uz); rs.appendChild(ui); cr.appendChild(pv); cr.appendChild(rs); card.appendChild(cr);

    const r1 = U().div('fr');
    [{ id: 'fvi', lbl: '🇻🇳 Tên truyện (VI) *', ph: 'VD: Thám Tử Conan', ek: 'titleVI' },
     { id: 'fen', lbl: '🇬🇧 Title (EN)', ph: 'e.g. Detective Conan' }].forEach(f => {
      const fg = U().div('fg'); fg.innerHTML = `<label class="fl">${f.lbl}</label>`;
      const inp = U().el('input', 'fi' + (App.errors[f.ek] ? ' err' : '')); inp.id = f.id; inp.placeholder = f.ph;
      fg.appendChild(inp);
      if (App.errors[f.ek]) { const em = U().div('emsg'); em.textContent = '⚠ ' + App.errors[f.ek]; fg.appendChild(em); }
      r1.appendChild(fg);
    });
    card.appendChild(r1);

    const r2 = U().div('fr');
    [{ id: 'fdvi', lbl: 'Mô tả (VI)', ph: 'Mô tả...' }, { id: 'fden', lbl: 'Description (EN)', ph: 'Description...' }].forEach(f => {
      const fg = U().div('fg'); fg.innerHTML = `<label class="fl">${f.lbl}</label>`;
      const ta = U().el('textarea', 'fi'); ta.id = f.id; ta.placeholder = f.ph; ta.rows = 2; fg.appendChild(ta); r2.appendChild(fg);
    });
    card.appendChild(r2);

    const r3 = U().div('fr');
    r3.innerHTML = `<div class="fg"><label class="fl">Thể loại</label><select class="fi" id="fgenre"><option value="action">Hành động</option><option value="romance">Tình cảm</option><option value="comedy">Hài hước</option><option value="mystery">Trinh thám</option><option value="fantasy">Kỳ ảo</option></select></div>
<div class="fg"><label class="fl">Trạng thái</label><select class="fi" id="fstatus"><option value="published">Công khai</option><option value="draft">Nháp</option></select></div>`;
    card.appendChild(r3); w.appendChild(card);

    const sb = U().mkBtn('btn-primary', '✓ Lưu truyện', saveComic); sb.style.cssText = 'font-size:13px;padding:10px 24px';
    w.appendChild(sb);
    if (App.coverData) setTimeout(() => showCover(App.coverData), 20);
    return w;
  }

  function showCover(src) {
    const img = document.getElementById('cimg'), ph = document.getElementById('cprev');
    if (img && ph) { img.src = src; img.style.display = 'block'; ph.style.display = 'none'; }
  }

  async function saveComic() {
    if (App.isSaving) return; App.isSaving = true; setTimeout(() => { App.isSaving = false; }, 1500);
    const errs = {}, vi = (document.getElementById('fvi')?.value || '').trim();
    if (!vi) errs.titleVI = 'Tên truyện không được để trống';
    if (Object.keys(errs).length) { App.errors = errs; App.isSaving = false; UI.renderContent(); return; }
    UI.showLoading('Đang lưu...');
    App.comics.push({ id: 'c' + Date.now(), titleVI: vi, titleEN: (document.getElementById('fen')?.value || '').trim(),
      descVI: document.getElementById('fdvi')?.value || '', descEN: document.getElementById('fden')?.value || '',
      genre: document.getElementById('fgenre')?.value || 'action', status: document.getElementById('fstatus')?.value || 'published',
      cover: App.coverData || null, chapters: [] });
    await DB.saveMeta(); UI.hideLoading(); App.coverData = null; App.errors = {}; go('library');
  }

  /* ════ CHAPTERS ═══════════════════════════════════════ */
  function viewChapters() {
    if (!App.comics.length) { const d=U().div(); d.innerHTML='<div style="text-align:center;padding:60px;color:#555;font-size:13px">Chưa có truyện nào.</div>'; return d; }
    const comic=App.getComic(); if (!comic) { App.selComicId=App.comics[0].id; return viewChapters(); }
    const w=U().div();
    const hdr=U().div(); hdr.style.cssText='display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:16px';
    const hl=U().div(); hl.innerHTML=`<div style="font-family:monospace;font-size:16px">${U().esc(comic.titleVI)}</div><div style="font-size:11px;color:#555;margin-top:2px">${U().esc(comic.titleEN)||''}</div>`;
    const addBtns=U().div(); addBtns.style.cssText='display:flex;gap:6px';
    addBtns.appendChild(U().mkBtn('btn-primary','+ Truyện tranh',()=>go('add-chapter',{clearPages:true})));
    addBtns.appendChild(U().mkBtn('btn-ghost','+ Truyện chữ',()=>TextEditor.openNew()));
    hdr.appendChild(hl); hdr.appendChild(addBtns); w.appendChild(hdr);

    const tabs=U().div('tabs');
    App.comics.forEach(m=>{const t=U().div('tab'+(m.id===comic.id?' active':''));t.textContent=m.titleVI||'?';t.addEventListener('click',()=>{App.selComicId=m.id;UI.renderContent();UI.renderNav();});tabs.appendChild(t);});
    w.appendChild(tabs);

    const chaps=comic.chapters||[];
    if(!chaps.length){const d=U().div();d.innerHTML='<div style="text-align:center;padding:40px;color:#555;font-size:12px">Chưa có chương nào.</div>';w.appendChild(d);return w;}

    chaps.forEach((ch,idx)=>{
      const isText=ch.type==='text';
      const item=U().div('chi');
      const num=U().div('chn'); num.textContent='Ch.'+ch.num;
      const info=U().div('chinfo');

      if(isText){
        const langs=(ch.languages||[]).map(l=>Translate.getLangLabel(l)).join(', ');
        info.innerHTML=`<div class="cht">📝 ${U().esc(ch.title||'Chương '+ch.num)}</div>
<div class="chs"><span style="color:#c8a96e">Truyện chữ</span><span>${langs}</span></div>`;
        const acts=U().div('cha');
        acts.appendChild(U().mkBtn('btn-ghost btn-sm','📖 Đọc',()=>TextReader.open(comic.id,idx)));
        acts.appendChild(U().mkBtn('btn-ghost btn-sm','✏ Sửa',()=>TextEditor.openEdit(comic.id,ch.id)));
        acts.appendChild(U().mkBtn('btn-danger btn-sm','Xóa',async()=>{
          if(!confirm('Xóa chương này?'))return; UI.showLoading('Đang xóa...');
          await DB.deleteTextChap(ch.id);
          comic.chapters=comic.chapters.filter(c=>c.id!==ch.id);
          await DB.saveMeta(); UI.hideLoading(); UI.renderContent();
        }));
        item.appendChild(num); item.appendChild(info); item.appendChild(acts);
      } else {
        const viC=(ch.pages||[]).filter(p=>p.vi).length, enC=(ch.pages||[]).filter(p=>p.en).length;
        const mis=(ch.pages||[]).filter(p=>!!p.vi!==!!p.en).length;
        info.innerHTML=`<div class="cht">🖼 ${U().esc(ch.title||'Chương '+ch.num)}</div>
<div class="chs"><span>${ch.pages?.length||0} trang</span><span class="lt lvi">VI ${viC}</span><span class="lt len">EN ${enC}</span>${mis>0?`<span style="color:#e0a030">⚠ ${mis} lệch</span>`:`<span style="color:#4caf50">✓ khớp</span>`}</div>`;
        const acts=U().div('cha');
        acts.appendChild(U().mkBtn('btn-ghost btn-sm','🇻🇳 VI',()=>Reader.open(comic.id,idx,'single','vi')));
        acts.appendChild(U().mkBtn('btn-ghost btn-sm','🇬🇧 EN',()=>Reader.open(comic.id,idx,'single','en')));
        acts.appendChild(U().mkBtn('btn-ghost btn-sm','⧉ Song song',()=>Reader.open(comic.id,idx,'split','vi')));
        acts.appendChild(U().mkBtn('btn-ghost btn-sm','✏ Sửa',()=>openEditChapter(comic.id,ch.id)));
        acts.appendChild(U().mkBtn('btn-danger btn-sm','Xóa',async()=>{
          if(!confirm('Xóa chương này?'))return; UI.showLoading('Đang xóa...');
          DB.revokeChap(ch.id); PDFModule.invalidateChap(ch.id);
          await DB.deleteByChap(ch.id);
          comic.chapters=comic.chapters.filter(c=>c.id!==ch.id);
          await DB.saveMeta(); UI.hideLoading(); UI.renderContent();
        }));
        item.appendChild(num); item.appendChild(info); item.appendChild(acts);
      }
      w.appendChild(item);
    });
    return w;
  }

  /* ════ ADD CHAPTER ════════════════════════════════════ */
  function viewAddChapter() {
    const w = U().div(); w.style.maxWidth = '900px';
    if (Object.keys(App.errors).length) { const eb = U().div('ebanner'); eb.textContent = '⚠ ' + Object.values(App.errors).join(' · '); w.appendChild(eb); }
    const ic = U().div('fc'); ic.innerHTML = '<div class="fct">📑 Thông tin chương</div>';
    ic.innerHTML += `<div class="fr"><div class="fg"><label class="fl">Số chương *</label><input class="fi${App.errors.chapNum ? ' err' : ''}" id="ichnum" type="number" min="1" placeholder="VD: 1">${App.errors.chapNum ? `<div class="emsg">⚠ ${App.errors.chapNum}</div>` : ''}</div>
<div class="fg"><label class="fl">Tiêu đề chương</label><input class="fi" id="ichtitle" placeholder="VD: Vụ án đầu tiên"></div></div>`;
    w.appendChild(ic);
    w.appendChild(AdminForm.buildSourceCard());
    w.appendChild(AdminForm.buildPagesCard());
    const sb = U().mkBtn('btn-primary', '✓ Lưu chương', saveChapter); sb.style.cssText = 'font-size:13px;padding:10px 24px;margin-bottom:40px';
    w.appendChild(sb); return w;
  }

  async function saveChapter() {
    if (App.isSaving) return; App.isSaving = true;
    const errs = {}, num = parseInt(document.getElementById('ichnum')?.value || '');
    if (!num || isNaN(num)) errs.chapNum = 'Số chương không được để trống';
    if (!App.pendingPages.length) errs.pages = 'Chưa có trang nào';
    if (Object.keys(errs).length) { App.errors = errs; App.isSaving = false; UI.renderContent(); return; }
    const comicIdx = App.comics.findIndex(c => c.id === App.selComicId);
    if (comicIdx < 0 && !App.comics.length) { alert('Không tìm thấy truyện'); App.isSaving = false; return; }
    const cidx = comicIdx >= 0 ? comicIdx : 0;
    const chapId = 'ch' + Date.now(), title = document.getElementById('ichtitle')?.value || 'Chương ' + num;
    UI.showLoading('Đang lưu...');
    const pagesMeta = await AdminForm.persistPages(App.comics[cidx].id, chapId);
    if (!App.comics[cidx].chapters) App.comics[cidx].chapters = [];
    App.comics[cidx].chapters.push({ id: chapId, num, title, pages: pagesMeta });
    App.comics[cidx].chapters.sort((a, b) => a.num - b.num);
    await DB.saveMeta(); UI.hideLoading(); App.pendingPages = []; App.errors = {}; App.isSaving = false; go('chapters');
  }

  /* ════ EDIT CHAPTER ═══════════════════════════════════ */
  function openEditChapter(comicId, chapId) {
    App.selComicId = comicId;
    const chap = App.comics.find(c => c.id === comicId)?.chapters?.find(c => c.id === chapId);
    if (!chap) return;
    App.pendingPages = chap.pages.map(p => ({
      id: p.id, note: p.note || '',
      vi: p.vi ? { ...p.vi, previewURL: p.vi.url || null } : null,
      en: p.en ? { ...p.en, previewURL: p.en.url || null } : null,
    }));
    go('edit-chapter', { editingChapId: chapId });
    setTimeout(() => loadExistingPreviews(chapId), 80);
  }

  async function loadExistingPreviews(chapId) {
    for (const p of App.pendingPages) for (const lang of ['vi', 'en']) {
      const d = p[lang];
      if (d?.idb && !d.previewURL) { const url = await DB.getBlobURL(chapId, p.id, lang); if (url) d.previewURL = url; }
    }
    AdminForm.refreshTable();
  }

  function viewEditChapter() {
    const w = U().div(); w.style.maxWidth = '900px';
    const comic = App.getComic(), chap = comic?.chapters?.find(c => c.id === App.editingChapId);
    if (!chap) { w.innerHTML = '<div style="color:#555">Không tìm thấy chương</div>'; return w; }
    if (Object.keys(App.errors).length) { const eb = U().div('ebanner'); eb.textContent = '⚠ ' + Object.values(App.errors).join(' · '); w.appendChild(eb); }

    const ic = U().div('fc'); ic.innerHTML = '<div class="fct">📑 Thông tin chương</div>';
    const ir = U().div('fr');
    const n0 = U().el('input', 'fi'); n0.id = 'ichnum'; n0.type = 'number'; n0.min = '1'; n0.value = chap.num;
    const t0 = U().el('input', 'fi'); t0.id = 'ichtitle'; t0.value = chap.title || '';
    const fg1 = U().div('fg'); fg1.innerHTML = '<label class="fl">Số chương *</label>'; fg1.appendChild(n0);
    const fg2 = U().div('fg'); fg2.innerHTML = '<label class="fl">Tiêu đề chương</label>'; fg2.appendChild(t0);
    ir.appendChild(fg1); ir.appendChild(fg2); ic.appendChild(ir); w.appendChild(ic);

    // Collapsible "add more"
    const addMore = U().div('fc');
    const th2 = U().div(); th2.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer';
    th2.innerHTML = '<div class="fct" style="margin-bottom:0">📂 Thêm trang mới</div>';
    const ch2 = U().div(); ch2.style.cssText = 'font-size:12px;color:#555;transition:transform .2s'; ch2.textContent = '▼';
    th2.appendChild(ch2);
    const body2 = U().div(); body2.style.display = 'none'; body2.style.marginTop = '14px';
    const sc2 = AdminForm.buildSourceCard(); sc2.style.cssText = 'margin:0;background:transparent;padding:0;border:none';
    body2.appendChild(sc2);
    th2.addEventListener('click', () => { const o = body2.style.display !== 'none'; body2.style.display = o ? 'none' : 'block'; ch2.style.transform = o ? '' : 'rotate(180deg)'; });
    addMore.appendChild(th2); addMore.appendChild(body2); w.appendChild(addMore);
    w.appendChild(AdminForm.buildPagesCard());

    const btns = U().div(); btns.style.cssText = 'display:flex;gap:10px;margin-bottom:40px';
    btns.appendChild(U().mkBtn('btn-primary', '✓ Lưu thay đổi', () => saveEditedChapter(chap)));
    btns.appendChild(U().mkBtn('btn-ghost', 'Hủy', () => go('chapters')));
    w.appendChild(btns); return w;
  }

  async function saveEditedChapter(oldChap) {
    if (App.isSaving) return; App.isSaving = true;
    const errs = {}, num = parseInt(document.getElementById('ichnum')?.value || '');
    if (!num || isNaN(num)) errs.chapNum = 'Số chương không được để trống';
    if (Object.keys(errs).length) { App.errors = errs; App.isSaving = false; UI.renderContent(); return; }
    UI.showLoading('Đang lưu...');
    const comic = App.getComic(), cidx = comic.chapters.findIndex(c => c.id === App.editingChapId);
    if (cidx < 0) { UI.hideLoading(); App.isSaving = false; return; }
    const chapId = App.editingChapId, title = document.getElementById('ichtitle')?.value || 'Chương ' + num;
    const pagesMeta = await AdminForm.persistPages(comic.id, chapId);
    const newIds = new Set(pagesMeta.map(p => p.id));
    await AdminForm.deleteRemovedPages(chapId, oldChap.pages, newIds);
    comic.chapters[cidx] = { id: chapId, num, title, pages: pagesMeta };
    comic.chapters.sort((a, b) => a.num - b.num);
    await DB.saveMeta();
    DB.revokeChap(chapId); PDFModule.invalidateChap(chapId);
    UI.hideLoading(); App.pendingPages = []; App.errors = {}; App.isSaving = false; go('chapters');
  }

  /* ════ SETTINGS ═══════════════════════════════════════ */
  async function viewSettings(container) {
    const w = U().div(); w.style.maxWidth = '520px';
    w.innerHTML = '<div style="font-family:monospace;font-size:15px;margin-bottom:16px">Cài đặt hệ thống</div>';

    // Storage usage
    const usage = await DB.getUsage();
    if (usage) {
      const pct = Math.round(usage.usage / usage.quota * 100), color = pct > 80 ? '#e05555' : pct > 50 ? '#e0a030' : '#4caf50';
      const sb = U().div('storage-bar');
      sb.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>
<div class="storage-track"><div class="storage-fill" style="width:${pct}%;background:${color}"></div></div>
<div class="storage-label">${fmtBytes(usage.usage)} / ${fmtBytes(usage.quota)} (${pct}%)</div>`;
      w.appendChild(sb);
    }

    // GDrive Script URL
    const gdCard = U().div('sc'); gdCard.style.marginBottom = '12px';
    gdCard.innerHTML = '<div class="sl" style="margin-bottom:8px">🔗 Google Drive — Apps Script URL</div>';
    const sRow = U().div(); sRow.style.cssText = 'display:flex;gap:6px;align-items:center';
    const sInp = U().el('input', 'fi'); sInp.type = 'text'; sInp.placeholder = 'https://script.google.com/macros/s/.../exec';
    sInp.value = App.gdScriptUrl; sInp.style.cssText = 'flex:1;font-size:11px;padding:7px 10px;font-family:monospace';
    const sSt = U().div(); sSt.style.display = 'none';
    const sSave = U().mkBtn('btn-primary btn-xs', 'Lưu', () => {
      App.gdScriptUrl = sInp.value.trim(); localStorage.setItem('gd_script_url', App.gdScriptUrl);
      sSt.className = 'gd-status ok'; sSt.textContent = '✓ Đã lưu'; sSt.style.display = 'block'; setTimeout(() => sSt.style.display = 'none', 2500);
    });
    const sClear = U().mkBtn('btn-danger btn-xs', 'Xóa', () => {
      App.gdScriptUrl = ''; localStorage.removeItem('gd_script_url'); sInp.value = '';
      sSt.className = 'gd-status ok'; sSt.textContent = 'Đã xóa'; sSt.style.display = 'block'; setTimeout(() => sSt.style.display = 'none', 2000);
    });
    [sInp, sSave, sClear].forEach(e => sRow.appendChild(e));
    const sNote = U().div('apikey-note'); sNote.style.marginTop = '6px';
    sNote.innerHTML = 'Script cần xử lý cả <b>?folderId=</b> (list file) và <b>?fileId=</b> (render PDF). Xem code mẫu trong phần <b>Thêm chương → Import từ Google Drive</b>.';
    gdCard.appendChild(sRow); gdCard.appendChild(sSt); gdCard.appendChild(sNote);

    // ── Lưu trữ dữ liệu ──
    const storeCard = U().div('sc'); storeCard.style.marginBottom = '12px';
    storeCard.innerHTML = '<div class="sl" style="margin-bottom:8px">💾 Lưu trữ dữ liệu</div>';
    const storeInfo = U().div(); storeInfo.style.cssText='font-size:11px;color:#666;line-height:1.8;margin-bottom:10px';
    storeInfo.innerHTML = `Toàn bộ dữ liệu (metadata truyện + trang ảnh + nội dung truyện chữ) được lưu trong
<b style="color:#888">IndexedDB</b> của trình duyệt — không cần server, không upload lên internet.<br>
<span style="color:#555">⚠ Xóa cache/dữ liệu trình duyệt sẽ mất toàn bộ dữ liệu. Dùng Export để backup định kỳ.</span>`;
    storeCard.appendChild(storeInfo);

    // Export / Import buttons
    const ioRow = U().div(); ioRow.style.cssText='display:flex;gap:8px;flex-wrap:wrap';

    // Export JSON toàn bộ metadata + text chapters
    const expBtn = U().mkBtn('btn-ghost btn-xs', '📤 Export JSON', async () => {
      expBtn.disabled=true; expBtn.textContent='Đang xuất...';
      try {
        const textChaps = [];
        for (const comic of App.comics) {
          for (const ch of (comic.chapters||[])) {
            if (ch.type==='text') {
              const data = await DB.getTextChap(ch.id);
              if (data) textChaps.push(data);
            }
          }
        }
        const blob = new Blob([JSON.stringify({
          version: 1,
          exportedAt: new Date().toISOString(),
          comics: App.comics,
          textChaps,
        }, null, 2)], {type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href=url; a.download=`mangadesk-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click(); URL.revokeObjectURL(url);
      } catch(e) { alert('Lỗi export: '+e.message); }
      expBtn.disabled=false; expBtn.textContent='📤 Export JSON';
    });

    // Import JSON
    const impWrap = U().div('uic');
    const impBtn  = U().el('button','btn btn-ghost btn-xs'); impBtn.textContent='📥 Import JSON';
    const impFile = U().el('input'); impFile.type='file'; impFile.accept='.json';
    impFile.addEventListener('change', async () => {
      const f = impFile.files[0]; if (!f) return;
      if (!confirm(`Import từ "${f.name}"? Dữ liệu hiện tại sẽ được GỘP (không xóa).`)) { impFile.value=''; return; }
      UI.showLoading('Đang import...');
      try {
        const text = await f.text();
        const bk   = JSON.parse(text);
        if (!bk.comics) throw new Error('File không hợp lệ (thiếu comics)');
        // Merge comics
        for (const comic of bk.comics) {
          if (!App.comics.find(c=>c.id===comic.id)) App.comics.push(comic);
        }
        // Restore text chapters
        for (const tc of (bk.textChaps||[])) {
          await DB.saveTextChap(tc.chapId, tc);
        }
        await DB.saveMeta();
        UI.hideLoading(); alert(`✓ Import xong! ${bk.comics.length} truyện, ${bk.textChaps?.length||0} chương chữ.`);
        go('library');
      } catch(e) { UI.hideLoading(); alert('Lỗi import: '+e.message); }
      impFile.value='';
    });
    impWrap.appendChild(impBtn); impWrap.appendChild(impFile);

    const noteImp = U().div(); noteImp.style.cssText='font-size:10px;color:#555;margin-top:6px;line-height:1.6';
    noteImp.innerHTML='<b>Export</b>: lưu metadata + nội dung truyện chữ (không gồm file ảnh/PDF đã upload).<br><b>Import</b>: gộp vào dữ liệu hiện tại, không ghi đè.';

    [expBtn, impWrap].forEach(e=>ioRow.appendChild(e));
    storeCard.appendChild(ioRow); storeCard.appendChild(noteImp);

    // Phiên bản
    const verCard = U().div('sc'); verCard.style.marginBottom = '10px';
    verCard.innerHTML = '<div class="sl">Phiên bản</div><div style="font-size:12px;margin-top:4px">MangaDesk v1.2</div>';

    const delBtn = U().mkBtn('btn-danger', '🗑 Xóa toàn bộ dữ liệu', async () => {
      if (!confirm('Xóa toàn bộ? Không thể hoàn tác.')) return;
      UI.showLoading('Đang xóa...');
      await DB.clearAll(); App.comics = []; UI.hideLoading(); go('library');
    });

    w.appendChild(gdCard);
    w.appendChild(storeCard);
    w.appendChild(verCard);
    w.appendChild(delBtn);
    container.appendChild(w);
  }

  /* ════ ANALYTICS ══════════════════════════════════════ */
  async function viewAnalytics(container) {
    const w = U().div(); w.style.maxWidth = '640px';
    w.innerHTML = '<div style="font-family:monospace;font-size:15px;margin-bottom:16px">📊 Thống kê người dùng</div>';
    UI.showLoading('Đang tải thống kê...');
    try {
      const [stats, users] = await Promise.all([
        UserDB.getReadingStats(),
        UserDB.getUserList(),
      ]);
      UI.hideLoading();

      // User activity summary
      const ua = U().div('sc'); ua.style.marginBottom = '14px';
      ua.innerHTML = `<div class="sl" style="margin-bottom:10px">👥 Hoạt động người đọc</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
  <div style="text-align:center"><div style="font-size:20px;font-family:monospace;color:#c8a96e">${users.length}</div><div style="font-size:10px;color:#555;margin-top:3px">Người đọc</div></div>
  <div style="text-align:center"><div style="font-size:20px;font-family:monospace;color:#c8a96e">${users.reduce((a,u)=>a+u.reads,0)}</div><div style="font-size:10px;color:#555;margin-top:3px">Lượt đọc</div></div>
  <div style="text-align:center"><div style="font-size:20px;font-family:monospace;color:#c8a96e">${stats.length}</div><div style="font-size:10px;color:#555;margin-top:3px">Truyện được đọc</div></div>
</div>`;
      w.appendChild(ua);

      // Top comics
      if (stats.length) {
        const tc = U().div('sc'); tc.style.marginBottom = '14px';
        tc.innerHTML = '<div class="sl" style="margin-bottom:10px">🔥 Truyện được đọc nhiều nhất</div>';
        stats.slice(0, 5).forEach((s, i) => {
          const row = U().div(); row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #1a1a1e';
          const rank = U().div(); rank.style.cssText = 'font-family:monospace;font-size:12px;color:#555;min-width:20px'; rank.textContent = `${i+1}.`;
          const name = U().div(); name.style.cssText = 'flex:1;font-size:12px'; name.textContent = s.comic?.title_vi || s.comic?.titleVI || s.comic?.id || '?';
          const cnt  = U().div(); cnt.style.cssText = 'font-size:11px;color:#c8a96e;font-family:monospace'; cnt.textContent = s.count + ' lượt';
          [rank, name, cnt].forEach(e => row.appendChild(e));
          tc.appendChild(row);
        });
        w.appendChild(tc);
      }

      // Recent users
      if (users.length) {
        const ru = U().div('sc'); ru.style.marginBottom = '14px';
        ru.innerHTML = '<div class="sl" style="margin-bottom:10px">🕐 Hoạt động gần đây</div>';
        users.slice(0, 5).forEach(u => {
          const row = U().div(); row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1a1a1e;font-size:11px';
          const uid = U().div(); uid.style.cssText = 'font-family:monospace;color:#666;font-size:10px'; uid.textContent = u.id.slice(0,8)+'...';
          const meta = U().div(); meta.style.color='#555';
          const d = new Date(u.lastActive);
          meta.textContent = `${u.reads} lượt · ${d.toLocaleDateString('vi-VN')}`;
          [uid, meta].forEach(e => row.appendChild(e));
          ru.appendChild(row);
        });
        w.appendChild(ru);
      }

      if (!stats.length && !users.length) {
        w.innerHTML += '<div style="color:#555;font-size:12px;padding:20px 0">Chưa có dữ liệu người đọc.</div>';
      }
    } catch(e) {
      UI.hideLoading();
      w.innerHTML += `<div style="color:#e05555;font-size:12px">Lỗi tải thống kê: ${e.message}<br><span style="color:#555;font-size:11px">Cần chạy file data/supabase-user-schema.sql trong Supabase SQL Editor.</span></div>`;
    }
    container.appendChild(w);
  }

  /* ════ USERS ═══════════════════════════════════════════ */
  async function viewUsers(container) {
    const w = U().div(); w.style.maxWidth = '760px';
    w.innerHTML = '<div style="font-family:monospace;font-size:15px;margin-bottom:16px">👥 Quản lý tài khoản</div>';

    UI.showLoading('Đang tải danh sách user...');
    let profiles = [], historyData = [];
    try {
      const { data: p } = await window._sb
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      profiles = p || [];

      const { data: h } = await window._sb
        .from('reading_history')
        .select('user_id, updated_at, comic_id');
      historyData = h || [];
    } catch(e) {
      UI.hideLoading();
      w.innerHTML += `<div style="color:#e05555;font-size:12px;padding:16px 0">
        Lỗi: ${e.message}<br>
        <span style="color:#555;font-size:11px">Cần chạy supabase-schema.sql để tạo bảng profiles.</span>
      </div>`;
      container.appendChild(w); return;
    }
    UI.hideLoading();

    // Summary bar
    const admins = profiles.filter(p => p.role === 'admin').length;
    const users  = profiles.filter(p => p.role === 'user').length;
    const blocked = profiles.filter(p => p.is_blocked).length;
    const sb = U().div('stats'); sb.style.marginBottom = '16px';
    [[profiles.length,'Tổng'],[admins,'Admin'],[users,'User'],[blocked,'Bị khóa']].forEach(([v,l])=>{
      sb.innerHTML += `<div class="sc"><div class="sv">${v}</div><div class="sl">${l}</div></div>`;
    });
    w.appendChild(sb);

    // Add user manually
    const addCard = U().div('sc'); addCard.style.marginBottom = '16px';
    addCard.innerHTML = '<div class="sl" style="margin-bottom:8px">➕ Thêm tài khoản</div>';
    const addRow = U().div(); addRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    const emailInp = U().el('input','fi'); emailInp.placeholder='Email'; emailInp.type='email'; emailInp.style.flex='1';
    const passInp  = U().el('input','fi'); passInp.placeholder='Mật khẩu (≥6 ký tự)'; passInp.type='password'; passInp.style.flex='1';
    const roleSelA = U().el('select','fi'); roleSelA.style.cssText='width:auto;font-size:12px;padding:7px 10px';
    [['user','User'],['admin','Admin']].forEach(([v,l])=>{ const o=U().el('option');o.value=v;o.textContent=l;roleSelA.appendChild(o); });
    const addMsg = U().div(); addMsg.style.cssText='font-size:11px;margin-top:6px;display:none';
    const addBtn = U().mkBtn('btn-primary btn-xs','+ Tạo', async()=>{
      const email=emailInp.value.trim(), pass=passInp.value, role=roleSelA.value;
      if(!email||!pass){addMsg.style.display='block';addMsg.style.color='#e05555';addMsg.textContent='Nhập email và mật khẩu';return;}
      if(pass.length<6){addMsg.style.display='block';addMsg.style.color='#e05555';addMsg.textContent='Mật khẩu ít nhất 6 ký tự';return;}
      addBtn.disabled=true; addBtn.textContent='Đang tạo...';
      // Dùng admin API qua Supabase — chỉ được với service_role key
      // Với anon key: dùng signUp (user tự đăng ký), sau đó update role
      const { data, error } = await window._sb.auth.signUp({ email, password: pass });
      if(error){ addMsg.style.display='block';addMsg.style.color='#e05555';addMsg.textContent=error.message; addBtn.disabled=false;addBtn.textContent='+ Tạo';return; }
      if(data?.user && role==='admin'){
        await window._sb.from('profiles').upsert({id:data.user.id,email,role:'admin'},{onConflict:'id'});
      }
      addMsg.style.display='block';addMsg.style.color='#4caf50';addMsg.textContent=`✓ Đã tạo tài khoản ${email}`;
      emailInp.value=''; passInp.value='';
      addBtn.disabled=false;addBtn.textContent='+ Tạo';
      setTimeout(()=>{ Admin.viewUsers(container); container.innerHTML=''; Admin.viewUsers(container); },1000);
    });
    [emailInp,passInp,roleSelA,addBtn].forEach(e=>addRow.appendChild(e));
    addCard.appendChild(addRow); addCard.appendChild(addMsg); w.appendChild(addCard);

    // User table
    const tableWrap = U().div(); tableWrap.style.cssText='background:#18181c;border:1px solid #2a2a30;border-radius:8px;overflow:hidden';
    const tbl = U().el('table'); tbl.style.cssText='width:100%;border-collapse:collapse';
    tbl.innerHTML=`<thead><tr style="background:#111;border-bottom:1px solid #2a2a30">
<th style="padding:10px 14px;font-size:10px;font-weight:500;color:#666;text-align:left;letter-spacing:.5px;text-transform:uppercase">Tài khoản</th>
<th style="padding:10px 14px;font-size:10px;font-weight:500;color:#666;text-align:left;letter-spacing:.5px;text-transform:uppercase">Role</th>
<th style="padding:10px 14px;font-size:10px;font-weight:500;color:#666;text-align:left;letter-spacing:.5px;text-transform:uppercase">Hoạt động</th>
<th style="padding:10px 14px;font-size:10px;font-weight:500;color:#666;text-align:center;letter-spacing:.5px;text-transform:uppercase">Thao tác</th>
</tr></thead>`;
    const tbody = U().el('tbody');

    profiles.forEach(p => {
      const reads  = historyData.filter(h=>h.user_id===p.id).length;
      const lastH  = historyData.filter(h=>h.user_id===p.id).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at))[0];
      const lastAct= lastH ? fmtRelTime(lastH.updated_at) : (p.last_seen ? fmtRelTime(p.last_seen) : 'Chưa có');
      const isMe   = p.id === Auth.getUserId();

      const tr = U().el('tr'); tr.style.cssText='border-bottom:1px solid #1e1e24;transition:background .1s';
      tr.addEventListener('mouseenter',()=>tr.style.background='#1f1f24');
      tr.addEventListener('mouseleave',()=>tr.style.background='');

      // Avatar + email
      const av = p.avatar_url
        ? `<img src="${U().esc(p.avatar_url)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px">`
        : `<span style="display:inline-flex;width:28px;height:28px;border-radius:50%;background:#2a2a30;align-items:center;justify-content:center;font-size:11px;margin-right:8px;vertical-align:middle">${(p.display_name||p.email||'?').charAt(0).toUpperCase()}</span>`;
      const namePart = p.display_name ? `<div style="font-size:12px;font-weight:500">${U().esc(p.display_name)}</div><div style="font-size:10px;color:#555">${U().esc(p.email)}</div>` : `<div style="font-size:12px">${U().esc(p.email)}</div>`;
      const blockedBadge = p.is_blocked ? `<span style="font-size:9px;background:#3a1515;color:#e05555;border:1px solid #5a2020;padding:1px 5px;border-radius:3px;margin-left:4px">Bị khóa</span>` : '';
      const meBadge = isMe ? `<span style="font-size:9px;background:#1a2a1a;color:#4caf50;border:1px solid #2a4a2a;padding:1px 5px;border-radius:3px;margin-left:4px">Bạn</span>` : '';

      const td1 = U().el('td'); td1.style.cssText='padding:10px 14px';
      td1.innerHTML=`<div style="display:flex;align-items:center">${av}<div>${namePart}${blockedBadge}${meBadge}</div></div>`;

      // Role selector
      const td2 = U().el('td'); td2.style.padding='10px 14px';
      const roleSel = U().el('select'); roleSel.style.cssText='background:#111;border:1px solid #2a2a30;border-radius:4px;padding:4px 7px;color:#e8e6e0;font-size:11px;cursor:pointer;font-family:inherit';
      [['user','User'],['admin','Admin']].forEach(([v,l])=>{
        const o=U().el('option');o.value=v;o.textContent=l;if(v===p.role)o.selected=true;roleSel.appendChild(o);
      });
      if(isMe) roleSel.disabled=true; // không tự đổi role của mình
      roleSel.addEventListener('change', async()=>{
        await window._sb.from('profiles').update({role:roleSel.value}).eq('id',p.id);
      });
      td2.appendChild(roleSel);

      // Activity
      const td3 = U().el('td'); td3.style.padding='10px 14px';
      td3.innerHTML=`<div style="font-size:11px;color:#c8a96e">${reads} lượt đọc</div><div style="font-size:10px;color:#555;margin-top:2px">Cuối: ${lastAct}</div>`;

      // Actions
      const td4 = U().el('td'); td4.style.cssText='padding:10px 14px;text-align:center';
      const acts = U().div(); acts.style.cssText='display:flex;gap:5px;justify-content:center';

      const blockBtn = U().mkBtn(p.is_blocked?'btn-ghost btn-xs':'btn-ghost btn-xs',
        p.is_blocked?'🔓 Mở khóa':'🔒 Khóa',
        async()=>{
          if(isMe){alert('Không thể tự khóa chính mình');return;}
          await window._sb.from('profiles').update({is_blocked:!p.is_blocked}).eq('id',p.id);
          await viewUsers(container); container.innerHTML=''; await viewUsers(container);
        });
      if(p.is_blocked) blockBtn.style.cssText='color:#4caf50;border-color:#2a4a2a';

      const delBtn = U().mkBtn('btn-danger btn-xs','🗑 Xóa', async()=>{
        if(isMe){alert('Không thể xóa tài khoản của chính mình');return;}
        if(!confirm(`Xóa tài khoản ${p.email}?\nHành động này không thể hoàn tác.`))return;
        // Xóa profile (cascade xóa history + bookmarks)
        await window._sb.from('profiles').delete().eq('id',p.id);
        await viewUsers(container); container.innerHTML=''; await viewUsers(container);
      });

      [blockBtn, delBtn].forEach(b=>acts.appendChild(b));
      td4.appendChild(acts);

      [td1,td2,td3,td4].forEach(td=>tr.appendChild(td));
      tbody.appendChild(tr);
    });

    if(!profiles.length){
      const tr=U().el('tr'); const td=U().el('td'); td.colSpan=4; td.style.cssText='padding:32px;text-align:center;color:#555;font-size:12px';
      td.textContent='Chưa có user nào. Khi user đăng ký, họ sẽ xuất hiện ở đây.';
      tr.appendChild(td); tbody.appendChild(tr);
    }

    tbl.appendChild(tbody); tableWrap.appendChild(tbl); w.appendChild(tableWrap);

    // Note về quyền xóa
    const note = U().div(); note.style.cssText='font-size:10px;color:#444;margin-top:10px;line-height:1.7';
    note.innerHTML='<b style="color:#555">Lưu ý:</b> Xóa tài khoản sẽ xóa lịch sử đọc và bookmark của user đó. Tài khoản Google OAuth chỉ xóa được profile, không xóa được khỏi Supabase Auth (cần dùng Dashboard).';
    w.appendChild(note);
    container.appendChild(w);
  }

  function fmtRelTime(iso) {
    if (!iso) return '—';
    const d=new Date(iso), now=new Date();
    const diff=Math.floor((now-d)/60000);
    if(diff<2)   return 'Vừa xong';
    if(diff<60)  return diff+'p trước';
    if(diff<1440) return Math.floor(diff/60)+'g trước';
    if(diff<43200) return Math.floor(diff/1440)+'ngày trước';
    return d.toLocaleDateString('vi-VN');
  }

  return { viewLibrary, viewAddComic, viewChapters, viewAddChapter, viewEditChapter, viewSettings, viewAnalytics, viewUsers };
})();
