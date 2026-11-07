// End-to-end check: loads the real extension in Chromium and drives the side panel against local fixtures.
// Run: node test/e2e.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const launch = require('./harness');

(async () => {
  const { base, openPanel: open, close } = await launch();
  const errors = [];
  const openPanel = async (url) => {
    const r = await open(url);
    r.panel.on('pageerror', (e) => errors.push(e.message));
    r.panel.on('console', (msg) => msg.type() === 'error' && !/Failed to load resource/.test(msg.text()) && errors.push(msg.text()));
    return r;
  };

  const rowCount = (panel) => panel.locator('#rowCount').textContent().then(Number);

  // 1. Auto-detect product grid
  const { page, panel } = await openPanel(`${base}/shop1.html`);
  await panel.waitForFunction(() => +document.querySelector('#rowCount').textContent > 0, null, { polling: 200 });
  assert.strictEqual(await rowCount(panel), 12, 'detects 12 products');
  const headers = await panel.$$eval('#grid thead input', (i) => i.map((x) => x.value));
  console.log('columns:', headers);
  for (const want of ['Image', 'Link', 'Price', 'Rating']) assert(headers.some((h) => h.startsWith(want)), 'has column ' + want);
  assert(!headers.some((h) => /cart/i.test(h)), 'drops constant "Add to cart" column');
  const firstRow = await panel.$$eval('#grid tbody tr:first-child td', (t) => t.map((x) => x.textContent));
  console.log('row 1:', firstRow);
  assert(firstRow.includes('$11.99') && firstRow.some((v) => v.endsWith('/item/1-1')), 'row values');
  assert(await page.locator('[data-grabbit-row]').count() === 12, 'rows highlighted on page');

  // 2. Exports
  const [dl] = await Promise.all([panel.waitForEvent('download'), panel.click('[data-export=xlsx]')]);
  const xlsxPath = await dl.path();
  const buf = fs.readFileSync(xlsxPath);
  assert(buf.slice(0, 2).toString() === 'PK', 'xlsx is a zip');
  console.log('xlsx bytes:', buf.length, dl.suggestedFilename());
  const [dl2] = await Promise.all([panel.waitForEvent('download'), panel.click('[data-export=csv]')]);
  const csv = fs.readFileSync(await dl2.path(), 'utf8');
  assert.strictEqual(csv.trim().split('\r\n').length, 13, 'csv has header + 12 rows');

  // 3. Picker: click a price on page picks the product rows
  await panel.click('#nextCand');
  await panel.click('#pick');
  await page.waitForSelector('#grabbit-tip');
  await page.click('.product-card:nth-child(3) .price');
  await panel.waitForFunction(() => document.querySelector('#candInfo').textContent.startsWith('List 1') && +document.querySelector('#rowCount').textContent === 12, null, { polling: 200 });
  assert.strictEqual(await page.evaluate(() => location.pathname), '/shop1.html', 'picker click did not navigate');

  // 4. Pagination via Next link (3 pages x 12)
  await panel.click('#pagerCard summary');
  await panel.check('[name=pmode][value=next]');
  await panel.waitForFunction(() => document.querySelector('#nextLabel').textContent.includes('Next'), null, { polling: 200 });
  await panel.fill('#delay', '0.2');
  await panel.click('#runPager');
  await panel.waitForFunction(() => document.querySelector('#progress').hidden && +document.querySelector('#rowCount').textContent >= 36, null, { timeout: 60000, polling: 200 });
  assert.strictEqual(await rowCount(panel), 36, 'paginated 3 pages');

  // 5. Quick grab: contacts with contact-page deep scan
  await page.goto(`${base}/shop1.html`);
  await panel.click('[data-tab=quick]');
  await panel.click('[data-quick=contacts]');
  await panel.waitForFunction(() => document.querySelector('#grid tbody td') && [...document.querySelectorAll('#grid tbody td')].some((t) => t.textContent.includes('@')), null, { polling: 200 });
  const contact = await panel.$$eval('#grid tbody td', (t) => t.map((x) => x.textContent).join(' | '));
  console.log('contacts:', contact);
  assert(/sales@demo-shop\.com/.test(contact) && /help@demo-shop\.com/.test(contact), 'emails from page + contact page');
  assert(/415\) 555-0132/.test(contact), 'phone');
  assert(/linkedin\.com\/company\/demo-shop/.test(contact), 'social from contact page');

  // 6. Table detection with headers
  const t = await openPanel(`${base}/table.html`);
  await t.panel.waitForFunction(() => +document.querySelector('#rowCount').textContent > 0, null, { polling: 200 });
  const th = await t.panel.$$eval('#grid thead input', (i) => i.map((x) => x.value));
  console.log('table columns:', th);
  assert.deepStrictEqual(th, ['Country', 'Population', 'GDP']);
  assert.strictEqual(await rowCount(t.panel), 5);

  // 7. Bulk URLs (auto-detect)
  await t.panel.click('[data-tab=bulk]');
  await t.panel.fill('#urls', `${base}/shop1.html\n${base}/shop2.html`);
  await t.panel.selectOption('#bulkMode', 'auto');
  await t.panel.click('#runBulk');
  await t.panel.waitForFunction(() => document.querySelector('#progress').hidden && +document.querySelector('#rowCount').textContent > 0, null, { timeout: 60000, polling: 200 });
  assert.strictEqual(await rowCount(t.panel), 24, 'bulk scraped 2 pages');

  // 8. Infinite scroll: 10 items load at a time, 40 total
  const sc = await openPanel(`${base}/scroll.html`);
  await sc.panel.waitForFunction(() => +document.querySelector('#rowCount').textContent === 10, null, { polling: 200 });
  await sc.panel.click('#pagerCard summary');
  await sc.panel.check('[name=pmode][value=scroll]');
  await sc.panel.fill('#delay', '0.5');
  await sc.panel.click('#runPager');
  await sc.panel.waitForFunction(() => document.querySelector('#progress').hidden && +document.querySelector('#rowCount').textContent >= 40, null, { timeout: 90000, polling: 200 });
  assert.strictEqual(await rowCount(sc.panel), 40, 'infinite scroll collected all');

  // Keep a copy of the xlsx for external validation.
  fs.copyFileSync(xlsxPath, path.join(os.tmpdir(), 'grabbit-test.xlsx'));
  assert.deepStrictEqual(errors, [], 'no panel errors');
  console.log('ALL PASSED');
  await close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
