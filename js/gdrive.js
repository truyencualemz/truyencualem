/* ── GDRIVE.JS ────────────────────────────────────────────
   Google Drive folder import via Apps Script proxy.
   Fallback: bulk paste individual share links.
──────────────────────────────────────────────────────────── */
window.GDrive = (() => {
  const GD_ALLOWED = ['image/jpeg','image/png','image/webp','image/gif','image/bmp','application/pdf'];

  function extractFolderId(url) {
    const m  = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);  if (m)  return m[1];
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);      if (m2) return m2[1];
    return null;
  }
  function extractFileId(url) {
    const m  = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);    if (m)  return m[1];
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/); if (m2) return m2[1];
    return null;
  }
  function gdViewURL(fileId) { return `https://drive.google.com/uc?export=view&id=${fileId}`; }
  function mimeToType(mime)  { return mime === 'application/pdf' ? 'pdf' : 'image'; }

  function toObj(f) {
    const url  = gdViewURL(f.id);
    const type = mimeToType(f.mimeType);
    return { type, name: f.name, url, previewURL: type === 'image' ? url : null };
  }

  function toObjFromId(fileId, isPDF) {
    const url = gdViewURL(fileId);
    return { type: isPDF ? 'pdf' : 'image', name: fileId.slice(0, 16), url, previewURL: isPDF ? null : url };
  }

  // Merge imported objs into pendingPages
  function mergeLang(objs, lang) {
    const pages = App.pendingPages;
    if (lang === 'both') {
      // Interleave: odd index → vi, even index → en
      objs.forEach((obj, i) => {
        const slot = Math.floor(i / 2), side = i % 2 === 0 ? 'vi' : 'en';
        while (pages.length <= slot)
          pages.push({ id: 'p' + Date.now() + Math.random(), vi: null, en: null, note: '' });
        if (!pages[slot][side]) pages[slot][side] = obj;
      });
    } else {
      objs.forEach(obj => {
        let placed = false;
        for (let j = 0; j < pages.length; j++) {
          if (!pages[j][lang]) { pages[j][lang] = obj; placed = true; break; }
        }
        if (!placed) {
          const p = { id: 'p' + Date.now() + Math.random(), vi: null, en: null, note: '' };
          p[lang] = obj;
          pages.push(p);
        }
      });
    }
  }

  // ── Apps Script fetch ──────────────────────────────────
  async function fetchFolder(rawUrl) {
    const statusEl  = document.getElementById('gd-as-status');
    const resultEl  = document.getElementById('gd-as-result');
    const actionsEl = document.getElementById('gd-as-actions');
    const st = (type, msg) => {
      if (!statusEl) return;
      statusEl.className = 'gd-status ' + type;
      statusEl.textContent = msg;
      statusEl.style.display = 'block';
    };

    if (!rawUrl)               { st('err', '⚠ Chưa nhập link folder'); return; }
    if (!App.gdScriptUrl)      { st('err', '⚠ Chưa có Apps Script URL. Vào Cài đặt để lưu.'); return; }
    const folderId = extractFolderId(rawUrl);
    if (!folderId)             { st('err', '⚠ Không nhận ra folder ID trong URL'); return; }

    st('loading', '⏳ Đang lấy danh sách file...');
    if (resultEl)  resultEl.style.display  = 'none';
    if (actionsEl) actionsEl.style.display = 'none';

    try {
      const res  = await fetch(`${App.gdScriptUrl}?folderId=${encodeURIComponent(folderId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const files = (data.files || []).filter(f => GD_ALLOWED.includes(f.mimeType));
      if (!files.length) { st('err', '⚠ Không tìm thấy file ảnh/PDF nào'); return; }

      App.gdFiles = files.map(f => ({ ...f, selected: true }));
      st('ok', `✓ Tìm thấy ${App.gdFiles.length} file`);
      renderFileList();
      if (resultEl)  resultEl.style.display  = 'block';
      if (actionsEl) actionsEl.style.display = 'flex';
    } catch (e) {
      let msg = e.message;
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError'))
        msg = 'Không kết nối được → Kiểm tra script đã deploy chưa, thử mở URL script trên trình duyệt';
      if (msg.includes('403') || msg.includes('permission'))
        msg = 'Folder chưa được chia sẻ công khai hoặc script chưa được cấp quyền';
      st('err', '⚠ ' + msg);
    }
  }

  function renderFileList() {
    const el = document.getElementById('gd-as-result');
    if (!el) return;
    el.innerHTML = '';
    App.gdFiles.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'gd-file' + (f.selected ? ' selected' : '');
      const cb   = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'gd-file-check'; cb.checked = f.selected;
      const icon = document.createElement('div'); icon.className = 'gd-file-icon'; icon.textContent = f.mimeType === 'application/pdf' ? '📄' : '🖼️';
      const name = document.createElement('div'); name.className = 'gd-file-name'; name.textContent = f.name; name.title = f.name;
      const type = document.createElement('div'); type.className = 'gd-file-type'; type.textContent = f.mimeType === 'application/pdf' ? 'PDF' : 'IMG';
      cb.addEventListener('change', () => {
        App.gdFiles[i].selected = cb.checked;
        row.className = 'gd-file' + (cb.checked ? ' selected' : '');
        updateSelInfo();
      });
      row.addEventListener('click', e => { if (e.target === cb) return; cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); });
      [cb, icon, name, type].forEach(n => row.appendChild(n));
      el.appendChild(row);
    });
    updateSelInfo();
  }

  function updateSelInfo() {
    const el = document.getElementById('gd-sel-info');
    if (el) el.textContent = `${App.gdFiles.filter(f => f.selected).length} / ${App.gdFiles.length} file đã chọn`;
  }
  function toggleAll(v) { App.gdFiles.forEach(f => f.selected = v); renderFileList(); }

  function importSelected() {
    const selected = App.gdFiles.filter(f => f.selected);
    if (!selected.length) { alert('Chưa chọn file nào'); return; }
    const lang = document.getElementById('gd-lang-sel')?.value || 'vi';
    mergeLang(selected.map(toObj), lang);
    window.AdminForm.refreshTable();
    const st = document.getElementById('gd-as-status');
    if (st) { st.className = 'gd-status ok'; st.textContent = `✓ Đã import ${selected.length} file`; }
  }

  // ── Bulk paste ─────────────────────────────────────────
  function importBulk() {
    const ta   = document.getElementById('gd-bulk-ta');
    const stEl = document.getElementById('gd-bulk-status');
    if (!ta) return;
    const lines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) { if (stEl) { stEl.className = 'gd-status err'; stEl.textContent = '⚠ Chưa có link nào'; stEl.style.display = 'block'; } return; }
    const lang = document.getElementById('gd-bulk-lang')?.value || 'vi';
    const objs = [];
    for (const line of lines) {
      const fid = extractFileId(line);
      if (!fid) continue;
      const isPDF = line.toLowerCase().includes('.pdf');
      objs.push(toObjFromId(fid, isPDF));
    }
    if (!objs.length) { if (stEl) { stEl.className = 'gd-status err'; stEl.textContent = '⚠ Không tìm thấy file ID hợp lệ'; stEl.style.display = 'block'; } return; }
    mergeLang(objs, lang);
    window.AdminForm.refreshTable();
    if (stEl) { stEl.className = 'gd-status ok'; stEl.textContent = `✓ Đã import ${objs.length} file`; stEl.style.display = 'block'; }
  }

  // ── Build UI ───────────────────────────────────────────
  function buildUI() {
    const U = window.UI;
    const box = U.div('gd-box');
    const tabBar = U.div('stabs'); tabBar.style.marginBottom = '10px';
    const tAS   = U.el('button','stab active'); tAS.textContent   = '📜 Apps Script';
    const tBulk = U.el('button','stab');        tBulk.textContent = '🔗 Dán nhiều link';
    const panelAS = U.div(), panelBulk = U.div(); panelBulk.style.display = 'none';
    tAS.addEventListener('click',   () => { tAS.className='stab active'; tBulk.className='stab'; panelAS.style.display=''; panelBulk.style.display='none'; });
    tBulk.addEventListener('click', () => { tBulk.className='stab active'; tAS.className='stab'; panelBulk.style.display=''; panelAS.style.display='none'; });
    tabBar.appendChild(tAS); tabBar.appendChild(tBulk); box.appendChild(tabBar);

    /* Apps Script panel */
    const hint = U.div('gd-hint');
    hint.innerHTML = `<b>Thiết lập 1 lần (miễn phí):</b><br>
1. Mở <a href="https://script.google.com" target="_blank" style="color:#c8a96e">script.google.com</a> → New project → dán code bên dưới<br>
2. Deploy → New deployment → Web app → Execute as: <b>Me</b> → Who has access: <b>Anyone</b> → Deploy<br>
3. Copy URL web app → dán vào Cài đặt → lưu<br>
⚠ Nếu đã có script cũ: thay toàn bộ code rồi <b>deploy lại (New deployment)</b> — chỉ Save không đủ.
<details style="margin-top:6px;cursor:pointer"><summary style="color:#c8a96e;font-size:10px">▶ Code Apps Script cần dán (copy toàn bộ)</summary>
<pre style="background:#0d0d10;border:1px solid #2a2a30;border-radius:4px;padding:8px;margin-top:6px;font-size:10px;color:#9ae;overflow-x:auto;white-space:pre">function doGet(e) {
  try {
    // --- List files in folder ---
    if (e.parameter.folderId) {
      var folder = DriveApp.getFolderById(e.parameter.folderId);
      var files = [], it = folder.getFiles();
      while (it.hasNext()) {
        var f = it.next();
        files.push({
          id: f.getId(),
          name: f.getName(),
          mimeType: f.getMimeType()
        });
      }
      files.sort(function(a, b) {
        return a.name.localeCompare(b.name, undefined, {numeric: true});
      });
      return ok({files: files});
    }

    // --- Return file content as base64 (for PDF rendering) ---
    if (e.parameter.fileId) {
      var fileId = e.parameter.fileId;
      var file = DriveApp.getFileById(fileId);
      var blob = file.getBlob();
      var b64  = Utilities.base64Encode(blob.getBytes());
      return ok({data: b64, name: file.getName()});
    }

    return ok({error: 'Missing parameter: folderId or fileId'});

  } catch(err) {
    return ok({error: err.toString()});
  }
}

function ok(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}</pre></details>`;
    panelAS.appendChild(hint);

    // Script URL display (read from App.gdScriptUrl set in settings)
    if (App.gdScriptUrl) {
      const info = U.div(); info.style.cssText = 'font-size:10px;color:#4caf50;margin-bottom:8px;padding:5px 8px;background:#1a2e1a;border-radius:4px';
      info.textContent = '✓ Apps Script đã thiết lập. Nhập folder URL bên dưới:';
      panelAS.appendChild(info);
      const fRow = U.div('gd-row');
      const fInp = U.el('input', 'fi'); fInp.style.cssText = 'flex:1;font-size:11px;padding:6px 9px';
      fInp.id = 'gd-folder-url'; fInp.placeholder = 'https://drive.google.com/drive/folders/...';
      const fBtn = U.mkBtn('btn-primary btn-xs', 'Lấy danh sách', () => fetchFolder(fInp.value.trim()));
      fInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fBtn.click(); } });
      fRow.appendChild(fInp); fRow.appendChild(fBtn); panelAS.appendChild(fRow);
    } else {
      const warn = U.div(); warn.style.cssText = 'font-size:10px;color:#888;padding:8px;background:#111;border-radius:5px';
      warn.textContent = '→ Vào Cài đặt để lưu Apps Script URL trước.';
      panelAS.appendChild(warn);
    }

    const asStatus  = U.div(); asStatus.id  = 'gd-as-status';
    const asResult  = U.div('gd-result'); asResult.id  = 'gd-as-result';  asResult.style.display  = 'none';
    const asActions = U.div('gd-actions'); asActions.id = 'gd-as-actions'; asActions.style.display = 'none';

    const selInfo = U.div('gd-select-info'); selInfo.id = 'gd-sel-info';
    const selAll  = U.mkBtn('btn-ghost btn-xs', 'Chọn tất cả', () => toggleAll(true));
    const selNone = U.mkBtn('btn-ghost btn-xs', 'Bỏ chọn',    () => toggleAll(false));
    const lLbl    = U.div(); lLbl.style.cssText = 'font-size:10px;color:#777;margin-left:auto'; lLbl.textContent = 'Import vào:';
    const lSel    = U.el('select', 'fi'); lSel.id = 'gd-lang-sel'; lSel.style.cssText = 'width:auto;padding:4px 8px;font-size:11px;margin-left:4px';
    lSel.innerHTML = '<option value="vi">🇻🇳 VI</option><option value="en">🇬🇧 EN</option><option value="both">VI + EN (xen kẽ)</option>';
    const impBtn  = U.mkBtn('btn-primary btn-xs', '✓ Import vào bảng', importSelected);
    [selInfo, selAll, selNone, lLbl, lSel, impBtn].forEach(e => asActions.appendChild(e));
    [asStatus, asResult, asActions].forEach(e => panelAS.appendChild(e));

    /* Bulk paste panel */
    const bHint = U.div('gd-hint');
    bHint.innerHTML = 'Dán các link chia sẻ Drive, mỗi link 1 dòng.<br>Hỗ trợ link file ảnh và PDF.';
    const bTa = U.el('textarea', 'fi'); bTa.id = 'gd-bulk-ta'; bTa.rows = 5;
    bTa.style.cssText = 'width:100%;font-size:10px;font-family:monospace;padding:8px;resize:vertical';
    bTa.placeholder = 'https://drive.google.com/file/d/AAA.../view\nhttps://drive.google.com/file/d/BBB.../view';
    const bRow = U.div(); bRow.style.cssText = 'display:flex;gap:6px;margin-top:8px;align-items:center';
    const bLbl = U.div(); bLbl.style.cssText = 'font-size:10px;color:#777'; bLbl.textContent = 'Import vào:';
    const bSel = U.el('select', 'fi'); bSel.id = 'gd-bulk-lang'; bSel.style.cssText = 'width:auto;padding:4px 8px;font-size:11px';
    bSel.innerHTML = '<option value="vi">🇻🇳 VI</option><option value="en">🇬🇧 EN</option><option value="both">VI + EN (xen kẽ)</option>';
    const bBtn = U.mkBtn('btn-primary btn-xs', '✓ Import', importBulk);
    const bSt  = U.div(); bSt.id = 'gd-bulk-status'; bSt.style.cssText = 'font-size:10px;flex:1';
    [bLbl, bSel, bBtn, bSt].forEach(e => bRow.appendChild(e));
    [bHint, bTa, bRow].forEach(e => panelBulk.appendChild(e));

    box.appendChild(panelAS); box.appendChild(panelBulk);
    return box;
  }

  return { buildUI, fetchFolder, importSelected, importBulk, toggleAll };
})();
