/* ── STATE.JS ──────────────────────────────────────────────
   Toàn bộ state toàn cục dùng chung giữa các module.
   Không import/export — dùng qua window.App
──────────────────────────────────────────────────────────── */
window.App = {
  // Data
  comics: [],

  // Admin navigation
  view: 'library',
  selComicId: null,
  editingChapId: null,

  // Chapter form (image)
  pendingPages: [],
  errors: {},
  coverData: null,
  isSaving: false,

  // Reader (image)
  rComicId: null,
  rChapIdx: 0,
  rMode: 'single',
  rLang: 'vi',
  rZoom: 100,

  // Google Drive
  gdScriptUrl: localStorage.getItem('gd_script_url') || '',
  gdFiles: [],

  // Helpers
  getComic() {
    return this.comics.find(c => c.id === this.selComicId) || this.comics[0] || null;
  },

  go(view, opts = {}) {
    this.view = view;
    this.errors = {};
    if (opts.selComicId   !== undefined) this.selComicId   = opts.selComicId;
    if (opts.editingChapId !== undefined) this.editingChapId = opts.editingChapId;
    if (opts.clearPages) this.pendingPages = [];
    window.UI.renderAll();
  },
};
