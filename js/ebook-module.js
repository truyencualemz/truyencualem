/* ── EBOOK-MODULE.JS ──────────────────────────────────────
   Hỗ trợ đọc CBZ/CBR (comic ZIP), EPUB, FB2.
   Yêu cầu: JSZip phải load trước từ CDN.
──────────────────────────────────────────────────────────── */
window.EbookModule = (() => {

  /* ── Fetch file (Drive qua Apps Script hoặc URL trực tiếp) ── */
  async function fetchDriveFile(url) {
    const m = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/) || url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    const fileId = m?.[1];
    if (!fileId) throw new Error('Không đọc được Drive file ID từ URL');
    const gdUrl = window.App?.gdScriptUrl || window.GD_SCRIPT_URL || '';
    if (!gdUrl) throw new Error('Chưa cấu hình Apps Script URL — vào Cài đặt để nhập');
    const res = await fetch(`${gdUrl}?fileId=${encodeURIComponent(fileId)}`);
    if (!res.ok) throw new Error(`Apps Script HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    if (!json.data) throw new Error('Apps Script không trả về data');
    const bin = atob(json.data);
    const buf = new ArrayBuffer(bin.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
    return buf;
  }

  async function fetchFile(url) {
    if (url.includes('drive.google.com')) return fetchDriveFile(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.arrayBuffer();
  }

  /* ════════════════════════════════════════════════════
     CBZ / CBR — ZIP chứa ảnh (comic book archive)
  ════════════════════════════════════════════════════ */
  async function buildCBZEl(url, widthStyle) {
    if (!window.JSZip) throw new Error('JSZip chưa được tải');
    const buf = await fetchFile(url);
    const zip = await JSZip.loadAsync(buf);

    const imgFiles = Object.values(zip.files)
      .filter(f => !f.dir && /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    if (!imgFiles.length) throw new Error('Không tìm thấy ảnh trong file CBZ/ZIP');

    const wrap = document.createElement('div');
    wrap.style.cssText = `width:${widthStyle || '100%'};max-width:none`;

    // Lazy load từng ảnh trong ZIP
    const obs = window.IntersectionObserver ? new IntersectionObserver((entries, ob) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        ob.unobserve(e.target);
        e.target._load?.();
      });
    }, { rootMargin: '300px 0px' }) : null;

    for (const file of imgFiles) {
      const ph = document.createElement('div');
      ph.style.cssText = 'width:100%;min-height:80px;background:var(--bg-secondary)';

      const doLoad = async () => {
        const blob = await file.async('blob');
        const blobUrl = URL.createObjectURL(blob);
        const img = document.createElement('img');
        img.src = blobUrl;
        img.style.cssText = 'width:100%;height:auto;display:block';
        ph.style.minHeight = '';
        ph.appendChild(img);
      };

      if (obs) { ph._load = doLoad; obs.observe(ph); }
      else await doLoad();
      wrap.appendChild(ph);
    }
    return wrap;
  }

  /* ════════════════════════════════════════════════════
     EPUB — ZIP theo chuẩn OPF (IDPF)
  ════════════════════════════════════════════════════ */
  async function buildEPUBEl(url) {
    if (!window.JSZip) throw new Error('JSZip chưa được tải');
    const buf = await fetchFile(url);
    const zip = await JSZip.loadAsync(buf);
    const parser = new DOMParser();

    // Bước 1: Đọc container.xml để biết đường dẫn OPF
    const contXml = await zip.file('META-INF/container.xml')?.async('text');
    if (!contXml) throw new Error('EPUB thiếu META-INF/container.xml');
    const contDoc = parser.parseFromString(contXml, 'application/xml');
    const opfPath = contDoc.querySelector('rootfile')?.getAttribute('full-path');
    if (!opfPath) throw new Error('EPUB thiếu đường dẫn OPF trong container.xml');

    const opfXml = await zip.file(opfPath)?.async('text');
    if (!opfXml) throw new Error(`EPUB thiếu file OPF: ${opfPath}`);
    const opfDoc = parser.parseFromString(opfXml, 'application/xml');
    const opfDir = opfPath.includes('/') ? opfPath.split('/').slice(0, -1).join('/') + '/' : '';

    // Bước 2: Tạo blob URL cho ảnh trong ZIP
    const imgBlobs = {};
    for (const [name, file] of Object.entries(zip.files)) {
      if (!file.dir && /\.(jpe?g|png|webp|gif|svg)$/i.test(name)) {
        const blob = await file.async('blob');
        const blobUrl = URL.createObjectURL(blob);
        imgBlobs[name] = blobUrl;
        imgBlobs[name.split('/').pop()] = blobUrl;
        imgBlobs[decodeURIComponent(name.split('/').pop())] = blobUrl;
      }
    }

    // Bước 3: Build manifest và spine
    const manifest = {};
    opfDoc.querySelectorAll('manifest item').forEach(item => {
      manifest[item.getAttribute('id')] = {
        href: item.getAttribute('href') || '',
        type: item.getAttribute('media-type') || '',
      };
    });
    const spineIds = Array.from(opfDoc.querySelectorAll('spine itemref')).map(r => r.getAttribute('idref'));
    const spineItems = spineIds.map(id => manifest[id]).filter(item =>
      item?.type?.includes('html') || item?.type?.includes('xml')
    );

    const wrap = document.createElement('div');
    wrap.className = 'epub-viewer';

    // Bước 4: Render từng spine item
    for (const item of spineItems) {
      const filePath = opfDir + item.href.split('?')[0].split('#')[0];
      const rawHtml = await zip.file(filePath)?.async('text')
                   || await zip.file(item.href.split('#')[0])?.async('text');
      if (!rawHtml) continue;

      const htmlDoc = parser.parseFromString(rawHtml, 'application/xhtml+xml');
      const body = htmlDoc.querySelector('body');
      if (!body) continue;

      // Thay src ảnh bằng blob URL
      body.querySelectorAll('img[src]').forEach(img => {
        const src = img.getAttribute('src') || '';
        const short = decodeURIComponent(src.split('/').pop());
        img.setAttribute('src', imgBlobs[src] || imgBlobs[short] || src);
      });

      const section = document.createElement('div');
      section.className = 'epub-section';
      const cleaned = body.innerHTML
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<link[^>]*>/gi, '');
      section.innerHTML = cleaned;
      wrap.appendChild(section);
    }

    if (!wrap.children.length) wrap.textContent = 'Không đọc được nội dung EPUB';
    return wrap;
  }

  /* ════════════════════════════════════════════════════
     FB2 — XML novel format (phổ biến ở CIS)
  ════════════════════════════════════════════════════ */
  async function buildFB2El(url) {
    let text;
    if (url.includes('drive.google.com')) {
      const buf = await fetchDriveFile(url);
      // Thử detect encoding từ XML declaration
      const head = new TextDecoder('utf-8').decode(buf.slice(0, 200));
      const encMatch = head.match(/encoding=["']([^"']+)/i);
      const enc = encMatch?.[1]?.toLowerCase() || 'utf-8';
      text = new TextDecoder(enc).decode(buf);
    } else {
      const res = await fetch(url); text = await res.text();
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('File FB2 không hợp lệ (XML parse error)');

    const wrap = document.createElement('div');
    wrap.className = 'fb2-viewer';

    // Tiêu đề sách
    const bookTitle = doc.querySelector('book-title')?.textContent?.trim();
    if (bookTitle) {
      const h = document.createElement('h2');
      h.className = 'ebook-title';
      h.textContent = bookTitle;
      wrap.appendChild(h);
    }

    // Tác giả
    const firstName = doc.querySelector('author > first-name')?.textContent?.trim() || '';
    const lastName  = doc.querySelector('author > last-name')?.textContent?.trim() || '';
    const authorName = [firstName, lastName].filter(Boolean).join(' ');
    if (authorName) {
      const a = document.createElement('div');
      a.className = 'ebook-author';
      a.textContent = authorName;
      wrap.appendChild(a);
    }

    // Render từng section/chapter
    const bodies = doc.querySelectorAll('body');
    bodies.forEach(body => {
      body.querySelectorAll(':scope > section').forEach(sec => {
        const div = document.createElement('div');
        div.className = 'epub-section';

        const titleEl = sec.querySelector(':scope > title');
        if (titleEl) {
          const h = document.createElement('h3');
          h.className = 'ebook-chap-title';
          h.textContent = titleEl.textContent?.trim();
          div.appendChild(h);
        }

        sec.querySelectorAll('p').forEach(p => {
          if (p.closest('title')) return;
          const el = document.createElement('p');
          el.textContent = p.textContent;
          div.appendChild(el);
        });

        if (div.querySelector('p, h3')) wrap.appendChild(div);
      });

      // FB2 không có section — render thẳng p
      if (!body.querySelector('section')) {
        body.querySelectorAll('p').forEach(p => {
          const el = document.createElement('p');
          el.textContent = p.textContent;
          wrap.appendChild(el);
        });
      }
    });

    if (!wrap.querySelector('p, h2, h3')) wrap.textContent = 'Không đọc được nội dung FB2';
    return wrap;
  }

  return { buildCBZEl, buildEPUBEl, buildFB2El };
})();
