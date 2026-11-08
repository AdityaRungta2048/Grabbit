// End-to-end check: loads the real extension in Chromium and drives the side panel against local fixtures.
// Run: node test/e2e.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const launch = require('./harness');

(async () => {
  const { sw, base, openPanel: open, close } = await launch();
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
  await panel.waitForTimeout(500);
  assert(await panel.isHidden('#scrollHint'), 'no scroll hint when the page has a Next button');
  assert.strictEqual(await panel.textContent('#candInfo'), '12 items · 5 fields', 'item count wording');

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
  await panel.waitForFunction(() => document.querySelector('#candPos').textContent.startsWith('1/') && +document.querySelector('#rowCount').textContent === 12, null, { polling: 200 });
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
  // Opening the panel alone (no multi-page run) must still fetch pictures that load on scroll.
  await sc.panel.waitForFunction(() => {
    const cols = [...document.querySelectorAll('#grid thead input')].map((i) => i.value);
    const cells = [...document.querySelectorAll(`#grid tbody td:nth-child(${cols.indexOf('Image') + 2})`)];
    return cells.length >= 10 && cells.slice(0, 10).every((td) => td.title); // rows the scroll pulled in are Infinite scroll's job
  }, null, { polling: 200, timeout: 15000 });
  // The list runs to the page bottom with no Next button, so the panel offers infinite scroll in one click.
  await sc.panel.waitForSelector('#scrollHint:not([hidden])', { timeout: 10000 });
  await sc.panel.evaluate(() => { document.querySelector('#delay').value = '0.5'; }); // pager section is still collapsed
  await sc.panel.click('#scrollHintBtn');
  await sc.panel.waitForFunction(() => document.querySelector('#progress').hidden && +document.querySelector('#rowCount').textContent >= 40, null, { timeout: 90000, polling: 200 });
  assert.strictEqual(await rowCount(sc.panel), 40, 'infinite scroll collected all');
  const scCols = await sc.panel.$$eval('#grid thead input', (i) => i.map((x) => x.value));
  const scImgs = await sc.panel.$$eval(`#grid tbody td:nth-child(${scCols.indexOf('Image') + 2})`, (t) => t.map((x) => x.title));
  assert(scImgs.length === 40 && scImgs.every((x) => /\/img\/post\d+\.png$/.test(x)), 'pictures that load on scroll are captured, missing rows: ' + scImgs.map((x, i) => (x ? '' : i + 1)).filter(Boolean).join(','));

  // 8b. Grid split into row containers (4 cards each, generated class names, sale prices in an extra wrapper)
  const ns = await openPanel(`${base}/nested.html`);
  await ns.panel.waitForFunction(() => +document.querySelector('#rowCount').textContent > 0, null, { polling: 200 });
  assert.strictEqual(await rowCount(ns.panel), 30, 'all 30 cards in one list, not 8 row containers');
  const nsCols = await ns.panel.$$eval('#grid thead input', (i) => i.map((x) => x.value));
  console.log('nested columns:', nsCols);
  assert(!nsCols.some((c) => /^(Link|Image) \d/.test(c)), 'no Link 2 / Image 2 columns');
  assert(!nsCols.some((c) => /css/i.test(c)), 'no generated class names');
  assert.deepStrictEqual(nsCols.slice(-3), ['Price', 'Original price', 'Discount'], 'sale and regular prices share a column; price inside a heading is still a Price');
  const colValues = (name) => ns.panel.$$eval(`#grid tbody td:nth-child(${nsCols.indexOf(name) + 2})`, (t) => t.map((x) => x.title || x.textContent));
  const prices = await colValues('Price');
  assert(prices.every((x) => /^₹ [\d,]+$/.test(x)), 'every card has a price: ' + prices.join(' '));
  assert((await colValues('Original price')).filter(Boolean).length === 10, 'original price only on the 10 discounted cards');
  const nsImgs = await colValues('Image');
  assert(nsImgs.every((x) => /\/img\/p\d+\.jpg$/.test(x)), 'lazy images (data-src, data-srcset) are captured: ' + nsImgs.filter((x) => !/jpg$/.test(x)).length + ' missing');
  await ns.panel.click('#nextCand');
  await ns.panel.click('#pick');
  await ns.page.waitForSelector('#grabbit-tip');
  await ns.page.click('.css-gridrow:nth-child(3) .product-card:nth-child(3) .css-regprice');
  await ns.panel.waitForFunction(() => document.querySelector('#candPos').textContent.startsWith('1/') && +document.querySelector('#rowCount').textContent === 30, null, { polling: 200 });

  // 9. Image download: 9 product images from the demo list
  const im = await openPanel(`${base}/demo.html`);
  await im.panel.waitForFunction(() => +document.querySelector('#rowCount').textContent === 9, null, { polling: 200 });
  assert(await im.panel.isVisible('#dlImages'), 'image download button shown');
  await im.panel.click('#dlImages');
  await im.panel.waitForFunction(() => document.querySelector('#progress').hidden, null, { polling: 200 });
  const imgs = await sw.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      const d = (await chrome.downloads.search({})).filter((x) => x.finalUrl.startsWith('data:image/svg'));
      if (d.length >= 9 && d.every((x) => x.state === 'complete')) return d.length;
      await new Promise((r) => setTimeout(r, 200));
    }
    return 0;
  });
  assert.strictEqual(imgs, 9, 'downloaded 9 images');
  const names = await im.panel.evaluate(() => [imageName('data:image/svg+xml,abc', 0), imageName('https://x.com/a/b/photo%20one.webp?w=2', 11), imageName('https://x.com/img?id=3', 2)]);
  console.log('image names:', names);
  assert.deepStrictEqual(names, ['001-image.svg', '012-photo_one.webp', '003-img.jpg']);

  // 10. Schedule: 3 pages via Next, auto CSV export, first run starts right away
  const sch = await openPanel(`${base}/shop1.html`);
  await sch.panel.waitForFunction(() => +document.querySelector('#rowCount').textContent === 12, null, { polling: 200 });
  await sch.panel.click('#pagerCard summary');
  await sch.panel.check('[name=pmode][value=next]');
  await sch.panel.waitForFunction(() => document.querySelector('#nextLabel').textContent.includes('Next'), null, { polling: 200 });
  await sch.panel.fill('#delay', '0.2');
  await sch.panel.click('[data-tab=schedule]');
  await sch.panel.selectOption('#schedExport', 'csv');
  await sch.panel.click('#createSchedule');
  await sch.panel.waitForFunction(() => /Last run .* 36 rows/.test(document.querySelector('#schedList').textContent), null, { polling: 300, timeout: 90000 });
  const alarms = await sw.evaluate(() => chrome.alarms.getAll());
  assert.strictEqual(alarms.length, 1, 'alarm created');
  assert.strictEqual(alarms[0].periodInMinutes, 1440, 'daily');
  const csv1 = await sw.evaluate(async () => (await chrome.downloads.search({ state: 'complete' })).filter((d) => d.finalUrl.startsWith('data:text/csv')).map((d) => d.finalUrl));
  assert.strictEqual(csv1.length, 1, 'auto CSV exported');
  const csvText = Buffer.from(csv1[0].split(',')[1], 'base64').toString('utf8');
  assert.strictEqual(csvText.trim().split('\r\n').length, 37, 'auto CSV has header + 36 rows');
  // Second run: same data, so nothing new
  await sch.panel.click('#schedList [data-a=run]');
  await sch.panel.waitForFunction(() => /Running/.test(document.querySelector('#schedList').textContent), null, { polling: 100, timeout: 5000 }).catch(() => {});
  await sch.panel.waitForFunction(() => /Last run .* 36 rows/.test(document.querySelector('#schedList').textContent) && !/new/.test(document.querySelector('#schedList').textContent), null, { polling: 300, timeout: 90000 });
  await sch.panel.click('#schedList [data-a=view]');
  await sch.panel.waitForFunction(() => +document.querySelector('#rowCount').textContent === 36, null, { polling: 200 });
  await sch.panel.click('#schedList [data-a=del]');
  await sch.panel.waitForFunction(() => !document.querySelector('#schedEmpty').hidden, null, { polling: 200 });
  assert.strictEqual((await sw.evaluate(() => chrome.alarms.getAll())).length, 0, 'alarm removed');

  // Keep a copy of the xlsx for external validation.
  fs.copyFileSync(xlsxPath, path.join(os.tmpdir(), 'grabbit-test.xlsx'));
  assert.deepStrictEqual(errors, [], 'no panel errors');
  console.log('ALL PASSED');
  await close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
