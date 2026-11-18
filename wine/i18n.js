/* Vinum Fortis — локализация.
 * Исходный язык — русский: русская строка служит ключом. keys.js даёт каждой строке короткий id,
 * словари языков (i18n/<код>.js) переводят по id. Названия сортов и регионов переводятся
 * отдельными словарями names-*.js по русскому тексту (общий для языков на латинице). */
(function (root) {
  'use strict';
  const I = root.I18N = root.I18N || {};
  I.langs = [
    { code: 'ru', name: 'Русский', locale: 'ru-RU', currency: 'RUB', names: null },
    { code: 'uk', name: 'Українська', locale: 'uk-UA', currency: 'UAH', names: 'uk' },
    { code: 'en', name: 'English', locale: 'en-US', currency: 'USD', names: 'latin' },
    { code: 'fr', name: 'Français', locale: 'fr-FR', currency: 'EUR', names: 'latin' },
    { code: 'es', name: 'Español', locale: 'es-ES', currency: 'EUR', names: 'latin' },
    { code: 'it', name: 'Italiano', locale: 'it-IT', currency: 'EUR', names: 'latin' },
    { code: 'de', name: 'Deutsch', locale: 'de-DE', currency: 'EUR', names: 'latin' },
    { code: 'pt', name: 'Português', locale: 'pt-PT', currency: 'EUR', names: 'latin' },
    { code: 'ka', name: 'ქართული', locale: 'ka-GE', currency: 'GEL', names: 'ka' }
  ];
  I.keys = I.keys || {};     // id -> русский текст
  I.packs = I.packs || {};   // код -> { id: перевод }
  I.names = I.names || {};   // группа -> { русский: перевод }

  let cur = 'ru', index = null;
  const meta = () => I.langs.find(l => l.code === cur);
  I.meta = meta;
  I.lang = () => cur;
  I.has = code => I.langs.some(l => l.code === code);
  I.setLang = code => { if (I.has(code)) cur = code; };

  function buildIndex() { index = {}; Object.entries(I.keys).forEach(([id, ru]) => { index[ru] = id; }); }
  function fmtNum(v) { return v.toLocaleString(meta().locale, { maximumFractionDigits: 2 }); }
  function interpolate(s, p) {
    return s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? (typeof p[k] === 'number' ? fmtNum(p[k]) : String(p[k])) : m));
  }
  function lookup(ru) {
    if (cur === 'ru') return ru;
    if (!index) buildIndex();
    const id = index[ru], pack = I.packs[cur];
    if (id && pack && pack[id] != null) return pack[id];
    const g = meta().names, n = g && I.names[g];
    if (n && n[ru] != null) return n[ru];
    if (id === undefined && root.console && root.location && /[?&]i18ndebug/.test(root.location.search)) console.warn('i18n: нет ключа', ru);
    return ru;
  }
  I.t = (ru, p) => { const s = lookup(ru); return p ? interpolate(s, p) : s; };
  /* Названия: «Бордо · Крым» переводится по частям. */
  I.tn = ru => String(ru).split(' · ').map(lookup).join(' · ');

  /* Статический текст страницы: запоминаем русские оригиналы и переводим по запросу. */
  const CYR = /[А-Яа-яЁё]/;
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  let nodes = [], attrs = [];
  I.collectDom = (rootEl = document.body) => {
    const w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.parentElement && !n.parentElement.closest('script,style,[data-no-i18n]') && CYR.test(n.nodeValue)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    let n;
    while ((n = w.nextNode())) {
      const m = n.nodeValue.match(/^(\s*)([\s\S]*?)(\s*)$/);
      nodes.push({ n, lead: m[1], ru: m[2].replace(/\s+/g, ' '), trail: m[3] });
    }
    rootEl.querySelectorAll('*').forEach(el => ATTRS.forEach(a => {
      const v = el.getAttribute(a);
      if (v && CYR.test(v)) attrs.push({ el, a, ru: v });
    }));
  };
  I.translateDom = () => {
    nodes.forEach(x => { if (x.n.isConnected) x.n.nodeValue = x.lead + I.t(x.ru) + x.trail; });
    attrs.forEach(x => { if (x.el.isConnected) x.el.setAttribute(x.a, I.t(x.ru)); });
    const d = document.querySelector('meta[name=description]');
    if (d) { d.__ru = d.__ru || d.content; d.content = I.t(d.__ru); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
