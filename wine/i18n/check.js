/* Проверка словарей: все ключи на месте, плейсхолдеры совпадают. Запуск: node wine/i18n/check.js */
global.window = {};
const path = require('path'), dir = __dirname;
require(path.join(dir, 'keys.js'));
const fs = require('fs');
const langs = fs.readdirSync(dir).filter(f => /^[a-z]{2}\.js$/.test(f)).map(f => f.slice(0, 2));
langs.forEach(l => require(path.join(dir, l + '.js')));
const K = window.I18N.keys; let bad = 0;
const ph = s => JSON.stringify((String(s).match(/\{\w+\}/g) || []).sort());
for (const l of langs) {
  const P = window.I18N.packs[l] || {};
  const miss = Object.keys(K).filter(k => !(k in P));
  const extra = Object.keys(P).filter(k => !(k in K));
  const badPh = Object.keys(K).filter(k => P[k] != null && ph(K[k]) !== ph(P[k]));
  const same = Object.keys(K).filter(k => P[k] === K[k] && /[А-Яа-я]{4}/.test(K[k]) && l !== 'uk');
  console.log(l, 'missing', miss.length, 'extra', extra.length, 'placeholders', badPh.length, 'untranslated-cyrillic', same.length);
  if (miss.length || extra.length || badPh.length || same.length) { bad++; console.log('  ', { miss: miss.slice(0, 8), extra, badPh, same: same.slice(0, 5) }); }
}
process.exit(bad ? 1 : 0);
