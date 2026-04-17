/* ── PDF-MODULE.JS ────────────────────────────────────────
   PDF.js canvas cache + unified page element builder.

   Nguồn PDF được xử lý thống nhất thành canvas:
     • IDB (uploaded)      → PDF.js trực tiếp        ✓
     • Drive URL           → fetch qua Apps Script    ✓ (no CORS)
     • URL khác            → PDF.js trực tiếp (nếu server cho phép CORS)

   Tất cả đều ra canvas → scroll hoàn toàn tự nhiên,
   không cần iframe, không lệch khi xem song song.
──────────────────────────────────────────────────────────── */
window.PDFModule = (() => {
  // canvas cache: key → {status:'pending'|'done'|'error', canvases:[]}
  const canvasCache = {};
  const renderQueue = {}; // key → Promise

  // ── Helpers ───────────────────────────────────────────
  function extractDriveId(url) {
    if (!url) return null;
    // https://drive.google.com/uc?export=view&id=ID  (stored format from gdrive.js)
    let m = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (m) return m[1];
    // https://drive.google.com/file/d/ID/...
    m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    if (m) return m[1];
    // https://drive.google.com/open?id=ID
    m = url.match(/open\?id=([a-zA-Z0-9_-]{10,})/);
    if (m) return m[1];
    return null;
  }
  function isDriveURL(url) { return !!(url && url.includes('drive.google.com')); }

  // ── Fetch Drive PDF via Apps Script (returns ArrayBuffer) ──
  // Apps Script nhận ?fileId=ID, trả JSON {data: base64string}
  async function fetchDrivePDF(driveUrl) {
    const fileId = extractDriveId(driveUrl);
    if (!fileId) {
      throw new Error(`Không tách được file ID từ URL: ${driveUrl?.slice(0,80)}`);
    }
    if (!App.gdScriptUrl) {
      throw new Error('Chưa thiết lập Apps Script URL — vào Cài đặt để lưu');
    }

    const endpoint = `${App.gdScriptUrl}?fileId=${encodeURIComponent(fileId)}`;
    let res;
    try {
      res = await fetch(endpoint);
    } catch (e) {
      throw new Error(`Không kết nối Apps Script: ${e.message}`);
    }
    if (!res.ok) throw new Error(`Apps Script HTTP ${res.status}`);

    let json;
    try { json = await res.json(); } catch { throw new Error('Apps Script trả về dữ liệu không hợp lệ (không phải JSON)'); }

    if (json.error) {
      // Trả lỗi chi tiết kèm fileId để dễ debug
      throw new Error(`Apps Script lỗi (fileId=${fileId}): ${json.error}. Hãy kiểm tra: 1) code script đã được cập nhật 2) đã redeploy 3) file trong Drive có thể truy cập`);
    }
    if (!json.data) throw new Error('Apps Script không trả về data PDF');

    // base64 → ArrayBuffer
    const binary = atob(json.data);
    const buf = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    return buf;
  }

  // ── Core render: ArrayBuffer/src → canvas[] ───────────
  async function renderToCanvases(src, scale = 1.8) {
    const loadTask = typeof src === 'string'
      ? pdfjsLib.getDocument(src)
      : pdfjsLib.getDocument({ data: src instanceof ArrayBuffer ? src.slice(0) : src });
    const pdf = await loadTask.promise;
    const canvases = [];
    for (let pg = 1; pg <= pdf.numPages; pg++) {
      const page = await pdf.getPage(pg);
      const vp   = page.getViewport({ scale });
      const cv   = document.createElement('canvas');
      cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      canvases.push(cv);
    }
    return canvases;
  }

  // ── Canvas cache ──────────────────────────────────────
  async function getCanvases(key, srcFn) {
    if (canvasCache[key]?.status === 'done') return canvasCache[key].canvases;
    if (renderQueue[key]) return renderQueue[key];
    canvasCache[key] = { canvases: [], status: 'pending' };
    renderQueue[key] = (async () => {
      try {
        const src = await srcFn();
        if (!src) throw new Error('no src');
        const canvases = await renderToCanvases(src);
        canvasCache[key] = { canvases, status: 'done' };
        return canvases;
      } catch (e) {
        canvasCache[key] = { canvases: [], status: 'error' };
        throw e;
      } finally {
        delete renderQueue[key];
      }
    })();
    return renderQueue[key];
  }

  function cloneCanvas(src) {
    const dst = document.createElement('canvas');
    dst.width = src.width; dst.height = src.height;
    dst.getContext('2d').drawImage(src, 0, 0);
    return dst;
  }

  function invalidateChap(chapId) {
    Object.keys(canvasCache).filter(k => k.startsWith(chapId + '_')).forEach(k => delete canvasCache[k]);
  }

  // ── Prefetch IDB + Drive PDFs for a chapter ───────────
  async function prefetch(comicId, chapIdx) {
    const comic = App.comics.find(c => c.id === comicId);
    const chap  = comic?.chapters?.[chapIdx];
    if (!chap) return;
    for (const p of chap.pages) for (const lang of ['vi', 'en']) {
      const d = p[lang];
      if (!d || d.type !== 'pdf') continue;
      const cacheKey = d.idb
        ? `${chap.id}_${p.id}_${lang}`
        : `drv_${extractDriveId(d.url) || d.url}`;
      if (canvasCache[cacheKey]?.status === 'done') continue;
      // Fire and forget
      getCanvases(cacheKey, async () => {
        if (d.idb) { const rec = await DB.getPage(chap.id, p.id, lang); return rec?.data || null; }
        if (isDriveURL(d.url)) return fetchDrivePDF(d.url);
        return d.url; // external non-Drive URL — PDF.js will try directly
      }).catch(() => {});
    }
  }

  /* ── buildPageEl ─────────────────────────────────────
     Trả về DOM element (img hoặc div.pdf-pages chứa canvas)
     widthStyle: CSS width string, vd '80%' hoặc null (= '100%')
  ──────────────────────────────────────────────────────── */
  async function buildPageEl(d, chapId, pageId, lang, widthStyle) {
    if (!d) return null;
    const ws = widthStyle || '100%';

    // ── IMAGE ─────────────────────────────────────────
    if (d.type === 'image') {
      let src = d.url || d.previewURL || null;
      if (!src && d.idb) src = await DB.getBlobURL(chapId, pageId, lang);
      if (!src) return null;
      const img = document.createElement('img');
      img.src = src; img.loading = 'lazy';
      img.style.cssText = `width:${ws};max-width:none;height:auto;display:block`;
      return img;
    }

    // ── PDF → canvas (tất cả nguồn đều qua PDF.js) ───
    if (d.type === 'pdf') {
      // Cache key: IDB dùng chapId+pageId+lang, Drive dùng fileId
      const cacheKey = d.idb
        ? `${chapId}_${pageId}_${lang}`
        : `drv_${extractDriveId(d.url) || d.url}`;

      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-pages';
      wrapper.style.cssText = `width:${ws};max-width:none`;

      // Nếu đã cache → clone ngay, không async
      const cached = canvasCache[cacheKey];
      if (cached?.status === 'done') {
        cached.canvases.forEach(cv => {
          const c = cloneCanvas(cv);
          c.style.cssText = 'width:100%;height:auto;display:block';
          wrapper.appendChild(c);
        });
        return wrapper;
      }

      // Chưa cache → spinner, render async
      const spinner = document.createElement('div');
      spinner.className = 'pdf-spin';
      spinner.textContent = isDriveURL(d.url)
        ? ' Đang tải PDF từ Drive...'
        : ' Đang render PDF...';
      wrapper.appendChild(spinner);

      (async () => {
        try {
          const canvases = await getCanvases(cacheKey, async () => {
            if (d.idb) {
              const rec = await DB.getPage(chapId, pageId, lang);
              return rec?.data || null;
            }
            if (isDriveURL(d.url)) return fetchDrivePDF(d.url);
            return d.url; // non-Drive external URL
          });
          if (wrapper.contains(spinner)) wrapper.removeChild(spinner);
          canvases.forEach(cv => {
            const c = cloneCanvas(cv);
            c.style.cssText = 'width:100%;height:auto;display:block';
            wrapper.appendChild(c);
          });
        } catch (e) {
          spinner.className = ''; // remove spin animation
          spinner.style.cssText = 'padding:12px;font-size:10px;color:#e05555';
          // Nếu lỗi do chưa có Apps Script URL, hiển thị hướng dẫn
          if (e.message.includes('Apps Script')) {
            spinner.innerHTML = `[PDF Drive: ${e.message}]`;
          } else {
            spinner.textContent = `[lỗi render PDF: ${e.message}]`;
          }
        }
      })();
      return wrapper;
    }

    return null;
  }

  return { buildPageEl, prefetch, invalidateChap };
})();
