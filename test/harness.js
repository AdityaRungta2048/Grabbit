// Shared test setup: serves fixtures and launches Chromium with the extension loaded.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const fixtures = path.join(__dirname, 'fixtures');

module.exports = async function launch(viewport) {
  const server = http.createServer((req, res) => {
    const f = path.join(fixtures, path.normalize(req.url.split('?')[0]).replace(/^(\.\.[/\\])+/, ''));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.end(fs.readFileSync(f));
    }
    res.statusCode = 404;
    res.end('nope');
  }).listen(0);
  const base = `http://localhost:${server.address().port}`;

  // Copy the extension and grant host access up front: headless tests cannot click the toolbar icon for activeTab.
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'grabbit-ext-'));
  for (const f of fs.readdirSync(root)) if (!['test', '.git', 'store', 'dist', 'node_modules'].includes(f)) fs.cpSync(path.join(root, f), path.join(ext, f), { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json')));
  m.host_permissions = ['<all_urls>'];
  m.permissions.push(...m.optional_permissions); // already granted, so permissions.request() resolves without a prompt
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(m));

  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'grabbit-prof-')), {
    channel: 'chromium',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    acceptDownloads: true,
    viewport,
  });
  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
  const extId = sw.url().split('/')[2];

  const openPanel = async (url, panelViewport) => {
    const page = await ctx.newPage();
    await page.goto(url);
    const tabId = await sw.evaluate((u) => chrome.tabs.query({}).then((t) => t.find((x) => x.url === u).id), url);
    const panel = await ctx.newPage();
    if (panelViewport) await panel.setViewportSize(panelViewport);
    await panel.goto(`chrome-extension://${extId}/panel.html?tab=${tabId}`);
    return { page, panel };
  };
  const close = async () => { await ctx.close(); server.close(); };
  return { ctx, sw, base, openPanel, close };
};
