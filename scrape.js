// Shared scraping helpers, used by the side panel and the background worker (scheduled runs).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Key order is not stable (chrome.storage returns keys sorted), so sort before comparing rows.
const rowKey = (r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]]));
// The same item can be read twice, e.g. before and after its lazy image loaded: identify it by its link when it has one.
const itemKey = (cols, r) => {
  const link = cols.find((c) => c.kind === 'href');
  return (link && r[link.key]) || rowKey(r);
};
// Keep one row per item; a later read fills fields the earlier one was missing.
function mergeRows(seen, cols, rows, out) {
  for (const r of rows) {
    const k = itemKey(cols, r);
    const old = seen.get(k);
    if (!old) {
      seen.set(k, r);
      out.push(r);
    } else for (const [f, v] of Object.entries(r)) if (v && !old[f]) old[f] = v;
  }
}

async function callIn(tid, name, ...args) {
  await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
  const [r] = await chrome.scripting.executeScript({ target: { tabId: tid }, func: async (n, a) => JSON.stringify((await window.__grabbit[n](...a)) ?? null), args: [name, args] });
  return JSON.parse(r?.result ?? 'null'); // JSON keeps column order; structured clone may not
}

function waitLoaded(tid, timeout = 30000) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(l); clearTimeout(t); resolve(); };
    const l = (id, info) => { if (id === tid && info.status === 'complete') done(); };
    const t = setTimeout(done, timeout);
    chrome.tabs.onUpdated.addListener(l);
    chrome.tabs.get(tid).then((tab) => tab.status === 'complete' && done()).catch(done);
  });
}

async function waitForChange(tid, rowSelector, before, timeout, stop) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout && !stop()) {
    await sleep(500);
    try {
      if ((await chrome.tabs.get(tid)).status !== 'complete') continue;
      const fp = await callIn(tid, 'fingerprint', rowSelector);
      if (fp !== before && !fp.startsWith('0:')) return true;
    } catch { /* page is navigating */ }
  }
  return false;
}

// Extract the list, then follow "Next" or infinite scroll. onPage gets each page's rows.
async function paginate(tid, recipe, { mode = 'none', next, max = 1, delay = 0, onPage, stop = () => false }) {
  let stale = 0;
  for (let page = 1; page <= max && !stop(); page++) {
    await callIn(tid, 'revealLazy', recipe.rowSelector); // sites that only load pictures once they scroll into view
    await onPage(await callIn(tid, 'extract', recipe), page);
    if (page === max || mode === 'none') break;
    const before = await callIn(tid, 'fingerprint', recipe.rowSelector);
    if (mode === 'next') {
      if (!next || !(await callIn(tid, 'clickNext', next.selector))) break;
    } else await callIn(tid, 'scrollMore', recipe.rowSelector);
    if (!(await waitForChange(tid, recipe.rowSelector, before, mode === 'scroll' ? 8000 : 20000, stop))) {
      if (mode === 'next' || ++stale >= 2) break;
    } else stale = 0;
    await sleep(delay);
  }
  // Rows that arrived on the last step may still be waiting for their pictures.
  if (mode !== 'none' && !stop()) {
    await callIn(tid, 'revealLazy', recipe.rowSelector);
    await onPage(await callIn(tid, 'extract', recipe), max);
  }
}
