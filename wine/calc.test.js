const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./calc.js');

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≈ ${b} ±${eps}`);
const base = { Vw: 10, aw: 12, Sw: 0, as: 96.4, targetAbv: 19, targetSugar: 0, useContraction: false };

test('спирт без контракции совпадает с квадратом Пирсона', () => {
  const r = C.solve(base);
  close(r.spiritL, 10 * 7 / 77.4, 1e-4, 'Vs');
  close(r.abv, 19, 1e-6);
  close(r.Vf, 10 + r.spiritL, 1e-9);
});

test('с контракцией итоговая крепость точная, спирта чуть меньше, объём меньше суммы', () => {
  const a = C.solve(base), b = C.solve({ ...base, useContraction: true });
  close(b.abv, 19, 1e-5);
  assert.ok(b.spiritL < a.spiritL);
  assert.ok(b.contractionL > 0 && b.contractionL < 0.1);
});

test('цель равна текущей крепости: ничего не добавляется', () => {
  const r = C.solve({ ...base, targetAbv: 12 });
  close(r.spiritL, 0, 1e-9);
  close(r.Vf, 10, 1e-9);
});

test('сахар до 100 г/л с одновременным креплением', () => {
  const r = C.solve({ ...base, targetSugar: 100 });
  close(r.sugar, 100, 1e-4);
  close(r.abv, 19, 1e-5);
  close(r.sugarG, 100 * r.Vf, 1e-3, 'масса сахара = S·Vf');
  close(r.sugarVolL, r.sugarG * C.SUCROSE_L_PER_G, 1e-9);
});

test('подсластка концентратом (РКС)', () => {
  const r = C.solve({ ...base, targetSugar: 80, sugarSource: 'rcs', rcsConc: 860 });
  close(r.sugar, 80, 1e-4);
  close(r.abv, 19, 1e-5);
  assert.ok(r.rcsL > 0.9 && r.rcsL < 1.3);
});

test('сахар выше цели: подсластки нет, предупреждение', () => {
  const r = C.solve({ ...base, Sw: 200, targetSugar: 50 });
  assert.equal(r.sugarG, 0);
  assert.ok(r.warnings.some(w => w.includes('выше целевого')));
});

test('валидация: спирт слабее цели', () => {
  const r = C.solve({ ...base, as: 18 });
  assert.equal(r.ok, false);
  assert.ok(r.errors[0].includes('слабее'));
});

test('валидация: отрицательный объём', () => {
  assert.equal(C.solve({ ...base, Vw: -1 }).ok, false);
});

test('состояние сусла при мутаже', () => {
  const m = C.mustState(240, 50);
  close(m.sugar, 120, 1e-9);
  close(m.abv, 120 / 16.83, 1e-9);
});

test('оптимальный момент мутажа даёт целевой сахар без подсластки', () => {
  const o = C.optimalMutage({ Vw: 100, sugar0: 240, as: 77, targetAbv: 19.5, targetSugar: 100 });
  assert.ok(o.reachable);
  close(o.sol.sugar, 100, 0.01);
  close(o.sol.abv, 19.5, 1e-4);
  assert.ok(o.p > 20 && o.p < 60);
});

test('прогноз: кислоты и SO₂ разбавляются, pH растёт', () => {
  const wine = { volume: 10, abv: 12, sugar: 0, ta: 6, pH: 3.4, va: 0.5, freeSO2: 30, totalSO2: 100, extract: 25 };
  const s = C.solve(base);
  const p = C.predict(wine, s);
  close(p.ta, 6 * 10 / s.Vf, 1e-9);
  close(p.freeSO2, 30 * 10 / s.Vf, 1e-9);
  assert.ok(p.pH > 3.4 && p.pH < 3.5);
  assert.ok(p.density > 0.97 && p.density < 1.0);
});

test('классы сладости и статус диапазона', () => {
  assert.equal(C.sweetnessClass(2), 'сухое');
  assert.equal(C.sweetnessClass(100), 'сладкое');
  assert.equal(C.sweetnessClass(250), 'ликёрное');
  assert.equal(C.rangeStatus(19, [19, 22]), 'ok');
  assert.equal(C.rangeStatus(18.7, [19, 22]), 'near');
  assert.equal(C.rangeStatus(15, [19, 22]), 'out');
});

test('°Brix ↔ сахар взаимно обратны', () => {
  close(C.sugarToBrix(C.brixToSugar(24)), 24, 1e-6);
  close(C.brixToSugar(24), 240, 10);
});
