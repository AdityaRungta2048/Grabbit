// Every locale must have the same keys and placeholders as English, and every key the code uses must exist.
// Run: node test/i18n-check.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dir = path.join(root, '_locales');
const load = (l) => JSON.parse(fs.readFileSync(path.join(dir, l, 'messages.json'), 'utf8'));
const en = load('en');
const ph = (m) => Object.keys(m.placeholders || {}).sort().join(',');
const errors = [];

for (const lang of fs.readdirSync(dir)) {
  const msgs = load(lang);
  for (const k of Object.keys(en)) {
    if (!msgs[k]) errors.push(`${lang}: missing ${k}`);
    else if (ph(msgs[k]) !== ph(en[k])) errors.push(`${lang}.${k}: placeholders differ from English`);
  }
  for (const k of Object.keys(msgs)) if (!en[k]) errors.push(`${lang}: extra key ${k}`);
  if (msgs.appName.message.length > 75) errors.push(`${lang}: name over 75 chars`);
  if (msgs.appDesc.message.length > 132) errors.push(`${lang}: summary over 132 chars`);
}

const used = new Set();
for (const f of ['panel.html', 'welcome.html']) {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  for (const [, k] of s.matchAll(/data-i18n(?:-html)?="(\w+)"/g)) used.add(k);
  for (const [, a] of s.matchAll(/data-i18n-attr="([^"]+)"/g)) a.split(',').forEach((p) => used.add(p.split(':')[1]));
}
for (const f of ['panel.js', 'content.js', 'background.js']) {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  for (const [, k] of s.matchAll(/\b(?:t|tr)\('(\w+)'\s*[,)]/g)) used.add(k); // skips built keys like t('every' + n)
  for (const [, k] of s.matchAll(/getMessage\('(\w+)'\)/g)) used.add(k);
}
for (const k of used) if (!en[k]) errors.push(`code uses unknown key ${k}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`i18n OK: ${fs.readdirSync(dir).length} languages, ${Object.keys(en).length} keys, ${used.size} used directly in code`);
