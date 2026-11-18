/* Vinum Fortis — расчётное ядро. Чистые функции, без DOM.
 * Единицы: объём — литры, сахар/кислоты/экстракт — г/л, спирт — % об., SO2 — мг/л. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WineCalc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Контракция водно-спиртовой смеси при 20 °C: доля уменьшения объёма относительно
   * суммы объёмов чистых компонентов (этанол + вода) в зависимости от крепости смеси. */
  const CONTRACTION_TABLE = [
    [0, 0], [10, 0.0055], [20, 0.0125], [30, 0.021], [40, 0.030], [50, 0.035],
    [60, 0.036], [70, 0.033], [80, 0.026], [90, 0.016], [96.4, 0.0055], [100, 0]
  ];
  const SUCROSE_L_PER_G = 0.00063;   // удельный объём сахарозы в растворе, л/г
  const SUGAR_PER_ABV = 16.83;       // г/л сахара на 1 % об. спирта при брожении

  function interp(table, x) {
    if (x <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      const [x1, y1] = table[i];
      if (x <= x1) {
        const [x0, y0] = table[i - 1];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return table[table.length - 1][1];
  }
  const contraction = abv => interp(CONTRACTION_TABLE, abv);

  /* Состояние бродящего сусла: остаточный сахар и накопленный спирт. */
  function mustState(sugar0, fermentedPct, k = SUGAR_PER_ABV) {
    const p = Math.min(Math.max(fermentedPct, 0), 100) / 100;
    return { sugar: sugar0 * (1 - p), abv: sugar0 * p / k };
  }

  /* Ядро смешивания: по количествам добавок считает итоговый объём и состав. */
  function mix({ Vw, aw, Sw, Vs, as, sugarG = 0, rcsL = 0, rcsConc = 0, useContraction = true }) {
    const C = useContraction ? contraction : () => 0;
    const ethanol = (aw * Vw + as * Vs) / 100;               // л чистого спирта
    const ideal = Vw / (1 - C(aw)) + Vs / (1 - C(as)) + rcsL; // объём «до контракции»
    let Vliq = ideal;
    for (let i = 0; i < 30; i++) Vliq = ideal * (1 - C(100 * ethanol / Vliq));
    const plainSum = Vw + Vs + rcsL;
    const sugarVol = sugarG * SUCROSE_L_PER_G;
    const Vf = Vliq + sugarVol;
    const sugarTotal = Sw * Vw + sugarG + rcsL * rcsConc;
    return {
      Vf, abv: 100 * ethanol / Vf, sugar: sugarTotal / Vf,
      ethanolL: ethanol, contractionL: Math.max(0, plainSum - Vliq), sugarVolL: sugarVol
    };
  }

  /* Обратная задача: сколько спирта и сахара (или РКС) нужно для цели A, St. */
  function solve(input) {
    const {
      Vw, aw, Sw, as, targetAbv: A, targetSugar: St,
      sugarSource = 'sucrose', rcsConc = 860, useContraction = true
    } = input;
    const errors = validate(input);
    if (errors.length) return { ok: false, errors };

    let Vs = Vw * (A - aw) / (as - A);
    let add = 0; // граммы сахара либо литры РКС
    let res;
    for (let i = 0; i < 200; i++) {
      Vs = Math.max(0, Vs);
      add = Math.max(0, add);
      res = mix({
        Vw, aw, Sw, Vs, as, useContraction, rcsConc,
        sugarG: sugarSource === 'sucrose' ? add : 0,
        rcsL: sugarSource === 'rcs' ? add : 0
      });
      const dA = A - res.abv, dS = St - res.sugar;
      if (Math.abs(dA) < 1e-7 && Math.abs(dS) < 1e-6) break;
      // Ньютоновский шаг по каждой переменной (переменные слабо связаны)
      const stepVs = dA * res.Vf / (as - res.abv);
      const perUnit = sugarSource === 'sucrose' ? 1 - res.sugar * SUCROSE_L_PER_G : rcsConc - res.sugar;
      const stepAdd = dS * res.Vf / perUnit;
      Vs = Math.max(0, Vs + stepVs);
      add = Math.max(0, add + stepAdd);
    }
    Vs = Math.max(0, Vs); add = Math.max(0, add);
    res = mix({
      Vw, aw, Sw, Vs, as, useContraction, rcsConc,
      sugarG: sugarSource === 'sucrose' ? add : 0,
      rcsL: sugarSource === 'rcs' ? add : 0
    });
    const warnings = [];
    if (A <= aw) warnings.push('Крепость вина уже не ниже целевой: спирт не нужен.');
    if (res.sugar - St > 2) warnings.push(`Сахар после крепления ${res.sugar.toFixed(0)} г/л выше целевого: подсластка не нужна, снизить сахар можно только купажом с более сухим вином.`);
    if (Vs / Vw > 0.45) warnings.push('Спирта требуется много относительно объёма вина: возьмите более крепкий спирт, иначе вино сильно разбавится по вкусу и кислотности.');
    return {
      ok: true, warnings,
      spiritL: Vs,
      absAlcoholL: Vs * as / 100,
      sugarG: sugarSource === 'sucrose' ? add : 0,
      rcsL: sugarSource === 'rcs' ? add : 0,
      ...res
    };
  }

  function validate({ Vw, aw, Sw, as, targetAbv: A, targetSugar: St }) {
    const e = [];
    const num = v => typeof v === 'number' && isFinite(v);
    if (!num(Vw) || Vw <= 0) e.push('Объём вина должен быть больше нуля.');
    if (!num(aw) || aw < 0 || aw >= 25) e.push('Крепость вина должна быть от 0 до 25 % об.');
    if (!num(Sw) || Sw < 0 || Sw > 700) e.push('Сахар вина должен быть от 0 до 700 г/л.');
    if (!num(as) || as <= 0 || as > 100) e.push('Крепость спирта должна быть от 0 до 100 % об.');
    if (!num(A) || A <= 0) e.push('Укажите целевую крепость.');
    if (!num(St) || St < 0) e.push('Целевой сахар не может быть отрицательным.');
    if (num(as) && num(A) && as <= A) e.push(`Спирт ${as} % слабее или равен цели ${A} %: такой спирт не поднимет крепость до цели.`);
    return e;
  }

  /* Прогноз остальных показателей после смешивания. */
  function predict(wine, sol) {
    const d = wine.volume / sol.Vf; // коэффициент разбавления вина
    const ta = wine.ta * d;
    const extractNonSugar = wine.extract * d;
    const pH = wine.pH + 0.35 * Math.log10(1 / d) + 0.004 * (sol.abv - wine.abv);
    const density = 0.9982 - 0.00125 * sol.abv + 0.000375 * sol.sugar + 0.0004 * extractNonSugar;
    return {
      abv: sol.abv, sugar: sol.sugar, ta, pH,
      va: wine.va * d, freeSO2: wine.freeSO2 * d, totalSO2: wine.totalSO2 * d,
      extract: extractNonSugar, totalExtract: extractNonSugar + sol.sugar,
      density, brix: 261.3 * (1 - 1 / density), baume: 145 * (1 - 1 / density),
      kcal: sol.abv * 0.789 * 7 + sol.sugar / 10 * 4,
      sugarAcid: ta > 0 ? sol.sugar / ta : 0,
      molSO2: molecularSO2(wine.freeSO2 * d, pH),
      dilution: d,
      sweetness: sweetnessClass(sol.sugar)
    };
  }

  function baseline(wine) {
    const density = 0.9982 - 0.00125 * wine.abv + 0.000375 * wine.sugar + 0.0004 * wine.extract;
    return {
      abv: wine.abv, sugar: wine.sugar, ta: wine.ta, pH: wine.pH, va: wine.va,
      freeSO2: wine.freeSO2, totalSO2: wine.totalSO2, extract: wine.extract,
      totalExtract: wine.extract + wine.sugar, density,
      brix: 261.3 * (1 - 1 / density), baume: 145 * (1 - 1 / density),
      kcal: wine.abv * 0.789 * 7 + wine.sugar / 10 * 4,
      sugarAcid: wine.ta > 0 ? wine.sugar / wine.ta : 0, dilution: 1,
      molSO2: molecularSO2(wine.freeSO2, wine.pH),
      sweetness: sweetnessClass(wine.sugar)
    };
  }

  function sweetnessClass(s) {
    if (s < 4) return 'сухое';
    if (s < 12) return 'полусухое';
    if (s < 45) return 'полусладкое';
    if (s < 120) return 'сладкое';
    if (s < 200) return 'десертное';
    return 'ликёрное';
  }

  /* Статус попадания значения в диапазон: ok / near (±10 % ширины, мин. 0.5) / out. */
  function rangeStatus(v, range) {
    if (!range) return null;
    const [lo, hi] = range;
    if (v >= lo - 1e-9 && v <= hi + 1e-9) return 'ok';
    const tol = Math.max(0.5, (hi - lo) * 0.1, Math.abs(hi) * 0.03);
    if (v >= lo - tol && v <= hi + tol) return 'near';
    return 'out';
  }

  function styleCheck(pred, style) {
    if (!style) return {};
    return {
      abv: rangeStatus(pred.abv, style.abv),
      sugar: rangeStatus(pred.sugar, style.sugar),
      ta: rangeStatus(pred.ta, style.ta),
      pH: rangeStatus(pred.pH, style.pH)
    };
  }

  function recommendations(pred, style, Vf) {
    const r = [];
    if (!style) return r;
    if (style.ta && pred.ta < style.ta[0]) {
      const g = (style.ta[0] - pred.ta) * Vf;
      r.push(`Кислотность ${pred.ta.toFixed(1)} г/л ниже стиля (${style.ta[0]}–${style.ta[1]}): добавьте около ${Math.ceil(g)} г винной кислоты на весь объём (+${(style.ta[0] - pred.ta).toFixed(1)} г/л), пробное подкисление на малом объёме.`);
    }
    if (style.ta && pred.ta > style.ta[1]) r.push(`Кислотность ${pred.ta.toFixed(1)} г/л выше стиля: купаж с менее кислым вином, холодная стабилизация или раскисление карбонатом кальция.`);
    if (style.pH && pred.pH > style.pH[1]) r.push(`pH ${pred.pH.toFixed(2)} высоковат: риск микробной порчи, следите за свободным SO₂.`);
    if (pred.sugar > 20 && pred.abv < 17 && pred.molSO2 < 0.5) {
      const need = freeSO2ForMolecular(0.6, pred.pH);
      r.push(`Молекулярный SO₂ ${pred.molSO2.toFixed(2)} мг/л: для сладкого вина ниже 17 % лучше 0.5–0.8. Поднимите свободный SO₂ до ≈ ${Math.ceil(need)} мг/л (метабисульфит ≈ ${kmsGrams(need - pred.freeSO2, Vf).toFixed(1)} г на партию).`);
    }
    if (pred.va > 1.2) r.push(`Летучая кислотность ${pred.va.toFixed(2)} г/л высокая: проверьте вино перед креплением.`);
    if (pred.sugarAcid > 0 && style.sai && (pred.sugarAcid < style.sai[0] || pred.sugarAcid > style.sai[1]))
      r.push(`Сахарно-кислотный индекс ${pred.sugarAcid.toFixed(0)} вне типичного для стиля (${style.sai[0]}–${style.sai[1]}): вкус будет ${pred.sugarAcid < style.sai[0] ? 'резче и кислее' : 'приторнее'} эталона.`);
    return r;
  }

  /* Поиск оптимального момента мутажа: сброжённость p, при которой
   * после внесения спирта получаются целевые крепость и сахар без подсластки. */
  function optimalMutage({ Vw, sugar0, k = SUGAR_PER_ABV, as, targetAbv, targetSugar, useContraction = true }) {
    const f = p => {
      const m = mustState(sugar0, p, k);
      const s = solve({ Vw, aw: m.abv, Sw: m.sugar, as, targetAbv, targetSugar: 0, useContraction });
      return s.ok ? { p, must: m, sol: s, diff: s.sugar - targetSugar } : null;
    };
    let lo = 0, hi = 100;
    const a = f(lo);
    if (!a) return null;
    if (a.diff < 0) return { reachable: false, reason: 'Сахара в сусле не хватает: даже без брожения после крепления сахар ниже цели.', ...a };
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const r = f(mid);
      if (!r) { hi = mid; continue; }
      if (r.diff > 0) lo = mid; else hi = mid;
    }
    const r = f(lo);
    if (!r) return null;
    if (r.must.abv >= targetAbv) return { reachable: false, reason: 'При таком сахаре сусло само дойдёт до целевой крепости: мутаж не нужен.', ...r };
    return { reachable: true, ...r };
  }

  const mustDensity = (sugar, abv) => 0.9982 - 0.00125 * abv + 0.000375 * sugar + 0.010;
  /* °Brix ↔ г/л сахара (с учётом плотности сусла и ~25 г/л несахаров). */
  const brixSG = b => 1 + b / (258.6 - (b / 258.2) * 227.1);
  const brixToSugar = b => Math.max(0, b * brixSG(b) * 10 - 25);
  function sugarToBrix(s) {
    let lo = 0, hi = 80;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (brixToSugar(m) < s) lo = m; else hi = m; }
    return lo;
  }


  /* Прямой расчёт: пользователь задал свои дозы, считаем результат. */
  function forward({ Vw, aw, Sw, as, spiritL = 0, sugarG = 0, rcsL = 0, rcsConc = 860, useContraction = true }) {
    const errors = [];
    if (!(Vw > 0)) errors.push('Объём вина должен быть больше нуля.');
    if (!(as > 0 && as <= 100)) errors.push('Крепость спирта должна быть от 0 до 100 % об.');
    if ([spiritL, sugarG, rcsL].some(v => !(v >= 0))) errors.push('Дозы не могут быть отрицательными.');
    if (![aw, Sw].every(v => v >= 0)) errors.push('Заполните крепость и сахар вина.');
    if (errors.length) return { ok: false, errors };
    const res = mix({ Vw, aw, Sw, Vs: spiritL, as, sugarG, rcsL, rcsConc, useContraction });
    const warnings = [];
    if (spiritL / Vw > 0.45) warnings.push('Спирта очень много относительно объёма вина.');
    return { ok: true, warnings, spiritL, absAlcoholL: spiritL * as / 100, sugarG, rcsL, ...res };
  }

  /* Молекулярный SO2 (мг/л) по свободному SO2 и pH; pKa1 ≈ 1.81. */
  const molecularSO2 = (free, pH) => free / (1 + Math.pow(10, pH - 1.81));
  const freeSO2ForMolecular = (mol, pH) => mol * (1 + Math.pow(10, pH - 1.81));
  /* Метабисульфит калия: 57.6 % SO2. Возвращает граммы на объём. */
  const kmsGrams = (deltaFree, V) => Math.max(0, deltaFree) * V / 1000 / 0.576;

  /* Кислотность: вещества и их эффект на ТК (по винной кислоте), г/л на 1 г/л вещества. */
  const ACIDS = {
    tartaric: { name: 'Винная кислота', factor: 1.0 },
    citric: { name: 'Лимонная кислота', factor: 1.17 },
    malic: { name: 'Яблочная кислота', factor: 1.12 },
    lactic: { name: 'Молочная кислота', factor: 0.83 }
  };
  const BASES = {
    khco3: { name: 'Бикарбонат калия KHCO₃', perG: 1.33 },
    caco3: { name: 'Карбонат кальция CaCO₃', perG: 0.67 }
  };
  function acidAdjust(taNow, taTarget, V, acid = 'tartaric', base = 'khco3') {
    const d = taTarget - taNow;
    if (d >= 0) return { dir: 'up', grams: d / ACIDS[acid].factor * V, agent: ACIDS[acid].name, perL: d / ACIDS[acid].factor };
    return { dir: 'down', grams: -d * BASES[base].perG * V, agent: BASES[base].name, perL: -d * BASES[base].perG };
  }

  /* Купаж двух компонентов по одному параметру (квадрат Пирсона, линейное смешение). */
  function blend2(a, b, target, total) {
    if (a === b) return null;
    const fa = (target - b) / (a - b);
    if (fa < 0 || fa > 1) return null;
    return { fa, fb: 1 - fa, Va: total * fa, Vb: total * (1 - fa) };
  }
  /* Купаж нескольких показателей сразу при известных объёмах. */
  function blendMix(parts) {
    const V = parts.reduce((s, p) => s + p.V, 0);
    const avg = k => parts.reduce((s, p) => s + p[k] * p.V, 0) / V;
    return { V, abv: avg('abv'), sugar: avg('sugar'), ta: avg('ta') };
  }

  /* Разведение спирта водой с учётом контракции: сколько воды добавить к V1 л крепостью a1, чтобы получить a2. */
  function diluteSpirit(V1, a1, a2) {
    if (!(V1 > 0) || !(a1 > a2) || !(a2 > 0)) return null;
    let lo = 0, hi = V1 * a1 / a2 * 2;
    for (let i = 0; i < 80; i++) {
      const W = (lo + hi) / 2;
      const r = mix({ Vw: W, aw: 0, Sw: 0, Vs: V1, as: a1 });
      if (r.abv > a2) lo = W; else hi = W;
    }
    const W = (lo + hi) / 2, r = mix({ Vw: W, aw: 0, Sw: 0, Vs: V1, as: a1 });
    return { water: W, Vf: r.Vf, contraction: V1 + W - r.Vf, naive: V1 * a1 / a2 - V1 };
  }

  /* Ареометрия: из плотности (SG при 20 °C) — °Brix, Боме, Эксле, сахар, потенциальный спирт. */
  function fromSG(sg, k = SUGAR_PER_ABV) {
    const brix = sg > 1 ? sugarToBrix(Math.max(0, (sg - 0.9982 - 0.010) / 0.000375)) : 0;
    const sugar = Math.max(0, (sg - 0.9982 - 0.010) / 0.000375);
    return { sg, brix: 261.3 * (1 - 1 / sg), baume: 145 * (1 - 1 / sg), oechsle: (sg - 1) * 1000, sugar, potAbv: sugar / k, brixBySugar: brix };
  }

  /* Себестоимость партии. */
  function cost({ Vw, wineL = 0, spiritL, spiritPrice = 0, sugarG = 0, sugarPrice = 0, rcsL = 0, rcsPrice = 0, Vf, bottle = 0.75, bottlePrice = 0 }) {
    const parts = {
      wine: Vw * wineL,
      spirit: spiritL * spiritPrice,
      sugar: sugarG / 1000 * sugarPrice,
      rcs: rcsL * rcsPrice
    };
    const bottles = bottle > 0 ? Math.floor(Vf / bottle + 1e-9) : 0;
    parts.bottles = bottles * bottlePrice;
    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    return { parts, total, perL: total / Vf, bottles, perBottle: bottles ? total / bottles : 0, rest: Vf - bottles * bottle };
  }

  /* Кривая мутажа: что будет при внесении спирта на разной сброжённости. */
  function mutageCurve({ Vw, sugar0, k = SUGAR_PER_ABV, as, targetAbv, useContraction = true, steps = 50 }) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const p = 100 * i / steps, m = mustState(sugar0, p, k);
      if (m.abv >= targetAbv) break;
      const s = solve({ Vw, aw: m.abv, Sw: m.sugar, as, targetAbv, targetSugar: 0, useContraction });
      if (!s.ok) break;
      pts.push({ p, sugar: s.sugar, spiritL: s.spiritL, Vf: s.Vf, mustSugar: m.sugar });
    }
    return pts;
  }

  return {
    forward, molecularSO2, freeSO2ForMolecular, kmsGrams, ACIDS, BASES, acidAdjust, blend2, blendMix, diluteSpirit, fromSG, cost, mutageCurve,
    CONTRACTION_TABLE, SUCROSE_L_PER_G, SUGAR_PER_ABV,
    contraction, mustState, mix, solve, validate, predict, baseline,
    sweetnessClass, rangeStatus, styleCheck, recommendations, optimalMutage,
    mustDensity, brixToSugar, sugarToBrix
  };
});
