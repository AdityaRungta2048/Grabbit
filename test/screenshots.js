// Generates Chrome Web Store images from the real extension: node test/screenshots.js
const fs = require('fs');
const path = require('path');
const launch = require('./harness');
const out = path.join(__dirname, '..', 'store');
const icon = fs.readFileSync(path.join(__dirname, '..', 'icons', '128.png')).toString('base64');

const VIEW = { width: 880, height: 700 };
const PANEL = { width: 400, height: 700 };

function frame(pageB64, panelB64, title, sub) {
  return `<!doctype html><html><head><style>
  *{box-sizing:border-box}body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:Inter,system-ui,sans-serif;
  background:radial-gradient(1200px 600px at 0% 0%,#ece6ff,transparent),radial-gradient(900px 500px at 100% 100%,#ffe3da,transparent),#f7f5ff;}
  .cap{position:absolute;left:56px;top:34px;right:56px;display:flex;align-items:center;gap:16px}
  .cap img{width:52px;height:52px}.cap h1{margin:0;font:800 34px/1.1 'Inter Display',Inter,sans-serif;letter-spacing:-.02em;color:#1d1b2e}
  .cap p{margin:4px 0 0;font-size:17px;color:#5d5a73}
  .win{position:absolute;left:56px;top:128px;width:1168px;height:640px;border-radius:14px;overflow:hidden;background:#fff;
  box-shadow:0 30px 80px rgba(60,40,140,.25),0 0 0 1px rgba(0,0,0,.06);display:flex;flex-direction:column}
  .bar{height:34px;background:#eceaf3;display:flex;align-items:center;gap:7px;padding:0 14px;flex:none}
  .bar i{width:11px;height:11px;border-radius:50%;background:#ff5f57}.bar i:nth-child(2){background:#febc2e}.bar i:nth-child(3){background:#28c840}
  .bar span{margin-left:16px;background:#fff;border-radius:6px;padding:3px 12px;font-size:12px;color:#777;width:420px}
  .body{flex:1;display:flex;min-height:0}.body img{display:block;height:100%;object-fit:cover;object-position:top left}
  .pg{flex:1;min-width:0;overflow:hidden}.pn{width:${(PANEL.width * 606) / PANEL.height}px;border-left:1px solid #ddd;flex:none}
  </style></head><body>
  <div class="cap"><img src="data:image/png;base64,${icon}"><div><h1>${title}</h1><p>${sub}</p></div></div>
  <div class="win"><div class="bar"><i></i><i></i><i></i><span>northpeakoutdoor.co/hiking-gear</span></div>
  <div class="body"><div class="pg"><img src="data:image/png;base64,${pageB64}" style="width:100%"></div>
  <div class="pn"><img src="data:image/png;base64,${panelB64}" style="width:100%"></div></div></div></body></html>`;
}

(async () => {
  const { ctx, base, openPanel, close } = await launch(VIEW);
  const shots = {};
  const shoot = async (page, panel, name, title, sub) => {
    await panel.waitForTimeout(400);
    const a = (await page.screenshot()).toString('base64');
    const b = (await panel.screenshot()).toString('base64');
    shots[name] = b;
    const comp = await ctx.newPage();
    await comp.setViewportSize({ width: 1280, height: 800 });
    await comp.setContent(frame(a, b, title, sub));
    await comp.screenshot({ path: path.join(out, name), type: 'jpeg', quality: 95 });
    await comp.close();
    console.log('wrote', name);
  };
  const ready = (panel) => panel.waitForFunction(() => +document.querySelector('#rowCount').textContent > 0, null, { polling: 200 });

  const { page, panel } = await openPanel(`${base}/demo.html`, PANEL);
  await ready(panel);
  await panel.evaluate(() => { document.querySelector('#host').textContent = 'northpeakoutdoor.co'; });
  await shoot(page, panel, 'screenshot-1.jpg', 'Scrape any website in one click', 'Grabbit finds lists and tables for you. Export to Excel, CSV, JSON or Google Sheets.');

  await panel.click('#pagerCard summary');
  await panel.check('[name=pmode][value=next]');
  await panel.waitForFunction(() => document.querySelector('#nextLabel').textContent.includes('Next'), null, { polling: 200 });
  await shoot(page, panel, 'screenshot-2.jpg', 'Every page, automatically', 'Follows “Next” buttons and infinite scroll, and removes duplicate rows as it goes.');

  await panel.click('[data-tab=quick]');
  await panel.click('[data-quick=contacts]');
  await panel.waitForFunction(() => [...document.querySelectorAll('#grid td')].some((t) => t.textContent.includes('@')), null, { polling: 200 });
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await shoot(page, panel, 'screenshot-3.jpg', 'Find emails, phones & social profiles', 'Checks each site’s contact and about pages too. Great for lead lists.');

  await panel.click('[data-tab=bulk]');
  await panel.fill('#urls', [1, 2, 3].map((n) => `${base}/demo.html?list=${n}`).join('\n'));
  await panel.dispatchEvent('#urls', 'input');
  await panel.selectOption('#bulkMode', 'auto');
  await panel.click('#runBulk');
  await panel.waitForFunction(() => document.querySelector('#progress').hidden && +document.querySelector('#rowCount').textContent > 0, null, { polling: 200, timeout: 60000 });
  await panel.evaluate(() => {
    const t = document.querySelector('#urls');
    t.value = 'https://northpeakoutdoor.co/hiking-gear\nhttps://summit-supply.shop/tents\nhttps://trailhouse.store/jackets';
    t.rows = 3;
    document.querySelector('[data-pane=bulk] .tiny').hidden = true;
    document.querySelector('#urlCount').textContent = '3 URLs';
  });
  await panel.waitForTimeout(2600); // let the toast fade
  await shoot(page, panel, 'screenshot-4.jpg', 'Scrape hundreds of URLs at once', 'Paste links or load a CSV. Grabbit visits each page and merges everything into one sheet.');

  await panel.click('[data-tab=list]');
  await panel.check('[name=pmode][value=none]'); // pager card is still open from screenshot 2
  await panel.click('#rescan');
  await panel.waitForFunction(() => +document.querySelector('#rowCount').textContent === 9, null, { polling: 200 });
  await panel.click('[data-tab=schedule]');
  await panel.selectOption('#schedExport', 'xlsx');
  await panel.click('#createSchedule');
  await panel.waitForFunction(() => /Last run/.test(document.querySelector('#schedList').textContent), null, { polling: 200, timeout: 60000 });
  await panel.evaluate(() => {
    document.querySelector('#schedList .host').textContent = 'northpeakoutdoor.co/hiking-gear';
    const st = document.querySelector('#schedList .status');
    st.textContent = st.textContent.replace(/ · 9 rows.*/, ' · 9 rows · 2 new');
  });
  await panel.waitForTimeout(2600);
  await shoot(page, panel, 'screenshot-5.jpg', 'Track prices & stock on autopilot', 'Schedule any scrape hourly, daily or weekly. See what’s new and auto-save to Excel.');

  // Promo tiles
  const chip = (t, big) => `<span style="display:inline-block;padding:${big ? '8px 16px' : '4px 9px'};margin:0 6px 6px 0;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);font:600 ${big ? 17 : 11}px Inter,sans-serif">${t}</span>`;
  const tile = async (w, h, name, html) => {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;position:relative;font-family:Inter,sans-serif;color:#fff;background:radial-gradient(700px 400px at 85% 10%,rgba(255,255,255,.18),transparent),linear-gradient(135deg,#6a4cff 0%,#9b5cf6 50%,#ff7a59 100%)">${html}</body>`);
    await p.screenshot({ path: path.join(out, name), type: 'jpeg', quality: 95 });
    await p.close();
    console.log('wrote', name);
  };
  await tile(440, 280, 'promo-small.jpg', `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
      <img src="data:image/png;base64,${icon}" style="width:84px;height:84px;filter:drop-shadow(0 10px 24px rgba(0,0,0,.25))">
      <div style="font:800 40px/1 'Inter Display',Inter,sans-serif;letter-spacing:-.03em;margin-top:10px">Grabbit</div>
      <div style="font:600 15px Inter,sans-serif;margin:8px 0 12px;opacity:.95">Free web scraper · Any site to Excel</div>
      <div>${['Excel', 'CSV', 'Sheets', 'Emails', 'Schedules'].map((t) => chip(t)).join('')}</div>
    </div>`);
  await tile(1400, 560, 'promo-marquee.jpg', `
    <div style="position:absolute;left:96px;top:0;bottom:0;width:640px;display:flex;flex-direction:column;justify-content:center">
      <div style="display:flex;align-items:center;gap:14px;font:700 24px Inter,sans-serif"><img src="data:image/png;base64,${icon}" style="width:52px;height:52px">Grabbit</div>
      <div style="font:800 62px/1.04 'Inter Display',Inter,sans-serif;letter-spacing:-.03em;margin:22px 0 16px">Turn any website into a spreadsheet, instantly.</div>
      <div style="font:500 21px/1.4 Inter,sans-serif;opacity:.92;margin-bottom:22px">Free web scraper for lists, tables, emails and prices. No code, no account.</div>
      <div>${['100% free', 'Excel · CSV · Sheets', 'Multi-page', 'Schedules'].map((t) => chip(t, true)).join('')}</div>
    </div>
    <img src="data:image/png;base64,${shots['screenshot-1.jpg']}" style="position:absolute;right:110px;top:56px;width:400px;border-radius:16px;box-shadow:0 30px 70px rgba(30,10,80,.45);transform:rotate(-2deg)">`);
  await close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
