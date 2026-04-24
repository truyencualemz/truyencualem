/* ── DB.JS v3 ─────────────────────────────────────────────
   Supabase backend — thay thế IndexedDB.
   API giữ nguyên để không đổi code ở các module khác.
──────────────────────────────────────────────────────────── */
window.DB = (() => {
  const sb = () => window._sb;

  async function must(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(error.message);
    return data;
  }

  /* ── open() — giữ API, không cần làm gì với Supabase ── */
  async function open() {}

  /* ══ META ══════════════════════════════════════════════ */

  async function loadMeta() {
    const uid = Auth.getUserId();
    if (!uid) { App.comics = []; return; }

    const role = window.CURRENT_ROLE || 'user';

    let query = sb().from('comics').select('*').order('sort_order');
    // Admin: thấy tất cả truyện của mình
    // Publisher: chỉ thấy truyện mình tạo
    if (role === 'publisher') {
      query = query.eq('created_by', uid);
    } else {
      query = query.eq('user_id', uid);
    }

    const comics = await must(query);
    const ids = comics.map(c => c.id);
    const chapters = ids.length ? await must(
      sb().from('chapters').select('*').in('comic_id', ids).order('num')
    ) : [];

    App.comics = comics.map((c, i) => ({
      id:        c.id,
      titleVI:   c.title_vi,   titleEN: c.title_en,
      descVI:    c.desc_vi,    descEN:  c.desc_en,
      genre:     c.genre,      status:  c.status,
      cover:     c.cover,      _order:  c.sort_order ?? i,
      createdBy: c.created_by,
      isOwner:   true,
      chapters: chapters
        .filter(ch => ch.comic_id === c.id)
        .map(ch => ({
          id: ch.id, num: ch.num, title: ch.title,
          type: ch.type, languages: ch.languages || [], pages: ch.pages || [],
        })),
    }));
  }

  /* Ẩn / hiện truyện (đổi status published ↔ draft) */
  async function toggleComicStatus(comicId, newStatus) {
    const uid = Auth.getUserId(); if (!uid) return;
    await must(sb().from('comics').update({ status: newStatus }).eq('id', comicId).eq('user_id', uid));
    const comic = App.comics.find(c => c.id === comicId);
    if (comic) comic.status = newStatus;
  }

  /* Xóa truyện hoàn toàn */
  async function deleteComic(comicId) {
    const uid = Auth.getUserId(); if (!uid) return;
    // cascade: chapters + text_chaps + reading_history + bookmarks
    await must(sb().from('comics').delete().eq('id', comicId).eq('user_id', uid));
    App.comics = App.comics.filter(c => c.id !== comicId);
  }

  async function saveMeta() {
    const uid = Auth.getUserId(); if (!uid) return;
    for (let i = 0; i < App.comics.length; i++) {
      const m = App.comics[i];
      await must(sb().from('comics').upsert({
        id: m.id, user_id: uid,
        created_by: m.createdBy || uid,
        title_vi: m.titleVI,       title_en: m.titleEN || '',
        desc_vi:  m.descVI  || '', desc_en:  m.descEN  || '',
        genre: m.genre || 'action', status: m.status || 'published',
        cover: m.cover || '', sort_order: i,
      }, { onConflict: 'id' }));

      for (let j = 0; j < (m.chapters || []).length; j++) {
        const ch = m.chapters[j];
        await must(sb().from('chapters').upsert({
          id: ch.id, comic_id: m.id, user_id: uid,
          num: ch.num, title: ch.title || '',
          type: ch.type || 'image',
          languages: ch.languages || [],
          pages: ch.pages || [],
          sort_order: j,
        }, { onConflict: 'id' }));
      }
    }
  }

  /* Xóa 1 chapter khỏi DB (cascade xóa text_chap) */
  async function deleteChapter(chapId) {
    const uid = Auth.getUserId(); if (!uid) return;
    await must(sb().from('chapters').delete().eq('id', chapId).eq('user_id', uid));
  }

  /* ══ IMAGE PAGES ════════════════════════════════════════
     Supabase không lưu binary ảnh/PDF.
     Pages là JSON array URL Drive, lưu trong chapters.pages.
     Các hàm dưới giữ API để không đổi admin-form.js.
  ════════════════════════════════════════════════════════ */

  async function savePage(comicId, chapId, pageId, lang, type, ab, name) {
    // Binary upload local không hỗ trợ trong Supabase mode.
    // Pages phải dùng Drive URL — import qua Apps Script.
    console.warn('[DB] savePage: upload local không hỗ trợ với Supabase. Dùng Drive URL.');
  }

  async function getPage()   { return null; }
  async function deletePage() {}

  async function deleteByChap(chapId) {
    await deleteChapter(chapId);
  }

  /* Blob URL cache chỉ cho preview tạm (local upload trong session) */
  const blobCache = {};
  async function getBlobURL(chapId, pageId, lang) {
    return blobCache[`${chapId}_${pageId}_${lang}`] || null;
  }
  function revokeChap(chapId) {
    Object.keys(blobCache).filter(k => k.startsWith(chapId+'_'))
      .forEach(k => { URL.revokeObjectURL(blobCache[k]); delete blobCache[k]; });
  }

  /* ══ TEXT CHAPTERS ═════════════════════════════════════ */

  async function saveTextChap(chapId, data) {
    const uid = Auth.getUserId(); if (!uid) return;
    await must(sb().from('text_chaps').upsert({
      chap_id: chapId, comic_id: data.comicId, user_id: uid,
      languages: data.languages || [],
      segments:  data.segments  || [],
    }, { onConflict: 'chap_id' }));
  }

  async function getTextChap(chapId) {
    const { data } = await sb().from('text_chaps').select('*').eq('chap_id', chapId).single();
    if (!data) return null;
    return { chapId: data.chap_id, comicId: data.comic_id, languages: data.languages || [], segments: data.segments || [] };
  }

  async function deleteTextChap(chapId) {
    const uid = Auth.getUserId(); if (!uid) return;
    await must(sb().from('text_chaps').delete().eq('chap_id', chapId));
  }

  /* ══ CLEAR ALL ══════════════════════════════════════════ */

  async function clearAll() {
    const uid = Auth.getUserId(); if (!uid) return;
    await must(sb().from('comics').delete().eq('user_id', uid));
    Object.values(blobCache).forEach(URL.revokeObjectURL);
    Object.keys(blobCache).forEach(k => delete blobCache[k]);
    App.comics = [];
  }

  /* ══ STORAGE USAGE ══════════════════════════════════════ */

  async function getUsage() {
    if (navigator.storage?.estimate) return navigator.storage.estimate();
    return null;
  }

  /* ══ EXPORT / IMPORT ════════════════════════════════════ */

  async function exportAll() {
    const uid = Auth.getUserId(); if (!uid) throw new Error('Chưa đăng nhập');
    const textChaps = [];
    for (const c of App.comics)
      for (const ch of (c.chapters || []))
        if (ch.type === 'text') { const d = await getTextChap(ch.id); if (d) textChaps.push(d); }
    return { version: 2, exportedAt: new Date().toISOString(), comics: App.comics, textChaps };
  }

  async function importAll(backup) {
    if (!backup?.comics) throw new Error('File không hợp lệ (thiếu comics)');
    for (const c of backup.comics)
      if (!App.comics.find(x => x.id === c.id)) App.comics.push(c);
    await saveMeta();
    for (const tc of (backup.textChaps || [])) await saveTextChap(tc.chapId, tc);
    await loadMeta();
  }

  return {
    open, loadMeta, saveMeta,
    savePage, getPage, deletePage, deleteByChap,
    getBlobURL, revokeChap,
    saveTextChap, getTextChap, deleteTextChap,
    clearAll, getUsage, exportAll, importAll,
    toggleComicStatus, deleteComic,
  };
})();
