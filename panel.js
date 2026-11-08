// Grabbit side panel. Bound to the tab it was opened from (?tab=ID).
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const tabId = +new URLSearchParams(location.search).get('tab');
const Local = window.__grabbit; // same engine, used here to parse fetched pages

const state = { cols: [], rows: [], cands: [], ci: 0, recipe: null, next: null, host: '', stop: false, busy: false };
const MAX_SHOWN = 300;

// ---------- page bridge (callIn, paginate etc. live in scrape.js) ----------
const call = (name, ...args) => callIn(tabId, name, ...args);

function notice(msg) {
  $('#notice').textContent = msg || '';
  $('#notice').hidden = !msg;
}
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._h);
  el._h = setTimeout(() => el.classList.remove('show'), 2200);
}
function accessError(e) {
  console.warn(e);
  notice(/Cannot access|cannot be scripted|chrome:\/\/|webstore|Missing host permission|No tab/i.test(String(e?.message || e))
    ? t('errCantRead')
    : t('errGeneric', e?.message || e));
}

// ---------- data / grid ----------
function setData(cols, rows) {
  state.cols = cols.map((c) => ({ ...c }));
  state.rows = rows;
  render();
}
function addRows(cols, rows, seen) {
  for (const c of cols) if (!state.cols.some((x) => x.key === c.key)) state.cols.push({ ...c });
  if (seen) mergeRows(seen, state.cols, rows, state.rows); // seen: Map of item key -> row (scrape.js)
  else state.rows.push(...rows);
  render();
}
const colName = (key) => chrome.i18n.getMessage('col' + key.replace(/\W/g, '')) || key;
const fromObjects = (objs, extra = {}) => {
  const keys = [...new Set(objs.flatMap((o) => Object.keys(o)))];
  return { cols: keys.map((k) => ({ key: k, name: colName(k) })), rows: objs.map((o) => ({ ...o, ...extra })) };
};

const isImageCol = (c) => c.kind === 'src' || c.key === 'Image';
const isImage = (c, v) => isImageCol(c) && /^(https?:|data:image\/)/.test(v);

function render() {
  const { cols, rows } = state;
  $('#rowCount').textContent = rows.length.toLocaleString();
  $('#colCount').textContent = cols.length;
  $('#empty').hidden = rows.length > 0;
  $('#grid').hidden = rows.length === 0;
  $('#dlImages').hidden = !rows.length || !cols.some(isImageCol);
  const thead = $('#grid thead'), tbody = $('#grid tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';
  if (!rows.length) return;
  const hr = thead.insertRow();
  hr.appendChild(Object.assign(document.createElement('th'), { className: 'num', textContent: '#' }));
  cols.forEach((c, i) => {
    const th = document.createElement('th');
    th.innerHTML = '<div class="colhead"><input /><button class="x">×</button></div>';
    th.querySelector('input').setAttribute('aria-label', t('columnName'));
    th.querySelector('.x').title = t('removeColumn');
    th.querySelector('.x').setAttribute('aria-label', t('removeColumn'));
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
  $('#more').textContent = t('showingFirst', MAX_SHOWN, rows.length.toLocaleString());
}

$('#dedupe').onclick = () => {
  const seen = new Set();
  const before = state.rows.length;
  state.rows = state.rows.filter((r) => {
    const k = JSON.stringify(state.cols.map((c) => r[c.key] ?? ''));
    return !seen.has(k) && seen.add(k);
  });
  render();
  toast(t('removedDupes', before - state.rows.length));
};
$('#clearData').onclick = () => { setData([], []); call('clear').catch(() => {}); };

// ---------- tabs ----------
$$('.tabs button').forEach((b) => (b.onclick = () => {
  $$('.tabs button').forEach((x) => x.setAttribute('aria-selected', x === b));
  $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
  if (b.dataset.tab === 'schedule') chrome.action.setBadgeText({ text: '' });
}));

// ---------- lists & tables ----------
function showCandidate() {
  const c = state.cands[state.ci];
  $('#prevCand').disabled = $('#nextCand').disabled = state.cands.length < 2;
  // "1/10" = which of the lists found on this page is shown (menus, filters… also repeat), not pages.
  $('#candPos').textContent = state.cands.length > 1 ? `${state.ci + 1}/${state.cands.length}` : '';
  $('#candPos').title = t('otherLists', state.cands.length);
  $('#scrollHint').hidden = true;
  if (!c) {
    $('#candInfo').textContent = t('noLists');
    return;
  }
  $('#candInfo').textContent = t('itemsFields', c.count, c.columns.length);
  useRecipe({ rowSelector: c.rowSelector, columns: c.columns });
  call('moreOnScroll', c.rowSelector).then((more) => {
    if (state.cands[state.ci] === c) $('#scrollHint').hidden = !more || $('[name=pmode]:checked').value !== 'none';
  }).catch(() => {});
}
async function useRecipe(recipe, scroll = true) {
  state.recipe = recipe;
  try {
    setData(recipe.columns, await call('extract', recipe));
    // Shops often add a picture only once it scrolls into view. Load the missing ones, then refresh.
    if (recipe.columns.some((c) => c.kind === 'src') && state.rows.length) {
      const info = $('#candInfo').textContent;
      $('#candInfo').textContent = t('loadingPictures');
      await call('revealLazy', recipe.rowSelector);
      if (state.recipe !== recipe) return; // user switched lists meanwhile
      $('#candInfo').textContent = info;
      setData(recipe.columns, await call('extract', recipe));
    }
    if (scroll) call('preview', recipe);
  } catch (e) { accessError(e); }
}
async function scan() {
  $('#candInfo').textContent = t('scanning');
  try {
    state.cands = await call('detect');
    state.ci = 0;
    notice('');
    showCandidate();
  } catch (e) {
    $('#candInfo').textContent = t('notReadable');
    accessError(e);
  }
}
$('#rescan').onclick = scan;
$('#prevCand').onclick = () => { state.ci = (state.ci - 1 + state.cands.length) % state.cands.length; showCandidate(); };
$('#nextCand').onclick = () => { state.ci = (state.ci + 1) % state.cands.length; showCandidate(); };
$('#pick').onclick = () => { call('pick', 'list').catch(accessError); toast(t('clickItem')); };
$('#pickNext').onclick = () => { call('pick', 'next').catch(accessError); toast(t('clickNext')); };

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
  $('#pagerSummary').textContent = t({ none: 'off', next: 'nextButton', scroll: 'infiniteScroll' }[mode]);
  if (mode === 'next' && !state.next) {
    call('findNext').then((n) => {
      state.next = n;
      $('#nextLabel').textContent = n ? n.label : t('notFoundChoose');
    }).catch(() => {});
  }
}
$$('[name=pmode]').forEach((r) => (r.onchange = pagerUI));
$('#scrollHintBtn').onclick = () => {
  $('#scrollHint').hidden = true;
  $('#pagerCard').open = true;
  $('[name=pmode][value=scroll]').checked = true;
  pagerUI();
  $('#runPager').click();
};

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

$('#runPager').onclick = async () => {
  const mode = $('[name=pmode]:checked').value;
  if (!state.recipe) return toast(t('pickListFirst'));
  if (mode === 'next' && !state.next) return toast(t('chooseNextFirst'));
  const max = Math.max(1, +$('#maxPages').value || 10);
  const delay = Math.max(0, +$('#delay').value || 0) * 1000;
  if (mode === 'next') {
    // Page loads would drop the one-time activeTab grant, so ask for this site only.
    if (state.origin && !(await chrome.permissions.request({ origins: [state.origin] }))) return toast(t('permFollow'));
  }
  const seen = new Map();
  setData(state.recipe.columns, []);
  startBusy(t('pageOf', 1, max, 0));
  try {
    await paginate(tabId, state.recipe, {
      mode, next: state.next, max, delay,
      stop: () => state.stop,
      onPage: (rows, page) => {
        addRows(state.recipe.columns, rows, seen);
        progress(page / max, t('pageOf', page, max, state.rows.length));
      },
    });
    endBusy(t('doneRows', state.rows.length));
  } catch (e) {
    endBusy();
    accessError(e);
  }
};

// Recipes. Keep the user's column renames and deletions.
const currentRecipe = () => ({
  ...state.recipe,
  columns: state.recipe.columns.filter((c) => state.cols.some((x) => x.key === c.key)).map((c) => ({ ...c, name: state.cols.find((x) => x.key === c.key).name })),
});
async function recipes() { return (await chrome.storage.local.get('recipes')).recipes || {}; }
$('#saveRecipe').onclick = async () => {
  if (!state.recipe) return toast(t('pickListFirst'));
  const all = await recipes();
  all[state.host] = { recipe: currentRecipe(), next: state.next, mode: $('[name=pmode]:checked').value };
  await chrome.storage.local.set({ recipes: all });
  $('#saved').hidden = false;
  toast(t('recipeSaved', state.host));
};
$('#useSaved').onclick = async () => {
  const r = (await recipes())[state.host];
  if (!r) return;
  state.next = r.next;
  if (r.next) $('#nextLabel').textContent = r.next.label;
  $(`[name=pmode][value=${r.mode || 'none'}]`).checked = true;
  pagerUI();
  $('#candInfo').textContent = t('usingSaved');
  useRecipe(r.recipe);
};

// ---------- quick grab ----------
$$('[data-quick]').forEach((b) => (b.onclick = async () => {
  try {
    const kind = b.dataset.quick;
    call('clear').catch(() => {});
    if (kind === 'contacts') {
      startBusy(t('scanningContacts'));
      const c = await call('contacts');
      for (const link of await call('contactLinks')) mergeContacts(c, await fetchContacts(link));
      endBusy();
      for (const k of Object.keys(c)) if (!c[k]) delete c[k]; // one page: hide empty fields
      const { cols, rows } = fromObjects([c]);
      setData(cols, rows);
      toast(c.Emails ? t('foundEmails', c.Emails.split(', ').length) : t('noEmails'));
    } else {
      const { cols, rows } = fromObjects(await call(kind));
      setData(cols, rows);
      toast(t('grabbed', rows.length));
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
$('#urls').oninput = () => { $('#urlCount').textContent = t('urlCount', parseUrls().length); };
$('#csvFile').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  $('#urls').value = (await f.text()).match(/https?:\/\/[^\s,"';]+/g)?.join('\n') || '';
  $('#urls').oninput();
};

async function scrapeOne(url, mode) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitLoaded(tab.id);
    await sleep(1200);
    if (mode === 'contacts') {
      const c = await callIn(tab.id, 'contacts');
      for (const link of await callIn(tab.id, 'contactLinks')) mergeContacts(c, await fetchContacts(link));
      return { cols: Object.keys(c).map((k) => ({ key: k, name: colName(k) })), rows: [c] };
    }
    let recipe = state.recipe;
    if (mode === 'auto' || !recipe) {
      const [best] = await callIn(tab.id, 'detect');
      if (!best) return { cols: [], rows: [] };
      recipe = { rowSelector: best.rowSelector, columns: best.columns };
    }
    const src = { key: '_source', name: t('colSource') };
    const rows = (await callIn(tab.id, 'extract', recipe)).map((r) => ({ ...r, _source: url }));
    return { cols: [...recipe.columns, src], rows };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

$('#runBulk').onclick = async () => {
  const urls = parseUrls();
  const mode = $('#bulkMode').value;
  if (!urls.length) return toast(t('pasteOneUrl'));
  if (mode === 'recipe' && !state.recipe) return toast(t('pickListCurrent'));
  if (!(await chrome.permissions.request({ origins: ['<all_urls>'] }))) return toast(t('permSites'));
  setData([], []);
  startBusy(t('bulkProgress', 0, urls.length, 0));
  let done = 0, failed = 0, i = 0;
  const worker = async () => {
    while (i < urls.length && !state.stop) {
      const url = urls[i++];
      try {
        const { cols, rows } = await scrapeOne(url, mode);
        addRows(cols, rows);
      } catch (e) {
        failed++;
        addRows([{ key: 'URL', name: 'URL' }, { key: '_error', name: t('colError') }], [{ URL: url, _error: String(e.message || e).slice(0, 120) }]);
      }
      progress(++done / urls.length, t('bulkProgress', done, urls.length, state.rows.length) + (failed ? ' · ' + t('failedN', failed) : ''));
    }
  };
  await Promise.all(Array.from({ length: Math.min(+$('#concurrency').value, urls.length) }, worker));
  endBusy(t('bulkDone', state.rows.length));
};

// ---------- image downloads ----------
function imageName(url, i) {
  let base = 'image', ext = '';
  if (url.startsWith('data:')) ext = '.' + (url.match(/^data:image\/([a-z+]+)/)?.[1] || 'png').replace('svg+xml', 'svg').replace('jpeg', 'jpg');
  else {
    base = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image').replace(/[^\w.-]+/g, '_').slice(-80) || 'image';
    if (!/\.(jpe?g|png|gif|webp|avif|svg|bmp|ico)$/i.test(base)) ext = '.jpg';
  }
  return `${String(i + 1).padStart(3, '0')}-${base}${ext}`;
}
$('#dlImages').onclick = async () => {
  const urls = [...new Set(state.rows.flatMap((r) => state.cols.filter(isImageCol).map((c) => String(r[c.key] ?? ''))).filter((v) => /^(https?:|data:image\/)/.test(v)))];
  if (!urls.length) return toast(t('noImageUrls'));
  if (!(await chrome.permissions.request({ permissions: ['downloads'] }))) return toast(t('permImages'));
  const folder = 'grabbit/' + (state.host || 'images').replace(/^www\./, '').replace(/[^\w.-]+/g, '_') + '-' + new Date().toISOString().slice(0, 10);
  startBusy(t('savingImages', 0, urls.length));
  let failed = 0;
  for (const [i, url] of urls.entries()) {
    if (state.stop) break;
    try { await chrome.downloads.download({ url, filename: `${folder}/${imageName(url, i)}`, conflictAction: 'uniquify', saveAs: false }); }
    catch { failed++; }
    progress((i + 1) / urls.length, t('savingImages', i + 1, urls.length));
  }
  endBusy(t('savedImages', urls.length - failed, 'Downloads/' + folder) + (failed ? ' · ' + t('failedN', failed) : ''));
};

// ---------- schedules (runs happen in background.js) ----------
$('#createSchedule').onclick = async () => {
  if (!state.recipe) return toast(t('pickListTab'));
  if (!state.origin) return toast(t('cantSchedule'));
  const autoExport = $('#schedExport').value;
  // Request before any other await so the click still counts as a user gesture.
  const ok = await chrome.permissions.request({ origins: [state.origin], ...(autoExport !== 'none' && { permissions: ['downloads'] }) });
  if (!ok) return toast(t('permBackground'));
  const mode = $('[name=pmode]:checked').value;
  const s = {
    id: Date.now().toString(36),
    url: state.url,
    host: state.host,
    recipe: currentRecipe(),
    mode,
    next: state.next,
    max: mode === 'none' ? 1 : Math.max(1, +$('#maxPages').value || 10),
    delay: Math.max(0, +$('#delay').value || 0) * 1000,
    every: +$('#schedEvery').value,
    autoExport,
  };
  const { schedules = [] } = await chrome.storage.local.get('schedules');
  await chrome.storage.local.set({ schedules: [...schedules, s] });
  await chrome.alarms.create('sched:' + s.id, { periodInMinutes: s.every, delayInMinutes: s.every });
  chrome.runtime.sendMessage({ grabbit: 'runSchedule', id: s.id }); // first run now, so the user sees it works
  toast(t('scheduled'));
};

async function renderSchedules() {
  const { schedules = [] } = await chrome.storage.local.get('schedules');
  const list = $('#schedList');
  list.innerHTML = '';
  $('#schedEmpty').hidden = schedules.length > 0;
  for (const s of schedules) {
    const li = document.createElement('li');
    li.className = 'card';
    li.innerHTML = '<div class="row between"><b class="host"></b><span class="muted tiny every"></span></div><div class="muted tiny status"></div><div class="row gap mt"><button class="btn small" data-a="view"></button><button class="btn small" data-a="run"></button><button class="btn small danger" data-a="del"></button></div>';
    li.querySelector('[data-a=view]').textContent = t('viewData');
    li.querySelector('[data-a=run]').textContent = t('runNow');
    li.querySelector('[data-a=del]').textContent = t('delete');
    li.querySelector('.host').textContent = s.host + new URL(s.url).pathname.replace(/\/$/, '');
    li.querySelector('.every').textContent = t('every' + s.every) + (s.autoExport !== 'none' ? ' · ' + t('autoX', s.autoExport === 'xlsx' ? 'Excel' : 'CSV') : '');
    li.querySelector('.status').textContent = s.running ? t('running')
      : s.lastRun ? t('lastRun', new Date(s.lastRun).toLocaleString(), s.lastCount) + (s.lastAdded ? ' · ' + t('newN', s.lastAdded) : '') + (s.lastError ? ' · ⚠ ' + s.lastError : '')
      : t('notRunYet');
    li.querySelector('[data-a=run]').onclick = () => chrome.runtime.sendMessage({ grabbit: 'runSchedule', id: s.id });
    li.querySelector('[data-a=view]').onclick = async () => {
      const res = (await chrome.storage.local.get('result:' + s.id))['result:' + s.id];
      if (!res) return toast(t('noDataYet'));
      setData(res.cols, res.rows);
    };
    li.querySelector('[data-a=del]').onclick = async () => {
      const { schedules = [] } = await chrome.storage.local.get('schedules');
      await chrome.storage.local.set({ schedules: schedules.filter((x) => x.id !== s.id) });
      chrome.storage.local.remove('result:' + s.id);
      chrome.alarms.clear('sched:' + s.id);
    };
    list.appendChild(li);
  }
}
chrome.storage.onChanged.addListener((ch) => ch.schedules && renderSchedules());

// ---------- export ----------
const fileBase = () => `${(state.host || 'grabbit').replace(/^www\./, '')}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
function download(blob, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$$('[data-export]').forEach((b) => (b.onclick = async () => {
  if (!state.rows.length) return toast(t('nothingToExport'));
  const { cols, rows } = state;
  const kind = b.dataset.export;
  if (kind === 'xlsx') download(Exporter.xlsx(cols, rows), fileBase() + '.xlsx');
  if (kind === 'csv') download(new Blob([Exporter.csv(cols, rows)], { type: 'text/csv' }), fileBase() + '.csv');
  if (kind === 'json') download(new Blob([Exporter.json(cols, rows)], { type: 'application/json' }), fileBase() + '.json');
  if (kind === 'copy' || kind === 'sheets') {
    await navigator.clipboard.writeText(Exporter.tsv(cols, rows));
    if (kind === 'sheets') {
      chrome.tabs.create({ url: 'https://sheets.new' });
      toast(t('copiedSheets'));
    } else toast(t('copiedRows', rows.length));
  } else toast(t('exportedRows', rows.length));
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
  if (!tabId) return notice(t('openFromIcon'));
  try {
    const tab = await chrome.tabs.get(tabId);
    state.host = tab.url ? new URL(tab.url).hostname : '';
    state.url = tab.url;
    if (/^https?:/.test(tab.url)) state.origin = new URL(tab.url).origin + '/*';
    $('#host').textContent = state.host || t('webScraper');
    if ((await recipes())[state.host]) $('#saved').hidden = false;
  } catch {}
  pagerUI();
  renderSchedules();
  scan();
})();
