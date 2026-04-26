/* ── INFINITE-SCROLL.JS ───────────────────────────────────
   Reusable infinite scroll: dùng IntersectionObserver.
   Mỗi trang = 20 items. Load thêm khi cuộn đến sentinel.

   Dùng:
     const pager = InfiniteScroll.create({
       container: gridEl,
       pageSize: 20,
       load: async (page) => [...items],
       render: (item) => domElement,
       empty: '<div>Không có kết quả</div>',
     });
     pager.reset(); // reset về trang 0 và load lại
──────────────────────────────────────────────────────────── */
window.InfiniteScroll = (() => {

  function create({ container, pageSize = 20, load, render, empty = 'Không có dữ liệu' }) {
    let page      = 0;
    let loading   = false;
    let exhausted = false;
    let sentinel  = null;
    let observer  = null;

    // Sentinel element — cuộn đến đây thì load thêm
    function buildSentinel() {
      const s = document.createElement('div');
      s.style.cssText = 'height:40px;display:flex;align-items:center;justify-content:center';
      s.innerHTML = '<div class="pdf-spin" style="width:18px;height:18px"></div>';
      return s;
    }

    function detachObserver() {
      if (observer) { observer.disconnect(); observer = null; }
      sentinel?.remove(); sentinel = null;
    }

    async function loadMore() {
      if (loading || exhausted) return;
      loading = true;

      let items = [];
      try { items = await load(page); } catch(e) { console.error('InfiniteScroll load error:', e); }

      loading = false;

      if (items.length === 0 && page === 0) {
        container.innerHTML = '';
        const em = document.createElement('div');
        em.style.cssText = 'padding:48px;text-align:center;color:var(--text-muted);font-size:13px';
        em.innerHTML = empty;
        container.appendChild(em);
        exhausted = true;
        return;
      }

      // Remove spinner sentinel before appending
      sentinel?.remove();

      items.forEach(item => {
        const el = render(item);
        if (el) container.appendChild(el);
      });

      if (items.length < pageSize) {
        exhausted = true;
        return; // no sentinel needed
      }

      page++;

      // Re-attach sentinel
      sentinel = buildSentinel();
      container.appendChild(sentinel);

      observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          observer = null;
          loadMore();
        }
      }, { rootMargin: '200px' });
      observer.observe(sentinel);
    }

    function reset(newLoad) {
      detachObserver();
      container.innerHTML = '';
      page = 0; loading = false; exhausted = false;
      if (newLoad) load = newLoad;
      loadMore();
    }

    // Initial load
    loadMore();

    return { reset, loadMore };
  }

  return { create };
})();
