/* ── TTS.JS ────────────────────────────────────────────────
   Text-to-Speech module cho text-reader.
   Bỏ qua 'vi' — chỉ đọc các ngôn ngữ khác.
──────────────────────────────────────────────────────────── */
window.TTS = (() => {
  if (!('speechSynthesis' in window)) return null;

  const synth = window.speechSynthesis;

  const LANG_BCP47 = {
    en: 'en', ja: 'ja', zh: 'zh',
    ko: 'ko', fr: 'fr', de: 'de', es: 'es',
  };

  let _playing  = false;
  let _rate     = 1;
  let _voice    = null;
  let _queue    = [];
  let _absIdx   = 0;
  let _onSeg    = null;
  let _onDone   = null;
  let _onWord   = null;

  /* ── Voices ── */
  function getVoicesForLang(langCode) {
    const prefix = LANG_BCP47[langCode] || langCode;
    return synth.getVoices().filter(v => v.lang.startsWith(prefix));
  }

  function setVoice(voiceURI) {
    _voice = synth.getVoices().find(v => v.voiceURI === voiceURI) || null;
  }

  /* ── Dừng hoàn toàn ── */
  function stop() {
    _playing = false; _queue = [];
    synth.cancel();
    _onSeg?.(-1); _onDone?.();
  }

  /* ── Đọc 1 đoạn (không auto-advance) ── */
  function speakSegment(text, lang, onEnd, onWord) {
    synth.cancel();
    if (!text?.trim()) { onEnd?.(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang  = (LANG_BCP47[lang] ? LANG_BCP47[lang] + '-' + lang.toUpperCase() : lang) || lang;
    u.rate  = _rate;
    if (_voice) u.voice = _voice;
    u.onboundary = (e) => { if (e.name === 'word') onWord?.(e.charIndex); };
    u.onend = u.onerror = () => onEnd?.();
    synth.speak(u);
  }

  /* ── Đọc toàn bộ từ startIdx ── */
  function readAll(segs, startIdx, { onSegment, onDone, onWord } = {}) {
    stop();
    _playing = true;
    _onSeg   = onSegment;
    _onDone  = onDone;
    _onWord  = onWord;
    _queue   = segs.slice(startIdx);
    _absIdx  = startIdx;
    _next();
  }

  function _next() {
    if (!_playing || !_queue.length) {
      _playing = false; _onSeg?.(-1); _onDone?.();
      return;
    }
    const seg = _queue.shift();
    _onSeg?.(_absIdx);
    if (!seg.text?.trim()) { _absIdx++; _next(); return; }
    const u = new SpeechSynthesisUtterance(seg.text);
    u.lang  = (LANG_BCP47[seg.lang] ? LANG_BCP47[seg.lang] + '-' + seg.lang.toUpperCase() : seg.lang) || seg.lang;
    u.rate  = _rate;
    if (_voice) u.voice = _voice;
    u.onboundary = (e) => { if (e.name === 'word') _onWord?.(_absIdx, e.charIndex); };
    u.onend = u.onerror = () => { _absIdx++; _next(); };
    synth.speak(u);
  }

  function isPlaying() { return _playing; }
  function setRate(r)  { _rate = Math.max(0.5, Math.min(2, +r || 1)); }

  return { speakSegment, readAll, stop, isPlaying, setRate, getVoicesForLang, setVoice };
})();
