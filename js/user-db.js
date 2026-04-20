/* ── USER-DB.JS ───────────────────────────────────────────
   Bookmark + Reading history CRUD.
   Tách riêng để không ảnh hưởng admin DB module.
──────────────────────────────────────────────────────────── */
window.UserDB = (() => {
  const sb  = () => window._sb;
  const uid = () => Auth.getUserId();

  /* ══ READING HISTORY ══════════════════════════════════════
     Lưu chương đọc gần nhất của mỗi bộ truyện (upsert).
  ════════════════════════════════════════════════════════ */
  async function saveHistory(comicId, chap) {
    if (!uid()) return;
    await sb().from('reading_history').upsert({
      user_id:    uid(),
      comic_id:   comicId,
      chap_id:    chap.id,
      chap_num:   chap.num,
      chap_title: chap.title || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,comic_id' });
  }

  async function loadHistory() {
    if (!uid()) return [];
    const { data } = await sb()
      .from('reading_history')
      .select('*, comics(id,title_vi,title_en,cover,status), chapters(id,num,title,type)')
      .eq('user_id', uid())
      .order('updated_at', { ascending: false })
      .limit(20);
    return data || [];
  }

  async function getHistory(comicId) {
    if (!uid()) return null;
    const { data } = await sb()
      .from('reading_history')
      .select('*')
      .eq('user_id', uid())
      .eq('comic_id', comicId)
      .single();
    return data || null;
  }

  async function deleteHistory(comicId) {
    if (!uid()) return;
    await sb().from('reading_history')
      .delete().eq('user_id', uid()).eq('comic_id', comicId);
  }

  /* ══ BOOKMARKS ════════════════════════════════════════════ */
  async function addBookmark(comicId, chap, note = '') {
    if (!uid()) return;
    const { error } = await sb().from('bookmarks').upsert({
      user_id:    uid(),
      comic_id:   comicId,
      chap_id:    chap.id,
      chap_num:   chap.num,
      chap_title: chap.title || '',
      note,
    }, { onConflict: 'user_id,comic_id,chap_id' });
    return !error;
  }

  async function removeBookmark(comicId, chapId) {
    if (!uid()) return;
    await sb().from('bookmarks')
      .delete()
      .eq('user_id', uid())
      .eq('comic_id', comicId)
      .eq('chap_id', chapId);
  }

  async function isBookmarked(comicId, chapId) {
    if (!uid()) return false;
    const { data } = await sb().from('bookmarks')
      .select('id')
      .eq('user_id', uid())
      .eq('comic_id', comicId)
      .eq('chap_id', chapId)
      .single();
    return !!data;
  }

  async function loadBookmarks() {
    if (!uid()) return [];
    const { data } = await sb()
      .from('bookmarks')
      .select('*, comics(id,title_vi,title_en,cover), chapters(id,num,title,type)')
      .eq('user_id', uid())
      .order('created_at', { ascending: false });
    return data || [];
  }

  /* ══ PUBLIC LIBRARY ═══════════════════════════════════════
     Load tất cả comics published (của mọi admin).
  ════════════════════════════════════════════════════════ */
  async function loadPublicComics() {
    const { data: comics } = await sb()
      .from('comics')
      .select('*')
      .eq('status', 'published')
      .order('title_vi');
    if (!comics?.length) return [];

    const ids = comics.map(c => c.id);
    const { data: chapters } = await sb()
      .from('chapters')
      .select('id,comic_id,num,title,type,languages')
      .in('comic_id', ids)
      .order('num');

    return comics.map(c => ({
      id: c.id, titleVI: c.title_vi, titleEN: c.title_en,
      cover: c.cover, genre: c.genre, status: c.status,
      chapters: (chapters || [])
        .filter(ch => ch.comic_id === c.id)
        .map(ch => ({ id: ch.id, num: ch.num, title: ch.title, type: ch.type, languages: ch.languages || [] })),
    }));
  }

  async function loadPublicTextChap(chapId) {
    const { data } = await sb().from('text_chaps')
      .select('*').eq('chap_id', chapId).single();
    if (!data) return null;
    return { chapId: data.chap_id, comicId: data.comic_id, languages: data.languages || [], segments: data.segments || [] };
  }

  /* ══ ADMIN ANALYTICS ══════════════════════════════════════ */
  async function getReadingStats() {
    // Top comics bằng lịch sử đọc
    const { data } = await sb()
      .from('reading_history')
      .select('comic_id, comics(title_vi, cover)')
      .limit(100);
    if (!data) return [];
    const counts = {};
    data.forEach(r => {
      const id = r.comic_id;
      if (!counts[id]) counts[id] = { comic: r.comics, count: 0 };
      counts[id].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10);
  }

  async function getUserList() {
    // Đếm user qua reading_history (không lộ thông tin nhạy cảm)
    const { data } = await sb()
      .from('reading_history')
      .select('user_id, updated_at')
      .order('updated_at', { ascending: false });
    if (!data) return [];
    const users = {};
    data.forEach(r => {
      if (!users[r.user_id]) users[r.user_id] = { id: r.user_id, lastActive: r.updated_at, reads: 0 };
      users[r.user_id].reads++;
    });
    return Object.values(users);
  }

  return {
    saveHistory, loadHistory, getHistory, deleteHistory,
    addBookmark, removeBookmark, isBookmarked, loadBookmarks,
    loadPublicComics, loadPublicTextChap,
    getReadingStats, getUserList,
  };
})();
