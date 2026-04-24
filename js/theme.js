/* ── THEME.JS ─────────────────────────────────────────────
   Theme system: dark (mặc định) | light | sepia
   - Áp dụng CSS custom properties lên :root
   - Lưu vào localStorage
   - Toggle button nhúng vào bất kỳ container nào
──────────────────────────────────────────────────────────── */
window.Theme = (() => {
  const THEMES = {
    dark: {
      label: '🌙', title: 'Tối',
      '--bg-app':       '#0f0f11',
      '--bg-primary':   '#18181c',
      '--bg-secondary': '#111',
      '--bg-tertiary':  '#1a1a1e',
      '--border':       '#2a2a30',
      '--text-primary': '#e8e6e0',
      '--text-secondary':'#aaa',
      '--text-muted':   '#555',
      '--accent':       '#c8a96e',
      '--accent-dim':   '#c8a96e22',
      '--reader-bg':    '#0a0a0b',
      '--reader-text':  '#d4d0c8',
    },
    light: {
      label: '☀️', title: 'Sáng',
      '--bg-app':        '#f0eeeb',
      '--bg-primary':    '#faf9f7',
      '--bg-secondary':  '#ebe8e4',
      '--bg-tertiary':   '#e2deda',
      '--border':        '#d0ccc6',
      '--text-primary':  '#1a1814',
      '--text-secondary':'#4a4540',
      '--text-muted':    '#8a8480',
      '--accent':        '#8b6914',
      '--accent-dim':    '#8b691418',
      '--reader-bg':     '#f8f7f4',
      '--reader-text':   '#1a1814',
    },
    sepia: {
      label: '📜', title: 'Sepia',
      '--bg-app':        '#f2e8d8',
      '--bg-primary':    '#fdf6e9',
      '--bg-secondary':  '#ede0c8',
      '--bg-tertiary':   '#e4d5b8',
      '--border':        '#c8b090',
      '--text-primary':  '#3d2b1f',
      '--text-secondary':'#6b4f3a',
      '--text-muted':    '#9d8060',
      '--accent':        '#8b5e3c',
      '--accent-dim':    '#8b5e3c18',
      '--reader-bg':     '#fdf6e9',
      '--reader-text':   '#3d2b1f',
    },
  };

  const LS_KEY = 'md_theme';
  let current = localStorage.getItem(LS_KEY) || 'dark';

  function apply(theme) {
    if (!THEMES[theme]) theme = 'dark';
    current = theme;
    localStorage.setItem(LS_KEY, theme);
    const root = document.documentElement;
    const vars = THEMES[theme];
    Object.entries(vars).forEach(([k, v]) => {
      if (k.startsWith('--')) root.style.setProperty(k, v);
    });
    // data attribute cho CSS selectors nếu cần
    root.dataset.theme = theme;
  }

  function get() { return current; }

  function cycle() {
    const order = ['dark', 'light', 'sepia'];
    const next = order[(order.indexOf(current) + 1) % order.length];
    apply(next);
    updateButtons();
  }

  // Cập nhật tất cả toggle button trên trang
  function updateButtons() {
    document.querySelectorAll('[data-theme-btn]').forEach(btn => {
      const t = THEMES[current];
      btn.textContent = t?.label || '🌙';
      btn.title = 'Theme: ' + (t?.title || current);
    });
  }

  // Build toggle button
  function buildToggleBtn(extraStyle = '') {
    const btn = document.createElement('button');
    btn.dataset.themeBtn = '1';
    btn.style.cssText = `background:transparent;border:1px solid var(--border);border-radius:6px;padding:5px 9px;cursor:pointer;font-size:14px;color:var(--text-secondary);transition:all .15s;${extraStyle}`;
    btn.addEventListener('mouseenter', () => btn.style.borderColor = 'var(--accent)');
    btn.addEventListener('mouseleave', () => btn.style.borderColor = 'var(--border)');
    btn.addEventListener('click', cycle);
    updateButtons();
    return btn;
  }

  // Áp dụng ngay khi load
  apply(current);

  return { apply, get, cycle, buildToggleBtn, updateButtons, THEMES };
})();
