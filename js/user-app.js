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
  showLoading('Đang khởi động...');

  if (!window.SUPABASE_URL || window.SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
    hideLoading();
    document.getElementById('content').innerHTML = '<div style="padding:40px;text-align:center;color:#e05555">⚠ Chưa cấu hình Supabase. Xem file js/config.js</div>';
    return;
  }
  window._sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON);

  const user = await Auth.init();
  if (!user) { hideLoading(); Auth.showAuthUI(); return; }

  document.getElementById('user-email')?.remove();

  // Update header with user info
  const meta = user.user_metadata || {};
  const displayName = meta.full_name || meta.name || user.email || '';
  const avatarUrl   = meta.avatar_url || meta.picture || '';

  const nameEl = document.getElementById('user-display-name');
  if (nameEl) nameEl.textContent = displayName;

  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) {
    if (avatarUrl) {
      avatarEl.innerHTML = `<img src="${avatarUrl}" style="width:22px;height:22px;border-radius:50%;object-fit:cover">`;
    } else {
      avatarEl.textContent = (displayName).charAt(0).toUpperCase() || '?';
    }
  }

  // Profile button
  document.getElementById('profile-btn')?.addEventListener('click', () => Auth.showProfileModal());

  // Tab events
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      renderTab(activeTab);
    });
  });

  // Load public comics
  allComics = await UserDB.loadPublicComics();
  hideLoading();
  renderTab('home');
}

/* ══════════════════════════════════════════════════════════
   TAB RENDER
══════════════════════════════════════════════════════════ */
async function renderTab(tab) {
  const c = document.getElementById('content'); c.innerHTML = '';
  if (tab === 'home')      renderHome(c);
  else if (tab === 'continue') await renderContinue(c);
  else if (tab === 'bookmarks') await renderBookmarks(c);
}

/* ── Home: browse library ── */
function renderHome(container) {
  // Search
  const sb = U.div('search-bar');
  const si = U.el('span','search-icon'); si.textContent='🔍';
  const inp = U.el('input'); inp.placeholder='Tìm tên truyện...'; inp.value=searchQ;
  inp.style.cssText='width:100%;background:#111;border:1px solid #2a2a30;border-radius:6px;padding:9px 12px 9px 34px;color:#e8e6e0;font-size:13px;outline:none;font-family:inherit';
  inp.addEventListener('input', () => { searchQ=inp.value; refreshGrid(container); });
  inp.addEventListener('focus', () => inp.style.borderColor='#c8a96e');
  inp.addEventListener('blur',  () => inp.style.borderColor='#2a2a30');
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
  if (q) list=list.filter(m => m.titleVI?.toLowerCase().includes(q)||m.titleEN?.toLowerCase().includes(q));
  if (activeGenre!=='all') list=list.filter(m=>m.genre===activeGenre);

  const info = U.div(); info.style.cssText='font-size:11px;color:#555;margin-bottom:10px';
  info.textContent = (q||activeGenre!=='all') ? `${list.length} / ${allComics.length} truyện` : `${allComics.length} truyện`;
  container.appendChild(info);

  if (!list.length) {
    const em=U.div('empty-state'); em.textContent='Không tìm thấy truyện nào.'; container.appendChild(em); return;
  }
  const grid = U.div('comic-grid');
  list.forEach(m => {
    const card = U.div('comic-card');
    const genreLabel = GENRES.find(g=>g[0]===m.genre)?.[1]||'';
    card.innerHTML = `<div class="comic-thumb">${m.cover
      ? `<img src="${U.esc(m.cover)}" loading="lazy">`
      : `<span class="comic-thumb-icon">📚</span>`}</div>
<div class="comic-info">
  <div class="comic-title">${U.esc(m.titleVI)}</div>
  <div class="comic-meta">
    ${genreLabel?`<span class="badge badge-genre">${U.esc(genreLabel)}</span>`:''}
    <span>${m.chapters?.length||0} ch</span>
  </div>
</div>`;
    card.addEventListener('click', () => openChapModal(m));
    grid.appendChild(card);
  });
  container.appendChild(grid);
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

  // Continue reading shortcut
  if (history) {
    const cont = U.div(); cont.style.cssText='padding:10px 12px;border-bottom:1px solid #2a2a30;background:#1a2030';
    const idx = comic.chapters.findIndex(c=>c.id===history.chap_id);
    cont.innerHTML = `<div style="font-size:10px;color:#888;margin-bottom:5px">Đang đọc</div>
<div style="font-size:13px;color:#c8a96e;font-weight:500">Ch.${history.chap_num}: ${U.esc(history.chap_title||'')}</div>`;
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
    if (isLast) item.innerHTML += `<span style="font-size:9px;color:#c8a96e;margin-left:6px">← đang đọc</span>`;
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
    const goBtn = U.btn('btn-primary btn-sm','▶ Đọc tiếp',()=>{
      openReader(allComics.find(m=>m.id===h.comic_id)||{...comic,id:h.comic_id,chapters:[]}, chapIdx>=0?chapIdx:0);
    });
    const delBtn = U.btn('btn-ghost btn-xs','✕',async(e)=>{
      e.stopPropagation(); await UserDB.deleteHistory(h.comic_id); renderTab('continue');
    });
    acts.appendChild(goBtn); acts.appendChild(delBtn);
    card.appendChild(thumb); card.appendChild(info); card.appendChild(acts);
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
    const goBtn = U.btn('btn-primary btn-xs','▶ Đọc',()=>{
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

/* ══════════════════════════════════════════════════════════
   READER — dùng lại logic từ admin reader.js / text-reader
   nhưng tích hợp saveHistory + bookmark
══════════════════════════════════════════════════════════ */
async function openReader(comic, chapIdx) {
  rComic=comic; rChapIdx=chapIdx; rMode='single'; rLang='vi'; rZoom=100;
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

  // Lưu lịch sử
  await UserDB.saveHistory(comic.id, chap);

  const rd = document.getElementById('reader');
  rd.innerHTML=''; rd.style.display='flex'; rd.style.flexDirection='column';
  renderReader();
  if (chap.type !== 'text') PDFModule.prefetch(comic.id, chapIdx);
}

async function renderReader() {
  const rd = document.getElementById('reader'); rd.innerHTML='';
  const chap = rComic.chapters?.[rChapIdx]; if(!chap){closeReader();return;}
  const isText = chap.type==='text';

  /* Top bar */
  const bar = U.div('rbar');
  const closeBtn = U.btn('btn-ghost btn-sm','← Đóng',closeReader);

  const rt = U.div('rtitle'); rt.textContent=`${rComic.titleVI} · Ch.${chap.num}: ${chap.title||''}`;
  bar.appendChild(closeBtn); bar.appendChild(rt);

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
      b.addEventListener('click',()=>{rMode=m;renderReader();}); mt.appendChild(b);
    }); bar.appendChild(mt);
    if(rMode==='single'){
      const lt=U.div('ltog');
      [['vi','🇻🇳 VI'],['en','🇬🇧 EN']].forEach(([l,lbl])=>{
        const b=U.el('button','lbtn'+(rLang===l?' active':'')); b.textContent=lbl;
        b.addEventListener('click',()=>{rLang=l;renderReader();}); lt.appendChild(b);
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
  const pb=U.btn('btn-ghost btn-sm','← Trước',async()=>{if(rChapIdx>0){rChapIdx--;await UserDB.saveHistory(rComic.id,chaps[rChapIdx]);renderReader();}});
  pb.disabled=rChapIdx===0;
  const ni=U.div('rni'); ni.textContent=`Ch ${rChapIdx+1} / ${chaps.length}`;
  const nb=U.btn('btn-ghost btn-sm','Sau →',async()=>{if(rChapIdx<chaps.length-1){rChapIdx++;await UserDB.saveHistory(rComic.id,chaps[rChapIdx]);renderReader();}});
  nb.disabled=rChapIdx>=chaps.length-1;
  [pb,ni,nb].forEach(x=>nav.appendChild(x));
  rd.appendChild(nav);

  /* Body */
  const body=U.div(); body.style.cssText='display:flex;flex:1;overflow:hidden;flex-direction:column';
  if (isText) {
    body.appendChild(buildTextLangBar());
    body.appendChild(buildTextCols());
  } else if (rMode==='single') {
    const scroll=U.div('rscroll'); body.appendChild(scroll);
    loadSingleImages(scroll, chap, rLang);
  } else {
    const sp=U.div('rsplit'); body.appendChild(sp);
    const scrollEls={};
    ['vi','en'].forEach((lang,i)=>{
      const col=U.div('rcol'); const hdr=U.div('rchdr');
      hdr.innerHTML=`<span class="lt l${lang}">${lang.toUpperCase()}</span>`;
      const scroll=U.div('rcs'); scroll.style.alignItems=lang==='vi'?'flex-end':'flex-start';
      scrollEls[lang]=scroll; col.appendChild(hdr); col.appendChild(scroll); sp.appendChild(col);
    });
    loadSplitImages(scrollEls.vi, scrollEls.en, chap);
  }
  rd.appendChild(body);
}

function closeReader() { const rd=document.getElementById('reader'); rd.style.display='none'; rd.innerHTML=''; }

function applyZoom(zoom) {
  rZoom=zoom;
  document.querySelectorAll('#reader .rpiw').forEach(w=>{w.style.width=zoom+'%';w.style.maxWidth='none';});
  document.querySelectorAll('#reader .split-page > img, #reader .split-page > .pdf-pages').forEach(e=>{e.style.width=zoom+'%';e.style.maxWidth='none';});
}

async function loadSingleImages(container, chap, lang) {
  for(let i=0;i<chap.pages.length;i++){
    const p=chap.pages[i];
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
  chap.pages.forEach((p,i)=>{
    ['vi','en'].forEach(lang=>{
      const scrollEl=lang==='vi'?viScroll:enScroll;
      const wrap=U.div('split-page');
      const lbl=U.div('spl'); lbl.textContent=`P${i+1}`; wrap.appendChild(lbl);
      const d=p[lang];
      if(!d){const ph=U.div('spblank');ph.textContent=`[${lang.toUpperCase()} trống]`;wrap.appendChild(ph);}
      else{
        const spin=U.div('pdf-spin'); spin.textContent=' '; wrap.appendChild(spin);
        PDFModule.buildPageEl(d,chap.id,p.id,lang,null).then(el=>{
          if(wrap.contains(spin))wrap.removeChild(spin);
          if(el){el.style.width=rZoom+'%';el.style.maxWidth='none';wrap.appendChild(el);}
          else{const ph=U.div('spno');ph.textContent='[lỗi]';wrap.appendChild(ph);}
        });
      }
      scrollEl.appendChild(wrap);
    });
  });
  setTimeout(()=>setupPageSync(viScroll,enScroll),150);
}

function setupPageSync(viEl,enEl){
  let syncing=false;
  const segs=el=>Array.from(el.querySelectorAll('.split-page'));
  function curIdx(el){const ps=segs(el),top=el.scrollTop;let idx=0;for(let i=0;i<ps.length;i++){if(ps[i].offsetTop<=top+4)idx=i;else break;}return idx;}
  function ratio(el,idx){const ps=segs(el);if(!ps[idx])return 0;return Math.max(0,Math.min(1,(el.scrollTop-ps[idx].offsetTop)/(ps[idx].offsetHeight||1)));}
  function syncTo(src,dst){if(syncing)return;syncing=true;const idx=curIdx(src),r=ratio(src,idx);const ps=segs(dst);if(ps[idx])dst.scrollTop=ps[idx].offsetTop+r*(ps[idx].offsetHeight||0);requestAnimationFrame(()=>{syncing=false;});}
  viEl.addEventListener('scroll',()=>syncTo(viEl,enEl),{passive:true});
  enEl.addEventListener('scroll',()=>syncTo(enEl,viEl),{passive:true});
}

/* ── Text chapter reader ── */
function buildTextLangBar(){
  const allLangs=rTextData?.languages||[];
  const bar=U.div('tbar-langs');
  const lbl=U.div();lbl.style.cssText='font-size:10px;color:#555;white-space:nowrap;flex-shrink:0';lbl.textContent='Cột đọc:';
  bar.appendChild(lbl);
  allLangs.forEach(lang=>{
    const pill=U.el('label','lang-pill');
    const cb=U.el('input');cb.type='checkbox';cb.value=lang;cb.style.accentColor='#c8a96e';
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
    hdr.innerHTML=`<span style="font-size:15px">${meta.flag}</span><span style="color:#aaa;font-size:11px">${meta.label}</span>`;
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
    else{textEl.style.color='#444';textEl.textContent=`[Chưa có bản ${Translate.getLangLabel(lang)}]`;}
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
