/* ── TRANSLATE.JS ─────────────────────────────────────────
   MyMemory API wrapper — miễn phí, không cần API key.
   Giới hạn: ~1000 từ/ngày/IP (đủ cho dùng nội bộ).
   Cache trong RAM để tránh gọi trùng.
──────────────────────────────────────────────────────────── */
window.Translate = (() => {
  // Mã ngôn ngữ MyMemory dùng (ISO 639-1)
  const LANG_META = {
    vi: { label: 'Tiếng Việt', flag: '🇻🇳', mm: 'vi-VN' },
    en: { label: 'English',    flag: '🇬🇧', mm: 'en-GB' },
    ja: { label: '日本語',      flag: '🇯🇵', mm: 'ja-JP' },
    zh: { label: '中文',        flag: '🇨🇳', mm: 'zh-CN' },
    ko: { label: '한국어',      flag: '🇰🇷', mm: 'ko-KR' },
    fr: { label: 'Français',   flag: '🇫🇷', mm: 'fr-FR' },
    de: { label: 'Deutsch',    flag: '🇩🇪', mm: 'de-DE' },
    es: { label: 'Español',    flag: '🇪🇸', mm: 'es-ES' },
  };

  const cache = new Map(); // key: `${from}|${to}|${text}` → translated string

  function cacheKey(text, from, to) { return `${from}|${to}|${text}`; }

  /* Dịch một đoạn văn bản.
     Trả về string kết quả hoặc throw Error nếu thất bại. */
  async function translate(text, fromLang, toLang) {
    if (!text?.trim()) return '';
    if (fromLang === toLang) return text;

    const key = cacheKey(text, fromLang, toLang);
    if (cache.has(key)) return cache.get(key);

    const fromMM = LANG_META[fromLang]?.mm || fromLang;
    const toMM   = LANG_META[toLang]?.mm   || toLang;

    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromMM}|${toMM}`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
    const json = await res.json();

    if (json.responseStatus !== 200) {
      throw new Error(json.responseDetails || `MyMemory lỗi ${json.responseStatus}`);
    }

    const result = json.responseData?.translatedText || '';
    cache.set(key, result);
    return result;
  }

  /* Dịch một text sang nhiều ngôn ngữ cùng lúc.
     Trả về { lang: translatedText, ... } */
  async function translateMany(text, fromLang, toLangs) {
    const results = {};
    await Promise.all(toLangs.map(async lang => {
      try { results[lang] = await translate(text, fromLang, lang); }
      catch { results[lang] = ''; }
    }));
    return results;
  }

  function getLangMeta(code) { return LANG_META[code] || { label: code, flag: '🌐', mm: code }; }
  function getAllLangs()      { return Object.keys(LANG_META); }
  function getLangLabel(code) {
    const m = LANG_META[code];
    return m ? `${m.flag} ${m.label}` : code;
  }

  return { translate, translateMany, getLangMeta, getAllLangs, getLangLabel, LANG_META };
})();
