// Records the Chrome Web Store promo video from the real extension: node test/promo-video.js
// 1) drives Grabbit on the demo shop and captures each step, 2) animates them with captions and a
// cursor in a 1920x1080 stage page, frame by frame, 3) encodes dist/grabbit-promo.mp4 with ffmpeg.
// Captioned, no voiceover (store/PROMO_VIDEO.md has the voiceover text if you want to record one).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const launch = require('./harness');

const root = path.join(__dirname, '..');
const OUT = path.join(root, 'dist', 'grabbit-promo.mp4');
const VIEW = { width: 880, height: 700 };
const PANEL = { width: 400, height: 700 };
const FPS = 30;
const b64 = (buf) => 'data:image/png;base64,' + buf.toString('base64');
const icon = b64(fs.readFileSync(path.join(root, 'icons', '128.png')));

async function capture() {
  const { ctx, base, openPanel, close } = await launch(VIEW, 'en', { deviceScaleFactor: 2 });
  const shots = {};
  const rects = {};
  const page0 = await ctx.newPage();
  await page0.goto(`${base}/demo.html`);
  shots.page0 = b64(await page0.screenshot());
  await page0.close();

  const { page, panel } = await openPanel(`${base}/demo.html`, PANEL);
  const snap = async (name) => {
    await panel.waitForTimeout(350);
    shots['p_' + name] = b64(await panel.screenshot());
    shots['w_' + name] = b64(await page.screenshot());
  };
  const rectOf = async (who, sel, name) => {
    const r = await who.locator(sel).first().boundingBox();
    rects[name] = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  await panel.waitForFunction(() => +document.querySelector('#rowCount').textContent > 0, null, { polling: 200 });
  await panel.evaluate(() => { document.querySelector('#host').textContent = 'northpeakoutdoor.co'; });
  await snap('detected');

  // Pick on page
  await rectOf(panel, '#pick', 'pick');
  await panel.click('#pick');
  await page.waitForSelector('#grabbit-tip');
  await page.evaluate(() => document.querySelectorAll('[data-grabbit-row]').forEach((e) => e.removeAttribute('data-grabbit-row')));
  await snap('picking');
  await rectOf(page, '.card:nth-child(5) .price', 'item');
  await page.click('.card:nth-child(5) .price');
  await panel.waitForFunction(() => +document.querySelector('#rowCount').textContent === 9, null, { polling: 200 });
  await snap('picked');

  // Every page
  await rectOf(panel, '#pagerCard summary', 'pager');
  await panel.click('#pagerCard summary');
  await panel.check('[name=pmode][value=next]');
  await panel.waitForFunction(() => document.querySelector('#nextLabel').textContent.includes('Next'), null, { polling: 200 });
  await panel.evaluate(() => { document.querySelector('#delay').value = '1'; });
  await snap('pager');
  await rectOf(panel, '#runPager', 'run');
  await panel.click('#runPager');
  let last = '';
  for (let i = 0; i < 4; i++) {
    await panel.waitForFunction((prev) => document.querySelector('#rowCount').textContent !== prev, last, { polling: 100, timeout: 30000 });
    last = await panel.textContent('#rowCount');
    await page.waitForTimeout(400);
    await snap('page' + (i + 1));
  }
  await panel.waitForFunction(() => document.querySelector('#progress').hidden, null, { polling: 200, timeout: 30000 });
  await panel.waitForTimeout(2400); // toast fades
  await snap('pagesDone');
  const sheet = await panel.evaluate(() => ({ cols: state.cols.map((c) => c.name), rows: state.rows.map((r) => state.cols.map((c) => r[c.key] ?? '')) }));

  // Excel button position (same in every later state)
  await rectOf(panel, '[data-export=xlsx]', 'excel');

  // Emails & contacts
  await page.goto(`${base}/demo.html`);
  await panel.click('[data-tab=quick]');
  await rectOf(panel, '[data-quick=contacts]', 'contacts');
  await panel.click('[data-quick=contacts]');
  await panel.waitForFunction(() => [...document.querySelectorAll('#grid td')].some((td) => td.textContent.includes('@')), null, { polling: 200 });
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await panel.waitForTimeout(2400);
  await snap('contacts');

  // Bulk URLs
  await page.evaluate(() => scrollTo(0, 0));
  await panel.click('[data-tab=bulk]');
  await panel.fill('#urls', [1, 2, 3].map((n) => `${base}/demo.html?page=${n}`).join('\n'));
  await panel.dispatchEvent('#urls', 'input');
  await panel.selectOption('#bulkMode', 'auto');
  await panel.click('#runBulk');
  await panel.waitForFunction(() => document.querySelector('#progress').hidden && +document.querySelector('#rowCount').textContent > 0, null, { polling: 200, timeout: 60000 });
  await panel.evaluate(() => {
    const ta = document.querySelector('#urls');
    ta.value = 'https://northpeakoutdoor.co/hiking-gear\nhttps://summit-supply.shop/tents\nhttps://trailhouse.store/jackets';
    ta.rows = 3;
    document.querySelector('[data-pane=bulk] .tiny').hidden = true;
    document.querySelector('#urlCount').textContent = t('urlCount', 3);
  });
  await panel.waitForTimeout(2600);
  await snap('bulk');

  // Schedule
  await panel.click('[data-tab=list]');
  await panel.check('[name=pmode][value=none]');
  await panel.click('#rescan');
  await panel.waitForFunction(() => +document.querySelector('#rowCount').textContent === 9, null, { polling: 200 });
  await panel.click('[data-tab=schedule]');
  await panel.selectOption('#schedExport', 'xlsx');
  await panel.click('#createSchedule');
  await panel.waitForFunction(() => /Last run/.test(document.querySelector('#schedList').textContent), null, { polling: 200, timeout: 60000 });
  await panel.evaluate(() => {
    document.querySelector('#schedList .host').textContent = 'northpeakoutdoor.co/hiking-gear';
    document.querySelector('#schedList .status').textContent = t('lastRun', new Date().toLocaleString('en-US'), 9) + ' · ' + t('newN', 2);
  });
  await panel.waitForTimeout(2600);
  await snap('schedule');
  await close();
  return { shots, rects, sheet };
}

// ---------- stage: everything is a function of time t, so frames are exact and repeatable ----------
function stageHtml({ shots, rects, sheet }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1920px;height:1080px;overflow:hidden;font-family:Inter,system-ui,sans-serif;background:#0f0d1a;color:#1d1b2e}
#bg{position:absolute;inset:0;background:radial-gradient(1400px 800px at 0% 0%,#ece6ff,transparent),radial-gradient(1100px 700px at 100% 100%,#ffe3da,transparent),#f7f5ff}
.cap{position:absolute;left:0;right:0;top:56px;text-align:center}
.cap h1{font:800 64px/1.1 'Inter Display',Inter,sans-serif;letter-spacing:-.025em}
.cap p{font:500 28px Inter,sans-serif;color:#5d5a73;margin-top:12px}
#win{position:absolute;left:180px;top:250px;width:1560px;height:780px;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 40px 120px rgba(60,40,140,.28),0 0 0 1px rgba(0,0,0,.06)}
.bar{height:44px;background:#eceaf3;display:flex;align-items:center;gap:9px;padding:0 18px}
.bar i{width:14px;height:14px;border-radius:50%;background:#ff5f57}.bar i:nth-child(2){background:#febc2e}.bar i:nth-child(3){background:#28c840}
.bar span{margin-left:20px;background:#fff;border-radius:8px;padding:5px 16px;font-size:15px;color:#777;width:560px}
#pg,#pn{position:absolute;top:44px;bottom:0;overflow:hidden}
#pg{left:0;width:1114px}#pn{right:0;width:446px;border-left:1px solid #ddd;background:#fff}
#pg img,#pn img{position:absolute;left:0;top:0;width:100%}
#cursor{position:absolute;width:34px;height:34px;left:0;top:0;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35));z-index:20}
#ring{position:absolute;width:70px;height:70px;border-radius:50%;border:4px solid #7c5cff;z-index:19;opacity:0}
.card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff;
 background:radial-gradient(900px 500px at 80% 10%,rgba(255,255,255,.18),transparent),linear-gradient(135deg,#6a4cff 0%,#9b5cf6 50%,#ff7a59 100%)}
.card h1{font:800 92px/1.05 'Inter Display',Inter,sans-serif;letter-spacing:-.03em;max-width:1500px}
.card p{font:500 36px Inter,sans-serif;opacity:.92;margin-top:22px}
.chip{display:inline-block;padding:12px 26px;margin:8px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);font:600 26px Inter,sans-serif}
#sheet{position:absolute;left:300px;top:270px;width:1320px;height:760px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 40px 120px rgba(20,90,50,.30)}
#sheet .xbar{height:56px;background:#107c41;color:#fff;display:flex;align-items:center;padding:0 24px;font:700 20px Inter,sans-serif;gap:14px}
#sheet table{border-collapse:collapse;width:100%;font:15px Inter,sans-serif}
#sheet th,#sheet td{border:1px solid #e2e2e2;padding:7px 10px;text-align:left;white-space:nowrap;overflow:hidden;max-width:300px;text-overflow:ellipsis}
#sheet th{background:#f3f3f3;font-weight:700}#sheet td.n,#sheet th.n{background:#f3f3f3;color:#777;width:44px;text-align:center}
#count{position:absolute;right:120px;top:120px;font:800 54px 'Inter Display',Inter,sans-serif;color:#7c5cff;opacity:0}
</style></head><body>
<div id="bg"></div>
<div class="cap" id="cap"><h1></h1><p></p></div>
<div id="win"><div class="bar"><i></i><i></i><i></i><span>northpeakoutdoor.co/hiking-gear</span></div>
 <div id="pg"><img id="pgA"><img id="pgB"></div><div id="pn"><img id="pnA"><img id="pnB"></div></div>
<div id="count"></div>
<div id="sheet"><div class="xbar">▦ northpeakoutdoor.co-hiking-gear.xlsx</div><table id="tbl"></table></div>
<div class="card" id="hook"><h1 id="hook1">Still copying website data by hand?</h1><p id="hook2">There’s a free, one-click fix.</p></div>
<div class="card" id="end"><img src="${icon}" style="width:150px;height:150px;filter:drop-shadow(0 12px 30px rgba(0,0,0,.25))">
 <h1 style="margin-top:26px">Grabbit</h1><p>Free web scraper · Any website to Excel in one click</p>
 <div style="margin-top:34px"><span class="chip">100% free</span><span class="chip">No account</span><span class="chip">No row limits</span><span class="chip">Private</span></div>
 <p style="margin-top:40px;font-weight:700;font-size:40px">Add to Chrome — it’s free</p></div>
<div id="ring"></div>
<svg id="cursor" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>
<script>
const S = ${JSON.stringify(shots)};
const R = ${JSON.stringify(rects)};
const SHEET = ${JSON.stringify(sheet)};
// table for the Excel scene
document.getElementById('tbl').innerHTML = '<tr><th class="n"></th>' + SHEET.cols.map((c, i) => '<th>' + String.fromCharCode(65 + i) + ' · ' + c + '</th>').join('') + '</tr>' +
  SHEET.rows.slice(0, 19).map((r, i) => '<tr><td class="n">' + (i + 1) + '</td>' + r.map((v) => '<td>' + (String(v).startsWith('data:image') ? '<img src="' + v + '" style="height:22px;border-radius:4px;vertical-align:middle">' : (String(v).startsWith('http://localhost') ? 'https://northpeakoutdoor.co' + new URL(v).pathname : String(v)).replace(/</g, '&lt;')) + '</td>').join('') + '</tr>').join('');

// Panel/page image positions on stage: panel 400px wide shown at 446px; page 880px shown at 1114px.
const PN = { x: 180 + 1560 - 446, y: 250 + 44, k: 446 / 400 };
const PG = { x: 180, y: 250 + 44, k: 1114 / 880 };
const at = (box, p) => ({ x: box.x + p.x * box.k, y: box.y + p.y * box.k });

// timeline (seconds)
const SCENES = [
  { t: 0, hook: true },
  { t: 4.5, cap: ['Scrape any website in one click', 'Open Grabbit on any page. It finds lists and tables for you.'], pg: 'page0', pn: null },
  { t: 6.3, pg: 'w_detected', pn: 'p_detected' },
  { t: 11, cap: ['Wrong list? Just click an item', 'Grabbit selects every item like it.'] },
  { t: 12.4, pg: 'w_picking', pn: 'p_detected' },
  { t: 14.4, pg: 'w_picked', pn: 'p_picked' },
  { t: 17.5, cap: ['Every page, automatically', 'Follows “Next” buttons and infinite scroll.'] },
  { t: 18.6, pn: 'p_pager' },
  { t: 20.4, pg: 'w_page1', pn: 'p_page1' },
  { t: 21.5, pg: 'w_page2', pn: 'p_page2' },
  { t: 22.6, pg: 'w_page3', pn: 'p_page3' },
  { t: 23.7, pg: 'w_page4', pn: 'p_page4' },
  { t: 24.8, pn: 'p_pagesDone' },
  { t: 27, cap: ['Find emails, phones & socials', 'Also checks each site’s contact and about pages.'], pg: 'w_contacts', pn: 'p_contacts' },
  { t: 32, cap: ['Scrape hundreds of URLs at once', 'Paste links or load a CSV. Everything lands in one sheet.'], pg: 'w_bulk', pn: 'p_bulk' },
  { t: 37, cap: ['Track prices & stock on autopilot', 'Schedule any scrape hourly, daily or weekly.'], pg: 'w_schedule', pn: 'p_schedule' },
  { t: 42, cap: ['Excel, CSV, JSON or Google Sheets', 'One click. Clean columns. Ready to use.'], pg: 'w_pagesDone', pn: 'p_pagesDone' },
  { t: 44.6, sheet: true },
  { t: 50, end: true },
];
const END = 56;
// cursor path: [time, point, click?]
const CUR = [
  [5.6, at(PN, { x: 360, y: 640 })], [8.5, at(PN, { x: 300, y: 600 })],
  [11.6, at(PN, R.pick)], [12.2, at(PN, R.pick), true],
  [13.6, at(PG, R.item)], [14.3, at(PG, R.item), true],
  [18.0, at(PN, R.pager)], [18.4, at(PN, R.pager), true],
  [19.6, at(PN, R.run)], [20.1, at(PN, R.run), true],
  [26.5, at(PN, { x: 320, y: 560 })],
  [42.8, at(PN, R.excel)], [44.3, at(PN, R.excel), true],
  [49, at(PN, { x: 380, y: 680 })],
];
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp = (x) => Math.max(0, Math.min(1, x));
const $ = (id) => document.getElementById(id);

function stateAt(t) {
  const st = { pg: null, pn: null, cap: null, capT: 0, pgT: 0, pnT: 0, prevPg: null, prevPn: null, hook: false, end: false, sheet: false, sheetT: 0, endT: 0 };
  for (const s of SCENES) {
    if (s.t > t) break;
    if ('pg' in s && s.pg !== st.pg) { st.prevPg = st.pg; st.pg = s.pg; st.pgT = s.t; }
    if ('pn' in s && s.pn !== st.pn) { st.prevPn = st.pn; st.pn = s.pn; st.pnT = s.t; }
    if (s.cap) { st.cap = s.cap; st.capT = s.t; }
    st.hook = !!s.hook;
    if (s.sheet) { st.sheet = true; st.sheetT = s.t; }
    if (s.end) { st.end = true; st.endT = s.t; }
  }
  return st;
}
function layer(a, b, cur, prev, since, t) {
  const f = clamp((t - since) / 0.35);
  if (cur) { a.src = S[cur]; a.style.opacity = 1; } else a.style.opacity = 0;
  if (prev && f < 1) { b.src = S[prev]; b.style.opacity = 1 - f; b.style.zIndex = 2; } else b.style.opacity = 0;
}
window.render = (t) => {
  const st = stateAt(t);
  // hook card
  const hk = $('hook');
  hk.style.opacity = st.hook ? 1 : clamp(1 - (t - 4.5) / 0.5);
  hk.style.display = t < 5.1 ? 'flex' : 'none';
  $('hook1').style.transform = 'translateY(' + (1 - ease(clamp(t / 0.8))) * 40 + 'px)';
  $('hook1').style.opacity = clamp(t / 0.6);
  $('hook2').style.opacity = clamp((t - 1.6) / 0.6);
  // window
  const winIn = ease(clamp((t - 4.5) / 0.9));
  $('win').style.transform = 'translateY(' + (1 - winIn) * 120 + 'px) scale(' + (0.96 + 0.04 * winIn) + ')';
  $('win').style.opacity = winIn;
  layer($('pgA'), $('pgB'), st.pg, st.prevPg, st.pgT, t);
  layer($('pnA'), $('pnB'), st.pn, st.prevPn, st.pnT, t);
  // panel slides in the first time
  const pnIn = ease(clamp((t - 6.3) / 0.6));
  $('pn').style.transform = 'translateX(' + (1 - pnIn) * 446 + 'px)';
  $('pg').style.width = (1560 - 446 * pnIn) + 'px';
  // caption
  const cap = $('cap');
  if (st.cap) {
    cap.querySelector('h1').textContent = st.cap[0];
    cap.querySelector('p').textContent = st.cap[1];
    const f = ease(clamp((t - st.capT) / 0.5));
    cap.style.opacity = f; cap.style.transform = 'translateY(' + (1 - f) * 18 + 'px)';
  } else cap.style.opacity = 0;
  // pagination counter
  const cnt = $('count');
  const pages = [['p_page1', 9], ['p_page2', 18], ['p_page3', 27], ['p_page4', 36]];
  const hit = pages.find(([k]) => k === st.pn);
  cnt.style.opacity = t > 20.4 && t < 26.6 ? 1 : 0;
  cnt.textContent = (hit ? hit[1] : 36) + ' rows';
  // excel sheet
  const sf = st.sheet ? ease(clamp((t - st.sheetT) / 0.7)) : 0;
  $('sheet').style.opacity = sf; $('sheet').style.transform = 'translateY(' + (1 - sf) * 160 + 'px)';
  $('win').style.filter = sf ? 'blur(' + 3 * sf + 'px)' : '';
  // end card
  const ef = st.end ? ease(clamp((t - st.endT) / 0.6)) : 0;
  $('end').style.opacity = ef; $('end').style.display = ef ? 'flex' : 'none';
  // cursor
  const c = $('cursor'), ring = $('ring');
  let i = CUR.findIndex(([ct]) => ct > t);
  if (i === -1) i = CUR.length;
  const prev = CUR[i - 1], next = CUR[i];
  let p;
  if (!prev) p = next[1];
  else if (!next) p = prev[1];
  else {
    const seg = clamp((t - prev[0]) / Math.min(1.1, next[0] - prev[0]));
    p = { x: prev[1].x + (next[1].x - prev[1].x) * ease(seg), y: prev[1].y + (next[1].y - prev[1].y) * ease(seg) };
  }
  c.style.transform = 'translate(' + (p.x - 6) + 'px,' + (p.y - 3) + 'px)';
  c.style.opacity = t > 5.4 && t < 49.8 && !st.sheet ? 1 : (t > 44 && t < 44.6 ? 1 : 0);
  const click = CUR.find(([ct, , clk]) => clk && t >= ct && t < ct + 0.45);
  if (click) {
    const k = (t - click[0]) / 0.45;
    ring.style.opacity = 1 - k; ring.style.transform = 'translate(' + (click[1].x - 35) + 'px,' + (click[1].y - 35) + 'px) scale(' + (0.4 + k * 0.8) + ')';
  } else ring.style.opacity = 0;
};
window.DURATION = END;
</script></body></html>`;
}

async function render(assets) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setContent(stageHtml(assets));
  if (errors.length || !(await page.evaluate(() => window.DURATION))) throw new Error('stage page failed: ' + errors.join('; '));
  await page.evaluate(() => document.fonts.ready);
  const total = await page.evaluate(() => window.DURATION);
  if (process.env.PREVIEW) { // PREVIEW=2,8,15 node test/promo-video.js -> stills in dist/ to check the layout
    for (const t of process.env.PREVIEW.split(',').map(Number)) {
      await page.evaluate((x) => window.render(x), t);
      await page.screenshot({ path: path.join(root, 'dist', `promo-${t}s.png`) });
    }
    return browser.close();
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(total * FPS);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % (FPS * 5) === 0) console.log(`frame ${f}/${frames}`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', (code) => (code ? rej(new Error('ffmpeg ' + code)) : res())));
  await browser.close();
  console.log('wrote', path.relative(process.cwd(), OUT));
}

(async () => {
  const assets = await capture();
  console.log('captured', Object.keys(assets.shots).length, 'images');
  await render(assets);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
