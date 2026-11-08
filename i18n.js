// Translations come from _locales/<lang>/messages.json, picked by Chrome from the browser language.
// t('key', a, b) fills $1, $2 placeholders; falls back to the key so a missing string is visible, not blank.
const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;

document.documentElement.lang = chrome.i18n.getUILanguage();
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
// Only our own bundled strings, which contain simple markup like <b> and <kbd>.
for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
for (const el of document.querySelectorAll('[data-i18n-attr]'))
  for (const pair of el.dataset.i18nAttr.split(',')) {
    const [attr, key] = pair.split(':');
    el.setAttribute(attr, t(key));
  }
