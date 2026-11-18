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
    if (pred.freeSO2 < 15 && pred.sugar > 20 && pred.abv < 17) r.push('Свободного SO₂ мало для сладкого вина ниже 17 %: стоит поднять до 25–35 мг/л.');
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

  return {
    CONTRACTION_TABLE, SUCROSE_L_PER_G, SUGAR_PER_ABV,
    contraction, mustState, mix, solve, validate, predict, baseline,
    sweetnessClass, rangeStatus, styleCheck, recommendations, optimalMutage,
    mustDensity, brixToSugar, sugarToBrix
  };
});
