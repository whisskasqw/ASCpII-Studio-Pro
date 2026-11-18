const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

global.window = globalThis;
require('./i18n.js');
require('./i18n/keys.js');
fs.readdirSync(path.join(__dirname, 'i18n')).filter(f => /^(names-.+|[a-z]{2})\.js$/.test(f)).forEach(f => require('./i18n/' + f));
const I = window.I18N;
const C = require('./calc.js');
const CODES = I.langs.map(l => l.code);

test('все языки из списка имеют словарь', () => {
  CODES.filter(c => c !== 'ru').forEach(c => assert.ok(I.packs[c], 'нет словаря ' + c));
});

test('словари полны, без лишних ключей, плейсхолдеры совпадают', () => {
  const ph = s => JSON.stringify((String(s).match(/\{\w+\}/g) || []).sort());
  CODES.filter(c => c !== 'ru').forEach(c => {
    const P = I.packs[c];
    const missing = Object.keys(I.keys).filter(k => !(k in P));
    const extra = Object.keys(P).filter(k => !(k in I.keys));
    assert.deepEqual(missing, [], `${c}: нет переводов`);
    assert.deepEqual(extra, [], `${c}: лишние ключи`);
    Object.keys(I.keys).forEach(k => assert.equal(ph(P[k]), ph(I.keys[k]), `${c}/${k}: плейсхолдеры`));
    Object.keys(I.keys).forEach(k => assert.ok(String(P[k]).trim().length > 0, `${c}/${k}: пусто`));
  });
});

test('названия сортов и регионов переведены для каждой группы', () => {
  I.langs.filter(l => l.names).forEach(l => {
    const missing = I.nameList.filter(n => !(n in I.names[l.names]));
    assert.deepEqual(missing, [], `${l.code}: нет названий`);
  });
});

test('каждая русская строка в коде и разметке есть среди ключей (нет забытых)', () => {
  const keyset = new Set(Object.values(I.keys));
  const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8') + fs.readFileSync(path.join(__dirname, 'calc.js'), 'utf8');
  const used = [...src.matchAll(/\b[tT]\('((?:[^'\\]|\\.)*)'/g)].map(m => m[1].replace(/\\'/g, "'")).filter(s => /[А-Яа-я]/.test(s));
  const lost = used.filter(s => !keyset.has(s));
  assert.deepEqual(lost, [], 'строки без ключа: запустите node wine/i18n/build-keys.js и переведите');
});

test('перевод подстановок и сообщения ядра расчёта', () => {
  I.setLang('en'); C.setTranslator(I.t);
  const err = C.solve({ Vw: 10, aw: 12, Sw: 0, as: 18, targetAbv: 19, targetSugar: 0 });
  assert.equal(err.ok, false);
  assert.match(err.errors[0], /weaker than or equal to the 19 % target/);
  assert.equal(C.sweetnessClass(2), 'dry');
  I.setLang('fr'); assert.equal(C.sweetnessClass(250), 'liquoreux');
  I.setLang('uk'); assert.match(C.solve({ Vw: -1, aw: 12, Sw: 0, as: 96, targetAbv: 19, targetSugar: 0 }).errors[0], /більшим за нуль/);
  I.setLang('ru'); C.setTranslator((tpl, p) => p ? tpl.replace(/\{(\w+)\}/g, (m, k) => p[k]) : tpl);
});

test('названия сортов переводятся по частям', () => {
  I.setLang('fr'); assert.equal(I.tn('Бордо · Крым'), 'Bordeaux · Crimée'.replace('Crimée', 'Crimea'));
  I.setLang('ka'); assert.equal(I.tn('Мерло'), 'მერლო');
  I.setLang('ru'); assert.equal(I.tn('Мерло'), 'Мерло');
});
