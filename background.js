importScripts('scrape.js', 'export.js');

// Clicking the icon (or Alt+G) grants activeTab and opens a side panel bound to that tab.
// setOptions/open are not awaited on purpose: open() must run inside the user gesture.
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.setOptions({ tabId: tab.id, path: `panel.html?tab=${tab.id}`, enabled: true });
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: 'welcome.html' });
});

// ---------- scheduled scraping ----------
chrome.alarms.onAlarm.addListener((a) => a.name.startsWith('sched:') && runSchedule(a.name.slice(6)));
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.grabbit === 'runSchedule') runSchedule(msg.id);
});

async function updateSchedule(id, patch) {
  const { schedules = [] } = await chrome.storage.local.get('schedules');
  await chrome.storage.local.set({ schedules: schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
}

const running = new Set();
async function runSchedule(id) {
  const { schedules = [] } = await chrome.storage.local.get('schedules');
  const s = schedules.find((x) => x.id === id);
  if (!s) return chrome.alarms.clear('sched:' + id);
  if (running.has(id)) return;
  running.add(id);
  await updateSchedule(id, { running: true });

  const rows = [], seen = new Set();
  let error = '';
  let tab;
  try {
    if (!(await chrome.permissions.contains({ origins: [new URL(s.url).origin + '/*'] }))) throw new Error('site access was removed');
    tab = await chrome.tabs.create({ url: s.url, active: false });
    await waitLoaded(tab.id);
    await sleep(1500);
    await paginate(tab.id, s.recipe, {
      mode: s.mode, next: s.next, max: s.max, delay: s.delay,
      onPage: (page) => page.forEach((r) => !seen.has(rowKey(r)) && seen.add(rowKey(r)) && rows.push(r)),
    });
    if (!rows.length) error = 'no rows found, the page layout may have changed';
  } catch (e) {
    error = String(e.message || e).slice(0, 120);
  } finally {
    if (tab) chrome.tabs.remove(tab.id).catch(() => {});
  }

  const key = 'result:' + id;
  const prev = (await chrome.storage.local.get(key))[key];
  const before = new Set((prev?.rows || []).map(rowKey));
  const added = prev ? rows.filter((r) => !before.has(rowKey(r))).length : 0;
  if (rows.length) {
    try { await chrome.storage.local.set({ [key]: { at: Date.now(), cols: s.recipe.columns, rows } }); }
    catch (e) { error = 'could not save results: ' + e.message; }
    if (s.autoExport !== 'none') error ||= await autoExport(s, rows);
  }
  if (added) {
    chrome.action.setBadgeBackgroundColor({ color: '#7c5cff' });
    chrome.action.setBadgeText({ text: String(Math.min(added, 999)) });
  }
  await updateSchedule(id, { running: false, lastRun: Date.now(), lastCount: rows.length, lastAdded: added, lastError: error });
  running.delete(id);
}

// Service workers have no object URLs, so downloads go through a data: URL.
async function autoExport(s, rows) {
  if (!(await chrome.permissions.contains({ permissions: ['downloads'] }))) return 'downloads permission was removed';
  const bytes = s.autoExport === 'xlsx'
    ? new Uint8Array(await Exporter.xlsx(s.recipe.columns, rows).arrayBuffer())
    : new TextEncoder().encode(Exporter.csv(s.recipe.columns, rows));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const mime = s.autoExport === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv';
  const name = `grabbit/${s.host.replace(/^www\./, '')}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${s.autoExport}`;
  try {
    await chrome.downloads.download({ url: `data:${mime};base64,${btoa(bin)}`, filename: name, conflictAction: 'uniquify', saveAs: false });
    return '';
  } catch (e) {
    return 'download failed: ' + e.message;
  }
}
