/* ── COMMENTS.JS ──────────────────────────────────────────
   Bình luận per chương:
   - Nested reply (1 cấp)
   - Emoji reaction: 👍 ❤️ 😂 😮 😢
   - Admin/owner xóa comment
   - Realtime subscribe (Supabase Realtime)
──────────────────────────────────────────────────────────── */
window.Comments = (() => {
  const sb    = () => window._sb;
  const uid   = () => Auth.getUserId();
  const EMOJIS = ['👍','❤️','😂','😮','😢'];

  /* ── Load comments của 1 chương ── */
  async function load(chapId) {
    const { data, error } = await sb()
      .from('comments')
      .select(`
        id, user_id, parent_id, body, is_deleted, created_at,
        profiles:user_id ( display_name, avatar_url, role ),
        reactions:comment_reactions ( user_id, emoji )
      `)
      .eq('chap_id', chapId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  /* ── Đăng comment mới ── */
  async function post(chapId, comicId, body, parentId = null) {
    if (!uid()) throw new Error('Chưa đăng nhập');
    if (!body?.trim()) throw new Error('Nội dung không được để trống');
    const { data, error } = await sb().from('comments').insert({
      user_id:  uid(),
      comic_id: comicId,
      chap_id:  chapId,
      parent_id: parentId || null,
      body:     body.trim(),
    }).select('id').single();
    if (error) throw error;
    return data;
  }

  /* ── Xóa mềm (is_deleted = true) ── */
  async function remove(commentId) {
    const { error } = await sb().from('comments')
      .update({ is_deleted: true, body: '[Đã xóa]' })
      .eq('id', commentId);
    if (error) throw error;
  }

  /* ── Toggle reaction ── */
  async function toggleReaction(commentId, emoji) {
    if (!uid()) return;
    // Check existing
    const { data: existing } = await sb().from('comment_reactions')
      .select('user_id')
      .eq('user_id', uid())
      .eq('comment_id', commentId)
      .eq('emoji', emoji)
      .single();

    if (existing) {
      await sb().from('comment_reactions')
        .delete()
        .eq('user_id', uid())
        .eq('comment_id', commentId)
        .eq('emoji', emoji);
    } else {
      await sb().from('comment_reactions')
        .insert({ user_id: uid(), comment_id: commentId, emoji });
    }
  }

  /* ══ UI RENDER ══════════════════════════════════════════ */
  function el(tag, cls, style) {
    const e = document.createElement(tag);
    if (cls)   e.className = cls;
    if (style) e.style.cssText = style;
    return e;
  }
  function div(cls, style) { return el('div', cls, style); }
  function esc(s) { const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; }
  function fmtTime(iso) {
    const d = new Date(iso), now = new Date();
    const diff = Math.floor((now - d) / 60000);
    if (diff < 1)    return 'Vừa xong';
    if (diff < 60)   return diff + 'p trước';
    if (diff < 1440) return Math.floor(diff/60) + 'g trước';
    return d.toLocaleDateString('vi-VN');
  }

  /* ── Render panel bình luận ── */
  async function renderPanel(chapId, comicId, container) {
    container.innerHTML = '';
    container.style.cssText = 'padding:16px;max-width:760px';

    const title = div('', 'font-family:monospace;font-size:13px;color:var(--accent);margin-bottom:12px');
    title.textContent = '💬 Bình luận';
    container.appendChild(title);

    // Loading
    const loadingEl = div('', 'font-size:11px;color:var(--text-muted);margin-bottom:10px');
    loadingEl.textContent = 'Đang tải...';
    container.appendChild(loadingEl);

    let comments = [];
    try { comments = await load(chapId); }
    catch(e) {
      loadingEl.textContent = 'Lỗi tải bình luận: ' + e.message;
      return;
    }
    loadingEl.remove();

    // Tổ chức: root comments + replies map
    const roots   = comments.filter(c => !c.parent_id);
    const replyMap = {};
    comments.filter(c => c.parent_id).forEach(c => {
      if (!replyMap[c.parent_id]) replyMap[c.parent_id] = [];
      replyMap[c.parent_id].push(c);
    });

    // Comment list
    const listEl = div('', 'margin-bottom:16px');
    if (!roots.length) {
      const em = div('', 'text-align:center;padding:24px;color:var(--text-muted);font-size:12px');
      em.textContent = 'Chưa có bình luận nào. Hãy là người đầu tiên!';
      listEl.appendChild(em);
    } else {
      roots.forEach(c => {
        listEl.appendChild(buildComment(c, replyMap[c.id] || [], chapId, comicId, listEl, comments));
      });
    }
    container.appendChild(listEl);

    // Write box (cho user đăng nhập)
    if (uid()) {
      container.appendChild(buildWriteBox(chapId, comicId, null, '💬 Viết bình luận...', async() => {
        await renderPanel(chapId, comicId, container);
      }));
    } else {
      const hint = div('', 'font-size:12px;color:var(--text-muted);text-align:center;padding:12px;background:var(--bg-secondary);border-radius:6px');
      hint.textContent = 'Đăng nhập để bình luận.';
      container.appendChild(hint);
    }
  }

  function buildComment(c, replies, chapId, comicId, listEl, allComments) {
    const isMe    = c.user_id === uid();
    const isAdmin = window.CURRENT_ROLE === 'admin' || window.Auth?.getProfile?.()?.role === 'admin';
    const profile = c.profiles;
    const name    = profile?.display_name || 'Ẩn danh';
    const avatar  = profile?.avatar_url;
    const role    = profile?.role;

    const wrap = div('', 'margin-bottom:12px');

    // Avatar + name row
    const hdr = div('', 'display:flex;align-items:center;gap:8px;margin-bottom:6px');
    const av = div('', 'width:28px;height:28px;border-radius:50%;background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:12px;overflow:hidden;flex-shrink:0');
    if (avatar) av.innerHTML = `<img src="${esc(avatar)}" style="width:100%;height:100%;object-fit:cover">`;
    else av.textContent = name.charAt(0).toUpperCase();

    const nameLbl = div('', 'font-size:12px;font-weight:500;color:var(--text-primary)');
    nameLbl.textContent = name;

    // Role badge
    if (role === 'admin' || role === 'publisher') {
      const badge = el('span', '', 'font-size:9px;padding:1px 5px;border-radius:3px;background:var(--accent-dim);color:var(--accent);margin-left:4px;font-family:monospace');
      badge.textContent = role === 'admin' ? 'Admin' : 'Publisher';
      nameLbl.appendChild(badge);
    }

    const timeLbl = div('', 'font-size:10px;color:var(--text-muted);margin-left:auto');
    timeLbl.textContent = fmtTime(c.created_at);

    [av, nameLbl, timeLbl].forEach(e => hdr.appendChild(e));
    wrap.appendChild(hdr);

    // Body
    const body = div('', `font-size:13px;line-height:1.7;color:${c.is_deleted ? 'var(--text-muted)' : 'var(--text-primary)'};font-style:${c.is_deleted ? 'italic' : 'normal'};padding:8px 10px;background:var(--bg-secondary);border-radius:6px;margin-left:36px`);
    body.textContent = c.body;
    wrap.appendChild(body);

    // Reaction + actions row
    const actRow = div('', 'display:flex;align-items:center;gap:6px;margin-left:36px;margin-top:5px;flex-wrap:wrap');

    // Emoji reactions
    const reactionMap = {};
    (c.reactions || []).forEach(r => {
      if (!reactionMap[r.emoji]) reactionMap[r.emoji] = { count: 0, mine: false };
      reactionMap[r.emoji].count++;
      if (r.user_id === uid()) reactionMap[r.emoji].mine = true;
    });

    if (!c.is_deleted) {
      EMOJIS.forEach(emoji => {
        const rb = el('button', '', `background:${reactionMap[emoji]?.mine ? 'var(--accent-dim)' : 'var(--bg-secondary)'};border:1px solid ${reactionMap[emoji]?.mine ? 'var(--accent)' : 'var(--border)'};border-radius:12px;padding:2px 7px;font-size:12px;cursor:pointer;color:var(--text-primary);transition:all .12s`);
        rb.innerHTML = emoji + (reactionMap[emoji]?.count ? ` <span style="font-size:10px">${reactionMap[emoji].count}</span>` : '');
        rb.addEventListener('click', async () => {
          if (!uid()) return;
          await toggleReaction(c.id, emoji);
          // Inline update
          if (reactionMap[emoji]?.mine) {
            reactionMap[emoji].count--; reactionMap[emoji].mine = false;
          } else {
            if (!reactionMap[emoji]) reactionMap[emoji] = { count: 0, mine: false };
            reactionMap[emoji].count++; reactionMap[emoji].mine = true;
          }
          rb.style.background = reactionMap[emoji].mine ? 'var(--accent-dim)' : 'var(--bg-secondary)';
          rb.style.borderColor = reactionMap[emoji].mine ? 'var(--accent)' : 'var(--border)';
          rb.innerHTML = emoji + (reactionMap[emoji].count ? ` <span style="font-size:10px">${reactionMap[emoji].count}</span>` : '');
        });
        actRow.appendChild(rb);
      });

      // Reply button
      if (uid() && !c.parent_id) {
        const replyBtn = el('button', '', 'background:none;border:none;font-size:11px;color:var(--text-muted);cursor:pointer;padding:2px 6px;border-radius:4px');
        replyBtn.textContent = '↩ Trả lời';
        replyBtn.addEventListener('click', () => {
          const existing = wrap.querySelector('.reply-box');
          if (existing) { existing.remove(); return; }
          const box = buildWriteBox(chapId, comicId, c.id, `Trả lời ${name}...`, async () => {
            await renderPanel(chapId, comicId, listEl.parentElement);
          });
          box.className = 'reply-box';
          box.style.marginLeft = '36px';
          wrap.appendChild(box);
        });
        actRow.appendChild(replyBtn);
      }

      // Delete button
      if ((isMe || isAdmin) && !c.is_deleted) {
        const delBtn = el('button', '', 'background:none;border:none;font-size:11px;color:#e05555;cursor:pointer;padding:2px 6px;border-radius:4px;margin-left:auto');
        delBtn.textContent = '🗑';
        delBtn.title = 'Xóa bình luận';
        delBtn.addEventListener('click', async () => {
          if (!confirm('Xóa bình luận này?')) return;
          await remove(c.id);
          body.textContent = '[Đã xóa]';
          body.style.fontStyle = 'italic';
          body.style.color = 'var(--text-muted)';
          actRow.remove();
        });
        actRow.appendChild(delBtn);
      }
    }
    wrap.appendChild(actRow);

    // Replies
    if (replies.length) {
      const replyWrap = div('', 'margin-left:36px;padding-left:12px;border-left:2px solid var(--border);margin-top:8px');
      replies.forEach(r => replyWrap.appendChild(buildComment(r, [], chapId, comicId, listEl, allComments)));
      wrap.appendChild(replyWrap);
    }

    return wrap;
  }

  function buildWriteBox(chapId, comicId, parentId, placeholder, onSuccess) {
    const box = div('', 'margin-top:8px');
    const ta = el('textarea', '', `width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:9px 12px;color:var(--text-primary);font-size:13px;outline:none;font-family:inherit;resize:vertical;min-height:70px;transition:border-color .15s`);
    ta.placeholder = placeholder;
    ta.addEventListener('focus', () => ta.style.borderColor = 'var(--accent)');
    ta.addEventListener('blur',  () => ta.style.borderColor = 'var(--border)');

    const btnRow = div('', 'display:flex;gap:6px;margin-top:6px;justify-content:flex-end');
    const submitBtn = el('button', 'btn btn-primary btn-xs', '');
    submitBtn.textContent = '✓ Gửi';
    submitBtn.addEventListener('click', async () => {
      const body = ta.value.trim();
      if (!body) { ta.focus(); return; }
      submitBtn.disabled = true; submitBtn.textContent = 'Đang gửi...';
      try {
        await post(chapId, comicId, body, parentId);
        ta.value = '';
        await onSuccess();
      } catch(e) {
        alert('Lỗi: ' + e.message);
        submitBtn.disabled = false; submitBtn.textContent = '✓ Gửi';
      }
    });
    btnRow.appendChild(submitBtn);
    box.appendChild(ta); box.appendChild(btnRow);
    return box;
  }

  return { load, post, remove, toggleReaction, renderPanel };
})();
