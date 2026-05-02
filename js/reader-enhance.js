/* ── READER-ENHANCE.JS ────────────────────────────────────
   Fullscreen, keyboard shortcuts, scroll position sync Supabase.
   Gọi ReaderEnhance.init(comicId, chapId) sau khi reader render.
   Gọi ReaderEnhance.destroy() khi đóng reader.
──────────────────────────────────────────────────────────── */
window.ReaderEnhance = (() => {
  let _comicId = null, _chapId = null;
  let _isFullscreen = false;
  let _saveTimer = null;
  let _keyHandler = null;
  let _swipe = null;
  let _isUserPage = !!window.IS_USER_PAGE;

  /* ══ FULLSCREEN ══════════════════════════════════════ */
  function toggleFullscreen() {
    const rd = document.getElementById('reader');
    if (!rd) return;
    _isFullscreen = !_isFullscreen;
    rd.classList.toggle('fs', _isFullscreen);
    _syncFsOverlay(rd);
    // Native fullscreen (enhancement, may fail on iOS)
    if (_isFullscreen) {
      rd.requestFullscreen?.() || rd.webkitRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.();
    }
    updateFsBtn();
  }

  function _syncFsOverlay(rd) {
    rd.querySelector('.fs-exit')?.remove();
    if (_isFullscreen) {
      const btn = document.createElement('button');
      btn.className = 'fs-exit';
      btn.textContent = '✕ Thoát';
      btn.addEventListener('click', toggleFullscreen);
      rd.appendChild(btn);
    }
  }

  function updateFsBtn() {
    document.querySelectorAll('[data-fs-btn]').forEach(b => {
      b.title = _isFullscreen ? 'Thoát toàn màn hình (F)' : 'Toàn màn hình (F)';
    });
  }

  function buildFsBtn() {
    const btn = document.createElement('button');
    btn.dataset.fsBtn = '1';
    btn.className = 'bk-btn';
    btn.textContent = '⛶';
    btn.title = 'Toàn màn hình (F)';
    btn.addEventListener('click', toggleFullscreen);
    return btn;
  }

  /* ══ KEYBOARD SHORTCUTS ══════════════════════════════ */
  function setupKeyboard(callbacks) {
    // callbacks: { prev, next, bookmark, zoomIn, zoomOut, close }
    if (_keyHandler) document.removeEventListener('keydown', _keyHandler);
    _keyHandler = (e) => {
      // Ignore khi đang focus vào input/textarea
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      switch(e.key) {
        case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); callbacks.prev?.();     break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); callbacks.next?.();     break;
        case 'f': case 'F':                    e.preventDefault(); toggleFullscreen();     break;
        case 'b': case 'B':                    e.preventDefault(); callbacks.bookmark?.(); break;
        case '+': case '=':                    e.preventDefault(); callbacks.zoomIn?.();   break;
        case '-': case '_':                    e.preventDefault(); callbacks.zoomOut?.();  break;
        case 'Escape':
          if (document.fullscreenElement) { document.exitFullscreen(); }
          else callbacks.close?.();
          break;
      }
    };
    document.addEventListener('keydown', _keyHandler);

    // Hiển thị hint lần đầu
    const LS_KEY = 'md_kb_hint_shown';
    if (!localStorage.getItem(LS_KEY)) {
      showKeyboardHint();
      localStorage.setItem(LS_KEY, '1');
    }
  }

  function showKeyboardHint() {
    const hint = document.createElement('div');
    hint.style.cssText = [
      'position:fixed;bottom:20px;left:50%;transform:translateX(-50%)',
      'background:rgba(0,0,0,.85);border:1px solid var(--border)',
      'border-radius:8px;padding:10px 18px;font-size:11px',
      'color:var(--text-secondary);z-index:9999;text-align:center',
      'animation:fadeout 4s ease forwards;pointer-events:none',
    ].join(';');
    hint.innerHTML = `
      <div style="margin-bottom:5px;color:var(--accent);font-family:monospace">⌨ Phím tắt</div>
      <span style="margin:0 8px">← → Chuyển chương</span>
      <span style="margin:0 8px">F Toàn màn hình</span>
      <span style="margin:0 8px">B Bookmark</span>
      <span style="margin:0 8px">+/− Zoom</span>
      <span style="margin:0 8px">Esc Đóng</span>`;
    if (!document.getElementById('kb-anim')) {
      const sty = document.createElement('style');
      sty.id = 'kb-anim';
      sty.textContent = '@keyframes fadeout{0%{opacity:1}70%{opacity:1}100%{opacity:0}}';
      document.head.appendChild(sty);
    }
    document.body.appendChild(hint);
    setTimeout(() => hint.remove(), 4200);
  }

  /* ══ SWIPE GESTURE ══════════════════════════════════ */
  function setupSwipe(callbacks) {
    const rd = document.getElementById('reader');
    if (!rd) return;

    let sx, sy, dir;

    function onStart(e) {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      dir = null;
    }
    function onMove(e) {
      if (!e.touches.length) return;
      if (dir === null) {
        const dx = Math.abs(e.touches[0].clientX - sx);
        const dy = Math.abs(e.touches[0].clientY - sy);
        if (dx > 8 || dy > 8) dir = dx > dy ? 'h' : 'v';
      }
      if (dir === 'h') e.preventDefault();
    }
    function onEnd(e) {
      if (dir !== 'h') return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) < 50) return;
      dx < 0 ? callbacks.next?.() : callbacks.prev?.();
    }

    rd.addEventListener('touchstart', onStart, { passive: true });
    rd.addEventListener('touchmove',  onMove,  { passive: false });
    rd.addEventListener('touchend',   onEnd,   { passive: true });
    _swipe = { el: rd, onStart, onMove, onEnd };
  }

  /* ══ DOUBLE-TAP ZOOM ════════════════════════════════ */
  function setupDoubleTap(el, onDoubleTap) {
    let lastTap = 0;
    el.addEventListener('touchend', e => {
      const now = Date.now();
      if (now - lastTap < 300 && e.changedTouches.length === 1) {
        e.preventDefault();
        onDoubleTap(e.changedTouches[0]);
      }
      lastTap = now;
    }, { passive: false });
  }

  /* ══ SCROLL POSITION SYNC ════════════════════════════ */
  function init(comicId, chapId) {
    _comicId = comicId; _chapId = chapId;
    if (_isUserPage && window._sb) loadScrollPosition();
    // Re-apply fs state if still active (chapter navigation mid-fullscreen)
    const rd = document.getElementById('reader');
    if (rd) { rd.classList.toggle('fs', _isFullscreen); _syncFsOverlay(rd); }
  }

  async function loadScrollPosition() {
    if (!_comicId || !_chapId) return;
    try {
      const { data } = await window._sb.from('read_positions')
        .select('page_index, scroll_ratio')
        .eq('user_id', Auth.getUserId())
        .eq('comic_id', _comicId)
        .single();
      if (!data || data.page_index === 0) return;
      // Chờ DOM render xong rồi scroll đến đúng trang
      setTimeout(() => restoreScroll(data.page_index, data.scroll_ratio), 800);
    } catch {}
  }

  function restoreScroll(pageIdx, ratio) {
    const scroll = document.querySelector('#reader .rscroll')
                || document.querySelector('#reader [style*="overflow-y:auto"]');
    if (!scroll) return;
    // Single view: .rpiw, Split view: .grid-row
    const pages = scroll.querySelectorAll('.rpiw, .grid-row');
    const target = pages[pageIdx];
    if (target) {
      const offset = target.offsetTop + ratio * (target.offsetHeight || 0);
      scroll.scrollTop = offset;
    }
  }

  function saveScrollPosition(scrollEl) {
    if (!_isUserPage || !window._sb || !_comicId) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      // Single view: .rpiw, Split view: .grid-row
      const pages = scrollEl.querySelectorAll('.rpiw, .grid-row');
      if (!pages.length) return;
      const top = scrollEl.scrollTop;
      let pageIdx = 0;
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].offsetTop <= top + 4) pageIdx = i;
        else break;
      }
      const h = pages[pageIdx]?.offsetHeight || 1;
      const scrollRatio = Math.max(0, Math.min(1, (top - (pages[pageIdx]?.offsetTop || 0)) / h));
      try {
        await window._sb.from('read_positions').upsert({
          user_id:      Auth.getUserId(),
          comic_id:     _comicId,
          chap_id:      _chapId,
          page_index:   pageIdx,
          scroll_ratio: scrollRatio,
          updated_at:   new Date().toISOString(),
        }, { onConflict: 'user_id,comic_id' });
      } catch {}
    }, 1500);
  }

  function attachScrollSave(scrollEl) {
    if (!scrollEl) return;
    scrollEl.addEventListener('scroll',
      () => saveScrollPosition(scrollEl), { passive: true });
  }

  function attachScrollSaveDelayed(scrollEl, delay = 500) {
    // Dùng cho split grid — cần đợi ảnh render mới có offsetTop đúng
    if (!scrollEl) return;
    setTimeout(() => attachScrollSave(scrollEl), delay);
  }

  /* ══ DESTROY ══════════════════════════════════════════ */
  function destroy() {
    if (_keyHandler) {
      document.removeEventListener('keydown', _keyHandler);
      _keyHandler = null;
    }
    if (_swipe) {
      _swipe.el.removeEventListener('touchstart', _swipe.onStart);
      _swipe.el.removeEventListener('touchmove',  _swipe.onMove);
      _swipe.el.removeEventListener('touchend',   _swipe.onEnd);
      _swipe = null;
    }
    clearTimeout(_saveTimer);
    if (document.fullscreenElement) document.exitFullscreen?.();
    _isFullscreen = false;
    const rd = document.getElementById('reader');
    if (rd) rd.classList.remove('fs');
    _comicId = null; _chapId = null;
  }

  document.addEventListener('fullscreenchange', () => {
    // Nếu browser thoát native fullscreen (ESC), sync lại CSS state
    if (!document.fullscreenElement && _isFullscreen) {
      _isFullscreen = false;
      const rd = document.getElementById('reader');
      if (rd) { rd.classList.remove('fs'); _syncFsOverlay(rd); }
    }
    updateFsBtn();
  });

  return { init, destroy, toggleFullscreen, buildFsBtn, setupKeyboard, setupSwipe, setupDoubleTap, attachScrollSave, attachScrollSaveDelayed };
})();
