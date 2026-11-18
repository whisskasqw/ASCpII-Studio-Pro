/* Vinum Fortis — интерфейс */
(function () {
  'use strict';
  const D = window.WINE_DATA, C = window.WineCalc;
  const $ = id => document.getElementById(id);
  const STORE_KEY = 'vinum-fortis:v1';
  const JOURNAL_KEY = 'vinum-fortis:journal';
  const WINE_KEYS = ['abv', 'sugar', 'ta', 'pH', 'va', 'freeSO2', 'totalSO2', 'extract'];
  const byId = (list, id) => list.find(x => x.id === id);

  const defaults = () => {
    const w = byId(D.wines, 'touriga_nacional');
    return {
      mode: 'must', calcMode: 'target', wineId: w.id, wine: pickWine(w), sugar0: w.must, fermented: 50, k: C.SUGAR_PER_ABV,
      volume: 10, spiritId: 'aguardente', spiritAbv: 77, styleId: 'port_ruby',
      targetAbv: 20, targetSugar: 100, sugarSource: 'sucrose', rcsConc: 860, contraction: true,
      dose: { spiritL: 2.2, sugarG: 0, rcsL: 0 },
      prices: { wine: 250, spirit: 600, sugar: 90, rcs: 350, bottle: 70, size: 0.75 }
    };
  };
  function pickWine(w) { const o = {}; WINE_KEYS.forEach(k => o[k] = w[k]); return o; }
  function sanitize(s) {
    if (!s || typeof s !== 'object' || !byId(D.wines, s.wineId) || !byId(D.styles, s.styleId) || !byId(D.spirits, s.spiritId)) return null;
    const d = defaults();
    return Object.assign(d, s, {
      wine: Object.assign(d.wine, s.wine), dose: Object.assign(d.dose, s.dose), prices: Object.assign(d.prices, s.prices)
    });
  }

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
      const json = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
      return sanitize(JSON.parse(json));
    } catch (e) { return null; }
  }

  /* ——— форматирование ——— */
  const nf = (v, d = 1) => Number.isFinite(v) ? v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const vol = v => v < 1 ? { v: nf(v * 1000, 0), u: 'мл' } : { v: nf(v, 2), u: 'л' };
  const volStr = v => { const x = vol(v); return `${x.v} ${x.u}`; };
  const mass = g => g >= 1000 ? { v: nf(g / 1000, 2), u: 'кг' } : { v: nf(g, g < 10 ? 1 : 0), u: 'г' };
  const massStr = g => { const x = mass(g); return `${x.v} ${x.u}`; };
  const rub = v => `${nf(v, 0)} ₽`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
  const num = el => { const v = parseFloat(String(el.value).replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
  const num0 = el => { const v = num(el); return Number.isFinite(v) ? v : 0; };

  /* ——— цвет ——— */
  const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgb2hex = a => '#' + a.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
  const mixHex = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const wineColor = (wineRef, style, sugar) => mixHex(mixHex(wineRef.hue, style.tint, style.tintWeight || 0), '#1a0705', Math.min(0.35, sugar / 900));

  /* ——— наполнение селектов ——— */
  function fillWineSelect(filter = '') {
    const sel = $('wineSelect'), f = filter.trim().toLowerCase();
    sel.innerHTML = '';
    Object.entries(D.colors).forEach(([c, title]) => {
      const items = D.wines.filter(w => w.color === c && (!f || (w.name + ' ' + w.region).toLowerCase().includes(f) || w.id === 'custom'));
      if (!items.length) return;
      const g = document.createElement('optgroup'); g.label = title;
      items.forEach(w => g.appendChild(new Option(w.name, w.id)));
      sel.appendChild(g);
    });
    if (![...sel.options].some(o => o.value === state.wineId)) sel.prepend(new Option(byId(D.wines, state.wineId).name, state.wineId));
    sel.value = state.wineId;
  }
  function fillStatic() {
    D.spirits.forEach(s => $('spiritSelect').appendChild(new Option(s.id === 'custom' ? s.name : `${s.name} · ${s.abv} %`, s.id)));
    const groups = {};
    D.styles.forEach(s => {
      if (!groups[s.group]) { groups[s.group] = document.createElement('optgroup'); groups[s.group].label = s.group; $('styleSelect').appendChild(groups[s.group]); }
      groups[s.group].appendChild(new Option(s.name, s.id));
    });
    Object.entries(C.ACIDS).forEach(([k, a]) => $('acAcid').appendChild(new Option(a.name, k)));
    Object.entries(C.BASES).forEach(([k, b]) => $('acBase').appendChild(new Option(b.name, k)));
    $('styleRef').querySelector('tbody').innerHTML = D.styles.filter(s => s.id !== 'custom').map(s =>
      `<tr data-style="${s.id}"><td>${esc(s.name)}</td><td class="num">${s.abv[0]}–${s.abv[1]} %</td><td class="num">${s.sugar[0]}–${s.sugar[1]}</td><td>${s.method === 'mutage' ? 'мутаж' : 'готовое вино'}</td></tr>`).join('');
  }

  /* ——— синхронизация формы ——— */
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
  }

  function applyStyle(style) {
    const mid = r => r[0] + (r[1] - r[0]) / 2;
    state.targetAbv = round(mid(style.abv), 1);
    state.targetSugar = Math.round(style.sugar[1] <= 10 ? style.sugar[0] : style.sugar[1] > 300 ? style.sugar[0] + 40 : mid(style.sugar));
    const sp = byId(D.spirits, style.spirit);
    if (sp) { state.spiritId = sp.id; state.spiritAbv = sp.abv; }
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
      ? C.forward(Object.assign(common, {
          spiritL: state.dose.spiritL,
          sugarG: state.sugarSource === 'sucrose' ? state.dose.sugarG : 0,
          rcsL: state.sugarSource === 'rcs' ? state.dose.rcsL : 0
        }))
      : C.solve(Object.assign(common, { targetAbv: state.targetAbv, targetSugar: state.targetSugar, sugarSource: state.sugarSource }));
    const bad = WINE_KEYS.filter(k => !Number.isFinite(wine[k]) || wine[k] < 0);
    if (bad.length && sol.ok) { sol.ok = false; sol.errors = ['Заполните все параметры вина неотрицательными числами.']; }
    return { wine, style, sol, base: C.baseline(wine), pred: sol.ok ? C.predict(wine, sol) : null };
  }

  /* ——— рендер ——— */
  let last = null;
  function render() {
    const r = last = compute();
    const wineRef = byId(D.wines, state.wineId);
    const must = state.mode === 'must', dose = state.calcMode === 'dose';

    $('wineName').textContent = wineRef.name;
    $('wineMeta').textContent = `${D.colors[wineRef.color]} · ${wineRef.region}`;
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
    if (must) $('mustNow').innerHTML = `Сейчас в сусле: сахар <b>${nf(r.wine.sugar, 0)} г/л</b>, спирт <b>${nf(r.wine.abv, 2)} %</b>, плотность ≈ <b>${nf(C.mustDensity(r.wine.sugar, r.wine.abv), 3)}</b> г/см³.`;
    $('rcsField').hidden = state.sugarSource !== 'rcs';
    $('doseBlock').hidden = !dose;
    $('targetBlock').hidden = dose;
    $('doseSugarField').hidden = state.sugarSource !== 'sucrose';
    $('doseRcsField').hidden = state.sugarSource !== 'rcs';

    const st = r.style, rng = (a, u) => a ? `${a[0]}–${a[1]} ${u}` : '';
    let sc = `<div class="ranges"><span>спирт ${rng(st.abv, '%')}</span><span>сахар ${rng(st.sugar, 'г/л')}</span>${st.ta ? `<span>ТК ${rng(st.ta, 'г/л')}</span>` : ''}<span>${st.method === 'mutage' ? 'мутаж при брожении' : 'крепление готового вина'}</span></div><p>${esc(st.notes)}</p>`;
    if (st.method === 'mutage' && !must && st.id !== 'custom') sc += `<p class="warn">Этот стиль традиционно делают мутажем: попробуйте режим «Бродящее сусло».</p>`;
    if (st.colors.length && !st.colors.includes(wineRef.color) && wineRef.id !== 'custom') sc += `<p class="warn">Обычно его делают из вин типа «${st.colors.map(c => D.colors[c].toLowerCase()).join(', ')}».</p>`;
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
    const s = r.sol, spirit = byId(D.spirits, state.spiritId);
    const sv = vol(s.spiritL), fv = vol(s.Vf);
    const doses = [{ k: 'Спирт ' + nf(state.spiritAbv, 1) + ' %', v: sv.v, u: sv.u, s: `${nf(s.absAlcoholL, 2)} л безводного · ${nf(s.spiritL / state.volume * 100, 1)} % к вину`, c: 'var(--brass)' }];
    if (state.sugarSource === 'sucrose') { const m = mass(s.sugarG); doses.push({ k: 'Сахар (сахароза)', v: m.v, u: m.u, s: `${nf(s.sugarG / state.volume, 1)} г на литр вина`, c: 'var(--oak)' }); }
    else { const x = vol(s.rcsL); doses.push({ k: `Концентрат сусла ${state.rcsConc} г/л`, v: x.v, u: x.u, s: `${massStr(s.rcsL * state.rcsConc)} сахара`, c: 'var(--oak)' }); }
    const bottles = Math.floor(s.Vf / state.prices.size + 1e-9);
    doses.push({ k: 'Итоговый объём', v: fv.v, u: fv.u, s: `${bottles} бут. × ${nf(state.prices.size, state.prices.size < 1 ? 3 : 1)} л${state.contraction ? ` · контракция −${nf(s.contractionL * 1000, 0)} мл` : ''}`, c: 'var(--garnet)' });
    box.innerHTML = doses.map(d => `<div class="dose" style="--c:${d.c}"><div class="k">${esc(d.k)}</div><div class="v">${d.v}<small>${d.u}</small></div><div class="s">${d.s}</div></div>`).join('');
    proc.innerHTML = procedureSteps(r).map(t => `<li>${t}</li>`).join('');
  }

  function procedureSteps(r, plain = false) {
    const s = r.sol, spirit = byId(D.spirits, state.spiritId);
    const B = plain ? (x => x) : (x => `<b>${x}</b>`);
    const q = plain ? (x => x) : esc;
    const steps = [];
    const sweet = state.sugarSource === 'sucrose' ? s.sugarG > 0.5 : s.rcsL > 0.0005;
    const sweetText = state.sugarSource === 'sucrose'
      ? `Растворите ${B(massStr(s.sugarG))} сахара в 2–3 л вина, подогретого до 30–35 °C, и верните сироп в ёмкость.`
      : `Внесите ${B(volStr(s.rcsL))} концентрата сусла, перемешайте.`;
    if (state.mode === 'must') {
      steps.push(`Ведите брожение до сброжённости ${B(nf(state.fermented, 1) + ' %')}: сахар ≈ ${B(nf(r.wine.sugar, 0) + ' г/л')}, плотность ≈ ${B(nf(C.mustDensity(r.wine.sugar, r.wine.abv), 3))}. Контролируйте ареометром каждые 4–6 часов.`);
      if (s.spiritL > 0) steps.push(`Быстро внесите ${B(volStr(s.spiritL))} спирта «${q(spirit.name)}» (${nf(state.spiritAbv, 1)} %), сразу и тщательно перемешайте: дрожжи остановятся при ≥ 15–16 %.`);
      if (sweet) steps.push(sweetText);
    } else {
      if (sweet) steps.push(sweetText);
      if (s.spiritL > 0) steps.push(`Внесите ${B(volStr(s.spiritL))} спирта «${q(spirit.name)}» (${nf(state.spiritAbv, 1)} %) в 2–3 приёма, перемешивая. Спирт лейте в вино, а не наоборот.`);
    }
    steps.push(`Через 24–48 ч смесь «сядет»: проверьте крепость спиртомером. Ожидаемо ${B(nf(s.abv, 1) + ' %')} и ${B(nf(s.sugar, 0) + ' г/л')}.`);
    steps.push('Отдых 3–4 недели при 10–15 °C, снятие с осадка, при необходимости оклейка и фильтрация.');
    steps.push(`Выдержка: ${q(r.style.aging)}.`);
    return steps;
  }

  const ROWS = [
    ['Крепость', 'abv', '% об.', 1, 'abv'],
    ['Сахар', 'sugar', 'г/л', 0, 'sugar'],
    ['Титруемая кислотность', 'ta', 'г/л', 2, 'ta'],
    ['pH (оценка)', 'pH', '', 2, 'pH'],
    ['Летучая кислотность', 'va', 'г/л', 2],
    ['SO₂ свободный', 'freeSO2', 'мг/л', 0],
    ['SO₂ молекулярный', 'molSO2', 'мг/л', 2],
    ['SO₂ общий', 'totalSO2', 'мг/л', 0],
    ['Приведённый экстракт', 'extract', 'г/л', 1],
    ['Общий экстракт', 'totalExtract', 'г/л', 0],
    ['Плотность при 20 °C', 'density', 'г/см³', 4],
    ['Кажущийся °Brix', 'brix', '°Bx', 1],
    ['Боме', 'baume', '°Bé', 1],
    ['Энергия', 'kcal', 'ккал/100 мл', 0],
    ['Сахарно-кислотный индекс', 'sugarAcid', '', 1],
    ['Категория сладости', 'sweetness', '', null]
  ];
  const STATUS = { ok: 'в стиле', near: 'рядом', out: 'вне стиля' };

  function renderTable(r) {
    const tb = document.querySelector('#params tbody');
    if (!r.pred) { tb.innerHTML = ''; return; }
    const check = C.styleCheck(r.pred, r.style);
    tb.innerHTML = ROWS.map(([label, k, unit, d, rk]) => {
      const b = r.base[k], a = r.pred[k];
      const fmt = v => d === null ? esc(v) : nf(v, d);
      let delta = '';
      if (d !== null && Number.isFinite(a) && Math.abs(a - b) >= 0.5 * 10 ** -d) delta = `<span class="delta">${a > b ? '+' : '−'}${nf(Math.abs(a - b), d)}</span>`;
      const stc = rk && check[rk] ? `<span class="chip ${check[rk]}">${STATUS[check[rk]]}</span>` : '<span class="chip none">—</span>';
      return `<tr><td>${label}</td><td class="num before">${fmt(b)}${unit ? `<span class="unit">${unit}</span>` : ''}</td><td class="num after">${fmt(a)}${delta}</td><td>${stc}</td></tr>`;
    }).join('');
  }

  function renderNotes(r) {
    const ul = $('notes');
    if (!r.pred) { ul.innerHTML = ''; return; }
    const items = [];
    r.sol.warnings.forEach(w => items.push(['warn', w]));
    C.recommendations(r.pred, r.style, r.sol.Vf).forEach(t => items.push(['', t]));
    const ch = C.styleCheck(r.pred, r.style);
    if (ch.abv === 'out' || ch.sugar === 'out') items.push(['warn', state.calcMode === 'dose'
      ? `С такими дозами вино не попадает в «${r.style.name}» (крепость ${nf(r.pred.abv, 1)} %, сахар ${nf(r.pred.sugar, 0)} г/л).`
      : `Цель по крепости или сахару вне диапазона «${r.style.name}». Выберите стиль заново, чтобы вернуть типовые значения.`]);
    if (r.pred.dilution < 0.8) items.push(['warn', `Вино разбавляется на ${nf((1 - r.pred.dilution) * 100, 0)} %: кислотность, экстракт и аромат пропорционально ослабнут.`]);
    if (state.contraction && r.sol.contractionL > 0) items.push(['', `Контракция: смесь потеряет около ${nf(r.sol.contractionL * 1000, 0)} мл объёма. Расчёт это уже учёл.`]);
    if (state.mode === 'must' && r.wine.abv > 15) items.push(['warn', 'Крепость сусла уже выше 15 %: брожение, скорее всего, остановилось само. Проверьте фактический сахар.']);
    if (r.pred.abv >= 15 && r.pred.abv < 16 && r.pred.sugar > 50) items.push(['warn', 'При 15–16 % и высоком сахаре вино не застраховано от вторичного брожения: держите молекулярный SO₂ ≥ 0.6 мг/л или поднимите крепость.']);
    if (!items.some(i => i[0] === 'warn')) items.unshift(['good', `Параметры укладываются в «${r.style.name}». Вино будет ${r.pred.sweetness}, СКИ ${nf(r.pred.sugarAcid, 1)}.`]);
    ul.innerHTML = items.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('');
  }

  function renderStage(r) {
    const wineRef = byId(D.wines, state.wineId), st = r.style, ok = !!r.pred;
    const abv = ok ? r.pred.abv : r.wine.abv, sugar = ok ? r.pred.sugar : r.wine.sugar;
    const color = wineColor(wineRef, st, sugar);
    $('liquidBody').style.fill = color;
    $('meniscus').style.fill = mixHex(color, '#ffffff', 0.18);
    const ratio = ok ? r.sol.Vf / state.volume : 1;
    const fill = Math.min(0.92, 0.58 * ratio);
    $('liquid').style.transform = `translateY(${165 - 145 * fill}px)`;
    $('glassCaption').textContent = ok ? `${volStr(r.sol.Vf)} · ${r.pred.sweetness}` : 'проверьте ввод';
    const pos = v => `${Math.max(0, Math.min(100, v / 25 * 100))}%`;
    $('hydroBefore').style.left = pos(r.wine.abv);
    $('hydroBefore').firstElementChild.textContent = `${nf(r.wine.abv, 1)} %`;
    $('hydroAfter').style.left = pos(abv);
    $('hydroAfter').firstElementChild.textContent = `${nf(abv, 1)} %`;
    $('hydroBand').style.left = pos(st.abv[0]);
    $('hydroBand').style.width = `calc(${pos(st.abv[1])} - ${pos(st.abv[0])})`;
    $('labelStyle').textContent = st.id === 'custom' ? 'Креплёное вино' : st.name;
    $('labelWine').textContent = wineRef.name;
    $('labelAbv').textContent = nf(abv, 1);
    $('labelSugar').textContent = nf(sugar, 0);
    const v = vol(ok ? r.sol.Vf : state.volume);
    $('labelVol').textContent = v.v; $('labelVolUnit').textContent = v.u === 'л' ? 'литров' : 'миллилитров';
    $('labelFoot').textContent = ok ? `${r.pred.sweetness[0].toUpperCase() + r.pred.sweetness.slice(1)} · ${wineRef.region.split(' · ')[0]} · MMXXVI` : '';
  }

  /* сравнение спиртов: тот же итог (крепость и сахар) разными спиртами */
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
      const cur = sp.id === state.spiritId ? ' current' : '';
      if (!res) return `<tr class="disabled${cur}"><td>${esc(sp.name)} · ${nf(sp.abv, 1)} %</td><td colspan="5">слабее цели ${nf(A, 1)} %, не подходит</td></tr>`;
      const share = state.volume / res.Vf * 100, ta = r.wine.ta * state.volume / res.Vf;
      return `<tr class="${cur.trim()}" data-spirit="${sp.id}" tabindex="0"><td>${esc(sp.name)} · ${nf(sp.abv, 1)} %</td><td class="num"><span class="bar" style="width:${Math.max(4, res.spiritL / maxV * 60)}px"></span>${volStr(res.spiritL)}</td><td class="num">${volStr(res.Vf)}</td><td class="num">${nf(share, 0)} %</td><td class="num">${nf(ta, 2)}</td><td class="num">${nf(res.absAlcoholL, 2)} л</td></tr>`;
    }).join('');
  }

  /* себестоимость */
  // вино ведёт (акцент), остальное — ступени нейтральной шкалы
  const COST_COLORS = { wine: 'var(--garnet)', spirit: 'var(--ink-soft)', sugar: 'var(--ink-muted)', rcs: 'color-mix(in srgb, var(--ink) 40%, transparent)', bottles: 'color-mix(in srgb, var(--ink) 22%, transparent)' };
  const COST_NAMES = { wine: 'Вино / сусло', spirit: 'Спирт', sugar: 'Сахар', rcs: 'Концентрат', bottles: 'Бутылки' };
  function renderCost(r) {
    const out = $('costOut'), bar = $('costBar');
    if (!r.sol.ok) { out.innerHTML = ''; bar.innerHTML = ''; return; }
    const P = state.prices;
    const c = C.cost({ Vw: state.volume, wineL: P.wine, spiritL: r.sol.spiritL, spiritPrice: P.spirit, sugarG: r.sol.sugarG, sugarPrice: P.sugar, rcsL: r.sol.rcsL, rcsPrice: P.rcs, Vf: r.sol.Vf, bottle: P.size, bottlePrice: P.bottle });
    out.innerHTML = [
      ['Вся партия', rub(c.total), `${nf(r.sol.Vf, 2)} л готового вина`, 'var(--garnet)'],
      ['Литр', rub(c.perL), 'без учёта розлива: ' + rub((c.total - c.parts.bottles) / r.sol.Vf), 'var(--brass)'],
      ['Бутылка', c.bottles ? rub(c.perBottle) : '—', `${c.bottles} шт.${c.rest > 0.005 ? ` + остаток ${volStr(c.rest)}` : ''}`, 'var(--oak)']
    ].map(([k, v, s, col]) => `<div class="dose" style="--c:${col}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');
    const total = c.total || 1;
    bar.innerHTML = Object.entries(c.parts).filter(([, v]) => v > 0).map(([k, v]) => `<span style="width:${v / total * 100}%;background:${COST_COLORS[k]}" title="${COST_NAMES[k]}: ${rub(v)}"></span>`).join('');
    let lg = bar.nextElementSibling;
    if (!lg || !lg.classList.contains('cost-legend')) { lg = document.createElement('div'); lg.className = 'cost-legend'; bar.after(lg); }
    lg.innerHTML = Object.entries(c.parts).filter(([, v]) => v > 0).map(([k, v]) => `<span><i style="background:${COST_COLORS[k]}"></i>${COST_NAMES[k]} ${rub(v)} · ${nf(v / total * 100, 0)} %</span>`).join('');
  }

  /* график мутажа */
  function renderChart(r) {
    const svg = $('mutageChart');
    const target = state.calcMode === 'dose' && r.sol.ok ? r.sol.abv : state.targetAbv;
    const pts = C.mutageCurve({ Vw: state.volume, sugar0: state.sugar0, k: state.k, as: state.spiritAbv, targetAbv: target, useContraction: state.contraction, steps: 80 });
    if (pts.length < 2) { svg.innerHTML = `<text x="320" y="125" text-anchor="middle" class="axis-title">Нет данных: проверьте сахар сусла и крепость спирта</text>`; return; }
    const W = 640, H = 250, m = { l: 48, r: 52, t: 18, b: 38 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const xMax = 100;
    const sMax = Math.ceil(Math.max(pts[0].sugar, state.targetSugar, r.style.sugar[1] > 400 ? 0 : r.style.sugar[1]) / 50) * 50 || 50;
    const vMax = Math.max(...pts.map(p => p.spiritL)) * 1.1;
    const X = p => m.l + p / xMax * pw, Y = s => m.t + ph - Math.min(s, sMax) / sMax * ph, Y2 = v => m.t + ph - v / vMax * ph;
    let g = '';
    for (let i = 0; i <= 5; i++) { const s = sMax * i / 5; g += `<line class="grid-line" x1="${m.l}" x2="${W - m.r}" y1="${Y(s)}" y2="${Y(s)}"/><text class="axis-text" x="${m.l - 8}" y="${Y(s) + 3.5}" text-anchor="end">${nf(s, 0)}</text><text class="axis-text" x="${W - m.r + 8}" y="${Y(s) + 3.5}">${nf(vMax * i / 5, vMax < 1 ? 2 : 1)}</text>`; }
    for (let p = 0; p <= 100; p += 20) g += `<text class="axis-text" x="${X(p)}" y="${H - m.b + 16}" text-anchor="middle">${p}</text>`;
    g += `<text class="axis-title" x="${m.l + pw / 2}" y="${H - 4}" text-anchor="middle">сброжённость сусла, %</text>`;
    g += `<text class="axis-title" x="${m.l - 40}" y="${m.t - 6}">г/л</text><text class="axis-title" x="${W - 4}" y="${m.t - 6}" text-anchor="end">л спирта</text>`;
    const band = r.style.sugar;
    if (band && band[0] < sMax) g += `<rect class="band" x="${m.l}" width="${pw}" y="${Y(Math.min(band[1], sMax))}" height="${Y(band[0]) - Y(Math.min(band[1], sMax))}"/>`;
    if (state.calcMode === 'target' && state.targetSugar <= sMax) g += `<line class="target-line" x1="${m.l}" x2="${W - m.r}" y1="${Y(state.targetSugar)}" y2="${Y(state.targetSugar)}"/><text class="lbl target" x="${m.l + 6}" y="${Y(state.targetSugar) - 5}">цель ${state.targetSugar} г/л</text>`;
    const path = (fy, key) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.p).toFixed(1)},${fy(p[key]).toFixed(1)}`).join('');
    g += `<path class="s-spirit" d="${path(Y2, 'spiritL')}"/><path class="s-sugar" d="${path(Y, 'sugar')}"/>`;
    const lastP = pts[pts.length - 1];
    g += `<text class="lbl sugar" x="${Math.min(X(lastP.p) + 6, W - m.r - 70)}" y="${Y(lastP.sugar) - 6}">сахар</text>`;
    const midP = pts[Math.floor(pts.length * 0.15)];
    g += `<text class="lbl spirit" x="${X(midP.p) + 4}" y="${Y2(midP.spiritL) - 8}">доза спирта</text>`;
    const cur = state.fermented;
    if (cur <= lastP.p && r.sol.ok) {
      const cp = C.mustState(state.sugar0, cur, state.k);
      const cs = C.solve({ Vw: state.volume, aw: cp.abv, Sw: cp.sugar, as: state.spiritAbv, targetAbv: target, targetSugar: 0, useContraction: state.contraction });
      if (cs.ok) g += `<line class="now-line" x1="${X(cur)}" x2="${X(cur)}" y1="${m.t}" y2="${m.t + ph}"/><circle class="dot-spirit" cx="${X(cur)}" cy="${Y2(cs.spiritL)}" r="5"/><circle class="dot-sugar" cx="${X(cur)}" cy="${Y(cs.sugar)}" r="5.5"/><text class="axis-text" x="${X(cur) + 6}" y="${m.t + 10}">сейчас ${nf(cur, 0)} %</text>`;
    }
    g += `<rect class="hit" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/>`;
    svg.innerHTML = g;
    svg.querySelector('.hit').addEventListener('click', e => {
      const box = svg.getBoundingClientRect();
      const x = (e.clientX - box.left) / box.width * W;
      state.fermented = round(Math.max(0, Math.min(100, (x - m.l) / pw * 100)), 1);
      writeForm(); render();
    });
  }

  /* ——— текст рецепта ——— */
  function recipeText(r) {
    const wineRef = byId(D.wines, state.wineId), s = r.sol;
    const L = [];
    L.push(`VINUM FORTIS · ${r.style.name}`);
    L.push(`Основа: ${wineRef.name}, ${nf(state.volume, 2)} л (${state.mode === 'must' ? `сусло ${nf(state.sugar0, 0)} г/л, сброжено ${nf(state.fermented, 1)} %` : `${nf(r.wine.abv, 1)} %, ${nf(r.wine.sugar, 0)} г/л`})`);
    L.push(`Спирт: ${byId(D.spirits, state.spiritId).name}, ${nf(state.spiritAbv, 1)} % — ${volStr(s.spiritL)}`);
    if (s.sugarG > 0) L.push(`Сахар: ${massStr(s.sugarG)}`);
    if (s.rcsL > 0) L.push(`Концентрат сусла: ${volStr(s.rcsL)}`);
    L.push(`Итог: ${volStr(s.Vf)}, ${nf(s.abv, 1)} % об., ${nf(s.sugar, 0)} г/л сахара, ТК ${nf(r.pred.ta, 1)} г/л, pH ≈ ${nf(r.pred.pH, 2)}`);
    L.push('');
    procedureSteps(r, true).forEach((t, i) => L.push(`${i + 1}. ${t}`));
    return L.join('\n');
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
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
      name: name || `${r.style.name} · ${wineRef.name}`,
      date: new Date().toISOString(),
      state: JSON.parse(JSON.stringify(state)),
      summary: {
        style: r.style.name, wine: wineRef.name, hue: wineColor(wineRef, r.style, r.sol.sugar),
        abv: r.sol.abv, sugar: r.sol.sugar, Vf: r.sol.Vf, volume: state.volume,
        spirit: byId(D.spirits, state.spiritId).name, spiritAbv: state.spiritAbv, spiritL: r.sol.spiritL,
        sugarG: r.sol.sugarG, rcsL: r.sol.rcsL, ta: r.pred.ta, pH: r.pred.pH
      }
    };
  }
  function renderJournal() {
    const j = loadJournal();
    $('journalCount').textContent = j.length || '';
    const list = $('jList');
    if (!j.length) { list.innerHTML = '<div class="empty">Журнал пуст. Сохраните первый расчёт.</div>'; return; }
    list.innerHTML = j.slice().reverse().map(e => {
      const s = e.summary || {};
      const d = new Date(e.date);
      return `<article class="card entry" style="--hue:${esc(s.hue || '#8c1c2c')}" data-id="${esc(e.id)}">
        <h3>${esc(e.name)}</h3>
        <div class="meta">${esc(s.style || '')} · ${esc(s.wine || '')} · ${isNaN(d) ? '' : d.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        <div class="figs"><span>${nf(s.abv, 1)}<small>%</small></span><span>${nf(s.sugar, 0)}<small>г/л</small></span><span>${nf(s.Vf, 2)}<small>л</small></span><span>${nf(s.ta, 1)}<small>ТК</small></span></div>
        <div class="meta" style="margin:8px 0 0">${esc(s.spirit || '')} ${nf(s.spiritAbv, 1)} %: ${volStr(s.spiritL || 0)}${s.sugarG > 0 ? ` · сахар ${massStr(s.sugarG)}` : ''}${s.rcsL > 0 ? ` · РКС ${volStr(s.rcsL)}` : ''}</div>
        <div class="row"><button class="btn" data-act="open">Открыть</button><button class="btn-ghost" data-act="dup">Ссылка</button><button class="btn-ghost danger" data-act="del">Удалить</button></div>
      </article>`;
    }).join('');
  }
  function toCSV(j) {
    const cols = [['name', 'Партия'], ['date', 'Дата'], ['style', 'Стиль'], ['wine', 'Вино'], ['volume', 'Объём вина, л'], ['spirit', 'Спирт'], ['spiritAbv', 'Крепость спирта, %'], ['spiritL', 'Спирт, л'], ['sugarG', 'Сахар, г'], ['rcsL', 'РКС, л'], ['Vf', 'Итог, л'], ['abv', 'Спирт, %'], ['sugar', 'Сахар, г/л'], ['ta', 'ТК, г/л'], ['pH', 'pH']];
    const cell = v => { const t = typeof v === 'number' ? String(round(v, 3)).replace('.', ',') : String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    return '﻿' + [cols.map(c => c[1]).join(';')].concat(j.map(e => cols.map(([k]) => cell(k === 'name' || k === 'date' ? e[k] : (e.summary || {})[k])).join(';'))).join('\n');
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
  function prefillTools() {
    if (toolsPrefilled || !last) return;
    toolsPrefilled = true;
    const r = last, p = r.pred || r.base, V = r.sol.ok ? r.sol.Vf : state.volume;
    $('blA').value = round(r.wine.sugar, 1); $('blB').value = 250; $('blT').value = state.targetSugar; $('blV').value = round(state.volume, 1);
    $('acNow').value = round(p.ta, 2); $('acT').value = r.style.ta ? round((r.style.ta[0] + r.style.ta[1]) / 2, 1) : round(p.ta, 1); $('acV').value = round(V, 2);
    $('soPH').value = round(p.pH, 2); $('soFree').value = Math.round(p.freeSO2); $('soV').value = round(V, 2);
    $('dlV').value = 1; $('dlA1').value = state.spiritAbv; $('dlA2').value = Math.max(1, Math.min(70, round(state.spiritAbv - 10, 0)));
    $('hySG').value = round(C.mustDensity(state.sugar0, 0), 3); $('hyV').value = state.volume; $('hyT').value = 13;
    renderTools();
  }
  function renderTools() {
    // купаж
    const prm = $('blParam').value, unit = { sugar: 'г/л', abv: '% об.', ta: 'г/л' }[prm];
    const b = C.blend2(num(blA), num(blB), num(blT), num0($('blV')));
    $('blOut').innerHTML = b
      ? `<div class="kv"><div><span class="big">${volStr(b.Va)}</span><small>вина А · ${nf(b.fa * 100, 1)} %</small></div><div><span class="big">${volStr(b.Vb)}</span><small>вина Б · ${nf(b.fb * 100, 1)} %</small></div></div><p class="muted">Итог ${nf(num(blT), 1)} ${unit}. Смешение линейное, контракция для крепости не учтена (менее 0,1 %).</p>`
      : `<p class="bad">Нужное значение должно лежать между А и Б.</p>`;
    // кислотность
    const ac = C.acidAdjust(num0($('acNow')), num0($('acT')), num0($('acV')), $('acAcid').value, $('acBase').value);
    $('acOut').innerHTML = Math.abs(num0($('acT')) - num0($('acNow'))) < 0.005 ? '<p>Кислотность уже на месте.</p>'
      : `<p class="big">${massStr(ac.grams)}</p><p>${esc(ac.agent)}: ${nf(ac.perL, 2)} г/л на ${volStr(num0($('acV')))}.</p><p class="muted">${ac.dir === 'up' ? 'Вносите растворённой в небольшом объёме вина, затем пробная дегустация. Подкисление снижает pH примерно на 0,1 на каждый 1 г/л.' : 'Расход стехиометрический; на практике раскисление идёт с осаждением винного камня, делайте пробу на 1 л. Не раскисляйте более чем на 2 г/л за раз.'}</p>`;
    // SO2
    const pH = num0($('soPH')), free = num0($('soFree')), mol = parseFloat($('soMol').value), V = num0($('soV'));
    const need = C.freeSO2ForMolecular(mol, pH), cur = C.molecularSO2(free, pH);
    const add = need - free, g = C.kmsGrams(add, V);
    $('soOut').innerHTML = `<div class="kv"><div><b>${nf(cur, 2)}</b><small>молекулярный сейчас, мг/л</small></div><div><b>${nf(need, 0)}</b><small>свободный нужен, мг/л</small></div></div>`
      + (add > 0 ? `<p style="margin-top:8px"><span class="big">${massStr(g)}</span> метабисульфита калия K₂S₂O₅</p><p class="muted">+${nf(add, 0)} мг/л свободного SO₂. Часть свяжется: проверьте через 2–3 дня. Не превышайте общий SO₂ 200 мг/л (сладкие до 250).</p>`
        : '<p style="margin-top:8px">Защиты хватает, добавлять SO₂ не нужно.</p>');
    // разведение
    const dl = C.diluteSpirit(num0($('dlV')), num0($('dlA1')), num0($('dlA2')));
    $('dlOut').innerHTML = dl
      ? `<p><span class="big">${volStr(dl.water)}</span> воды</p><p>Получится ${volStr(dl.Vf)} крепостью ${nf(num0($('dlA2')), 1)} %, контракция ${nf(dl.contraction * 1000, 0)} мл.</p><p class="muted">По простой пропорции вышло бы ${volStr(dl.naive)}: ошибка ${nf((dl.water - dl.naive) * 1000, 0)} мл. Лейте спирт в воду, не наоборот.</p>`
      : '<p class="bad">Нужная крепость должна быть ниже исходной и больше нуля.</p>';
    // ареометр
    const sg = num0($('hySG')), hv = num0($('hyV')), ht = num0($('hyT'));
    if (sg >= 0.98 && sg <= 1.35) {
      const h = C.fromSG(sg, state.k);
      const k = state.k, per = Math.max(0, (ht * k - h.sugar) / (1 - C.SUCROSE_L_PER_G * ht * k));
      $('hyOut').innerHTML = `<div class="kv"><div><b>${nf(h.brix, 1)}</b><small>°Brix</small></div><div><b>${nf(h.baume, 1)}</b><small>°Боме</small></div><div><b>${nf(h.oechsle, 0)}</b><small>°Эксле</small></div><div><b>${nf(h.sugar, 0)}</b><small>сахар, г/л</small></div><div><b>${nf(h.potAbv, 1)}</b><small>потенц. спирт, %</small></div></div>`
        + (per > 0 ? `<p style="margin-top:8px">До ${nf(ht, 1)} % добавить <b>${massStr(per * hv)}</b> сахара (${nf(per, 0)} г/л).</p>` : `<p class="muted" style="margin-top:8px">Сахара хватает на ${nf(h.potAbv, 1)} %: добавка не нужна.</p>`)
        + '<p class="muted">Для сусла без спирта. Измерение при другой температуре даёт ошибку ≈ 0,0002 г/см³ на градус.</p>';
    } else $('hyOut').innerHTML = '<p class="bad">Плотность сусла обычно от 0,990 до 1,350.</p>';
  }
  const blA = $('blA'), blB = $('blB'), blT = $('blT');

  /* ——— вкладки ——— */
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $('panel-calc').hidden = name !== 'calc';
    $('panel-tools').hidden = name !== 'tools';
    $('panel-journal').hidden = name !== 'journal';
    if (name === 'tools') prefillTools();
    if (name === 'journal') renderJournal();
  }

  /* ——— события ——— */
  function bind() {
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
    document.querySelectorAll('input[name=mode]').forEach(i => i.addEventListener('change', () => {
      state.mode = i.value;
      if (state.mode === 'must') state.sugar0 = byId(D.wines, state.wineId).must;
      writeForm(); render();
    }));
    document.querySelectorAll('input[name=calcMode]').forEach(i => i.addEventListener('change', () => {
      if (i.value === 'dose' && last && last.sol.ok && state.calcMode === 'target') {
        state.dose = { spiritL: round(last.sol.spiritL, 3), sugarG: Math.round(last.sol.sugarG), rcsL: round(last.sol.rcsL, 3) };
      }
      state.calcMode = i.value; writeForm(); render();
    }));
    $('wineSearch').addEventListener('input', e => fillWineSelect(e.target.value));
    $('wineSelect').addEventListener('change', e => {
      const w = byId(D.wines, e.target.value);
      state.wineId = w.id; state.wine = pickWine(w); state.sugar0 = w.must;
      writeForm(); render();
    });
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
      if (!o) { out.textContent = 'Не удалось подобрать: проверьте крепость спирта и цель.'; return; }
      if (!o.reachable) { out.textContent = o.reason; return; }
      state.fermented = round(o.p, 1);
      writeForm(); render();
      out.innerHTML = `Мутаж при сброжённости <b>${nf(o.p, 1)} %</b>: сахар сусла <b>${nf(o.must.sugar, 0)} г/л</b>, плотность ≈ <b>${nf(C.mustDensity(o.must.sugar, o.must.abv), 3)}</b>. Подсластка не нужна.`;
    });

    $('cmpTable').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-spirit]'); if (!tr) return;
      const sp = byId(D.spirits, tr.dataset.spirit); state.spiritId = sp.id; if (sp.id !== 'custom') state.spiritAbv = sp.abv;
      writeForm(); render();
    });
    $('cmpTable').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('tr[data-spirit]')) e.target.click(); });

    $('printBtn').addEventListener('click', () => window.print());
    $('copyBtn').addEventListener('click', async () => {
      if (!last.sol.ok) return flash('actionMsg', 'Сначала исправьте ошибки ввода.');
      flash('actionMsg', await copyText(recipeText(last)) ? 'Рецепт скопирован в буфер обмена.' : 'Не удалось скопировать.');
    });
    $('shareBtn').addEventListener('click', async () => {
      const url = shareUrl(state);
      history.replaceState(null, '', url);
      flash('actionMsg', await copyText(url) ? 'Ссылка на этот расчёт скопирована.' : 'Ссылка в адресной строке, скопируйте её вручную.');
    });
    $('saveBtn').addEventListener('click', () => {
      if (!last.sol.ok) return flash('actionMsg', 'Сначала исправьте ошибки ввода.');
      const j = loadJournal(); j.push(entryFromState('')); 
      flash('actionMsg', saveJournal(j) ? 'Сохранено в журнал партий.' : 'Хранилище браузера недоступно.');
      $('journalCount').textContent = j.length;
    });
    $('resetAll').addEventListener('click', () => { state = defaults(); $('wineSearch').value = ''; fillWineSelect(); history.replaceState(null, '', location.href.split('#')[0]); writeForm(); render(); });
    $('themeToggle').addEventListener('click', () => {
      const root = document.documentElement;
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem(STORE_KEY + ':theme', root.dataset.theme); } catch (e) { /* ignore */ }
    });

    // мастерская
    $('panel-tools').addEventListener('input', renderTools);
    $('panel-tools').addEventListener('change', renderTools);
    $('blParam').addEventListener('change', () => {
      const r = last, p = $('blParam').value;
      const vals = { sugar: [r.wine.sugar, 250, state.targetSugar], abv: [r.wine.abv, 20, state.targetAbv], ta: [r.wine.ta, 9, r.style.ta ? (r.style.ta[0] + r.style.ta[1]) / 2 : r.wine.ta] }[p];
      [blA.value, blB.value, blT.value] = vals.map(v => round(v, 1));
      renderTools();
    });
    $('styleRef').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-style]'); if (!tr) return;
      state.styleId = tr.dataset.style; applyStyle(byId(D.styles, state.styleId)); writeForm(); render(); showTab('calc');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // журнал
    $('jSave').addEventListener('click', () => {
      if (!last.sol.ok) return flash('jMsg', 'В калькуляторе ошибка ввода, сохранять нечего.');
      const j = loadJournal(); j.push(entryFromState($('jName').value.trim()));
      flash('jMsg', saveJournal(j) ? 'Сохранено.' : 'Хранилище браузера недоступно.');
      $('jName').value = ''; renderJournal();
    });
    $('jList').addEventListener('click', async e => {
      const btn = e.target.closest('button[data-act]'); if (!btn) return;
      const id = btn.closest('.entry').dataset.id, j = loadJournal(), entry = j.find(x => x.id === id);
      if (!entry) return;
      if (btn.dataset.act === 'open') { const s = sanitize(entry.state); if (s) { state = s; fillWineSelect(); writeForm(); render(); showTab('calc'); window.scrollTo({ top: 0 }); } }
      if (btn.dataset.act === 'dup') flash('jMsg', await copyText(shareUrl(entry.state)) ? 'Ссылка на партию скопирована.' : 'Не удалось скопировать.');
      if (btn.dataset.act === 'del' && confirm(`Удалить «${entry.name}»?`)) { saveJournal(j.filter(x => x.id !== id)); renderJournal(); }
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
        flash('jMsg', `Импортировано партий: ${added.length}${valid.length - added.length ? `, пропущено дублей: ${valid.length - added.length}` : ''}.`);
        renderJournal();
      } catch (err) { flash('jMsg', 'Файл не похож на экспорт журнала Vinum Fortis.'); }
      e.target.value = '';
    });
    $('jClear').addEventListener('click', () => { if (loadJournal().length && confirm('Удалить все партии из журнала?')) { saveJournal([]); renderJournal(); } });
  }

  function init() {
    try { const t = localStorage.getItem(STORE_KEY + ':theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
    fillWineSelect(); fillStatic();
    writeForm(); bind(); render();
    $('journalCount').textContent = loadJournal().length || '';
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  init();
})();
