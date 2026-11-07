// Grabbit page engine. Injected on demand; idempotent. Exposes window.__grabbit.
(() => {
  if (window.__grabbit) return;
  const G = (window.__grabbit = {});
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'HEAD', 'META', 'LINK', 'BR', 'HR', 'svg', 'SVG', 'path', 'OPTION']);
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // ---------- element signatures & selectors ----------
  const stableClasses = (el) =>
    [...el.classList]
      .filter((c) => /^[a-zA-Z_-][\w-]*$/.test(c) && !/\d{2,}|^(is-|has-)|active|selected|hover|focus|open|odd|even|first|last|visible|hidden|grabbit/i.test(c))
      .sort()
      .slice(0, 3);
  const sig = (el) => el.tagName.toLowerCase() + stableClasses(el).map((c) => '.' + CSS.escape(c)).join('');

  function cssPath(el) {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      if (el.id && !/\d/.test(el.id) && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
        parts.unshift('#' + CSS.escape(el.id));
        break;
      }
      let part = el === document.body ? 'body' : sig(el);
      const p = el.parentElement;
      if (p && el !== document.body && [...p.children].filter((c) => c.matches(part)).length > 1)
        part += `:nth-child(${[...p.children].indexOf(el) + 1})`;
      parts.unshift(part);
      el = p;
    }
    return parts.join(' > ');
  }

  // ---------- fields inside a row ----------
  // A field path is a list of [signature, index-among-same-signature-siblings] steps from the row.
  function walkFields(row, cb) {
    const visit = (el, path, textDone) => {
      if (SKIP.has(el.tagName)) return;
      let done = textDone;
      if (!done) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (own) {
          cb(path, 'text', el);
          done = true;
        }
      }
      if (el.tagName === 'A' && el.getAttribute('href') && !/^(javascript:|#)/i.test(el.getAttribute('href'))) cb(path, 'href', el);
      if (el.tagName === 'IMG') cb(path, 'src', el);
      const seen = {};
      for (const c of el.children) {
        const s = sig(c);
        seen[s] = (seen[s] || 0) + 1;
        visit(c, path ? `${path}>${s}@${seen[s] - 1}` : `${s}@${seen[s] - 1}`, done);
      }
    };
    visit(row, '', false);
  }

  function resolve(row, path) {
    if (!path) return row;
    let el = row;
    for (const step of path.split('>')) {
      const at = step.lastIndexOf('@');
      const s = step.slice(0, at);
      const i = +step.slice(at + 1);
      el = [...el.children].filter((c) => sig(c) === s)[i];
      if (!el) return null;
    }
    return el;
  }

  const imgSrc = (el) => {
    const lazy = el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original');
    const src = el.currentSrc || el.src;
    return lazy && (!src || src.startsWith('data:')) ? new URL(lazy, location.href).href : src;
  };
  function valueOf(el, kind) {
    if (!el) return '';
    if (kind === 'href') return el.href || '';
    if (kind === 'src') return imgSrc(el) || '';
    return norm(el.innerText ?? el.textContent);
  }

  function nameFor(el, kind, row) {
    if (kind === 'href') return 'Link';
    if (kind === 'src') return 'Image';
    if (row.tagName === 'TR') {
      const cell = el.closest('td,th');
      const table = row.closest('table');
      const head = table && (table.tHead?.rows[0] || (table.rows[0] !== row && table.rows[0]?.querySelector('th') ? table.rows[0] : null));
      if (cell && head && head.cells[cell.cellIndex]) {
        const h = norm(head.cells[cell.cellIndex].innerText);
        if (h) return h.slice(0, 40);
      }
    }
    // Name after the closest heading or meaningful class between the field and its row.
    for (let e = el; e && e !== row.parentElement; e = e.parentElement) {
      if (/^H[1-6]$/.test(e.tagName)) return 'Title';
      const c = stableClasses(e).find((x) => x.length > 2);
      const pretty = c?.replace(/^.*__/, '').replace(/[-_]+/g, ' ').trim();
      if (pretty) return pretty[0].toUpperCase() + pretty.slice(1);
      if (e === row) break;
    }
    return { A: 'Link text', TIME: 'Date', LI: 'Item', TD: 'Cell', SPAN: 'Text', P: 'Text', DIV: 'Text' }[el.tagName] || 'Text';
  }

  function buildColumns(rows) {
    const found = new Map(); // key -> {count, sample el}
    for (const row of rows) {
      const keys = new Set();
      walkFields(row, (path, kind, el) => {
        const key = path + '|' + kind;
        if (keys.has(key)) return;
        keys.add(key);
        const f = found.get(key) || { path, kind, count: 0, el, row, values: new Set() };
        f.count++;
        if (f.values.size < 3) f.values.add(valueOf(el, kind));
        found.set(key, f);
      });
    }
    const min = Math.max(2, Math.ceil(rows.length * 0.2));
    const names = {};
    const cols = [];
    for (const [key, f] of found) {
      if (f.count < min) continue;
      if (rows.length > 3 && f.values.size === 1) continue; // same in every row: "Add to cart", icons...
      let name = nameFor(f.el, f.kind, f.row);
      names[name] = (names[name] || 0) + 1;
      if (names[name] > 1) name += ' ' + names[name];
      cols.push({ key, name, path: f.path, kind: f.kind });
    }
    return cols;
  }

  // ---------- list / table detection ----------
  const visible = (el) => el.getClientRects().length > 0;

  function groupsOf(parent) {
    const groups = new Map();
    for (const c of parent.children) {
      if (SKIP.has(c.tagName)) continue;
      const s = sig(c);
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s).push(c);
    }
    return groups;
  }

  function makeCandidate(parent, rows) {
    const rowSelector = cssPath(parent) + ' > ' + sig(rows[0]);
    const columns = buildColumns(rows);
    return { rowSelector, columns, count: rows.length };
  }

  G.detect = () => {
    const rough = [];
    for (const parent of document.body.querySelectorAll('*')) {
      if (parent.children.length < 3 || SKIP.has(parent.tagName) || !visible(parent)) continue;
      for (const rows of groupsOf(parent).values()) {
        if (rows.length < 3) continue;
        const text = rows.reduce((n, r) => n + Math.min((r.textContent || '').length, 400), 0) / rows.length;
        if (text < 3 && !rows[0].querySelector('img')) continue;
        rough.push({ parent, rows, score: rows.length * Math.sqrt(text + 10) });
      }
    }
    rough.sort((a, b) => b.score - a.score);
    const out = [];
    for (const r of rough.slice(0, 40)) {
      const c = makeCandidate(r.parent, r.rows);
      if (!c.columns.length) continue;
      c.score = r.score * Math.min(c.columns.length, 8);
      if (out.some((o) => o.rowSelector === c.rowSelector)) continue;
      out.push(c);
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 10).map(({ score, ...c }) => c);
  };

  G.extract = (recipe) => {
    const rows = [...document.querySelectorAll(recipe.rowSelector)];
    highlight(rows);
    return rows.map((row) => {
      const o = {};
      for (const c of recipe.columns) o[c.key] = valueOf(resolve(row, c.path), c.kind);
      return o;
    }).filter((o) => Object.values(o).some(Boolean));
  };

  G.preview = (recipe) => {
    highlight([...document.querySelectorAll(recipe.rowSelector)]);
    document.querySelector(recipe.rowSelector)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  // ---------- on-page highlight & picker ----------
  const style = document.createElement('style');
  style.textContent = `
    [data-grabbit-row]{outline:2px solid #7c5cff!important;outline-offset:-2px!important;background-color:rgba(124,92,255,.07)!important}
    #grabbit-hover{position:fixed;pointer-events:none;z-index:2147483647;border:2px dashed #ff7a59;background:rgba(255,122,89,.12);border-radius:4px;transition:all .06s}
    #grabbit-tip{position:fixed;z-index:2147483647;left:50%;top:12px;transform:translateX(-50%);background:#1d1b2e;color:#fff;font:600 13px system-ui,sans-serif;padding:8px 14px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.25);pointer-events:none}`;
  document.documentElement.appendChild(style);

  function highlight(rows) {
    document.querySelectorAll('[data-grabbit-row]').forEach((e) => e.removeAttribute('data-grabbit-row'));
    rows.forEach((e) => e.setAttribute('data-grabbit-row', ''));
  }
  G.clear = () => highlight([]);

  // Pick the ancestor of the clicked element that has the most look-alike siblings.
  function rowFromClick(target) {
    let best = null;
    for (let el = target; el && el !== document.body; el = el.parentElement) {
      const p = el.parentElement;
      if (!p) break;
      const same = [...p.children].filter((c) => sig(c) === sig(el));
      if (same.length >= 2 && (!best || same.length > best.rows.length)) best = { parent: p, rows: same };
    }
    return best;
  }

  let stopPicker = null;
  G.pick = (mode) => {
    stopPicker?.();
    const box = document.createElement('div');
    box.id = 'grabbit-hover';
    const tip = document.createElement('div');
    tip.id = 'grabbit-tip';
    tip.textContent = mode === 'next' ? 'Click the "Next" button or link · Esc to cancel' : 'Click any item in the list you want · Esc to cancel';
    document.documentElement.append(box, tip);
    const over = (e) => {
      const r = e.target.getBoundingClientRect();
      Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    };
    const click = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      stop();
      if (mode === 'next') {
        const el = e.target.closest('a,button,[role=button],input[type=submit],input[type=button]') || e.target;
        chrome.runtime.sendMessage({ grabbit: 'pickedNext', selector: cssPath(el), label: norm(el.innerText || el.value || el.getAttribute('aria-label')).slice(0, 30) });
        return;
      }
      const best = rowFromClick(e.target);
      if (!best) return chrome.runtime.sendMessage({ grabbit: 'picked', error: 'No repeating items found there. Try clicking another item.' });
      const c = makeCandidate(best.parent, best.rows);
      highlight(best.rows);
      chrome.runtime.sendMessage({ grabbit: 'picked', candidate: c });
    };
    const key = (e) => {
      if (e.key === 'Escape') {
        stop();
        chrome.runtime.sendMessage({ grabbit: 'picked', cancelled: true });
      }
    };
    const stop = () => {
      box.remove();
      tip.remove();
      removeEventListener('mouseover', over, true);
      removeEventListener('click', click, true);
      removeEventListener('keydown', key, true);
      stopPicker = null;
    };
    addEventListener('mouseover', over, true);
    addEventListener('click', click, true);
    addEventListener('keydown', key, true);
    stopPicker = stop;
  };
  G.cancelPick = () => stopPicker?.();

  // ---------- pagination ----------
  const NEXT_WORDS = /^(next|next page|more|load more|show more|see more|view more|more results|older|older posts|siguiente|suivant|weiter|nächste|próxima|próximo|avanti|volgende|następna|далее|次へ|下一页|下一頁|다음)$/i;
  const isNext = (e) => {
    const t = norm(e.innerText || e.value);
    return /^[›»>→]{1,2}$/.test(t) || NEXT_WORDS.test(t.replace(/[^\p{L}\p{N} ]/gu, '').trim());
  };
  G.findNext = () => {
    let el = document.querySelector('a[rel~=next]');
    if (!el) {
      const all = [...document.querySelectorAll('a,button,[role=button],input[type=submit],input[type=button]')].filter(visible);
      el =
        all.find((e) => /\bnext\b/i.test(e.getAttribute('aria-label') || '') && !e.closest('[class*=carousel],[class*=slider],[class*=swiper]')) ||
        all.find((e) => isNext(e) && !e.closest('[class*=carousel],[class*=slider],[class*=swiper]'));
    }
    return el ? { selector: cssPath(el), label: norm(el.innerText || el.value || el.getAttribute('aria-label')).slice(0, 30) || 'Next' } : null;
  };

  G.clickNext = (selector) => {
    const el = document.querySelector(selector);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || /\bdisabled\b/.test(el.className)) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  };

  G.fingerprint = (rowSelector) => {
    const rows = document.querySelectorAll(rowSelector);
    return rows.length + ':' + norm(rows[0]?.textContent).slice(0, 80) + ':' + norm(rows[rows.length - 1]?.textContent).slice(0, 80);
  };

  G.scrollMore = (rowSelector) => {
    const rows = document.querySelectorAll(rowSelector);
    rows[rows.length - 1]?.scrollIntoView({ block: 'end' });
    // Also scroll the nearest scrollable container (feeds inside panels).
    for (let p = rows[0]?.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.scrollHeight > p.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) {
        p.scrollTop = p.scrollHeight;
        break;
      }
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    return rows.length;
  };

  // ---------- quick extractors ----------
  const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;
  const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{3,4}[\s.-]?\d{0,4}/g;
  const SOCIAL = { LinkedIn: /linkedin\.com\/(in|company)\//, X: /(twitter|x)\.com\/(?!intent|share)[^/?]+/, Facebook: /facebook\.com\/(?!sharer)[^/?]+/, Instagram: /instagram\.com\/[^/?]+/, YouTube: /youtube\.com\/(@|c\/|channel\/|user\/)/, TikTok: /tiktok\.com\/@/, GitHub: /github\.com\/[^/?]+/ };

  G.contactsFromDoc = (doc, url) => {
    let text = '';
    if (doc === document) text = doc.body.innerText;
    else if (doc.body) for (const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT); w.nextNode(); ) text += w.currentNode.nodeValue + ' ';
    const links = [...doc.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    const emails = new Set();
    for (const m of text.match(EMAIL) || []) emails.add(m.toLowerCase());
    for (const h of links) if (/^mailto:/i.test(h)) emails.add(decodeURIComponent(h.slice(7).split('?')[0]).toLowerCase());
    for (const e of [...emails]) if (/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(e) || /example\.|sentry|wixpress/.test(e)) emails.delete(e);
    const phones = new Set();
    for (const h of links) if (/^tel:/i.test(h)) phones.add(decodeURIComponent(h.slice(4)).trim());
    for (const m of text.match(PHONE) || []) {
      const d = m.replace(/\D/g, '');
      if (d.length >= 9 && d.length <= 15 && /[+(]|\d[\s.-]\d/.test(m) && !/^(19|20)\d{2}[\s.-]\d{2}[\s.-]\d{2}$/.test(m.trim())) phones.add(m.trim());
    }
    const abs = links.map((h) => { try { return new URL(h, url).href; } catch { return ''; } });
    const social = {};
    for (const [k, re] of Object.entries(SOCIAL)) social[k] = abs.find((h) => re.test(h)) || '';
    return {
      Emails: [...emails].join(', '),
      Phones: [...phones].slice(0, 5).join(', '),
      ...social,
      URL: url,
      Title: norm(doc.title),
      Description: doc.querySelector('meta[name=description],meta[property="og:description"]')?.content || '',
      H1: norm(doc.querySelector('h1')?.textContent),
    };
  };
  G.contacts = () => G.contactsFromDoc(document, location.href);

  G.contactLinks = () => {
    const seen = new Set();
    return [...document.querySelectorAll('a[href]')]
      .filter((a) => a.host === location.host && /contact|about|impressum|kontakt|team|support|legal/i.test(a.pathname + ' ' + a.textContent))
      .map((a) => a.href.split('#')[0])
      .filter((h) => h !== location.href && !seen.has(h) && seen.add(h))
      .slice(0, 3);
  };

  G.links = () => {
    const seen = new Set();
    return [...document.querySelectorAll('a[href]')]
      .filter((a) => /^https?:/.test(a.href) && !seen.has(a.href) && seen.add(a.href))
      .map((a) => ({ Text: norm(a.innerText).slice(0, 200), URL: a.href, Type: a.host === location.host ? 'Internal' : 'External' }));
  };

  G.text = () =>
    [...document.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,td,dt,dd,figcaption')]
      .filter((e) => visible(e) && !e.closest('nav,footer,header,aside,[role=navigation]') && !e.querySelector('p,li,h1,h2,h3,h4,td'))
      .map((e) => ({ Type: e.tagName.toLowerCase(), Text: norm(e.innerText) }))
      .filter((r) => r.Text.length > 1);

  G.images = () => {
    const seen = new Set();
    return [...document.images]
      .map((i) => ({ Image: imgSrc(i), Alt: norm(i.alt), Width: i.naturalWidth || '', Height: i.naturalHeight || '' }))
      .filter((r) => r.Image && !r.Image.startsWith('data:') && !seen.has(r.Image) && seen.add(r.Image));
  };
})();
