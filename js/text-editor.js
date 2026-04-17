/* ── TEXT-EDITOR.JS ───────────────────────────────────────
   Admin form cho chương truyện chữ.
   - Quản lý segment (đoạn văn) đa ngôn ngữ
   - Annotation: đánh dấu cụm từ + bản dịch → tooltip khi đọc
   - Auto-translate qua MyMemory
──────────────────────────────────────────────────────────── */
window.TextEditor = (() => {
  // Working state cho form đang mở
  let chapData = null; // { chapId, languages:[], segments:[] }
  let editingChapMeta = null; // chapter metadata từ comic.chapters

  /* ── Mở form thêm chương chữ mới ── */
  function openNew() {
    chapData = {
      chapId: 'ch' + Date.now(),
      languages: ['vi', 'en'],
      segments: [makeSegment()],
    };
    editingChapMeta = null;
    App.go('add-text-chapter');
  }

  /* ── Mở form sửa chương chữ ── */
  async function openEdit(comicId, chapId) {
    App.selComicId = comicId;
    UI.showLoading('Đang tải chương...');
    const data = await DB.getTextChap(chapId);
    if (!data) { UI.hideLoading(); alert('Không tìm thấy dữ liệu chương'); return; }
    chapData = JSON.parse(JSON.stringify(data)); // deep clone
    const comic = App.getComic();
    editingChapMeta = comic?.chapters?.find(c => c.id === chapId) || null;
    UI.hideLoading();
    App.go('edit-text-chapter', { editingChapId: chapId });
  }

  function makeSegment() {
    return { id: 's' + Date.now() + Math.random(), note: '', content: {}, annotations: [] };
  }
  function makeAnnotation() {
    return { id: 'a' + Date.now() + Math.random(), phrase: {} };
  }

  /* ══════════════════════════════════════════════════════
     BUILD MAIN FORM
  ══════════════════════════════════════════════════════ */
  function buildForm(isEdit) {
    if (!chapData) return UI.div();
    const w = UI.div(); w.style.maxWidth = '960px';

    if (Object.keys(App.errors).length) {
      const eb = UI.div('ebanner'); eb.textContent = '⚠ ' + Object.values(App.errors).join(' · ');
      w.appendChild(eb);
    }

    /* ── Chapter info card ── */
    w.appendChild(buildInfoCard(isEdit));
    /* ── Language selector ── */
    w.appendChild(buildLangCard());
    /* ── Segments ── */
    w.appendChild(buildSegmentsSection());

    /* ── Save button ── */
    const btns = UI.div(); btns.style.cssText = 'display:flex;gap:10px;margin-bottom:40px;margin-top:8px';
    btns.appendChild(UI.mkBtn('btn-primary', isEdit ? '✓ Lưu thay đổi' : '✓ Lưu chương', () => saveChapter(isEdit)));
    if (isEdit) btns.appendChild(UI.mkBtn('btn-ghost', 'Hủy', () => App.go('chapters')));
    w.appendChild(btns);
    return w;
  }

  function buildInfoCard(isEdit) {
    const card = UI.div('fc');
    card.innerHTML = '<div class="fct">📑 Thông tin chương</div>';
    const r = UI.div('fr');
    const n0 = UI.el('input','fi'); n0.id='tchnum'; n0.type='number'; n0.min='1'; n0.placeholder='VD: 1';
    if (isEdit && editingChapMeta) n0.value = editingChapMeta.num;
    const t0 = UI.el('input','fi'); t0.id='tchtitle'; t0.placeholder='Tiêu đề chương';
    if (isEdit && editingChapMeta) t0.value = editingChapMeta.title || '';
    const fg1 = UI.div('fg'); fg1.innerHTML='<label class="fl">Số chương *</label>'; fg1.appendChild(n0);
    const fg2 = UI.div('fg'); fg2.innerHTML='<label class="fl">Tiêu đề chương</label>'; fg2.appendChild(t0);
    r.appendChild(fg1); r.appendChild(fg2); card.appendChild(r);
    return card;
  }

  function buildLangCard() {
    const card = UI.div('fc');
    card.innerHTML = '<div class="fct">🌐 Ngôn ngữ của chương</div>';
    const hint = UI.div(); hint.style.cssText='font-size:11px;color:#666;margin-bottom:10px';
    hint.textContent = 'Chọn các ngôn ngữ sẽ có trong chương này. Có thể thêm sau.';
    card.appendChild(hint);

    const grid = UI.div(); grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px';
    Translate.getAllLangs().forEach(code => {
      const lbl = UI.el('label'); lbl.style.cssText='display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:6px;border:1px solid #2a2a30;cursor:pointer;font-size:12px;user-select:none';
      const cb  = UI.el('input'); cb.type='checkbox'; cb.value=code; cb.style.accentColor='#c8a96e';
      cb.checked = chapData.languages.includes(code);
      cb.addEventListener('change', () => {
        if (cb.checked) { if (!chapData.languages.includes(code)) chapData.languages.push(code); }
        else chapData.languages = chapData.languages.filter(l => l !== code);
        // Rebuild segments section
        const old = document.getElementById('segs-section');
        if (old) old.parentNode.replaceChild(buildSegmentsSection(), old);
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(' ' + Translate.getLangLabel(code)));
      grid.appendChild(lbl);
    });
    card.appendChild(grid);
    return card;
  }

  /* ── Segments section ── */
  function buildSegmentsSection() {
    const wrap = UI.div('fc'); wrap.id = 'segs-section';
    const hdr = UI.div(); hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:14px';
    const title = UI.div('fct'); title.style.marginBottom='0'; title.textContent = '📝 Nội dung đoạn văn';
    const addBtn = UI.mkBtn('btn-ghost btn-xs', '+ Thêm đoạn', () => {
      chapData.segments.push(makeSegment());
      const old = document.getElementById('segs-section');
      if (old) old.parentNode.replaceChild(buildSegmentsSection(), old);
    });
    hdr.appendChild(title); hdr.appendChild(addBtn);
    wrap.appendChild(hdr);

    chapData.segments.forEach((seg, idx) => {
      wrap.appendChild(buildSegmentCard(seg, idx));
    });
    return wrap;
  }

  function buildSegmentCard(seg, idx) {
    const card = UI.div(); card.id = 'seg-' + seg.id;
    card.style.cssText = 'background:#111;border:1px solid #2a2a30;border-radius:8px;padding:14px;margin-bottom:10px';

    /* Header */
    const hdr = UI.div(); hdr.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:10px';
    const num = UI.div(); num.style.cssText='font-family:monospace;font-size:11px;color:#c8a96e;min-width:30px'; num.textContent='#'+(idx+1);
    const noteInp = UI.el('input','fi'); noteInp.style.cssText='flex:1;font-size:11px;padding:5px 9px'; noteInp.placeholder='Ghi chú đoạn (tùy chọn)'; noteInp.value=seg.note||'';
    noteInp.addEventListener('input', () => { seg.note = noteInp.value; });
    const delBtn = UI.mkBtn('btn-danger btn-xxs','✕',() => {
      chapData.segments.splice(idx,1);
      const old=document.getElementById('segs-section');
      if(old)old.parentNode.replaceChild(buildSegmentsSection(),old);
    });
    [num,noteInp,delBtn].forEach(e=>hdr.appendChild(e));
    card.appendChild(hdr);

    /* Content textareas per language */
    const langs = chapData.languages;
    if (!langs.length) {
      const w=UI.div(); w.style.cssText='font-size:11px;color:#555;text-align:center;padding:8px'; w.textContent='Chưa chọn ngôn ngữ nào';
      card.appendChild(w);
    } else {
      const grid=UI.div(); grid.style.cssText=`display:grid;grid-template-columns:repeat(${Math.min(langs.length,2)},1fr);gap:10px`;
      langs.forEach(lang => {
        const col=UI.div();
        const lhdr=UI.div(); lhdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:5px';
        const llbl=UI.div(); llbl.style.cssText='font-size:10px;color:#888'; llbl.textContent=Translate.getLangLabel(lang);
        const tBtn=UI.mkBtn('btn-ghost btn-xxs','⚡ Dịch',async()=>{
          // Tìm ngôn ngữ nguồn (ngôn ngữ đầu tiên có nội dung, khác lang này)
          const srcLang=langs.find(l=>l!==lang&&seg.content[l]?.trim());
          if(!srcLang){alert('Cần có nội dung ở ít nhất 1 ngôn ngữ khác trước');return;}
          tBtn.disabled=true; tBtn.textContent='...';
          try{
            const result=await Translate.translate(seg.content[srcLang],srcLang,lang);
            seg.content[lang]=result;
            const ta=document.getElementById(`ta-${seg.id}-${lang}`);
            if(ta)ta.value=result;
          }catch(e){alert('Dịch lỗi: '+e.message);}
          tBtn.disabled=false; tBtn.textContent='⚡ Dịch';
        });
        lhdr.appendChild(llbl); lhdr.appendChild(tBtn);
        col.appendChild(lhdr);
        const ta=UI.el('textarea','fi'); ta.id=`ta-${seg.id}-${lang}`;
        ta.rows=5; ta.placeholder=`Nội dung ${Translate.getLangLabel(lang)}...`;
        ta.value=seg.content[lang]||'';
        ta.style.cssText='width:100%;font-size:12px;line-height:1.7;resize:vertical';
        ta.addEventListener('input',()=>{ seg.content[lang]=ta.value; });
        col.appendChild(ta);
        grid.appendChild(col);
      });
      card.appendChild(grid);
    }

    /* Annotations */
    card.appendChild(buildAnnotationsSection(seg, idx));
    return card;
  }

  function buildAnnotationsSection(seg, segIdx) {
    const wrap=UI.div(); wrap.style.marginTop='10px';
    const hdr=UI.div(); hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:6px';
    const lbl=UI.div(); lbl.style.cssText='font-size:10px;color:#666';
    lbl.textContent=`Annotations (${seg.annotations?.length||0}) — đánh dấu cụm từ hiện tooltip khi đọc`;
    const addBtn=UI.mkBtn('btn-ghost btn-xxs','+ Thêm',()=>{
      const anno=makeAnnotation();
      if(!seg.annotations)seg.annotations=[];
      seg.annotations.push(anno);
      const old=document.getElementById('seg-'+seg.id);
      if(old)old.parentNode.replaceChild(buildSegmentCard(seg,segIdx),old);
    });
    hdr.appendChild(lbl); hdr.appendChild(addBtn); wrap.appendChild(hdr);

    (seg.annotations||[]).forEach((anno,aIdx)=>{
      wrap.appendChild(buildAnnotationRow(anno,seg,segIdx,aIdx));
    });
    return wrap;
  }

  function buildAnnotationRow(anno, seg, segIdx, aIdx) {
    const row=UI.div(); row.style.cssText='background:#18181c;border:1px solid #2a2a30;border-radius:6px;padding:8px 10px;margin-bottom:6px';
    const rHdr=UI.div(); rHdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:7px';
    const rLbl=UI.div(); rLbl.style.cssText='font-size:9px;color:#555;font-family:monospace'; rLbl.textContent='ANNOTATION '+(aIdx+1);
    const delBtn=UI.mkBtn('btn-danger btn-xxs','✕',()=>{
      seg.annotations.splice(aIdx,1);
      const old=document.getElementById('seg-'+seg.id);
      if(old)old.parentNode.replaceChild(buildSegmentCard(seg,segIdx),old);
    });
    rHdr.appendChild(rLbl); rHdr.appendChild(delBtn); row.appendChild(rHdr);

    const grid=UI.div(); grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px';
    chapData.languages.forEach(lang=>{
      const col=UI.div();
      const lhdr=UI.div(); lhdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:3px';
      const llbl=UI.div(); llbl.style.cssText='font-size:9px;color:#666'; llbl.textContent=Translate.getLangLabel(lang);
      const tBtn=UI.mkBtn('btn-ghost btn-xxs','⚡',async()=>{
        const srcLang=chapData.languages.find(l=>l!==lang&&anno.phrase[l]?.trim());
        if(!srcLang){alert('Cần nhập cụm từ ở ít nhất 1 ngôn ngữ khác');return;}
        tBtn.disabled=true;
        try{
          const r=await Translate.translate(anno.phrase[srcLang],srcLang,lang);
          anno.phrase[lang]=r;
          const inp=document.getElementById(`ap-${anno.id}-${lang}`);
          if(inp)inp.value=r;
        }catch(e){alert('Dịch lỗi: '+e.message);}
        tBtn.disabled=false;
      });
      lhdr.appendChild(llbl); lhdr.appendChild(tBtn); col.appendChild(lhdr);
      const inp=UI.el('input','fi'); inp.id=`ap-${anno.id}-${lang}`;
      inp.style.cssText='width:100%;font-size:11px;padding:4px 7px';
      inp.placeholder=`Cụm từ ${Translate.getLangLabel(lang)}`;
      inp.value=anno.phrase?.[lang]||'';
      inp.addEventListener('input',()=>{ if(!anno.phrase)anno.phrase={}; anno.phrase[lang]=inp.value; });
      col.appendChild(inp); grid.appendChild(col);
    });
    row.appendChild(grid);
    return row;
  }

  /* ── Save ── */
  async function saveChapter(isEdit) {
    const errs = {};
    const num = parseInt(document.getElementById('tchnum')?.value || '');
    if (!num || isNaN(num)) errs.chapNum = 'Số chương không được để trống';
    if (!chapData.languages.length) errs.langs = 'Chọn ít nhất 1 ngôn ngữ';
    if (!chapData.segments.length) errs.segs = 'Thêm ít nhất 1 đoạn văn';
    if (Object.keys(errs).length) { App.errors = errs; App.go(App.view); return; }

    UI.showLoading('Đang lưu...');
    try {
      const comic = App.getComic();
      const title = document.getElementById('tchtitle')?.value || 'Chương ' + num;

      if (isEdit && editingChapMeta) {
        // Cập nhật metadata chương
        const cidx = comic.chapters.findIndex(c => c.id === editingChapMeta.id);
        if (cidx >= 0) {
          comic.chapters[cidx].num = num;
          comic.chapters[cidx].title = title;
          comic.chapters[cidx].languages = chapData.languages;
        }
      } else {
        // Thêm chương mới vào danh sách
        if (!comic.chapters) comic.chapters = [];
        comic.chapters.push({
          id: chapData.chapId, num, title,
          type: 'text', languages: chapData.languages, pages: [],
        });
        comic.chapters.sort((a, b) => a.num - b.num);
      }

      // Bước 1: lưu metadata lên Supabase (bảng chapters)
      // Phải chạy TRƯỚC vì text_chaps có foreign key → chapters.id
      await DB.saveMeta();

      // Bước 2: lưu nội dung text chapter (bảng text_chaps)
      await DB.saveTextChap(chapData.chapId, { ...chapData, comicId: comic.id });

      UI.hideLoading();
      App.errors = {};
      App.go('chapters');
    } catch (e) {
      UI.hideLoading();
      console.error('saveChapter error:', e);
      alert('Lỗi khi lưu: ' + (e.message || e));
    }
  }

  return { openNew, openEdit, buildForm };
})();
