// Grabbit side panel. Bound to the tab it was opened from (?tab=ID).
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tabId = +new URLSearchParams(location.search).get('tab');
const Local = window.__grabbit; // same engine, used here to parse fetched pages

const state = { cols: [], rows: [], cands: [], ci: 0, recipe: null, next: null, host: '', stop: false, busy: false };
const MAX_SHOWN = 300;

// ---------- page bridge ----------
async function callIn(tid, name, ...args) {
  await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
  const [r] = await chrome.scripting.executeScript({ target: { tabId: tid }, func: (n, a) => JSON.stringify(window.__grabbit[n](...a) ?? null), args: [name, args] });
  return JSON.parse(r?.result ?? 'null'); // JSON keeps column order; structured clone may not
}
const call = (name, ...args) => callIn(tabId, name, ...args);

function notice(msg) {
  $('#notice').textContent = msg || '';
  $('#notice').hidden = !msg;
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}
function accessError(e) {
  console.warn(e);
  notice(/Cannot access|cannot be scripted|chrome:\/\/|webstore|Missing host permission|No tab/i.test(String(e?.message || e))
    ? 'Grabbit can’t read this page. Chrome blocks extensions on chrome:// pages and the Web Store. If the page just changed, click the Grabbit icon again.'
    : 'Something went wrong: ' + (e?.message || e));
}

// ---------- data / grid ----------
function setData(cols, rows) {
  state.cols = cols.map((c) => ({ ...c }));
  state.rows = rows;
  render();
}
function addRows(cols, rows, seen) {
  for (const c of cols) if (!state.cols.some((x) => x.key === c.key)) state.cols.push({ ...c });
  for (const r of rows) {
    const k = JSON.stringify(state.cols.map((c) => r[c.key] ?? ''));
    if (seen) { if (seen.has(k)) continue; seen.add(k); }
    state.rows.push(r);
  }
  render();
}
const fromObjects = (objs, extra = {}) => {
  const keys = [...new Set(objs.flatMap((o) => Object.keys(o)))];
  return { cols: keys.map((k) => ({ key: k, name: k })), rows: objs.map((o) => ({ ...o, ...extra })) };
};

const isImage = (c, v) => (c.kind === 'src' || c.name === 'Image') && /^(https?:|data:image\/)/.test(v);

function render() {
  const { cols, rows } = state;
  $('#rowCount').textContent = rows.length.toLocaleString();
  $('#colCount').textContent = cols.length;
  $('#empty').hidden = rows.length > 0;
  $('#grid').hidden = rows.length === 0;
  const thead = $('#grid thead'), tbody = $('#grid tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';
  if (!rows.length) return;
  const hr = thead.insertRow();
  hr.appendChild(Object.assign(document.createElement('th'), { className: 'num', textContent: '#' }));
  cols.forEach((c, i) => {
    const th = document.createElement('th');
    th.innerHTML = '<div class="colhead"><input aria-label="Column name" /><button class="x" title="Remove column" aria-label="Remove column">×</button></div>';
    const inp = th.querySelector('input');
    inp.value = c.name;
    inp.onchange = () => { c.name = inp.value.trim() || c.name; };
    th.querySelector('.x').onclick = () => { state.cols.splice(i, 1); render(); };
    hr.appendChild(th);
  });
  const frag = document.createDocumentFragment();
  rows.slice(0, MAX_SHOWN).forEach((r, ri) => {
    const tr = document.createElement('tr');
    tr.appendChild(Object.assign(document.createElement('td'), { className: 'num', textContent: ri + 1 }));
    for (const c of cols) {
      const td = document.createElement('td');
      const v = String(r[c.key] ?? '');
      td.title = v;
      td.tabIndex = 0;
      if (isImage(c, v)) td.appendChild(Object.assign(document.createElement('img'), { src: v, alt: '', loading: 'lazy' }));
      else {
        td.textContent = v;
        td.contentEditable = 'plaintext-only';
        td.oninput = () => { r[c.key] = td.textContent; };
      }
      tr.appendChild(td);
    }
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
  $('#more').hidden = rows.length <= MAX_SHOWN;
  $('#more').textContent = `Showing first ${MAX_SHOWN} rows. All ${rows.length.toLocaleString()} rows are exported.`;
}

$('#dedupe').onclick = () => {
  const seen = new Set();
  const before = state.rows.length;
  state.rows = state.rows.filter((r) => {
    const k = JSON.stringify(state.cols.map((c) => r[c.key] ?? ''));
    return !seen.has(k) && seen.add(k);
  });
  render();
  toast(`Removed ${before - state.rows.length} duplicates`);
};
$('#clearData').onclick = () => { setData([], []); call('clear').catch(() => {}); };

// ---------- tabs ----------
$$('.tabs button').forEach((b) => (b.onclick = () => {
  $$('.tabs button').forEach((x) => x.setAttribute('aria-selected', x === b));
  $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
}));

// ---------- lists & tables ----------
function showCandidate() {
  const c = state.cands[state.ci];
  $('#prevCand').disabled = $('#nextCand').disabled = state.cands.length < 2;
  if (!c) {
    $('#candInfo').textContent = 'No lists found. Use “Pick on page”.';
    return;
  }
  $('#candInfo').textContent = `List ${state.ci + 1} of ${state.cands.length} · ${c.count} items · ${c.columns.length} fields`;
  useRecipe({ rowSelector: c.rowSelector, columns: c.columns });
}
async function useRecipe(recipe, scroll = true) {
  state.recipe = recipe;
  try {
    const rows = await call('extract', recipe);
    if (scroll) call('preview', recipe);
    setData(recipe.columns, rows);
  } catch (e) { accessError(e); }
}
async function scan() {
  $('#candInfo').textContent = 'Scanning page…';
  try {
    state.cands = await call('detect');
    state.ci = 0;
    notice('');
    showCandidate();
  } catch (e) {
    $('#candInfo').textContent = 'Page not readable.';
    accessError(e);
  }
}
$('#rescan').onclick = scan;
$('#prevCand').onclick = () => { state.ci = (state.ci - 1 + state.cands.length) % state.cands.length; showCandidate(); };
$('#nextCand').onclick = () => { state.ci = (state.ci + 1) % state.cands.length; showCandidate(); };
$('#pick').onclick = () => { call('pick', 'list').catch(accessError); toast('Click an item on the page'); };
$('#pickNext').onclick = () => { call('pick', 'next').catch(accessError); toast('Click the Next button on the page'); };

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg.grabbit || sender.tab?.id !== tabId) return;
  if (msg.grabbit === 'picked') {
    if (msg.error) return toast(msg.error);
    if (!msg.candidate) return;
    state.cands = [msg.candidate, ...state.cands.filter((c) => c.rowSelector !== msg.candidate.rowSelector)];
    state.ci = 0;
    showCandidate();
  }
  if (msg.grabbit === 'pickedNext') {
    state.next = { selector: msg.selector, label: msg.label || 'Custom' };
    $('#nextLabel').textContent = state.next.label;
    $('[name=pmode][value=next]').checked = true;
    pagerUI();
  }
});

// Pagination
function pagerUI() {
  const mode = $('[name=pmode]:checked').value;
  $('#nextRow').hidden = mode !== 'next';
  $('#runPager').disabled = mode === 'none';
  $('#pagerSummary').textContent = { none: 'Off', next: 'Next button', scroll: 'Infinite scroll' }[mode];
  if (mode === 'next' && !state.next) {
    call('findNext').then((n) => {
      state.next = n;
      $('#nextLabel').textContent = n ? n.label : 'not found, click Choose';
    }).catch(() => {});
  }
}
$$('[name=pmode]').forEach((r) => (r.onchange = pagerUI));

function startBusy(text) {
  state.busy = true;
  state.stop = false;
  $('#progress').hidden = false;
  progress(0, text);
  $$('#runPager,#runBulk,#pick').forEach((b) => (b.disabled = true));
}
function progress(frac, text) {
  $('#barFill').style.width = Math.round(frac * 100) + '%';
  $('#progText').textContent = text;
}
function endBusy(text) {
  state.busy = false;
  $('#progress').hidden = true;
  $$('#runPager,#runBulk,#pick').forEach((b) => (b.disabled = false));
  pagerUI();
  if (text) toast(text);
}
$('#stop').onclick = () => { state.stop = true; };

async function waitForChange(before, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout && !state.stop) {
    await sleep(500);
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status !== 'complete') continue;
      const fp = await call('fingerprint', state.recipe.rowSelector);
      if (fp !== before && !fp.startsWith('0:')) return true;
    } catch { /* page is navigating */ }
  }
  return false;
}

$('#runPager').onclick = async () => {
  const mode = $('[name=pmode]:checked').value;
  if (!state.recipe) return toast('Pick a list first');
  if (mode === 'next' && !state.next) return toast('Choose the Next button first');
  const max = Math.max(1, +$('#maxPages').value || 10);
  const delay = Math.max(0, +$('#delay').value || 0) * 1000;
  if (mode === 'next') {
    // Page loads would drop the one-time activeTab grant, so ask for this site only.
    if (state.origin && !(await chrome.permissions.request({ origins: [state.origin] }))) return toast('Permission needed to follow pages');
  }
  const seen = new Set();
  setData(state.recipe.columns, []);
  startBusy('Page 1…');
  let stale = 0;
  try {
    for (let page = 1; page <= max && !state.stop; page++) {
      addRows(state.recipe.columns, await call('extract', state.recipe), seen);
      progress(page / max, `Page ${page} of ${max} · ${state.rows.length} rows`);
      if (page === max) break;
      const before = await call('fingerprint', state.recipe.rowSelector);
      if (mode === 'next') {
        if (!(await call('clickNext', state.next.selector))) break;
      } else await call('scrollMore', state.recipe.rowSelector);
      if (!(await waitForChange(before, mode === 'scroll' ? 8000 : 20000))) {
        if (mode === 'next' || ++stale >= 2) break;
      } else stale = 0;
      await sleep(delay);
    }
    endBusy(`Done · ${state.rows.length} rows`);
  } catch (e) {
    endBusy();
    accessError(e);
  }
};

// Recipes
async function recipes() { return (await chrome.storage.local.get('recipes')).recipes || {}; }
$('#saveRecipe').onclick = async () => {
  if (!state.recipe) return toast('Pick a list first');
  const all = await recipes();
  all[state.host] = { recipe: { ...state.recipe, columns: state.recipe.columns.map((c) => ({ ...c, name: state.cols.find((x) => x.key === c.key)?.name || c.name })).filter((c) => state.cols.some((x) => x.key === c.key)) }, next: state.next, mode: $('[name=pmode]:checked').value };
  await chrome.storage.local.set({ recipes: all });
  $('#saved').hidden = false;
  toast('Recipe saved for ' + state.host);
};
$('#useSaved').onclick = async () => {
  const r = (await recipes())[state.host];
  if (!r) return;
  state.next = r.next;
  if (r.next) $('#nextLabel').textContent = r.next.label;
  $(`[name=pmode][value=${r.mode || 'none'}]`).checked = true;
  pagerUI();
  $('#candInfo').textContent = 'Using saved recipe';
  useRecipe(r.recipe);
};

// ---------- quick grab ----------
$$('[data-quick]').forEach((b) => (b.onclick = async () => {
  try {
    const kind = b.dataset.quick;
    call('clear').catch(() => {});
    if (kind === 'contacts') {
      startBusy('Scanning page and contact pages…');
      const c = await call('contacts');
      for (const link of await call('contactLinks')) mergeContacts(c, await fetchContacts(link));
      endBusy();
      for (const k of Object.keys(c)) if (!c[k]) delete c[k]; // one page: hide empty fields
      const { cols, rows } = fromObjects([c]);
      setData(cols, rows);
      toast(c.Emails ? `Found ${c.Emails.split(', ').length} email(s)` : 'No emails found on this site');
    } else {
      const { cols, rows } = fromObjects(await call(kind));
      setData(cols, rows);
      toast(`${rows.length} ${kind} grabbed`);
    }
  } catch (e) { endBusy(); accessError(e); }
}));

async function fetchContacts(url) {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok || !/html/.test(res.headers.get('content-type') || '')) return null;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    doc.querySelectorAll('script,style,noscript').forEach((e) => e.remove());
    return Local.contactsFromDoc(doc, url);
  } catch { return null; }
}
function mergeContacts(into, extra) {
  if (!extra) return;
  for (const k of ['Emails', 'Phones']) into[k] = [...new Set([...into[k].split(', '), ...extra[k].split(', ')].filter(Boolean))].join(', ');
  for (const k of Object.keys(extra)) if (!into[k]) into[k] = extra[k];
}

// ---------- bulk ----------
const parseUrls = () => [...new Set($('#urls').value.split(/[\s,;]+/).map((u) => u.trim().replace(/^["']|["']$/g, '')).filter((u) => /^https?:\/\/\S+\.\S+/.test(u) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(u)).map((u) => (/^https?:/.test(u) ? u : 'https://' + u)))];
$('#urls').oninput = () => { $('#urlCount').textContent = parseUrls().length + ' URLs'; };
$('#csvFile').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  $('#urls').value = (await f.text()).match(/https?:\/\/[^\s,"';]+/g)?.join('\n') || '';
  $('#urls').oninput();
};

function waitLoaded(tid, timeout = 30000) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(l); clearTimeout(t); resolve(); };
    const l = (id, info) => { if (id === tid && info.status === 'complete') done(); };
    const t = setTimeout(done, timeout);
    chrome.tabs.onUpdated.addListener(l);
    chrome.tabs.get(tid).then((tab) => tab.status === 'complete' && done()).catch(done);
  });
}

async function scrapeOne(url, mode) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitLoaded(tab.id);
    await sleep(1200);
    if (mode === 'contacts') {
      const c = await callIn(tab.id, 'contacts');
      for (const link of await callIn(tab.id, 'contactLinks')) mergeContacts(c, await fetchContacts(link));
      return { cols: Object.keys(c).map((k) => ({ key: k, name: k })), rows: [c] };
    }
    let recipe = state.recipe;
    if (mode === 'auto' || !recipe) {
      const [best] = await callIn(tab.id, 'detect');
      if (!best) return { cols: [], rows: [] };
      recipe = { rowSelector: best.rowSelector, columns: best.columns };
    }
    const src = { key: '_source', name: 'Source URL' };
    const rows = (await callIn(tab.id, 'extract', recipe)).map((r) => ({ ...r, _source: url }));
    return { cols: [...recipe.columns, src], rows };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

$('#runBulk').onclick = async () => {
  const urls = parseUrls();
  const mode = $('#bulkMode').value;
  if (!urls.length) return toast('Paste at least one URL');
  if (mode === 'recipe' && !state.recipe) return toast('Pick a list on the current page first');
  if (!(await chrome.permissions.request({ origins: ['<all_urls>'] }))) return toast('Permission is needed to open those sites');
  setData([], []);
  startBusy(`0 of ${urls.length} pages`);
  let done = 0, failed = 0, i = 0;
  const worker = async () => {
    while (i < urls.length && !state.stop) {
      const url = urls[i++];
      try {
        const { cols, rows } = await scrapeOne(url, mode);
        addRows(cols, rows);
      } catch (e) {
        failed++;
        addRows([{ key: 'URL', name: 'URL' }, { key: '_error', name: 'Error' }], [{ URL: url, _error: String(e.message || e).slice(0, 120) }]);
      }
      progress(++done / urls.length, `${done} of ${urls.length} pages · ${state.rows.length} rows${failed ? ` · ${failed} failed` : ''}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(+$('#concurrency').value, urls.length) }, worker));
  endBusy(`Bulk done · ${state.rows.length} rows`);
};

// ---------- export ----------
const fileBase = () => `${(state.host || 'grabbit').replace(/^www\./, '')}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
function download(blob, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$$('[data-export]').forEach((b) => (b.onclick = async () => {
  if (!state.rows.length) return toast('Nothing to export yet');
  const { cols, rows } = state;
  const kind = b.dataset.export;
  if (kind === 'xlsx') download(Exporter.xlsx(cols, rows), fileBase() + '.xlsx');
  if (kind === 'csv') download(new Blob([Exporter.csv(cols, rows)], { type: 'text/csv' }), fileBase() + '.csv');
  if (kind === 'json') download(new Blob([Exporter.json(cols, rows)], { type: 'application/json' }), fileBase() + '.json');
  if (kind === 'copy' || kind === 'sheets') {
    await navigator.clipboard.writeText(Exporter.tsv(cols, rows));
    if (kind === 'sheets') {
      chrome.tabs.create({ url: 'https://sheets.new' });
      toast('Copied! Press Ctrl+V (⌘V) in the new sheet');
    } else toast(`Copied ${rows.length} rows`);
  } else toast(`Exported ${rows.length} rows`);
  countExport();
}));

// Ask for a review once, after the user has gotten value a few times.
async function countExport() {
  const { exports = 0, rated } = await chrome.storage.local.get(['exports', 'rated']);
  await chrome.storage.local.set({ exports: exports + 1 });
  if (!rated && exports + 1 >= 3) $('#rate').hidden = false;
}
$('#rateLink').href = `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`;
$('#rateLink').onclick = $('#rateClose').onclick = () => { chrome.storage.local.set({ rated: true }); $('#rate').hidden = true; };

// ---------- init ----------
(async () => {
  if (!tabId) return notice('Open Grabbit from the toolbar icon on the page you want to scrape.');
  try {
    const tab = await chrome.tabs.get(tabId);
    state.host = tab.url ? new URL(tab.url).hostname : '';
    if (/^https?:/.test(tab.url)) state.origin = new URL(tab.url).origin + '/*';
    $('#host').textContent = state.host || 'Web scraper';
    if ((await recipes())[state.host]) $('#saved').hidden = false;
  } catch {}
  pagerUI();
  scan();
})();
