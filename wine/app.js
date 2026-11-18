/* Vinum Fortis — интерфейс */
(function () {
  'use strict';
  const D = window.WINE_DATA, C = window.WineCalc;
  const $ = id => document.getElementById(id);
  const STORE_KEY = 'vinum-fortis:v1';
  const WINE_KEYS = ['abv', 'sugar', 'ta', 'pH', 'va', 'freeSO2', 'totalSO2', 'extract'];
  const byId = (list, id) => list.find(x => x.id === id);

  const defaults = () => {
    const w = byId(D.wines, 'touriga_nacional');
    return {
      mode: 'must', wineId: w.id, wine: pickWine(w), sugar0: w.must, fermented: 50, k: C.SUGAR_PER_ABV,
      volume: 10, spiritId: 'aguardente', spiritAbv: 77, styleId: 'port_ruby',
      targetAbv: 20, targetSugar: 100, sugarSource: 'sucrose', rcsConc: 860, contraction: true
    };
  };
  function pickWine(w) { const o = {}; WINE_KEYS.forEach(k => o[k] = w[k]); return o; }

  let state = load() || defaults();

  /* ——— хранение ——— */
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && byId(D.wines, s.wineId) && byId(D.styles, s.styleId)) return Object.assign(defaults(), s);
    } catch (e) { /* нет доступа к хранилищу */ }
    return null;
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }

  /* ——— форматирование ——— */
  const nf = (v, d = 1) => Number.isFinite(v) ? v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const vol = v => v < 1 ? { v: nf(v * 1000, 0), u: 'мл' } : { v: nf(v, 2), u: 'л' };
  const volStr = v => { const x = vol(v); return `${x.v} ${x.u}`; };
  const mass = g => g >= 1000 ? { v: nf(g / 1000, 2), u: 'кг' } : { v: nf(g, 0), u: 'г' };
  const massStr = g => { const x = mass(g); return `${x.v} ${x.u}`; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ——— цвет ——— */
  const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgb2hex = a => '#' + a.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
  const mixHex = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); };

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
    if (![...sel.options].some(o => o.value === state.wineId)) {
      const o = new Option(byId(D.wines, state.wineId).name, state.wineId); sel.prepend(o);
    }
    sel.value = state.wineId;
  }
  function fillSpiritSelect() {
    const sel = $('spiritSelect');
    D.spirits.forEach(s => sel.appendChild(new Option(s.id === 'custom' ? s.name : `${s.name} · ${s.abv} %`, s.id)));
  }
  function fillStyleSelect() {
    const sel = $('styleSelect'), groups = {};
    D.styles.forEach(s => {
      if (!groups[s.group]) { groups[s.group] = document.createElement('optgroup'); groups[s.group].label = s.group; sel.appendChild(groups[s.group]); }
      groups[s.group].appendChild(new Option(s.name, s.id));
    });
  }

  /* ——— синхронизация формы ——— */
  function writeForm() {
    document.querySelector(`input[name=mode][value=${state.mode}]`).checked = true;
    document.querySelector(`input[name=sugarSource][value=${state.sugarSource}]`).checked = true;
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
  }
  const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
  const num = el => { const v = parseFloat(String(el.value).replace(',', '.')); return Number.isFinite(v) ? v : NaN; };

  function applyStyle(style) {
    const mid = r => r[0] + (r[1] - r[0]) / 2;
    state.targetAbv = round(mid(style.abv), 1);
    state.targetSugar = Math.round(style.sugar[1] > 300 ? style.sugar[0] + 40 : mid(style.sugar));
    const sp = byId(D.spirits, style.spirit);
    if (sp) { state.spiritId = sp.id; state.spiritAbv = sp.abv; }
  }

  /* ——— расчёт ——— */
  function currentWine() {
    const w = Object.assign({}, state.wine, { volume: state.volume });
    if (state.mode === 'must') {
      const m = C.mustState(state.sugar0, state.fermented, state.k);
      w.abv = m.abv; w.sugar = m.sugar;
    }
    return w;
  }

  function compute() {
    const wine = currentWine();
    const style = byId(D.styles, state.styleId);
    const sol = C.solve({
      Vw: state.volume, aw: wine.abv, Sw: wine.sugar, as: state.spiritAbv,
      targetAbv: state.targetAbv, targetSugar: state.targetSugar,
      sugarSource: state.sugarSource, rcsConc: state.rcsConc, useContraction: state.contraction
    });
    const bad = WINE_KEYS.filter(k => !Number.isFinite(wine[k]) || wine[k] < 0);
    if (bad.length && sol.ok) { sol.ok = false; sol.errors = ['Заполните все параметры вина неотрицательными числами.']; }
    return { wine, style, sol, base: C.baseline(wine), pred: sol.ok ? C.predict(wine, sol) : null };
  }

  /* ——— рендер ——— */
  function render() {
    const r = compute();
    const wineRef = byId(D.wines, state.wineId);
    const must = state.mode === 'must';

    // карточка вина
    $('wineName').textContent = wineRef.name;
    $('wineMeta').textContent = `${D.colors[wineRef.color]} · ${wineRef.region}`;
    $('wineSwatch').style.background = wineRef.hue;
    $('mustBlock').hidden = !must;
    $('mutageBox').hidden = !must;
    ['abv', 'sugar'].forEach(k => {
      const inp = document.querySelector(`#wineFields input[data-k=${k}]`);
      inp.readOnly = must;
      if (must) inp.value = round(r.wine[k], k === 'abv' ? 2 : 1);
    });
    $('fermentedOut').textContent = `${nf(state.fermented, 1)} %`;
    if (must) $('mustNow').innerHTML = `Сейчас в сусле: сахар <b>${nf(r.wine.sugar, 0)} г/л</b>, спирт <b>${nf(r.wine.abv, 2)} %</b>, плотность ≈ <b>${nf(C.mustDensity(r.wine.sugar, r.wine.abv), 3)}</b> г/см³.`;
    $('rcsField').hidden = state.sugarSource !== 'rcs';

    // стиль
    const st = r.style;
    const rng = (a, u) => a ? `${a[0]}–${a[1]} ${u}` : '';
    let sc = `<div class="ranges"><span>спирт ${rng(st.abv, '%')}</span><span>сахар ${rng(st.sugar, 'г/л')}</span>${st.ta ? `<span>ТК ${rng(st.ta, 'г/л')}</span>` : ''}<span>${st.method === 'mutage' ? 'мутаж при брожении' : 'крепление готового вина'}</span></div><p>${esc(st.notes)}</p>`;
    if (st.method === 'mutage' && !must && st.id !== 'custom') sc += `<p class="warn">Этот стиль традиционно делают мутажем: попробуйте режим «Бродящее сусло».</p>`;
    if (st.colors.length && !st.colors.includes(wineRef.color) && wineRef.id !== 'custom') sc += `<p class="warn">Обычно его делают из вин типа «${st.colors.map(c => D.colors[c].toLowerCase()).join(', ')}».</p>`;
    $('styleCard').innerHTML = sc;

    // ошибки
    const errBox = $('errors');
    errBox.hidden = r.sol.ok;
    errBox.innerHTML = r.sol.ok ? '' : r.sol.errors.map(e => `<p>${esc(e)}</p>`).join('');

    renderRecipe(r);
    renderTable(r);
    renderNotes(r);
    renderStage(r);
    save();
  }

  function renderRecipe(r) {
    const box = $('recipe'), proc = $('procedure');
    if (!r.sol.ok) { box.innerHTML = ''; proc.innerHTML = ''; return; }
    const s = r.sol, spirit = byId(D.spirits, state.spiritId);
    const sv = vol(s.spiritL), fv = vol(s.Vf);
    const doses = [
      { k: 'Спирт ' + nf(state.spiritAbv, 1) + ' %', v: sv.v, u: sv.u, s: `${nf(s.absAlcoholL, 2)} л безводного · ${nf(s.spiritL / state.volume * 100, 1)} % к вину`, c: 'var(--brass)' }
    ];
    if (state.sugarSource === 'sucrose') { const m = mass(s.sugarG); doses.push({ k: 'Сахар (сахароза)', v: m.v, u: m.u, s: `${nf(state.volume ? s.sugarG / state.volume : 0, 1)} г на литр вина`, c: 'var(--oak)' }); }
    else { const x = vol(s.rcsL); doses.push({ k: `Концентрат сусла ${state.rcsConc} г/л`, v: x.v, u: x.u, s: `${massStr(s.rcsL * state.rcsConc)} сахара`, c: 'var(--oak)' }); }
    doses.push({ k: 'Итоговый объём', v: fv.v, u: fv.u, s: state.contraction ? `контракция −${nf(s.contractionL * 1000, 0)} мл` : 'без учёта контракции', c: 'var(--garnet)' });
    box.innerHTML = doses.map(d => `<div class="dose" style="--c:${d.c}"><div class="k">${esc(d.k)}</div><div class="v">${d.v}<small>${d.u}</small></div><div class="s">${d.s}</div></div>`).join('');

    const steps = [];
    const sweet = state.sugarSource === 'sucrose' ? s.sugarG > 0.5 : s.rcsL > 0.0005;
    const sweetText = state.sugarSource === 'sucrose'
      ? `Растворите <b>${massStr(s.sugarG)}</b> сахара в 2–3 л вина, подогретого до 30–35 °C, и верните сироп в ёмкость.`
      : `Внесите <b>${volStr(s.rcsL)}</b> концентрата сусла, перемешайте.`;
    if (state.mode === 'must') {
      steps.push(`Ведите брожение до сброжённости <b>${nf(state.fermented, 1)} %</b>: сахар ≈ <b>${nf(r.wine.sugar, 0)} г/л</b>, плотность ≈ <b>${nf(C.mustDensity(r.wine.sugar, r.wine.abv), 3)}</b>. Контролируйте ареометром каждые 4–6 часов.`);
      if (s.spiritL > 0) steps.push(`Быстро внесите <b>${volStr(s.spiritL)}</b> спирта «${esc(spirit.name)}», сразу и тщательно перемешайте: дрожжи остановятся при ≥ 15–16 %.`);
      if (sweet) steps.push(sweetText);
    } else {
      if (sweet) steps.push(sweetText);
      if (s.spiritL > 0) steps.push(`Внесите <b>${volStr(s.spiritL)}</b> спирта «${esc(spirit.name)}» в 2–3 приёма, перемешивая. Спирт лейте в вино, а не наоборот.`);
    }
    steps.push(`Через 24–48 ч смесь «сядет»: проверьте крепость спиртомером. Ожидаемо <b>${nf(s.abv, 1)} %</b> и <b>${nf(s.sugar, 0)} г/л</b>.`);
    steps.push('Отдых 3–4 недели при 10–15 °C, снятие с осадка, при необходимости оклейка и фильтрация.');
    steps.push(`Выдержка: ${esc(r.style.aging)}.`);
    proc.innerHTML = steps.map(t => `<li>${t}</li>`).join('');
  }

  const ROWS = [
    ['Крепость', 'abv', '% об.', 1, 'abv'],
    ['Сахар', 'sugar', 'г/л', 0, 'sugar'],
    ['Титруемая кислотность', 'ta', 'г/л', 2, 'ta'],
    ['pH (оценка)', 'pH', '', 2, 'pH'],
    ['Летучая кислотность', 'va', 'г/л', 2],
    ['SO₂ свободный', 'freeSO2', 'мг/л', 0],
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
    if (ch.abv === 'out' || ch.sugar === 'out') items.push(['warn', `Цель по крепости или сахару вне диапазона «${r.style.name}». Нажмите на стиль ещё раз, чтобы вернуть типовые значения.`]);
    if (r.pred.dilution < 0.8) items.push(['warn', `Вино разбавляется на ${nf((1 - r.pred.dilution) * 100, 0)} %: кислотность, экстракт и аромат пропорционально ослабнут.`]);
    if (state.contraction && r.sol.contractionL > 0) items.push(['', `Контракция: смесь потеряет около ${nf(r.sol.contractionL * 1000, 0)} мл объёма. Расчёт это уже учёл.`]);
    if (state.mode === 'must' && r.wine.abv > 15) items.push(['warn', 'Крепость сусла уже выше 15 %: брожение, скорее всего, остановилось само. Проверьте фактический сахар.']);
    if (!items.length || items.every(i => i[0] === '')) items.unshift(['good', `Параметры укладываются в «${r.style.name}». Вино будет ${r.pred.sweetness}, СКИ ${nf(r.pred.sugarAcid, 1)}.`]);
    ul.innerHTML = items.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('');
  }

  function renderStage(r) {
    const wineRef = byId(D.wines, state.wineId), st = r.style;
    const ok = !!r.pred;
    const abv = ok ? r.pred.abv : r.wine.abv, sugar = ok ? r.pred.sugar : r.wine.sugar;
    // цвет: сорт → тон стиля → темнее от сахара
    let color = mixHex(wineRef.hue, st.tint, st.tintWeight || 0);
    color = mixHex(color, '#1a0705', Math.min(0.35, sugar / 900));
    const surface = mixHex(color, '#ffffff', 0.18);
    $('liquidBody').style.fill = color;
    $('meniscus').style.fill = surface;
    // уровень: объём относительно исходного
    const ratio = ok ? r.sol.Vf / state.volume : 1;
    const fill = Math.min(0.92, 0.58 * ratio); // доля высоты чаши (20…165)
    const y = 165 - (165 - 20) * fill;
    $('liquid').style.transform = `translateY(${y}px)`;
    $('glassCaption').textContent = ok ? `${volStr(r.sol.Vf)} · ${r.pred.sweetness}` : 'проверьте ввод';

    // ареометр
    const pos = v => `${Math.max(0, Math.min(100, v / 25 * 100))}%`;
    $('hydroBefore').style.left = pos(r.wine.abv);
    $('hydroBefore').firstElementChild.textContent = `${nf(r.wine.abv, 1)} %`;
    $('hydroAfter').style.left = pos(abv);
    $('hydroAfter').firstElementChild.textContent = `${nf(abv, 1)} %`;
    $('hydroBand').style.left = pos(st.abv[0]);
    $('hydroBand').style.width = `calc(${pos(st.abv[1])} - ${pos(st.abv[0])})`;

    // этикетка
    $('labelStyle').textContent = st.id === 'custom' ? 'Креплёное вино' : st.name;
    $('labelWine').textContent = wineRef.name;
    $('labelAbv').textContent = nf(abv, 1);
    $('labelSugar').textContent = nf(sugar, 0);
    const v = vol(ok ? r.sol.Vf : state.volume);
    $('labelVol').textContent = v.v; $('labelVolUnit').textContent = v.u === 'л' ? 'литров' : 'миллилитров';
    $('labelFoot').textContent = ok ? `${r.pred.sweetness[0].toUpperCase() + r.pred.sweetness.slice(1)} · ${wineRef.region.split(' · ')[0]} · MMXXVI` : '';
  }

  /* ——— события ——— */
  function bind() {
    document.querySelectorAll('input[name=mode]').forEach(i => i.addEventListener('change', () => {
      state.mode = i.value;
      if (state.mode === 'must') state.sugar0 = byId(D.wines, state.wineId).must;
      writeForm(); render();
    }));
    $('wineSearch').addEventListener('input', e => fillWineSelect(e.target.value));
    $('wineSelect').addEventListener('change', e => {
      const w = byId(D.wines, e.target.value);
      state.wineId = w.id; state.wine = pickWine(w); state.sugar0 = w.must;
      writeForm(); render();
    });
    $('resetWine').addEventListener('click', () => {
      const w = byId(D.wines, state.wineId); state.wine = pickWine(w); state.sugar0 = w.must;
      writeForm(); render();
    });
    document.querySelectorAll('#wineFields input').forEach(inp => inp.addEventListener('input', () => {
      if (inp.readOnly) return;
      state.wine[inp.dataset.k] = num(inp); render();
    }));
    $('sugar0').addEventListener('input', e => { state.sugar0 = num(e.target) || 0; $('brix').value = round(C.sugarToBrix(state.sugar0), 1); render(); });
    $('brix').addEventListener('input', e => { state.sugar0 = round(C.brixToSugar(num(e.target) || 0), 1); $('sugar0').value = state.sugar0; render(); });
    $('kSugar').addEventListener('input', e => { const v = num(e.target); if (v > 0) { state.k = v; render(); } });
    $('fermented').addEventListener('input', e => { state.fermented = num(e.target); render(); });
    $('volume').addEventListener('input', e => { state.volume = num(e.target); render(); });
    $('spiritSelect').addEventListener('change', e => {
      const s = byId(D.spirits, e.target.value); state.spiritId = s.id;
      if (s.id !== 'custom') state.spiritAbv = s.abv;
      writeForm(); render();
    });
    $('spiritAbv').addEventListener('input', e => {
      state.spiritAbv = num(e.target);
      const s = byId(D.spirits, state.spiritId);
      if (s.abv !== state.spiritAbv) { state.spiritId = 'custom'; $('spiritSelect').value = 'custom'; }
      render();
    });
    const pickStyle = () => { applyStyle(byId(D.styles, $('styleSelect').value)); state.styleId = $('styleSelect').value; writeForm(); render(); };
    $('styleSelect').addEventListener('change', pickStyle);
    const pair = (rangeId, numId, key) => {
      $(rangeId).addEventListener('input', e => { state[key] = num(e.target); $(numId).value = state[key]; render(); });
      $(numId).addEventListener('input', e => { state[key] = num(e.target); $(rangeId).value = state[key]; render(); });
    };
    pair('targetAbvRange', 'targetAbv', 'targetAbv');
    pair('targetSugarRange', 'targetSugar', 'targetSugar');
    document.querySelectorAll('input[name=sugarSource]').forEach(i => i.addEventListener('change', () => { state.sugarSource = i.value; render(); }));
    $('rcsConc').addEventListener('input', e => { state.rcsConc = num(e.target); render(); });
    $('contraction').addEventListener('change', e => { state.contraction = e.target.checked; render(); });
    $('findMutage').addEventListener('click', () => {
      const o = C.optimalMutage({ Vw: state.volume, sugar0: state.sugar0, k: state.k, as: state.spiritAbv, targetAbv: state.targetAbv, targetSugar: state.targetSugar, useContraction: state.contraction });
      const out = $('mutageOut');
      if (!o) { out.textContent = 'Не удалось подобрать: проверьте крепость спирта и цель.'; return; }
      if (!o.reachable) { out.textContent = o.reason; return; }
      state.fermented = round(o.p, 1);
      writeForm(); render();
      out.innerHTML = `Мутаж при сброжённости <b>${nf(o.p, 1)} %</b>: сахар сусла <b>${nf(o.must.sugar, 0)} г/л</b>, плотность ≈ <b>${nf(C.mustDensity(o.must.sugar, o.must.abv), 3)}</b>. Подсластка не нужна.`;
    });
    $('printBtn').addEventListener('click', () => window.print());
    $('resetAll').addEventListener('click', () => { state = defaults(); $('wineSearch').value = ''; fillWineSelect(); writeForm(); render(); });
    $('themeToggle').addEventListener('click', () => {
      const root = document.documentElement;
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem(STORE_KEY + ':theme', root.dataset.theme); } catch (e) { /* ignore */ }
    });
  }

  function init() {
    try { const t = localStorage.getItem(STORE_KEY + ':theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
    fillWineSelect(); fillSpiritSelect(); fillStyleSelect();
    writeForm(); bind(); render();
  }
  init();
})();
