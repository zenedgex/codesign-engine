// ZenEdgeX site shell: navigation drawer, the current page's sections in the sidebar with scroll-spy,
// site search (⌘K) and the home header over the hero.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  // ------------------------------------------------------------------ drawer
  const menu = $('.zx-menu'), scrim = $('.zx-scrim');
  const drawer = open => {
    document.body.classList.toggle('zx-drawer', open);
    document.body.classList.toggle('zx-lock', open);
    if (menu) menu.setAttribute('aria-expanded', String(open));
  };
  if (menu) menu.addEventListener('click', () => drawer(!document.body.classList.contains('zx-drawer')));
  if (scrim) scrim.addEventListener('click', () => drawer(false));
  $$('.zx-side a').forEach(a => a.addEventListener('click', () => drawer(false)));

  // ------------------------------------------------------------------ the page's sections, under its link
  const current = $('.zx-side a[aria-current="page"]');
  const main = $('.zx-main');
  if (current && main) {
    let items = [];
    const src = $$('#rail a').length ? $$('#rail a') : $$('nav.jump a');
    if (src.length) items = src.map(a => [a.getAttribute('href'), text(a).replace(/^\d+\s+/, '')]);
    else items = $$('[id]', main).filter(el => el.id !== 'top' && $('h2', el) && !el.parentElement.closest('[id]:not(#top):not(#zx-main)'))
      .map(el => [`#${el.id}`, text($(':scope > .head .label, :scope > .label, :scope .stack > .label', el)) || text($('h2', el))]);
    items = items.filter(([href]) => href && href.startsWith('#') && document.getElementById(href.slice(1)));
    if (items.length) {
      const ul = document.createElement('ul');
      ul.className = 'zx-toc';
      ul.setAttribute('aria-label', 'On this page');
      const links = items.map(([href, label]) => {
        const li = document.createElement('li'), a = document.createElement('a');
        a.href = href; a.textContent = label;
        a.addEventListener('click', () => drawer(false));
        li.appendChild(a); ul.appendChild(li);
        return a;
      });
      current.insertAdjacentElement('afterend', ul);
      const targets = links.map(a => document.getElementById(a.getAttribute('href').slice(1)));
      const spy = () => {
        const y = innerHeight * .32;
        let on = -1;
        targets.forEach((t, i) => { if (t.getBoundingClientRect().top <= y) on = i; });
        links.forEach((a, i) => a.classList.toggle('is-active', i === on));
      };
      addEventListener('scroll', spy, { passive: true }); spy();
    }
  }

  // ------------------------------------------------------------------ home: the header turns solid past the hero
  const hero = $('.zx-hero'), head = $('.zx-header');
  if (hero && head) {
    const solid = () => head.classList.toggle('is-solid', scrollY > hero.offsetHeight - head.offsetHeight - 8);
    addEventListener('scroll', solid, { passive: true }); solid();
  }

  // ------------------------------------------------------------------ search over every page's sections
  const btn = $('[data-zx-search]');
  if (btn) {
    const dlg = document.createElement('div');
    dlg.className = 'zx-search'; dlg.hidden = true;
    dlg.innerHTML = '<div class="zx-search__box" role="dialog" aria-modal="true" aria-label="Search the site"><label class="zx-search__field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Search Atelier, Sutra, benchmarks…" autocomplete="off" spellcheck="false" aria-label="Search"><kbd>esc</kbd></label><ul class="zx-search__list" role="listbox"></ul></div>';
    document.body.appendChild(dlg);
    const input = $('input', dlg), list = $('ul', dlg);
    let index = null, loading = null, sel = 0, hits = [];
    // the pages to search are the sidebar's, so a new project is found as soon as it is in the navigation
    const pages = $$('.zx-side a[data-zx-page]').map(a => [a.href, a.dataset.zxPage]);
    const build = () => loading || (loading = Promise.all(pages.map(async ([href, name]) => {
      const url = new URL(href);
      let doc = document;
      if (url.pathname !== location.pathname) {
        try { const r = await fetch(url); if (!r.ok) return []; doc = new DOMParser().parseFromString(await r.text(), 'text/html'); }
        catch { return []; }
      }
      const out = [{ page: name, url: url.href, title: text($('h1', doc)) || name, ctx: text($('.sub, .soft, .lede', doc)) }];
      $$('h2', doc).forEach(h => {
        const box = h.closest('[id]:not(#top)');
        if (!box || !box.id || box.id === 'zx-main') return;
        const label = text($('.label, .eyebrow', box));
        const para = $$('p', box).map(text).filter(t => t.length > 40)[0] || '';
        out.push({ page: name, url: `${url.href}#${box.id}`, title: text(h), ctx: para, label, body: text(box).slice(0, 6000) });
      });
      const seen = new Set();
      return out.filter(o => !seen.has(o.url) && seen.add(o.url));
    })).then(r => (index = r.flat())));
    const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const mark = (s, words) => { let h = esc(s); words.forEach(w => { h = h.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>'); }); return h; };
    // the section's lead paragraph, or the passage around the first word it only mentions further down
    const snip = (o, words) => {
      if (!words.length || words.some(w => `${o.title} ${o.ctx}`.toLowerCase().includes(w)) || !o.body) return o.ctx;
      const i = o.body.toLowerCase().indexOf(words[0]);
      return i < 0 ? o.ctx : (i > 70 ? '…' : '') + o.body.slice(Math.max(0, i - 70), i + 130) + '…';
    };
    const render = () => {
      const q = input.value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
      if (!index) { list.innerHTML = '<li class="zx-search__empty">Loading…</li>'; return; }
      hits = !words.length ? index.filter(o => !o.url.includes('#')) : index
        .map(o => { const hay = `${o.title} ${o.label || ''} ${o.ctx} ${o.body || ''} ${o.page}`.toLowerCase(); if (!words.every(w => hay.includes(w))) return null; const t = o.title.toLowerCase(); return [o, words.filter(w => t.includes(w)).length * 2 + words.filter(w => o.ctx.toLowerCase().includes(w)).length]; })
        .filter(Boolean).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 14);
      sel = 0;
      list.innerHTML = hits.length ? hits.map((o, i) => `<li><a href="${esc(o.url)}" role="option" aria-selected="${i === 0}"><small>${esc(o.page)}${o.label ? ' · ' + esc(o.label) : ''}</small><b>${mark(o.title, words)}</b>${snip(o, words) ? `<span>${mark(snip(o, words), words)}</span>` : ''}</a></li>`).join('') : `<li class="zx-search__empty">Nothing matches “${esc(input.value.trim())}”.</li>`;
      $$('a', list).forEach(a => a.addEventListener('click', close));
    };
    const move = d => { const as = $$('a', list); if (!as.length) return; sel = (sel + d + as.length) % as.length; as.forEach((a, i) => a.setAttribute('aria-selected', String(i === sel))); as[sel].scrollIntoView({ block: 'nearest' }); };
    let back = null;
    function open() { back = document.activeElement; dlg.hidden = false; document.body.classList.add('zx-lock'); input.value = ''; render(); input.focus(); build().then(render); }
    function close() { dlg.hidden = true; if (!document.body.classList.contains('zx-drawer')) document.body.classList.remove('zx-lock'); if (back) back.focus(); }
    btn.addEventListener('click', open);
    input.addEventListener('input', render);
    dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
    dlg.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { const a = $$('a', list)[sel]; if (a) { e.preventDefault(); close(); location.href = a.href; } }
    });
    addEventListener('keydown', e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); dlg.hidden ? open() : close(); }
    });
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) { const k = $('kbd', btn); if (k) k.textContent = 'Ctrl K'; }
  }
})();
