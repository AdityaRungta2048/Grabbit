// Generates Chrome Web Store images from the real extension, one set per language.
//   node test/screenshots.js            all languages in store/captions.json
//   node test/screenshots.js ja de      just these
// English goes to store/, other languages to store/locales/<lang>/.
const fs = require('fs');
const path = require('path');
const launch = require('./harness');
const storeDir = path.join(__dirname, '..', 'store');
const captions = JSON.parse(fs.readFileSync(path.join(storeDir, 'captions.json'), 'utf8'));
const icon = fs.readFileSync(path.join(__dirname, '..', 'icons', '128.png')).toString('base64');

const VIEW = { width: 880, height: 700 };
const PANEL = { width: 400, height: 700 };
// Scripts Inter can't draw. Real users get their OS fonts; these keep the store images crisp.
const SCRIPT_FONT = { ja: "'Noto Sans CJK JP'", ko: "'Noto Sans CJK KR'", zh_CN: "'Noto Sans CJK SC'", hi: "'Noto Sans Devanagari'" };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function run(lang) {
  const c = captions[lang];
  const out = lang === 'en' ? storeDir : path.join(storeDir, 'locales', lang);
  fs.mkdirSync(out, { recursive: true });
  const extra = SCRIPT_FONT[lang];
  const font = ['Inter', extra, 'sans-serif'].filter(Boolean).join(',');
  const display = ["'Inter Display'", 'Inter', extra, 'sans-serif'].filter(Boolean).join(',');
  const tight = extra ? 'normal' : '-.02em'; // negative tracking cramps CJK and Devanagari

  const { ctx, base, openPanel, close } = await launch(VIEW, lang);

  // Shrink a single-line element's font until it fits its box.
  const fit = (page, sel, max, min) => page.evaluate(([sel, max, min]) => {
    for (const el of document.querySelectorAll(sel)) {
      let size = max;
      el.style.fontSize = size + 'px';
      while (el.scrollWidth > el.clientWidth + 1 && size > min) el.style.fontSize = --size + 'px';
    }
  }, [sel, max, min]);

  const frame = (pageB64, panelB64, [title, sub]) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:${font};
  background:radial-gradient(1200px 600px at 0% 0%,#ece6ff,transparent),radial-gradient(900px 500px at 100% 100%,#ffe3da,transparent),#f7f5ff;}
  .cap{position:absolute;left:56px;top:34px;right:56px;display:flex;align-items:center;gap:16px}.cap>div{flex:1;min-width:0}
  .cap img{width:52px;height:52px}.cap h1{margin:0;font-weight:800;font-family:${display};line-height:1.15;letter-spacing:${tight};color:#1d1b2e;white-space:nowrap}
  .cap p{margin:4px 0 0;color:#5d5a73;white-space:nowrap}
  .win{position:absolute;left:56px;top:128px;width:1168px;height:640px;border-radius:14px;overflow:hidden;background:#fff;
  box-shadow:0 30px 80px rgba(60,40,140,.25),0 0 0 1px rgba(0,0,0,.06);display:flex;flex-direction:column}
  .bar{height:34px;background:#eceaf3;display:flex;align-items:center;gap:7px;padding:0 14px;flex:none}
  .bar i{width:11px;height:11px;border-radius:50%;background:#ff5f57}.bar i:nth-child(2){background:#febc2e}.bar i:nth-child(3){background:#28c840}
  .bar span{margin-left:16px;background:#fff;border-radius:6px;padding:3px 12px;font-size:12px;color:#777;width:420px}
  .body{flex:1;display:flex;min-height:0}.body img{display:block;height:100%;object-fit:cover;object-position:top left}
  .pg{flex:1;min-width:0;overflow:hidden}.pn{width:${(PANEL.width * 606) / PANEL.height}px;border-left:1px solid #ddd;flex:none}
  </style></head><body>
  <div class="cap"><img src="data:image/png;base64,${icon}"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div></div>
  <div class="win"><div class="bar"><i></i><i></i><i></i><span>northpeakoutdoor.co/hiking-gear</span></div>
  <div class="body"><div class="pg"><img src="data:image/png;base64,${pageB64}" style="width:100%"></div>
  <div class="pn"><img src="data:image/png;base64,${panelB64}" style="width:100%"></div></div></div></body></html>`;

  const shots = {};
  const shoot = async (page, panel, name, caption) => {
    await panel.waitForTimeout(400);
    const a = (await page.screenshot()).toString('base64');
    const b = (await panel.screenshot()).toString('base64');
    shots[name] = b;
    const comp = await ctx.newPage();
    await comp.setViewportSize({ width: 1280, height: 800 });
    await comp.setContent(frame(a, b, caption));
    await comp.evaluate(() => document.fonts.ready);
    await fit(comp, '.cap h1', 34, 22);
    await fit(comp, '.cap p', 17, 12);
    await comp.screenshot({ path: path.join(out, name), type: 'jpeg', quality: 95 });
    await comp.close();
  };

  const { page, panel } = await openPanel(`${base}/demo.html`, PANEL);
  if (extra) await panel.addStyleTag({ content: `body,button,input,select,textarea{font-family:system-ui,-apple-system,"Segoe UI",Roboto,${extra},sans-serif}` });
  await panel.waitForFunction(() => +document.querySelector('#rowCount').textContent > 0, null, { polling: 200 });
  await panel.evaluate(() => { document.querySelector('#host').textContent = 'northpeakoutdoor.co'; });
  await shoot(page, panel, 'screenshot-1.jpg', c.s1);

  await panel.click('#pagerCard summary');
  await panel.check('[name=pmode][value=next]');
  await panel.waitForFunction(() => document.querySelector('#nextLabel').textContent.includes('Next'), null, { polling: 200 });
  await shoot(page, panel, 'screenshot-2.jpg', c.s2);

  await panel.click('[data-tab=quick]');
  await panel.click('[data-quick=contacts]');
  await panel.waitForFunction(() => [...document.querySelectorAll('#grid td')].some((td) => td.textContent.includes('@')), null, { polling: 200 });
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await shoot(page, panel, 'screenshot-3.jpg', c.s3);

  await panel.click('[data-tab=bulk]');
  await panel.fill('#urls', [1, 2, 3].map((n) => `${base}/demo.html?list=${n}`).join('\n'));
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
  await panel.waitForTimeout(2600); // let the toast fade
  await shoot(page, panel, 'screenshot-4.jpg', c.s4);

  await panel.click('[data-tab=list]');
  await panel.check('[name=pmode][value=none]'); // pager card is still open from screenshot 2
  await panel.click('#rescan');
  await panel.waitForFunction(() => +document.querySelector('#rowCount').textContent === 9, null, { polling: 200 });
  await panel.click('[data-tab=schedule]');
  await panel.selectOption('#schedExport', 'xlsx');
  await panel.click('#createSchedule');
  await panel.waitForFunction(() => {
    const st = document.querySelector('#schedList .status')?.textContent;
    return st && st !== t('running') && st !== t('notRunYet');
  }, null, { polling: 200, timeout: 60000 });
  await panel.evaluate(() => {
    document.querySelector('#schedList .host').textContent = 'northpeakoutdoor.co/hiking-gear';
    document.querySelector('#schedList .status').textContent = t('lastRun', new Date().toLocaleString(navigator.language), 9) + ' · ' + t('newN', 2);
  });
  await panel.waitForTimeout(2600);
  await shoot(page, panel, 'screenshot-5.jpg', c.s5);

  // Promo tiles
  const chip = (txt, big) => `<span style="display:inline-block;padding:${big ? '8px 16px' : '4px 9px'};margin:0 6px 6px 0;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);font-weight:600;font-size:${big ? 17 : 11}px">${esc(txt)}</span>`;
  const tile = async (w, h, name, html, after) => {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"></head><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;position:relative;font-family:${font};color:#fff;background:radial-gradient(700px 400px at 85% 10%,rgba(255,255,255,.18),transparent),linear-gradient(135deg,#6a4cff 0%,#9b5cf6 50%,#ff7a59 100%)">${html}</body></html>`);
    await p.evaluate(() => document.fonts.ready);
    if (after) await after(p);
    await p.screenshot({ path: path.join(out, name), type: 'jpeg', quality: 95 });
    await p.close();
  };
  await tile(440, 280, 'promo-small.jpg', `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 14px">
      <img src="data:image/png;base64,${icon}" style="width:84px;height:84px;filter:drop-shadow(0 10px 24px rgba(0,0,0,.25))">
      <div style="font:800 40px/1 ${display};letter-spacing:-.03em;margin-top:10px">Grabbit</div>
      <div class="tag" style="font-weight:600;margin:8px 0 12px;opacity:.95;white-space:nowrap;max-width:412px;overflow:hidden">${esc(c.tag)}</div>
      <div>${c.chipsSmall.map((x) => chip(x)).join('')}</div>
    </div>`, (p) => fit(p, '.tag', 15, 11));
  await tile(1400, 560, 'promo-marquee.jpg', `
    <div class="col" style="position:absolute;left:96px;top:0;bottom:0;width:680px;display:flex;flex-direction:column;justify-content:center">
      <div style="display:flex;align-items:center;gap:14px;font-weight:700;font-size:24px"><img src="data:image/png;base64,${icon}" style="width:52px;height:52px">Grabbit</div>
      <div class="head" style="word-break:auto-phrase;font-weight:800;font-family:${display};font-size:62px;line-height:1.08;letter-spacing:${extra ? 'normal' : '-.03em'};margin:22px 0 16px">${esc(c.head)}</div>
      <div style="font-weight:500;font-size:21px;line-height:1.4;opacity:.92;margin-bottom:22px;word-break:auto-phrase">${esc(c.sub)}</div>
      <div>${c.chipsBig.map((x) => chip(x, true)).join('')}</div>
    </div>
    <img src="data:image/png;base64,${shots['screenshot-1.jpg']}" style="position:absolute;right:110px;top:56px;width:400px;border-radius:16px;box-shadow:0 30px 70px rgba(30,10,80,.45);transform:rotate(-2deg)">`,
  // Long headlines: shrink until the text column fits the tile with margin.
  (p) => p.evaluate(() => {
    const head = document.querySelector('.head');
    const col = document.querySelector('.col');
    const used = () => col.lastElementChild.getBoundingClientRect().bottom - col.firstElementChild.getBoundingClientRect().top;
    let size = 62;
    while (used() > 470 && size > 36) head.style.fontSize = --size + 'px';
  }));
  await close();
  console.log('wrote', lang, '->', path.relative(process.cwd(), out));
}

(async () => {
  const langs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(captions);
  for (const lang of langs) {
    if (!captions[lang]) throw new Error(`no captions for ${lang} in store/captions.json`);
    await run(lang);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
