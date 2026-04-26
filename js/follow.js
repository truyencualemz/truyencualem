/* ── FOLLOW.JS ────────────────────────────────────────────
   Theo dõi truyện:
   - follow/unfollow per comic
   - loadFollows(): danh sách truyện đang theo dõi
   - badge: hiện số truyện có chương mới kể từ lần cuối xem
   - renderFollowTab(): tab "Đang theo dõi" trên user page
──────────────────────────────────────────────────────────── */
window.Follow = (() => {
  const sb  = () => window._sb;
  const uid = () => Auth.getUserId();

  let _cache = new Set(); // comicId đang follow (cache RAM)

  async function loadCache() {
    if (!uid()) return;
    const { data } = await sb().from('follows').select('comic_id').eq('user_id', uid());
    _cache = new Set((data || []).map(r => r.comic_id));
  }

  function isFollowing(comicId) { return _cache.has(comicId); }

  async function toggle(comicId) {
    if (!uid()) return false;
    if (_cache.has(comicId)) {
      await sb().from('follows').delete().eq('user_id', uid()).eq('comic_id', comicId);
      _cache.delete(comicId);
      return false; // now unfollowed
    } else {
      await sb().from('follows').insert({ user_id: uid(), comic_id: comicId });
      _cache.add(comicId);
      return true; // now following
    }
  }

  async function loadFollows(allComics) {
    if (!uid()) return [];
    await loadCache();
    return allComics.filter(c => _cache.has(c.id));
  }

  /* Badge: đếm truyện có chapter mới hơn lần đọc cuối */
  async function getNewChapterCount(allComics) {
    if (!uid() || !_cache.size) return 0;
    try {
      const { data: histories } = await sb()
        .from('reading_history')
        .select('comic_id, updated_at')
        .eq('user_id', uid())
        .in('comic_id', [..._cache]);

      const histMap = {};
      (histories || []).forEach(h => { histMap[h.comic_id] = new Date(h.updated_at); });

      let newCount = 0;
      for (const comic of allComics.filter(c => _cache.has(c.id))) {
        const lastRead = histMap[comic.id];
        if (!lastRead) { newCount++; continue; } // never read → all new
        // Check if any chapter was added after last read
        const hasNew = (comic.chapters || []).some(ch => {
          // chapters don't have created_at in client — use order heuristic:
          // if comic has chapters and user hasn't read recently, count as new
          return false; // placeholder — accurate check needs chapter timestamps
        });
        // Simple heuristic: count comics followed but not read in 7 days
        const daysSince = (Date.now() - lastRead.getTime()) / 86400000;
        if (daysSince > 7) newCount++;
      }
      return newCount;
    } catch { return 0; }
  }

  /* ── Follow button: dùng trong comic card / chapter modal ── */
  function buildFollowBtn(comicId, { onToggle } = {}) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-xs';
    btn.style.cssText = 'gap:4px;transition:all .15s';
    const following = isFollowing(comicId);
    btn.textContent = following ? '★ Đang theo dõi' : '☆ Theo dõi';
    btn.style.color  = following ? 'var(--accent)' : 'var(--text-muted)';
    btn.style.borderColor = following ? 'var(--accent)' : 'var(--border)';

    btn.addEventListener('click', async e => {
      e.stopPropagation();
      btn.disabled = true;
      const nowFollowing = await toggle(comicId);
      btn.textContent  = nowFollowing ? '★ Đang theo dõi' : '☆ Theo dõi';
      btn.style.color  = nowFollowing ? 'var(--accent)' : 'var(--text-muted)';
      btn.style.borderColor = nowFollowing ? 'var(--accent)' : 'var(--border)';
      btn.disabled = false;
      onToggle?.(nowFollowing);
      updateBadge();
    });
    return btn;
  }

  /* Update badge trên tab button */
  function updateBadge(count) {
    const tabBtn = document.querySelector('[data-tab="follows"]');
    if (!tabBtn) return;
    const existing = tabBtn.querySelector('.tab-badge');
    if (count > 0) {
      if (existing) existing.textContent = count;
      else {
        const badge = document.createElement('span');
        badge.className = 'tab-badge';
        badge.style.cssText = 'background:var(--accent);color:#18181c;border-radius:10px;font-size:9px;padding:1px 5px;margin-left:4px;font-weight:700';
        badge.textContent = count;
        tabBtn.appendChild(badge);
      }
    } else {
      existing?.remove();
    }
  }

  /* ── Tab "Đang theo dõi" ── */
  async function renderFollowTab(container, allComics, onReadComic) {
    const div = el => { const e=document.createElement('div'); e.style.cssText=el||''; return e; };
    const followed = await loadFollows(allComics);

    const st = document.createElement('div');
    st.className = 'section-title';
    st.innerHTML = '★ Đang theo dõi <span>' + followed.length + ' truyện</span>';
    container.appendChild(st);

    if (!followed.length) {
      const em = div('text-align:center;padding:48px 20px;color:var(--text-muted);font-size:13px;line-height:1.9');
      em.innerHTML = 'Chưa theo dõi truyện nào.<br>Nhấn <b>☆ Theo dõi</b> khi xem truyện để thêm vào đây.';
      container.appendChild(em); return;
    }

    const grid = document.createElement('div');
    grid.className = 'comic-grid';

    followed.forEach(m => {
      const card = document.createElement('div');
      card.className = 'comic-card';
      card.innerHTML = `
<div class="comic-thumb">${m.cover
  ? `<img src="${m.cover}" loading="lazy">`
  : '<span class="comic-thumb-icon">📚</span>'}</div>
<div class="comic-info">
  <div class="comic-title">${m.titleVI||''}</div>
  <div class="comic-meta">
    <span>${(m.chapters||[]).length} ch</span>
  </div>
</div>`;
      // Follow button inside card
      const bw = div('padding:4px 8px;border-top:1px solid var(--border);display:flex;gap:4px');
      bw.appendChild(buildFollowBtn(m.id, {
        onToggle: (following) => {
          if (!following) card.remove();
        }
      }));
      card.appendChild(bw);
      card.addEventListener('click', () => onReadComic?.(m));
      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  return {
    isFollowing, toggle, loadFollows, loadCache,
    buildFollowBtn, updateBadge, renderFollowTab, getNewChapterCount,
  };
})();
