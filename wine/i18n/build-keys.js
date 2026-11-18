/* Собирает все русские строки интерфейса в i18n/keys.js (id сохраняются между запусками).
 * Запуск: node wine/i18n/build-keys.js  (нужен Playwright для разбора статической разметки) */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const CYR = /[А-Яа-яЁё]/;

async function staticStrings() {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const p = await b.newPage({ javaScriptEnabled: false });
  await p.goto('file://' + path.join(dir, 'index.html'));
  const out = await p.evaluate(() => {
    const CYR = /[А-Яа-яЁё]/, res = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (n.parentElement.closest('script,style,[data-no-i18n]') || !CYR.test(n.nodeValue)) continue;
      res.push(n.nodeValue.trim().replace(/\s+/g, ' '));
    }
    document.querySelectorAll('*').forEach(el => ['placeholder', 'aria-label', 'title'].forEach(a => { const v = el.getAttribute(a); if (v && CYR.test(v)) res.push(v); }));
    const d = document.querySelector('meta[name=description]'); if (d) res.push(d.content);
    return res;
  });
  await b.close();
  return out;
}
const calls = (src, fn) => [...src.matchAll(new RegExp(`\\b${fn}\\('((?:[^'\\\\]|\\\\.)*)'`, 'g'))].map(m => m[1].replace(/\\'/g, "'"));

(async () => {
  global.window = {};
  require(path.join(dir, 'data.js'));
  const D = window.WINE_DATA;
  const calc = read('calc.js'), app = read('app.js');
  const ui = [
    ...await staticStrings(),
    ...calls(app, 't'), ...calls(calc, 'T'),
    ...[...calc.matchAll(/name: '([^']+)'/g)].map(m => m[1]),
    ...[...app.matchAll(/name: '([^']+)'/g)].map(m => m[1]).filter(s => CYR.test(s)),
    ...Object.values(D.colors), ...D.spirits.map(s => s.name),
    ...D.styles.flatMap(s => [s.group, s.name, s.notes, s.aging]),
    ...D.wines.filter(w => w.id === 'custom').flatMap(w => [w.name, w.region])
  ].filter(s => s && CYR.test(s));
  const names = [...new Set(D.wines.filter(w => w.id !== 'custom').flatMap(w => [w.name, ...w.region.split(' · ')]))].filter(s => CYR.test(s));

  const file = path.join(__dirname, 'keys.js');
  let old = {};
  if (fs.existsSync(file)) { global.window.I18N = {}; require(file); old = window.I18N.keys || {}; }
  const byRu = Object.fromEntries(Object.entries(old).map(([id, ru]) => [ru, id]));
  let next = Math.max(0, ...Object.keys(old).map(k => +k.slice(1))) + 1;
  const keys = {};
  for (const s of new Set(ui)) { const id = byRu[s] || 'k' + next++; keys[id] = s; }
  fs.writeFileSync(file, '/* Сгенерировано build-keys.js: id → русская строка. Не править вручную. */\nwindow.I18N = window.I18N || {};\nwindow.I18N.keys = ' + JSON.stringify(keys, null, 1) + ';\nwindow.I18N.nameList = ' + JSON.stringify(names) + ';\n');
  console.log('ui strings:', Object.keys(keys).length, 'names:', names.length);
})();
