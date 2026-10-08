'use strict';

/* =========================================================
   Klientska zóna – denné návyky (kroky, voda, spánok)
   Karta „Dnešné návyky“ na Prehľade aj v Progrese (nad 14-dňovým prehľadom).
   Ciele nastavuje tréner (posielajú sa v zdieľaných dátach), zápis sa ukladá
   do cloudu (shared/{kód}/habits/{dátum}) – tréner ho vidí v detaile klienta.
   V ukážke (DEMO) sa ukladá len v zariadení.
   ========================================================= */
const HB_DEMO_KEY = 'klient-habits-demo';
const hb = { code: null, data: new Map(), loaded: false, timers: new Map(), saved: '' };
const hbGoals = () => TRAINER?.habits || (isDemo() ? { steps: 8000, water: 2, sleep: 7 } : null);
const HB_ROWS = [
  ['steps', 'Kroky', '', 1000, 0, 100000],
  ['water', 'Voda', 'l', 0.25, 0, 10],
  ['sleep', 'Spánok', 'h', 0.5, 0, 24]
];
const HB_IC = {
  steps: '<path d="M8.5 13.5c-1.6.2-2.6-1-2.8-2.9-.3-2.3.4-5 2.2-5.3 1.7-.2 2.6 2.1 2.7 4.1.1 2.3-.5 3.9-2.1 4.1zM6.3 15.6l3.9-.5.4 2.6a2 2 0 0 1-3.9.6zM15.5 9.5c1.6.2 2.6-1 2.8-2.9.3-2.3-.4-5-2.2-5.3-1.7-.2-2.6 2.1-2.7 4.1-.1 2.3.5 3.9 2.1 4.1zM17.7 11.6l-3.9-.5-.4 2.6a2 2 0 0 0 3.9.6z"/>',
  water: '<path d="M12 3.5s6 6.4 6 10.6a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z"/><path d="M9.2 14.5a2.9 2.9 0 0 0 2.6 2.7"/>',
  sleep: '<path d="M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1z"/>'
};
const hbIc = (k) => `<span class="hb-ic" aria-hidden="true"><svg viewBox="0 0 24 24">${HB_IC[k]}</svg></span>`;
const hbFmt = (k, v) => (v == null ? '–' : k === 'steps' ? fmtNum(v, 0) : fmtNum(v, 2));
const hbDay = (d) => hb.data.get(d) || {};

/* ---------- Načítanie a uloženie ---------- */
async function hbLoad() {
  const code = client() ? authCode : null;
  if (!code || !hbGoals()) return;
  if (hb.code === code && hb.loaded) return;
  hb.code = code; hb.loaded = true; hb.data = new Map();
  if (isDemo()) {
    try { Object.entries(JSON.parse(localStorage.getItem(HB_DEMO_KEY) || '{}')).forEach(([d, v]) => hb.data.set(d, v)); } catch (e) { /* ok */ }
    if (!hb.data.size) for (let i = 1; i <= 6; i++) hb.data.set(addDays(today(), -i), { steps: 5000 + ((i * 1733) % 6000), water: 1.25 + (i % 4) * 0.25, sleep: 6 + (i % 3) * 0.5 });
    hbRefreshUi();
    return;
  }
  try {
    await cloudReady();
    const list = await window.clientCloud.listHabits(code, addDays(today(), -13));
    for (const h of list) if (typeof h.date === 'string') hb.data.set(h.date, { steps: h.steps ?? null, water: h.water ?? null, sleep: h.sleep ?? null });
    hbRefreshUi();
  } catch (e) { hb.loaded = false; }
}
function hbSave(d) {
  clearTimeout(hb.timers.get(d));
  hb.timers.set(d, setTimeout(async () => {
    const v = hbDay(d);
    const data = {};
    for (const [k] of HB_ROWS) if (typeof v[k] === 'number') data[k] = v[k];
    const st = document.getElementById('hb-state');
    if (isDemo()) {
      try { localStorage.setItem(HB_DEMO_KEY, JSON.stringify(Object.fromEntries(hb.data))); } catch (e) { /* ok */ }
      if (st) st.textContent = 'Uložené';
      return;
    }
    if (st) st.textContent = 'Ukladám…';
    try {
      await cloudReady();
      await window.clientCloud.saveHabit(authCode, TRAINER.ownerUid, d, data);
      const s2 = document.getElementById('hb-state'); if (s2) s2.textContent = 'Uložené – tréner to vidí';
    } catch (e) {
      const s2 = document.getElementById('hb-state');
      if (s2) s2.textContent = e?.code === 'permission-denied' ? 'Nepodarilo sa uložiť – tréner ešte nezapol návyky.' : 'Nepodarilo sa uložiť – skontroluj internet.';
    }
  }, 700));
}
function hbSet(d, k, v) {
  const row = HB_ROWS.find((r) => r[0] === k);
  if (!row) return;
  const cur = { ...hbDay(d) };
  cur[k] = v == null ? null : Math.min(row[5], Math.max(row[4], Math.round(v * 100) / 100));
  hb.data.set(d, cur);
  hbRefreshUi();
  hbSave(d);
}

/* ---------- Karta na Prehľade ---------- */
function hbCardHtml() {
  const g = hbGoals();
  const d = today();
  const v = hbDay(d);
  const week = Array.from({ length: 7 }, (_, i) => addDays(d, i - 6));
  const score = (day) => HB_ROWS.filter(([k]) => typeof hbDay(day)[k] === 'number' && hbDay(day)[k] >= g[k]).length;
  return `<section class="card hb-card" id="hb-card">
    <div class="card-head"><h2>Dnešné návyky</h2><span class="muted hb-state" id="hb-state"></span></div>
    ${HB_ROWS.map(([k, label, unit, step]) => {
      const val = v[k];
      const pct = typeof val === 'number' ? Math.min(100, (val / g[k]) * 100) : 0;
      const goal = k === 'steps' ? fmtNum(g[k], 0) : `${fmtNum(g[k], 2)} ${unit}`;
      return `<div class="hb-row${pct >= 100 ? ' done' : ''}" data-hb-row="${k}">
        ${hbIc(k)}
        <div class="hb-main"><div class="hb-top"><b>${label}</b><span class="hb-val">${k === 'steps'
          ? `<input class="hb-input" data-hb-input="steps" inputmode="numeric" placeholder="0" value="${typeof val === 'number' ? val : ''}" aria-label="Kroky dnes">`
          : `<span data-hb-show="${k}">${hbFmt(k, val)}</span>`}<small> / ${goal}</small></span></div>
          <div class="hb-bar"><i style="width:${pct}%"></i></div></div>
        ${k === 'steps' ? '' : `<div class="hb-step"><button type="button" data-hb-step="${k}" data-d="-${step}" aria-label="Menej">−</button><button type="button" data-hb-step="${k}" data-d="${step}" aria-label="Viac">+</button></div>`}
      </div>`;
    }).join('')}
    <div class="hb-week" aria-label="Posledných 7 dní">${week.map((day) => `<span class="hb-day${day === d ? ' today' : ''}" title="${fmtShort(day)}"><i class="s${score(day)}"></i><small>${DAYS_SHORT[weekday(day)]}</small></span>`).join('')}</div>
  </section>`;
}
function hbRefreshUi() {
  const card = document.getElementById('hb-card');
  if (card) {
    const a = document.activeElement;
    const typing = a?.dataset?.hbInput;
    const st = document.getElementById('hb-state')?.textContent || '';
    if (typing) {
      // počas písania neprekresľovať pole – len pruh postupu
      const g = hbGoals(); const v = hbDay(today()).steps;
      const bar = card.querySelector('[data-hb-row="steps"] .hb-bar i');
      if (bar) bar.style.width = `${typeof v === 'number' ? Math.min(100, (v / g.steps) * 100) : 0}%`;
    } else {
      card.outerHTML = hbCardHtml();
      const s2 = document.getElementById('hb-state'); if (s2) s2.textContent = st;
    }
  }
  const prog = document.getElementById('hb-progress');
  if (prog) prog.outerHTML = hbProgressHtml();
}

/* ---------- Progres: 14 dní ---------- */
function hbProgressHtml() {
  const g = hbGoals();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13));
  return `<section class="card" id="hb-progress">
    <div class="card-head"><h2>Návyky · 14 dní</h2></div>
    ${HB_ROWS.map(([k, label, unit]) => {
      const vals = days.map((d) => hbDay(d)[k]);
      const filled = vals.filter((x) => typeof x === 'number');
      const avg = filled.length ? filled.reduce((a, b) => a + b, 0) / filled.length : null;
      const max = Math.max(g[k] * 1.3, ...filled);
      if (!filled.length) return `<div class="hb-chart"><div class="hb-chart-head">${hbIc(k)}<b>${label}</b><span class="muted">zatiaľ nič</span></div></div>`;
      return `<div class="hb-chart"><div class="hb-chart-head">${hbIc(k)}<b>${label}</b><span class="muted">${avg == null ? 'zatiaľ nič' : `priemer ${hbFmt(k, Math.round(avg * 10) / 10)}${unit ? ' ' + unit : ''}`}</span></div>
        <div class="hb-bars" style="--goal:${(g[k] / max) * 100}%">${vals.map((x, i) => `<span class="${typeof x === 'number' && x >= g[k] ? 'ok' : ''}${days[i] === today() ? ' today' : ''}" style="height:${typeof x === 'number' ? Math.max(4, (x / max) * 100) : 0}%" title="${fmtShort(days[i])}: ${hbFmt(k, x)}"></span>`).join('')}</div></div>`;
    }).join('')}
    <p class="hint" style="margin:6px 0 0">${HB_ROWS.some(([k]) => days.some((d) => typeof hbDay(d)[k] === 'number')) ? 'Čiara = cieľ od trénera' : 'Graf sa ukáže, keď vyššie zapíšeš prvé hodnoty.'}</p>
  </section>`;
}

/* ---------- Ovládanie ---------- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-hb-step]');
  if (!b) return;
  const k = b.dataset.hbStep;
  const cur = hbDay(today())[k];
  hbSet(today(), k, Math.max(0, (typeof cur === 'number' ? cur : 0) + Number(b.dataset.d)));
});
document.addEventListener('input', (e) => {
  if (e.target.dataset?.hbInput !== 'steps') return;
  const raw = e.target.value.replace(/\D/g, '');
  if (raw !== e.target.value) e.target.value = raw;
  hbSet(today(), 'steps', raw === '' ? null : Number(raw));
});
document.addEventListener('focusout', (e) => { if (e.target.dataset?.hbInput) setTimeout(hbRefreshUi, 0); });

const renderWithoutHabits = render;
render = function (...args) {
  // ak klient práve píše kroky, po prekreslení (napr. živá aktualizácia od trénera) mu vrátime kurzor
  const typing = document.activeElement?.dataset?.hbInput;
  const r = renderWithoutHabits.apply(this, args);
  if (client() && hbGoals()) {
    hbLoad();
    const main = document.getElementById('main');
    if (route() === '' && !document.getElementById('hb-card')) {
      const anchor = main?.querySelector('.stats') || main?.querySelector('.hero');
      anchor?.insertAdjacentHTML('afterend', hbCardHtml());
    }
    if (route() === 'progress' && !document.getElementById('hb-progress')) main?.insertAdjacentHTML('beforeend', hbCardHtml() + hbProgressHtml());
    if (typing) {
      const inp = document.querySelector(`[data-hb-input="${typing}"]`);
      if (inp && document.activeElement !== inp) { inp.focus({ preventScroll: true }); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
  }
  return r;
};
if (client()) render();
