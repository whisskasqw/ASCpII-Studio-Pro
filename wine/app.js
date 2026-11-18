/* Vinum Fortis — интерфейс. Весь видимый текст проходит через t() (см. i18n.js). */
(function () {
  'use strict';
  const D = window.WINE_DATA, C = window.WineCalc, I = window.I18N;
  const t = I.t, tn = I.tn;
  const $ = id => document.getElementById(id);
  const STORE_KEY = 'vinum-fortis:v1';
  const JOURNAL_KEY = 'vinum-fortis:journal';
  const WINE_KEYS = ['abv', 'sugar', 'ta', 'pH', 'va', 'freeSO2', 'totalSO2', 'extract'];
  const byId = (list, id) => list.find(x => x.id === id);

  /* Валюты: rate — единиц за 1 USD (ориентировочно, для пересчёта при смене валюты). */
  const CURRENCIES = {
    RUB: { rate: 92, name: 'Российский рубль' },
    UAH: { rate: 41.5, name: 'Украинская гривна' },
    USD: { rate: 1, name: 'Доллар США' },
    EUR: { rate: 0.92, name: 'Евро' },
    GEL: { rate: 2.7, name: 'Грузинский лари' }
  };
  const BASE_PRICES_USD = { wine: 2.7, spirit: 6.5, sugar: 1, rcs: 3.8, bottle: 0.75 };
  const pricesIn = cur => {
    const r = CURRENCIES[cur].rate, o = {};
    Object.entries(BASE_PRICES_USD).forEach(([k, v]) => o[k] = niceRound(v * r));
    return o;
  };
  function niceRound(v) { return v >= 100 ? Math.round(v / 5) * 5 : v >= 10 ? Math.round(v) : Math.round(v * 10) / 10; }

  const defaults = () => {
    const w = byId(D.wines, 'touriga_nacional');
    const cur = I.meta().currency;
    return {
      mode: 'must', calcMode: 'target', wineId: w.id, wine: pickWine(w), sugar0: w.must, fermented: 50, k: C.SUGAR_PER_ABV,
      volume: 10, spiritId: 'aguardente', spiritAbv: 77, styleId: 'port_ruby',
      targetAbv: 20, targetSugar: 100, sugarSource: 'sucrose', rcsConc: 860, contraction: true,
      dose: { spiritL: 2.2, sugarG: 0, rcsL: 0 },
      currency: cur,
      prices: Object.assign(pricesIn(cur), { size: 0.75 })
    };
  };
  function pickWine(w) { const o = {}; WINE_KEYS.forEach(k => o[k] = w[k]); return o; }
  function sanitize(s) {
    if (!s || typeof s !== 'object' || !byId(D.wines, s.wineId) || !byId(D.styles, s.styleId) || !byId(D.spirits, s.spiritId)) return null;
    const d = defaults();
    const out = Object.assign(d, s, { wine: Object.assign(d.wine, s.wine), dose: Object.assign(d.dose, s.dose), prices: Object.assign(d.prices, s.prices) });
    if (!CURRENCIES[s.currency]) { out.currency = 'RUB'; if (!s.prices) out.prices = Object.assign(pricesIn('RUB'), { size: 0.75 }); } // старые сохранения были в рублях
    return out;
  }

  /* ——— язык: сохранённый → браузера → русский ——— */
  (function initLang() {
    let l = null;
    try { l = localStorage.getItem(STORE_KEY + ':lang'); } catch (e) { /* ignore */ }
    if (!l) { const nav = (navigator.language || 'ru').slice(0, 2).toLowerCase(); l = I.has(nav) ? nav : 'ru'; }
    I.setLang(l);
    C.setTranslator(t);
  })();

  let state = fromHash() || load() || defaults();

  /* ——— хранение ——— */
  function load() { try { return sanitize(JSON.parse(localStorage.getItem(STORE_KEY))); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function loadJournal() { try { const j = JSON.parse(localStorage.getItem(JOURNAL_KEY)); return Array.isArray(j) ? j : []; } catch (e) { return []; } }
  function saveJournal(j) { try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(j)); return true; } catch (e) { return false; } }

  /* ——— ссылка на расчёт ——— */
  function encodeState(s) {
    const bytes = new TextEncoder().encode(JSON.stringify(s));
    let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromHash() {
    const m = location.hash.match(/^#s=([\w-]+)$/);
    if (!m) return null;
    try {
      const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
      return sanitize(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))));
    } catch (e) { return null; }
  }

  /* ——— форматирование ——— */
  const loc = () => I.meta().locale;
  const nf = (v, d = 1) => Number.isFinite(v) ? v.toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const vol = v => v < 0.9995 ? { v: nf(v * 1000, 0), u: t('мл') } : { v: nf(v, 2), u: t('л') };
  const volStr = v => { const x = vol(v); return `${x.v} ${x.u}`; };
  const mass = g => g >= 1000 ? { v: nf(g / 1000, 2), u: t('кг') } : { v: nf(g, g < 10 ? 1 : 0), u: t('г') };
  const massStr = g => { const x = mass(g); return `${x.v} ${x.u}`; };
  const money = v => Number.isFinite(v) ? new Intl.NumberFormat(loc(), { style: 'currency', currency: state.currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0, minimumFractionDigits: 0 }).format(v) : '—';
  const curSymbol = () => (new Intl.NumberFormat(loc(), { style: 'currency', currency: state.currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(p => p.type === 'currency') || {}).value || state.currency;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
  const num = el => { const v = parseFloat(String(el.value).replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
  const num0 = el => { const v = num(el); return Number.isFinite(v) ? v : 0; };
  const cap = s => s ? s[0].toLocaleUpperCase(loc()) + s.slice(1) : s;
  const B = x => `<b>${x}</b>`;

  /* ——— цвет ——— */
  const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgb2hex = a => '#' + a.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
  const mixHex = (a, b, k) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * k)); };
  const wineColor = (wineRef, style, sugar) => mixHex(mixHex(wineRef.hue, style.tint, style.tintWeight || 0), '#1a0705', Math.min(0.35, sugar / 900));

  /* ——— селекты ——— */
  function fillWineSelect(filter = '') {
    const sel = $('wineSelect'), f = filter.trim().toLowerCase();
    sel.innerHTML = '';
    Object.entries(D.colors).forEach(([c, title]) => {
      const items = D.wines.filter(w => w.color === c && (!f || [w.name, w.region, tn(w.name), tn(w.region)].join(' ').toLowerCase().includes(f) || w.id === 'custom'));
      if (!items.length) return;
      const g = document.createElement('optgroup'); g.label = t(title);
      items.forEach(w => g.appendChild(new Option(tn(w.name), w.id)));
      sel.appendChild(g);
    });
    if (![...sel.options].some(o => o.value === state.wineId)) sel.prepend(new Option(tn(byId(D.wines, state.wineId).name), state.wineId));
    sel.value = state.wineId;
  }
  function fillLocalizedSelects() {
    const sp = $('spiritSelect'); sp.innerHTML = '';
    D.spirits.forEach(s => sp.appendChild(new Option(s.id === 'custom' ? t(s.name) : `${t(s.name)} · ${nf(s.abv, s.abv % 1 ? 1 : 0)} %`, s.id)));
    const st = $('styleSelect'), groups = {}; st.innerHTML = '';
    D.styles.forEach(s => {
      if (!groups[s.group]) { groups[s.group] = document.createElement('optgroup'); groups[s.group].label = t(s.group); st.appendChild(groups[s.group]); }
      groups[s.group].appendChild(new Option(t(s.name), s.id));
    });
    const acid = $('acAcid'), base = $('acBase'), av = acid.value, bv = base.value;
    acid.innerHTML = ''; base.innerHTML = '';
    Object.entries(C.ACIDS).forEach(([k, a]) => acid.appendChild(new Option(t(a.name), k)));
    Object.entries(C.BASES).forEach(([k, b]) => base.appendChild(new Option(t(b.name), k)));
    if (av) acid.value = av; if (bv) base.value = bv;
    const cur = $('currency'); cur.innerHTML = '';
    Object.entries(CURRENCIES).forEach(([code, c]) => cur.appendChild(new Option(`${code} · ${t(c.name)}`, code)));
    $('styleRef').querySelector('tbody').innerHTML = D.styles.filter(s => s.id !== 'custom').map(s =>
      `<tr data-style="${s.id}"><td>${esc(t(s.name))}</td><td class="num">${nf(s.abv[0], s.abv[0] % 1 ? 1 : 0)}–${nf(s.abv[1], s.abv[1] % 1 ? 1 : 0)} %</td><td class="num">${s.sugar[0]}–${s.sugar[1]}</td><td>${s.method === 'mutage' ? t('мутаж') : t('готовое вино')}</td></tr>`).join('');
  }
  function fillLangSelect() {
    const sel = $('langSelect'); sel.innerHTML = '';
    I.langs.forEach(l => sel.appendChild(new Option(l.name, l.code)));
    sel.value = I.lang();
  }

  /* ——— форма ——— */
  const setRadio = (name, v) => { const el = document.querySelector(`input[name=${name}][value=${v}]`); if (el) el.checked = true; };
  function writeForm() {
    setRadio('mode', state.mode); setRadio('sugarSource', state.sugarSource); setRadio('calcMode', state.calcMode);
    $('wineSelect').value = state.wineId;
    document.querySelectorAll('#wineFields input').forEach(inp => inp.value = state.wine[inp.dataset.k]);
    $('sugar0').value = round(state.sugar0, 1);
    $('brix').value = round(C.sugarToBrix(state.sugar0), 1);
    $('kSugar').value = state.k;
    $('fermented').value = state.fermented;
    $('volume').value = state.volume;
    $('spiritSelect').value = state.spiritId;
    $('spiritAbv').value = state.spiritAbv;
    $('styleSelect').value = state.styleId;
    $('targetAbv').value = state.targetAbv; $('targetAbvRange').value = state.targetAbv;
    $('targetSugar').value = state.targetSugar; $('targetSugarRange').value = state.targetSugar;
    $('rcsConc').value = state.rcsConc;
    $('contraction').checked = state.contraction;
    $('doseSpirit').value = state.dose.spiritL; $('doseSugar').value = state.dose.sugarG; $('doseRcs').value = state.dose.rcsL;
    const P = state.prices;
    $('priceWine').value = P.wine; $('priceSpirit').value = P.spirit; $('priceSugar').value = P.sugar;
    $('priceRcs').value = P.rcs; $('priceBottle').value = P.bottle; $('bottleSize').value = String(P.size);
    $('currency').value = state.currency;
    document.querySelectorAll('.cur-sym').forEach(el => el.textContent = curSymbol());
  }

  function applyStyle(style) {
    const mid = r => r[0] + (r[1] - r[0]) / 2;
    state.targetAbv = round(mid(style.abv), 1);
    state.targetSugar = Math.round(style.sugar[1] <= 10 ? style.sugar[0] : style.sugar[1] > 300 ? style.sugar[0] + 40 : mid(style.sugar));
    const sp = byId(D.spirits, style.spirit);
    if (sp) { state.spiritId = sp.id; state.spiritAbv = sp.abv; }
  }

  function setCurrency(code) {
    if (!CURRENCIES[code] || code === state.currency) return;
    const k = CURRENCIES[code].rate / CURRENCIES[state.currency].rate;
    ['wine', 'spirit', 'sugar', 'rcs', 'bottle'].forEach(p => state.prices[p] = niceRound(state.prices[p] * k));
    state.currency = code;
  }

  /* ——— расчёт ——— */
  function currentWine() {
    const w = Object.assign({}, state.wine, { volume: state.volume });
    if (state.mode === 'must') { const m = C.mustState(state.sugar0, state.fermented, state.k); w.abv = m.abv; w.sugar = m.sugar; }
    return w;
  }
  function compute() {
    const wine = currentWine(), style = byId(D.styles, state.styleId);
    const common = { Vw: state.volume, aw: wine.abv, Sw: wine.sugar, as: state.spiritAbv, rcsConc: state.rcsConc, useContraction: state.contraction };
    const sol = state.calcMode === 'dose'
      ? C.forward(Object.assign(common, { spiritL: state.dose.spiritL, sugarG: state.sugarSource === 'sucrose' ? state.dose.sugarG : 0, rcsL: state.sugarSource === 'rcs' ? state.dose.rcsL : 0 }))
      : C.solve(Object.assign(common, { targetAbv: state.targetAbv, targetSugar: state.targetSugar, sugarSource: state.sugarSource }));
    const bad = WINE_KEYS.filter(k => !Number.isFinite(wine[k]) || wine[k] < 0);
    if (bad.length && sol.ok) { sol.ok = false; sol.errors = [t('Заполните все параметры вина неотрицательными числами.')]; }
    return { wine, style, sol, base: C.baseline(wine), pred: sol.ok ? C.predict(wine, sol) : null };
  }

  /* ——— рендер ——— */
  let last = null;
  function render() {
    const r = last = compute();
    const wineRef = byId(D.wines, state.wineId);
    const must = state.mode === 'must', dose = state.calcMode === 'dose';

    $('wineName').textContent = tn(wineRef.name);
    $('wineMeta').textContent = `${t(D.colors[wineRef.color])} · ${tn(wineRef.region)}`;
    $('wineSwatch').style.background = wineRef.hue;
    $('mustBlock').hidden = !must;
    $('mutageBox').hidden = !must;
    $('findMutage').hidden = dose;
    ['abv', 'sugar'].forEach(k => {
      const inp = document.querySelector(`#wineFields input[data-k=${k}]`);
      inp.readOnly = must;
      if (must) inp.value = round(r.wine[k], k === 'abv' ? 2 : 1);
    });
    $('fermentedOut').textContent = `${nf(state.fermented, 1)} %`;
    if (must) $('mustNow').innerHTML = t('Сейчас в сусле: сахар {s} г/л, спирт {a} %, плотность ≈ {d} г/см³.', { s: B(nf(r.wine.sugar, 0)), a: B(nf(r.wine.abv, 2)), d: B(nf(C.mustDensity(r.wine.sugar, r.wine.abv), 3)) });
    $('rcsField').hidden = state.sugarSource !== 'rcs';
    $('doseBlock').hidden = !dose;
    $('targetBlock').hidden = dose;
    $('doseSugarField').hidden = state.sugarSource !== 'sucrose';
    $('doseRcsField').hidden = state.sugarSource !== 'rcs';

    const st = r.style, rng = (a, u) => a ? `${nf(a[0], a[0] % 1 ? 1 : 0)}–${nf(a[1], a[1] % 1 ? 1 : 0)} ${u}` : '';
    let sc = `<div class="ranges"><span>${t('спирт')} ${rng(st.abv, '%')}</span><span>${t('сахар')} ${rng(st.sugar, t('г/л'))}</span>${st.ta ? `<span>${t('ТК')} ${rng(st.ta, t('г/л'))}</span>` : ''}<span>${st.method === 'mutage' ? t('мутаж при брожении') : t('крепление готового вина')}</span></div><p>${esc(t(st.notes))}</p>`;
    if (st.method === 'mutage' && !must && st.id !== 'custom') sc += `<p class="warn">${esc(t('Этот стиль традиционно делают мутажем: попробуйте режим «Бродящее сусло».'))}</p>`;
    if (st.colors.length && !st.colors.includes(wineRef.color) && wineRef.id !== 'custom') sc += `<p class="warn">${esc(t('Обычно его делают из вин типа «{c}».', { c: st.colors.map(c => t(D.colors[c]).toLocaleLowerCase(loc())).join(', ') }))}</p>`;
    $('styleCard').innerHTML = sc;

    const errBox = $('errors');
    errBox.hidden = r.sol.ok;
    errBox.innerHTML = r.sol.ok ? '' : r.sol.errors.map(e => `<p>${esc(e)}</p>`).join('');

    renderRecipe(r); renderTable(r); renderNotes(r); renderStage(r);
    renderCompare(r); renderCost(r);
    if (must) renderChart(r);
    save();
  }

  function renderRecipe(r) {
    const box = $('recipe'), proc = $('procedure');
    if (!r.sol.ok) { box.innerHTML = ''; proc.innerHTML = ''; return; }
    const s = r.sol, sv = vol(s.spiritL), fv = vol(s.Vf);
    const doses = [{ k: t('Спирт {a} %', { a: nf(state.spiritAbv, 1) }), v: sv.v, u: sv.u, s: t('{a} л безводного · {p} % к вину', { a: nf(s.absAlcoholL, 2), p: nf(s.spiritL / state.volume * 100, 1) }), c: 'var(--brass)' }];
    if (state.sugarSource === 'sucrose') { const m = mass(s.sugarG); doses.push({ k: t('Сахар (сахароза)'), v: m.v, u: m.u, s: t('{g} г на литр вина', { g: nf(s.sugarG / state.volume, 1) }), c: 'var(--oak)' }); }
    else { const x = vol(s.rcsL); doses.push({ k: t('Концентрат сусла {c} г/л', { c: state.rcsConc }), v: x.v, u: x.u, s: t('{m} сахара', { m: massStr(s.rcsL * state.rcsConc) }), c: 'var(--oak)' }); }
    const bottles = Math.floor(s.Vf / state.prices.size + 1e-9);
    doses.push({ k: t('Итоговый объём'), v: fv.v, u: fv.u, s: t('{n} бут. × {v} л', { n: bottles, v: nf(state.prices.size, state.prices.size < 1 ? 3 : 1) }) + (state.contraction ? ' · ' + t('контракция −{ml} мл', { ml: nf(s.contractionL * 1000, 0) }) : ''), c: 'var(--garnet)' });
    box.innerHTML = doses.map(d => `<div class="dose" style="--c:${d.c}"><div class="k">${esc(d.k)}</div><div class="v">${d.v}<small>${d.u}</small></div><div class="s">${d.s}</div></div>`).join('');
    proc.innerHTML = procedureSteps(r).map(x => `<li>${x}</li>`).join('');
  }

  function procedureSteps(r, plain = false) {
    const s = r.sol, spirit = byId(D.spirits, state.spiritId);
    const b = plain ? (x => x) : B, q = plain ? (x => x) : esc;
    const steps = [];
    const sweet = state.sugarSource === 'sucrose' ? s.sugarG > 0.5 : s.rcsL > 0.0005;
    const sweetText = state.sugarSource === 'sucrose'
      ? t('Растворите {m} сахара в 2–3 л вина, подогретого до 30–35 °C, и верните сироп в ёмкость.', { m: b(massStr(s.sugarG)) })
      : t('Внесите {v} концентрата сусла, перемешайте.', { v: b(volStr(s.rcsL)) });
    const sp = { v: b(volStr(s.spiritL)), n: q(t(spirit.name)), a: nf(state.spiritAbv, 1) };
    if (state.mode === 'must') {
      steps.push(t('Ведите брожение до сброжённости {p}: сахар ≈ {s}, плотность ≈ {d}. Контролируйте ареометром каждые 4–6 часов.', { p: b(nf(state.fermented, 1) + ' %'), s: b(nf(r.wine.sugar, 0) + ' ' + t('г/л')), d: b(nf(C.mustDensity(r.wine.sugar, r.wine.abv), 3)) }));
      if (s.spiritL > 0) steps.push(t('Быстро внесите {v} спирта «{n}» ({a} %), сразу и тщательно перемешайте: дрожжи остановятся при ≥ 15–16 %.', sp));
      if (sweet) steps.push(sweetText);
    } else {
      if (sweet) steps.push(sweetText);
      if (s.spiritL > 0) steps.push(t('Внесите {v} спирта «{n}» ({a} %) в 2–3 приёма, перемешивая. Спирт лейте в вино, а не наоборот.', sp));
    }
    steps.push(t('Через 24–48 ч смесь «сядет»: проверьте крепость спиртомером. Ожидаемо {a} и {s}.', { a: b(nf(s.abv, 1) + ' %'), s: b(nf(s.sugar, 0) + ' ' + t('г/л')) }));
    steps.push(t('Отдых 3–4 недели при 10–15 °C, снятие с осадка, при необходимости оклейка и фильтрация.'));
    steps.push(t('Выдержка: {a}.', { a: q(t(r.style.aging)) }));
    return steps;
  }

  const ROWS = () => [
    [t('Крепость'), 'abv', t('% об.'), 1, 'abv'],
    [t('Сахар'), 'sugar', t('г/л'), 0, 'sugar'],
    [t('Титруемая кислотность'), 'ta', t('г/л'), 2, 'ta'],
    [t('pH (оценка)'), 'pH', '', 2, 'pH'],
    [t('Летучая кислотность'), 'va', t('г/л'), 2],
    [t('SO₂ свободный'), 'freeSO2', t('мг/л'), 0],
    [t('SO₂ молекулярный'), 'molSO2', t('мг/л'), 2],
    [t('SO₂ общий'), 'totalSO2', t('мг/л'), 0],
    [t('Приведённый экстракт'), 'extract', t('г/л'), 1],
    [t('Общий экстракт'), 'totalExtract', t('г/л'), 0],
    [t('Плотность при 20 °C'), 'density', t('г/см³'), 4],
    [t('Кажущийся °Brix'), 'brix', '°Bx', 1],
    [t('Боме'), 'baume', '°Bé', 1],
    [t('Энергия'), 'kcal', t('ккал/100 мл'), 0],
    [t('Сахарно-кислотный индекс'), 'sugarAcid', '', 1],
    [t('Категория сладости'), 'sweetness', '', null]
  ];
  const STATUS = () => ({ ok: t('в стиле'), near: t('рядом'), out: t('вне стиля') });

  function renderTable(r) {
    const tb = document.querySelector('#params tbody');
    if (!r.pred) { tb.innerHTML = ''; return; }
    const check = C.styleCheck(r.pred, r.style), S = STATUS();
    tb.innerHTML = ROWS().map(([label, k, unit, d, rk]) => {
      const b = r.base[k], a = r.pred[k];
      const fmt = v => d === null ? esc(v) : nf(v, d);
      let delta = '';
      if (d !== null && Number.isFinite(a) && Math.abs(a - b) >= 0.5 * 10 ** -d) delta = `<span class="delta">${a > b ? '+' : '−'}${nf(Math.abs(a - b), d)}</span>`;
      const stc = rk && check[rk] ? `<span class="chip ${check[rk]}">${S[check[rk]]}</span>` : '<span class="chip none">—</span>';
      return `<tr><td>${label}</td><td class="num before">${fmt(b)}${unit ? `<span class="unit">${unit}</span>` : ''}</td><td class="num after">${fmt(a)}${delta}</td><td>${stc}</td></tr>`;
    }).join('');
  }

  function renderNotes(r) {
    const ul = $('notes');
    if (!r.pred) { ul.innerHTML = ''; return; }
    const items = [], sn = t(r.style.name);
    r.sol.warnings.forEach(w => items.push(['warn', w]));
    C.recommendations(r.pred, r.style, r.sol.Vf).forEach(x => items.push(['', x]));
    const ch = C.styleCheck(r.pred, r.style);
    if (ch.abv === 'out' || ch.sugar === 'out') items.push(['warn', state.calcMode === 'dose'
      ? t('С такими дозами вино не попадает в «{s}» (крепость {a} %, сахар {g} г/л).', { s: sn, a: nf(r.pred.abv, 1), g: nf(r.pred.sugar, 0) })
      : t('Цель по крепости или сахару вне диапазона «{s}». Выберите стиль заново, чтобы вернуть типовые значения.', { s: sn })]);
    if (r.pred.dilution < 0.8) items.push(['warn', t('Вино разбавляется на {p} %: кислотность, экстракт и аромат пропорционально ослабнут.', { p: nf((1 - r.pred.dilution) * 100, 0) })]);
    if (state.contraction && r.sol.contractionL > 0) items.push(['', t('Контракция: смесь потеряет около {ml} мл объёма. Расчёт это уже учёл.', { ml: nf(r.sol.contractionL * 1000, 0) })]);
    if (state.mode === 'must' && r.wine.abv > 15) items.push(['warn', t('Крепость сусла уже выше 15 %: брожение, скорее всего, остановилось само. Проверьте фактический сахар.')]);
    if (r.pred.abv >= 15 && r.pred.abv < 16 && r.pred.sugar > 50) items.push(['warn', t('При 15–16 % и высоком сахаре вино не застраховано от вторичного брожения: держите молекулярный SO₂ ≥ 0,6 мг/л или поднимите крепость.')]);
    if (!items.some(i => i[0] === 'warn')) items.unshift(['good', t('Параметры укладываются в «{s}». Вино будет {w}, СКИ {i}.', { s: sn, w: r.pred.sweetness, i: nf(r.pred.sugarAcid, 1) })]);
    ul.innerHTML = items.map(([c, x]) => `<li class="${c}">${esc(x)}</li>`).join('');
  }

  function renderStage(r) {
    const wineRef = byId(D.wines, state.wineId), st = r.style, ok = !!r.pred;
    const abv = ok ? r.pred.abv : r.wine.abv, sugar = ok ? r.pred.sugar : r.wine.sugar;
    const color = wineColor(wineRef, st, sugar);
    $('liquidBody').style.fill = color;
    $('meniscus').style.fill = mixHex(color, '#ffffff', 0.18);
    const fill = Math.min(0.92, 0.58 * (ok ? r.sol.Vf / state.volume : 1));
    $('liquid').style.transform = `translateY(${165 - 145 * fill}px)`;
    $('glassCaption').textContent = ok ? `${volStr(r.sol.Vf)} · ${r.pred.sweetness}` : t('проверьте ввод');
    const pos = v => `${Math.max(0, Math.min(100, v / 25 * 100))}%`;
    $('hydroBefore').style.left = pos(r.wine.abv);
    $('hydroBefore').firstElementChild.textContent = `${nf(r.wine.abv, 1)} %`;
    $('hydroAfter').style.left = pos(abv);
    $('hydroAfter').firstElementChild.textContent = `${nf(abv, 1)} %`;
    $('hydroBand').style.left = pos(st.abv[0]);
    $('hydroBand').style.width = `calc(${pos(st.abv[1])} - ${pos(st.abv[0])})`;
    $('labelStyle').textContent = st.id === 'custom' ? t('Креплёное вино') : t(st.name);
    $('labelWine').textContent = tn(wineRef.name);
    $('labelAbv').textContent = nf(abv, 1);
    $('labelSugar').textContent = nf(sugar, 0);
    const v = vol(ok ? r.sol.Vf : state.volume);
    $('labelVol').textContent = v.v; $('labelVolUnit').textContent = v.u === t('л') ? t('литров') : t('миллилитров');
    $('labelFoot').textContent = ok ? `${cap(r.pred.sweetness)} · ${tn(wineRef.region.split(' · ')[0])} · MMXXVI` : '';
  }

  function renderCompare(r) {
    const tb = $('cmpTable').querySelector('tbody');
    if (!r.sol.ok) { tb.innerHTML = '<tr><td colspan="6">—</td></tr>'; return; }
    const A = r.sol.abv, S = r.sol.sugar;
    const list = D.spirits.filter(s => s.id !== 'custom').map(s => ({ ...s }));
    if (state.spiritId === 'custom') list.push({ id: 'custom', name: 'Свой спирт', abv: state.spiritAbv });
    const rows = list.map(sp => {
      if (sp.abv <= A + 0.2) return { sp, res: null };
      const res = C.solve({ Vw: state.volume, aw: r.wine.abv, Sw: r.wine.sugar, as: sp.abv, targetAbv: A, targetSugar: S, sugarSource: state.sugarSource, rcsConc: state.rcsConc, useContraction: state.contraction });
      return { sp, res: res.ok ? res : null };
    });
    const maxV = Math.max(...rows.filter(x => x.res).map(x => x.res.spiritL), 1e-9);
    tb.innerHTML = rows.map(({ sp, res }) => {
      const cur = sp.id === state.spiritId ? 'current' : '';
      const name = `${esc(t(sp.name))} · ${nf(sp.abv, 1)} %`;
      if (!res) return `<tr class="disabled ${cur}"><td>${name}</td><td colspan="5">${esc(t('слабее цели {a} %, не подходит', { a: nf(A, 1) }))}</td></tr>`;
      const share = state.volume / res.Vf * 100, ta = r.wine.ta * state.volume / res.Vf;
      return `<tr class="${cur}" data-spirit="${sp.id}" tabindex="0"><td>${name}</td><td class="num"><span class="bar" style="width:${Math.max(4, res.spiritL / maxV * 60)}px"></span>${volStr(res.spiritL)}</td><td class="num">${volStr(res.Vf)}</td><td class="num">${nf(share, 0)} %</td><td class="num">${nf(ta, 2)}</td><td class="num">${nf(res.absAlcoholL, 2)} ${t('л')}</td></tr>`;
    }).join('');
  }

  // вино ведёт (акцент), остальное — ступени нейтральной шкалы
  const COST_COLORS = { wine: 'var(--garnet)', spirit: 'var(--ink-soft)', sugar: 'var(--ink-muted)', rcs: 'color-mix(in srgb, var(--ink) 40%, transparent)', bottles: 'color-mix(in srgb, var(--ink) 22%, transparent)' };
  const COST_NAMES = () => ({ wine: t('Вино / сусло'), spirit: t('Спирт'), sugar: t('Сахар'), rcs: t('Концентрат'), bottles: t('Бутылки') });
  function renderCost(r) {
    const out = $('costOut'), bar = $('costBar');
    $('rateNote').textContent = t('Курсы для пересчёта при смене валюты ориентировочные: 1 USD ≈ {r}. Цены лучше вписать свои.', { r: Object.entries(CURRENCIES).filter(([c]) => c !== 'USD').map(([c, v]) => `${v.rate} ${c}`).join(', ') });
    if (!r.sol.ok) { out.innerHTML = ''; bar.innerHTML = ''; return; }
    const P = state.prices, N = COST_NAMES();
    const c = C.cost({ Vw: state.volume, wineL: P.wine, spiritL: r.sol.spiritL, spiritPrice: P.spirit, sugarG: r.sol.sugarG, sugarPrice: P.sugar, rcsL: r.sol.rcsL, rcsPrice: P.rcs, Vf: r.sol.Vf, bottle: P.size, bottlePrice: P.bottle });
    out.innerHTML = [
      [t('Вся партия'), money(c.total), t('{v} л готового вина', { v: nf(r.sol.Vf, 2) }), 'var(--garnet)'],
      [t('Литр'), money(c.perL), t('без учёта розлива: {m}', { m: money((c.total - c.parts.bottles) / r.sol.Vf) }), 'var(--brass)'],
      [t('Бутылка'), c.bottles ? money(c.perBottle) : '—', t('{n} шт.', { n: c.bottles }) + (c.rest > 0.005 ? ' ' + t('+ остаток {v}', { v: volStr(c.rest) }) : ''), 'var(--oak)']
    ].map(([k, v, s, col]) => `<div class="dose" style="--c:${col}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');
    const total = c.total || 1;
    bar.innerHTML = Object.entries(c.parts).filter(([, v]) => v > 0).map(([k, v]) => `<span style="width:${v / total * 100}%;background:${COST_COLORS[k]}" title="${N[k]}: ${money(v)}"></span>`).join('');
    let lg = bar.nextElementSibling;
    if (!lg || !lg.classList.contains('cost-legend')) { lg = document.createElement('div'); lg.className = 'cost-legend'; bar.after(lg); }
    lg.innerHTML = Object.entries(c.parts).filter(([, v]) => v > 0).map(([k, v]) => `<span><i style="background:${COST_COLORS[k]}"></i>${N[k]} ${money(v)} · ${nf(v / total * 100, 0)} %</span>`).join('');
  }

  function renderChart(r) {
    const svg = $('mutageChart');
    const target = state.calcMode === 'dose' && r.sol.ok ? r.sol.abv : state.targetAbv;
    const pts = C.mutageCurve({ Vw: state.volume, sugar0: state.sugar0, k: state.k, as: state.spiritAbv, targetAbv: target, useContraction: state.contraction, steps: 80 });
    if (pts.length < 2) { svg.innerHTML = `<text x="320" y="125" text-anchor="middle" class="axis-title">${esc(t('Нет данных: проверьте сахар сусла и крепость спирта'))}</text>`; return; }
    const W = 640, H = 250, m = { l: 48, r: 52, t: 18, b: 38 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const sMax = Math.ceil(Math.max(pts[0].sugar, state.targetSugar, r.style.sugar[1] > 400 ? 0 : r.style.sugar[1]) / 50) * 50 || 50;
    const vMax = Math.max(...pts.map(p => p.spiritL)) * 1.1;
    const X = p => m.l + p / 100 * pw, Y = s => m.t + ph - Math.min(s, sMax) / sMax * ph, Y2 = v => m.t + ph - v / vMax * ph;
    let g = '';
    for (let i = 0; i <= 5; i++) { const s = sMax * i / 5; g += `<line class="grid-line" x1="${m.l}" x2="${W - m.r}" y1="${Y(s)}" y2="${Y(s)}"/><text class="axis-text" x="${m.l - 8}" y="${Y(s) + 3.5}" text-anchor="end">${nf(s, 0)}</text><text class="axis-text" x="${W - m.r + 8}" y="${Y(s) + 3.5}">${nf(vMax * i / 5, vMax < 1 ? 2 : 1)}</text>`; }
    for (let p = 0; p <= 100; p += 20) g += `<text class="axis-text" x="${X(p)}" y="${H - m.b + 16}" text-anchor="middle">${p}</text>`;
    g += `<text class="axis-title" x="${m.l + pw / 2}" y="${H - 4}" text-anchor="middle">${esc(t('сброжённость сусла, %'))}</text>`;
    g += `<text class="axis-title" x="${m.l - 40}" y="${m.t - 6}">${t('г/л')}</text><text class="axis-title" x="${W - 4}" y="${m.t - 6}" text-anchor="end">${esc(t('л спирта'))}</text>`;
    const band = r.style.sugar;
    if (band && band[0] < sMax) g += `<rect class="band" x="${m.l}" width="${pw}" y="${Y(Math.min(band[1], sMax))}" height="${Y(band[0]) - Y(Math.min(band[1], sMax))}"/>`;
    if (state.calcMode === 'target' && state.targetSugar <= sMax) g += `<line class="target-line" x1="${m.l}" x2="${W - m.r}" y1="${Y(state.targetSugar)}" y2="${Y(state.targetSugar)}"/><text class="lbl target" x="${m.l + 6}" y="${Y(state.targetSugar) - 5}">${esc(t('цель {s} г/л', { s: state.targetSugar }))}</text>`;
    const path = (fy, key) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.p).toFixed(1)},${fy(p[key]).toFixed(1)}`).join('');
    g += `<path class="s-spirit" d="${path(Y2, 'spiritL')}"/><path class="s-sugar" d="${path(Y, 'sugar')}"/>`;
    const lastP = pts[pts.length - 1], midP = pts[Math.floor(pts.length * 0.15)];
    g += `<text class="lbl sugar" x="${Math.min(X(lastP.p) + 6, W - m.r - 70)}" y="${Y(lastP.sugar) - 6}">${esc(t('сахар'))}</text>`;
    g += `<text class="lbl spirit" x="${X(midP.p) + 4}" y="${Y2(midP.spiritL) - 8}">${esc(t('доза спирта'))}</text>`;
    const cur = state.fermented;
    if (cur <= lastP.p && r.sol.ok) {
      const cp = C.mustState(state.sugar0, cur, state.k);
      const cs = C.solve({ Vw: state.volume, aw: cp.abv, Sw: cp.sugar, as: state.spiritAbv, targetAbv: target, targetSugar: 0, useContraction: state.contraction });
      if (cs.ok) g += `<line class="now-line" x1="${X(cur)}" x2="${X(cur)}" y1="${m.t}" y2="${m.t + ph}"/><circle class="dot-spirit" cx="${X(cur)}" cy="${Y2(cs.spiritL)}" r="5"/><circle class="dot-sugar" cx="${X(cur)}" cy="${Y(cs.sugar)}" r="5.5"/><text class="axis-text" x="${X(cur) + 6}" y="${m.t + 10}">${esc(t('сейчас {p} %', { p: nf(cur, 0) }))}</text>`;
    }
    g += `<rect class="hit" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/>`;
    svg.innerHTML = g;
    svg.setAttribute('aria-label', t('График мутажа'));
    svg.querySelector('.hit').addEventListener('click', e => {
      const box = svg.getBoundingClientRect();
      state.fermented = round(Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width * W - m.l) / pw * 100)), 1);
      writeForm(); render();
    });
  }

  /* ——— текст рецепта ——— */
  function recipeText(r) {
    const wineRef = byId(D.wines, state.wineId), s = r.sol, L = [];
    L.push(`VINUM FORTIS · ${t(r.style.name)}`);
    L.push(t('Основа: {w}, {v} л ({d})', { w: tn(wineRef.name), v: nf(state.volume, 2), d: state.mode === 'must' ? t('сусло {s} г/л, сброжено {p} %', { s: nf(state.sugar0, 0), p: nf(state.fermented, 1) }) : `${nf(r.wine.abv, 1)} %, ${nf(r.wine.sugar, 0)} ${t('г/л')}` }));
    L.push(t('Спирт: {n}, {a} %: {v}', { n: t(byId(D.spirits, state.spiritId).name), a: nf(state.spiritAbv, 1), v: volStr(s.spiritL) }));
    if (s.sugarG > 0.5) L.push(t('Сахар: {m}', { m: massStr(s.sugarG) }));
    if (s.rcsL > 0) L.push(t('Концентрат сусла: {v}', { v: volStr(s.rcsL) }));
    L.push(t('Итог: {v}, {a} % об., {s} г/л сахара, ТК {ta} г/л, pH ≈ {ph}', { v: volStr(s.Vf), a: nf(s.abv, 1), s: nf(s.sugar, 0), ta: nf(r.pred.ta, 1), ph: nf(r.pred.pH, 2) }));
    L.push('');
    procedureSteps(r, true).forEach((x, i) => L.push(`${i + 1}. ${x}`));
    return L.join('\n');
  }
  async function copyText(x) {
    try { await navigator.clipboard.writeText(x); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = x; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove(); return ok;
    }
  }
  const flash = (id, text) => { const el = $(id); el.textContent = text; clearTimeout(el._t); el._t = setTimeout(() => el.textContent = '', 5000); };

  /* ——— журнал ——— */
  function entryFromState(name) {
    const r = last, wineRef = byId(D.wines, state.wineId);
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || `${t(r.style.name)} · ${tn(wineRef.name)}`,
      date: new Date().toISOString(),
      state: JSON.parse(JSON.stringify(state)),
      summary: {
        styleId: r.style.id, wineId: wineRef.id, spiritId: state.spiritId,
        style: r.style.name, wine: wineRef.name, hue: wineColor(wineRef, r.style, r.sol.sugar),
        abv: r.sol.abv, sugar: r.sol.sugar, Vf: r.sol.Vf, volume: state.volume,
        spirit: byId(D.spirits, state.spiritId).name, spiritAbv: state.spiritAbv, spiritL: r.sol.spiritL,
        sugarG: r.sol.sugarG, rcsL: r.sol.rcsL, ta: r.pred.ta, pH: r.pred.pH
      }
    };
  }
  const sumStyle = s => t((byId(D.styles, s.styleId) || {}).name || s.style || '');
  const sumWine = s => tn((byId(D.wines, s.wineId) || {}).name || s.wine || '');
  const sumSpirit = s => t((byId(D.spirits, s.spiritId) || {}).name || s.spirit || '');
  function renderJournal() {
    const j = loadJournal();
    $('journalCount').textContent = j.length || '';
    const list = $('jList');
    if (!j.length) { list.innerHTML = `<div class="empty">${esc(t('Журнал пуст. Сохраните первый расчёт.'))}</div>`; return; }
    list.innerHTML = j.slice().reverse().map(e => {
      const s = e.summary || {}, d = new Date(e.date);
      return `<article class="card entry" style="--hue:${esc(s.hue || '#8c1c2c')}" data-id="${esc(e.id)}">
        <h3>${esc(e.name)}</h3>
        <div class="meta">${esc(sumStyle(s))} · ${esc(sumWine(s))} · ${isNaN(d) ? '' : d.toLocaleString(loc(), { dateStyle: 'medium', timeStyle: 'short' })}</div>
        <div class="figs"><span>${nf(s.abv, 1)}<small>%</small></span><span>${nf(s.sugar, 0)}<small>${t('г/л')}</small></span><span>${nf(s.Vf, 2)}<small>${t('л')}</small></span><span>${nf(s.ta, 1)}<small>${t('ТК')}</small></span></div>
        <div class="meta" style="margin:8px 0 0">${esc(sumSpirit(s))} ${nf(s.spiritAbv, 1)} %: ${volStr(s.spiritL || 0)}${s.sugarG > 0.5 ? ` · ${t('сахар')} ${massStr(s.sugarG)}` : ''}${s.rcsL > 0 ? ` · ${t('РКС')} ${volStr(s.rcsL)}` : ''}</div>
        <div class="row"><button class="btn" data-act="open">${t('Открыть')}</button><button class="btn-ghost" data-act="dup">${t('Ссылка')}</button><button class="btn-ghost danger" data-act="del">${t('Удалить')}</button></div>
      </article>`;
    }).join('');
  }
  function toCSV(j) {
    const cols = [['name', t('Партия')], ['date', t('Дата')], ['style', t('Стиль')], ['wine', t('Вино')], ['volume', t('Объём вина, л')], ['spirit', t('Спирт')], ['spiritAbv', t('Крепость спирта, %')], ['spiritL', t('Спирт, л')], ['sugarG', t('Сахар, г')], ['rcsL', t('РКС, л')], ['Vf', t('Итог, л')], ['abv', t('Спирт, %')], ['sugar', t('Сахар, г/л')], ['ta', t('ТК, г/л')], ['pH', 'pH']];
    const dec = (1.5).toLocaleString(loc()).includes(',');
    const cell = v => { const x = typeof v === 'number' ? (dec ? String(round(v, 3)).replace('.', ',') : String(round(v, 3))) : String(v ?? ''); return /[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const val = (e, k) => { const s = e.summary || {}; if (k === 'name' || k === 'date') return e[k]; if (k === 'style') return sumStyle(s); if (k === 'wine') return sumWine(s); if (k === 'spirit') return sumSpirit(s); return s[k]; };
    return '﻿' + [cols.map(c => c[1]).join(';')].concat(j.map(e => cols.map(([k]) => cell(val(e, k))).join(';'))).join('\n');
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const shareUrl = s => `${location.href.split('#')[0]}#s=${encodeState(s)}`;

  /* ——— мастерская ——— */
  let toolsPrefilled = false;
  const blA = $('blA'), blB = $('blB'), blT = $('blT');
  function blendDefaults(param) {
    const r = last;
    const conf = {
      sugar: { a: r.wine.sugar, t: state.targetSugar, lo: 0, hi: 250 },
      abv: { a: r.wine.abv, t: state.targetAbv, lo: 11, hi: 22 },
      ta: { a: r.wine.ta, t: r.style.ta ? (r.style.ta[0] + r.style.ta[1]) / 2 : r.wine.ta + 1, lo: 3.5, hi: 9 }
    }[param];
    let a = conf.a, tg = conf.t;
    if (Math.abs(tg - a) < 1e-9) tg = a + (param === 'abv' ? 1 : param === 'ta' ? 0.5 : 20);
    const b = tg > a ? Math.max(conf.hi, tg * 1.25) : Math.min(conf.lo, tg * 0.5);
    return [a, b, tg].map(v => round(v, 1));
  }
  function prefillTools() {
    if (toolsPrefilled || !last) return;
    toolsPrefilled = true;
    const r = last, p = r.pred || r.base, V = r.sol.ok ? r.sol.Vf : state.volume;
    [blA.value, blB.value, blT.value] = blendDefaults($('blParam').value); $('blV').value = round(state.volume, 1);
    $('acNow').value = round(p.ta, 2); $('acT').value = r.style.ta ? round((r.style.ta[0] + r.style.ta[1]) / 2, 1) : round(p.ta, 1); $('acV').value = round(V, 2);
    $('soPH').value = round(p.pH, 2); $('soFree').value = Math.round(p.freeSO2); $('soV').value = round(V, 2);
    $('dlV').value = 1; $('dlA1').value = state.spiritAbv; $('dlA2').value = Math.max(1, Math.min(70, round(state.spiritAbv - 10, 0)));
    $('hySG').value = round(C.mustDensity(state.sugar0, 0), 3); $('hyV').value = state.volume; $('hyT').value = 13;
    renderTools();
  }
  function renderTools() {
    if (!toolsPrefilled) return;
    const unit = { sugar: t('г/л'), abv: t('% об.'), ta: t('г/л') }[$('blParam').value];
    const b = C.blend2(num(blA), num(blB), num(blT), num0($('blV')));
    $('blOut').innerHTML = b
      ? `<div class="kv"><div><span class="big">${volStr(b.Va)}</span><small>${t('вина А · {p} %', { p: nf(b.fa * 100, 1) })}</small></div><div><span class="big">${volStr(b.Vb)}</span><small>${t('вина Б · {p} %', { p: nf(b.fb * 100, 1) })}</small></div></div><p class="muted">${esc(t('Итог: {v} {u}. Смешение линейное, контракция для крепости не учтена (менее 0,1 %).', { v: nf(num(blT), 1), u: unit }))}</p>`
      : `<p class="bad">${esc(t('Нужное значение должно лежать между А и Б.'))}</p>`;
    const now = num0($('acNow')), tgt = num0($('acT')), av = num0($('acV'));
    const ac = C.acidAdjust(now, tgt, av, $('acAcid').value, $('acBase').value);
    $('acOut').innerHTML = Math.abs(tgt - now) < 0.005 ? `<p>${esc(t('Кислотность уже на месте.'))}</p>`
      : `<p class="big">${massStr(ac.grams)}</p><p>${esc(t('{a}: {g} г/л на {v}.', { a: t(ac.agent), g: nf(ac.perL, 2), v: volStr(av) }))}</p><p class="muted">${esc(ac.dir === 'up' ? t('Вносите растворённой в небольшом объёме вина, затем пробная дегустация. Подкисление снижает pH примерно на 0,1 на каждый 1 г/л.') : t('Расход стехиометрический; на практике раскисление идёт с осаждением винного камня, делайте пробу на 1 л. Не раскисляйте более чем на 2 г/л за раз.'))}</p>`;
    const pH = num0($('soPH')), free = num0($('soFree')), mol = parseFloat($('soMol').value), V = num0($('soV'));
    const need = C.freeSO2ForMolecular(mol, pH), curM = C.molecularSO2(free, pH), add = need - free;
    $('soOut').innerHTML = `<div class="kv"><div><b>${nf(curM, 2)}</b><small>${t('молекулярный сейчас, мг/л')}</small></div><div><b>${nf(need, 0)}</b><small>${t('свободный нужен, мг/л')}</small></div></div>`
      + (add > 0 ? `<p style="margin-top:8px"><span class="big">${massStr(C.kmsGrams(add, V))}</span> ${t('метабисульфита калия K₂S₂O₅')}</p><p class="muted">${esc(t('+{a} мг/л свободного SO₂. Часть свяжется: проверьте через 2–3 дня. Не превышайте общий SO₂ 200 мг/л (сладкие до 250).', { a: nf(add, 0) }))}</p>`
        : `<p style="margin-top:8px">${esc(t('Защиты хватает, добавлять SO₂ не нужно.'))}</p>`);
    const dl = C.diluteSpirit(num0($('dlV')), num0($('dlA1')), num0($('dlA2')));
    $('dlOut').innerHTML = dl
      ? `<p><span class="big">${volStr(dl.water)}</span> ${t('воды')}</p><p>${esc(t('Получится {v} крепостью {a} %, контракция {c} мл.', { v: volStr(dl.Vf), a: nf(num0($('dlA2')), 1), c: nf(dl.contraction * 1000, 0) }))}</p><p class="muted">${esc(t('По простой пропорции вышло бы {v}: ошибка {e} мл. Лейте спирт в воду, не наоборот.', { v: volStr(dl.naive), e: nf((dl.water - dl.naive) * 1000, 0) }))}</p>`
      : `<p class="bad">${esc(t('Нужная крепость должна быть ниже исходной и больше нуля.'))}</p>`;
    const sg = num0($('hySG')), hv = num0($('hyV')), ht = num0($('hyT'));
    if (sg >= 0.98 && sg <= 1.35) {
      const h = C.fromSG(sg, state.k), k = state.k, per = Math.max(0, (ht * k - h.sugar) / (1 - C.SUCROSE_L_PER_G * ht * k));
      $('hyOut').innerHTML = `<div class="kv"><div><b>${nf(h.brix, 1)}</b><small>°Brix</small></div><div><b>${nf(h.baume, 1)}</b><small>${t('°Боме')}</small></div><div><b>${nf(h.oechsle, 0)}</b><small>${t('°Эксле')}</small></div><div><b>${nf(h.sugar, 0)}</b><small>${t('сахар, г/л')}</small></div><div><b>${nf(h.potAbv, 1)}</b><small>${t('потенц. спирт, %')}</small></div></div>`
        + (per > 0 ? `<p style="margin-top:8px">${t('До {a} % добавить {m} сахара ({g} г/л).', { a: nf(ht, 1), m: B(massStr(per * hv)), g: nf(per, 0) })}</p>` : `<p class="muted" style="margin-top:8px">${esc(t('Сахара хватает на {a} %: добавка не нужна.', { a: nf(h.potAbv, 1) }))}</p>`)
        + `<p class="muted">${esc(t('Для сусла без спирта. Измерение при другой температуре даёт ошибку ≈ 0,0002 г/см³ на градус.'))}</p>`;
    } else $('hyOut').innerHTML = `<p class="bad">${esc(t('Плотность сусла обычно от 0,990 до 1,350.'))}</p>`;
  }

  /* ——— вкладки ——— */
  let currentTab = 'calc';
  function showTab(name) {
    currentTab = name;
    document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', String(x.dataset.tab === name)));
    $('panel-calc').hidden = name !== 'calc';
    $('panel-tools').hidden = name !== 'tools';
    $('panel-journal').hidden = name !== 'journal';
    if (name === 'tools') prefillTools();
    if (name === 'journal') renderJournal();
  }

  /* ——— язык ——— */
  function applyLanguage(code, { switchCurrency = true } = {}) {
    I.setLang(code);
    try { localStorage.setItem(STORE_KEY + ':lang', code); } catch (e) { /* ignore */ }
    document.documentElement.lang = code;
    I.translateDom();
    ['actionMsg', 'jMsg'].forEach(id => { const el = $(id); clearTimeout(el._t); el.textContent = ''; });
    if (switchCurrency) setCurrency(I.meta().currency);
    fillWineSelect($('wineSearch').value); fillLocalizedSelects(); fillLangSelect();
    writeForm(); render(); renderTools();
    if (currentTab === 'journal') renderJournal();
    $('mutageOut').textContent = t('Подберёт сброжённость, при которой после спирта получится целевой сахар без подсластки.');
  }

  /* ——— события ——— */
  function bind() {
    $('langSelect').addEventListener('change', e => applyLanguage(e.target.value));
    $('currency').addEventListener('change', e => { setCurrency(e.target.value); writeForm(); render(); });
    document.querySelectorAll('.tab').forEach(x => x.addEventListener('click', () => showTab(x.dataset.tab)));
    document.querySelectorAll('input[name=mode]').forEach(i => i.addEventListener('change', () => {
      state.mode = i.value;
      if (state.mode === 'must') state.sugar0 = byId(D.wines, state.wineId).must;
      writeForm(); render();
    }));
    document.querySelectorAll('input[name=calcMode]').forEach(i => i.addEventListener('change', () => {
      if (i.value === 'dose' && last && last.sol.ok && state.calcMode === 'target') state.dose = { spiritL: round(last.sol.spiritL, 3), sugarG: Math.round(last.sol.sugarG), rcsL: round(last.sol.rcsL, 3) };
      state.calcMode = i.value; writeForm(); render();
    }));
    $('wineSearch').addEventListener('input', e => fillWineSelect(e.target.value));
    $('wineSelect').addEventListener('change', e => { const w = byId(D.wines, e.target.value); state.wineId = w.id; state.wine = pickWine(w); state.sugar0 = w.must; writeForm(); render(); });
    $('resetWine').addEventListener('click', () => { const w = byId(D.wines, state.wineId); state.wine = pickWine(w); state.sugar0 = w.must; writeForm(); render(); });
    document.querySelectorAll('#wineFields input').forEach(inp => inp.addEventListener('input', () => { if (!inp.readOnly) { state.wine[inp.dataset.k] = num(inp); render(); } }));
    $('sugar0').addEventListener('input', e => { state.sugar0 = num0(e.target); $('brix').value = round(C.sugarToBrix(state.sugar0), 1); render(); });
    $('brix').addEventListener('input', e => { state.sugar0 = round(C.brixToSugar(num0(e.target)), 1); $('sugar0').value = state.sugar0; render(); });
    $('kSugar').addEventListener('input', e => { const v = num(e.target); if (v > 0) { state.k = v; render(); } });
    $('fermented').addEventListener('input', e => { state.fermented = num(e.target); render(); });
    $('volume').addEventListener('input', e => { state.volume = num(e.target); render(); });
    $('spiritSelect').addEventListener('change', e => { const s = byId(D.spirits, e.target.value); state.spiritId = s.id; if (s.id !== 'custom') state.spiritAbv = s.abv; writeForm(); render(); });
    $('spiritAbv').addEventListener('input', e => {
      state.spiritAbv = num(e.target);
      if (byId(D.spirits, state.spiritId).abv !== state.spiritAbv) { state.spiritId = 'custom'; $('spiritSelect').value = 'custom'; }
      render();
    });
    $('styleSelect').addEventListener('change', () => { state.styleId = $('styleSelect').value; applyStyle(byId(D.styles, state.styleId)); writeForm(); render(); });
    const pair = (rangeId, numId, key) => {
      $(rangeId).addEventListener('input', e => { state[key] = num(e.target); $(numId).value = state[key]; render(); });
      $(numId).addEventListener('input', e => { state[key] = num(e.target); $(rangeId).value = state[key]; render(); });
    };
    pair('targetAbvRange', 'targetAbv', 'targetAbv');
    pair('targetSugarRange', 'targetSugar', 'targetSugar');
    document.querySelectorAll('input[name=sugarSource]').forEach(i => i.addEventListener('change', () => { state.sugarSource = i.value; render(); }));
    $('rcsConc').addEventListener('input', e => { state.rcsConc = num(e.target); render(); });
    $('contraction').addEventListener('change', e => { state.contraction = e.target.checked; render(); });
    [['doseSpirit', 'spiritL'], ['doseSugar', 'sugarG'], ['doseRcs', 'rcsL']].forEach(([id, k]) => $(id).addEventListener('input', e => { state.dose[k] = num0(e.target); render(); }));
    [['priceWine', 'wine'], ['priceSpirit', 'spirit'], ['priceSugar', 'sugar'], ['priceRcs', 'rcs'], ['priceBottle', 'bottle']].forEach(([id, k]) => $(id).addEventListener('input', e => { state.prices[k] = num0(e.target); render(); }));
    $('bottleSize').addEventListener('change', e => { state.prices.size = parseFloat(e.target.value); render(); });

    $('findMutage').addEventListener('click', () => {
      const o = C.optimalMutage({ Vw: state.volume, sugar0: state.sugar0, k: state.k, as: state.spiritAbv, targetAbv: state.targetAbv, targetSugar: state.targetSugar, useContraction: state.contraction });
      const out = $('mutageOut');
      if (!o) { out.textContent = t('Не удалось подобрать: проверьте крепость спирта и цель.'); return; }
      if (!o.reachable) { out.textContent = o.reason; return; }
      state.fermented = round(o.p, 1);
      writeForm(); render();
      out.innerHTML = t('Мутаж при сброжённости {p}: сахар сусла {s}, плотность ≈ {d}. Подсластка не нужна.', { p: B(nf(o.p, 1) + ' %'), s: B(nf(o.must.sugar, 0) + ' ' + t('г/л')), d: B(nf(C.mustDensity(o.must.sugar, o.must.abv), 3)) })
        + (o.warning ? `<br><span style="color:var(--out)">${esc(o.warning)}</span>` : '');
    });

    $('cmpTable').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-spirit]'); if (!tr) return;
      const sp = byId(D.spirits, tr.dataset.spirit); state.spiritId = sp.id; if (sp.id !== 'custom') state.spiritAbv = sp.abv;
      writeForm(); render();
    });
    $('cmpTable').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('tr[data-spirit]')) e.target.click(); });

    $('printBtn').addEventListener('click', () => window.print());
    $('copyBtn').addEventListener('click', async () => {
      if (!last.sol.ok) return flash('actionMsg', t('Сначала исправьте ошибки ввода.'));
      flash('actionMsg', await copyText(recipeText(last)) ? t('Рецепт скопирован в буфер обмена.') : t('Не удалось скопировать.'));
    });
    $('shareBtn').addEventListener('click', async () => {
      const url = shareUrl(state);
      try { history.replaceState(null, '', url); } catch (e) { /* ignore */ }
      flash('actionMsg', await copyText(url) ? t('Ссылка на этот расчёт скопирована.') : t('Ссылка в адресной строке, скопируйте её вручную.'));
    });
    $('saveBtn').addEventListener('click', () => {
      if (!last.sol.ok) return flash('actionMsg', t('Сначала исправьте ошибки ввода.'));
      const j = loadJournal(); j.push(entryFromState(''));
      flash('actionMsg', saveJournal(j) ? t('Сохранено в журнал партий.') : t('Хранилище браузера недоступно.'));
      $('journalCount').textContent = j.length;
    });
    $('resetAll').addEventListener('click', () => {
      state = defaults(); $('wineSearch').value = ''; fillWineSelect();
      try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { /* ignore */ }
      writeForm(); render();
    });
    $('themeToggle').addEventListener('click', () => {
      const root = document.documentElement;
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem(STORE_KEY + ':theme', root.dataset.theme); } catch (e) { /* ignore */ }
    });

    $('panel-tools').addEventListener('input', renderTools);
    $('panel-tools').addEventListener('change', renderTools);
    $('blParam').addEventListener('change', () => { [blA.value, blB.value, blT.value] = blendDefaults($('blParam').value); renderTools(); });
    $('styleRef').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-style]'); if (!tr) return;
      state.styleId = tr.dataset.style; applyStyle(byId(D.styles, state.styleId)); writeForm(); render(); showTab('calc');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('jSave').addEventListener('click', () => {
      if (!last.sol.ok) return flash('jMsg', t('В калькуляторе ошибка ввода, сохранять нечего.'));
      const j = loadJournal(); j.push(entryFromState($('jName').value.trim()));
      flash('jMsg', saveJournal(j) ? t('Сохранено.') : t('Хранилище браузера недоступно.'));
      $('jName').value = ''; renderJournal();
    });
    $('jList').addEventListener('click', async e => {
      const btn = e.target.closest('button[data-act]'); if (!btn) return;
      const id = btn.closest('.entry').dataset.id, j = loadJournal(), entry = j.find(x => x.id === id);
      if (!entry) return;
      if (btn.dataset.act === 'open') { const s = sanitize(entry.state); if (s) { state = s; fillWineSelect(); writeForm(); render(); showTab('calc'); window.scrollTo({ top: 0 }); } }
      if (btn.dataset.act === 'dup') flash('jMsg', await copyText(shareUrl(entry.state)) ? t('Ссылка на партию скопирована.') : t('Не удалось скопировать.'));
      if (btn.dataset.act === 'del' && confirm(t('Удалить «{n}»?', { n: entry.name }))) { saveJournal(j.filter(x => x.id !== id)); renderJournal(); }
    });
    $('jExport').addEventListener('click', () => download('vinum-fortis-journal.json', JSON.stringify(loadJournal(), null, 2), 'application/json'));
    $('jCsv').addEventListener('click', () => download('vinum-fortis-journal.csv', toCSV(loadJournal()), 'text/csv;charset=utf-8'));
    $('jImport').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!Array.isArray(data)) throw new Error();
        const valid = data.filter(x => x && x.id && x.state && sanitize(x.state));
        const j = loadJournal(), ids = new Set(j.map(x => x.id));
        const added = valid.filter(x => !ids.has(x.id));
        saveJournal(j.concat(added));
        flash('jMsg', t('Импортировано партий: {n}.', { n: added.length }) + (valid.length - added.length ? ' ' + t('Пропущено дублей: {n}.', { n: valid.length - added.length }) : ''));
        renderJournal();
      } catch (err) { flash('jMsg', t('Файл не похож на экспорт журнала Vinum Fortis.')); }
      e.target.value = '';
    });
    $('jClear').addEventListener('click', () => { if (loadJournal().length && confirm(t('Удалить все партии из журнала?'))) { saveJournal([]); renderJournal(); } });
  }

  function init() {
    try { const th = localStorage.getItem(STORE_KEY + ':theme'); if (th) document.documentElement.dataset.theme = th; } catch (e) { /* ignore */ }
    I.collectDom();
    bind();
    applyLanguage(I.lang(), { switchCurrency: false });
    $('journalCount').textContent = loadJournal().length || '';
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  init();
})();
