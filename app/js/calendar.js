'use strict';

/* =========================================================
   Klientska zóna – kalendár tréningov (záložka Tréningy)
   Režimy: Zoznam (pôvodný), Týždeň (časová os ako v Google kalendári)
   a Mesiac (mriežka s bodkami + detail dňa). Vidieť vlastné tréningy,
   žiadosti čakajúce na potvrdenie a voľné termíny trénera – ťuknutím
   na voľné miesto sa rovno pripraví žiadosť o tréning.
   ========================================================= */
const KCAL_KEY = 'klient-cal-mode';
const KC_START = 6, KC_END = 22, KC_HOUR = 46;
const KC_MONTHS = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];
let kcalMode = 'list';
try { kcalMode = localStorage.getItem(KCAL_KEY) || 'list'; } catch (e) { /* ok */ }
let kcalFocus = today();

const kcIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const kcWeekStart = (d) => addDays(d, -weekday(d));
const kcMonthStart = (d) => `${d.slice(0, 7)}-01`;
const kcAddMonths = (d, n) => { const x = parseDate(kcMonthStart(d)); x.setMonth(x.getMonth() + n); return kcIso(x); };
const kcTop = (t) => ((toMin(t) - KC_START * 60) / 60) * KC_HOUR;

// čo sa v daný deň deje: moje tréningy (bez zrušených) a moje žiadosti čakajúce na trénera
const kcSessions = (d) => mySessions().filter((s) => s.date === d && s.status !== 'cancelled');
const kcRequests = (d) => requests.filter((r) => r.date === d && r.status === 'new');
// voľné termíny trénera v daný deň (len dnes a neskôr, v rámci dní, kedy sa dá objednať)
function kcFree(d) {
  if (d < today()) return [];
  const av = availability();
  if (!av) return [];
  if (daysBetween(today(), d) >= Math.min(Number(av.days) || 14, 21)) return [];
  const mine = new Set(kcRequests(d).map((r) => r.time));
  return (freeSlots(d, av) || []).filter((t) => !mine.has(t));
}
// súvislé voľné úseky [od, do] v minútach (na podfarbenie týždňa)
function kcFreeRanges(d) {
  const av = availability();
  const dur = Number(av?.duration) || 60;
  const out = [];
  for (const t of kcFree(d)) {
    const a = toMin(t), b = a + dur;
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}

/* ---------- Prepínač režimov ---------- */
const kcModes = () => `<div class="seg kc-modes" role="tablist" aria-label="Zobrazenie">
  ${[['list', 'Zoznam'], ['week', 'Týždeň'], ['month', 'Mesiac']].map(([k, l]) => `<button type="button" class="seg-btn${kcalMode === k ? ' active' : ''}" role="tab" aria-selected="${kcalMode === k}" data-kc-mode="${k}">${l}</button>`).join('')}
</div>`;

/* ---------- Týždeň ---------- */
function kcWeek() {
  const ws = kcWeekStart(kcalFocus);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const t = today();
  const hours = Array.from({ length: KC_END - KC_START }, (_, i) => KC_START + i);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const dur = Number(availability()?.duration) || 60;
  const evHtml = (top, h, cls, label, sub, attrs = '') => `<div class="kc-ev ${cls}" style="top:${top}px;height:${Math.max(h, 22)}px" ${attrs}><b>${label}</b>${h >= 34 && sub ? `<small>${sub}</small>` : ''}</div>`;
  return `<section class="card kc-card">
    <div class="kc-nav">
      <button type="button" class="icon-btn" data-kc-step="-7" aria-label="Predchádzajúci týždeň">‹</button>
      <span class="kc-title">${fmtShort(days[0])} – ${fmtShort(days[6])} ${parseDate(days[6]).getFullYear()}</span>
      <button type="button" class="icon-btn" data-kc-step="7" aria-label="Nasledujúci týždeň">›</button>
      ${ws !== kcWeekStart(t) ? '<button type="button" class="btn small" data-kc-today>Dnes</button>' : ''}
    </div>
    <div class="kc-week">
      <div class="kc-head"><span></span>${days.map((d) => `<button type="button" class="kc-dh${d === t ? ' today' : ''}" data-kc-day="${d}"><small>${DAYS_SHORT[weekday(d)]}</small><b>${parseDate(d).getDate()}</b></button>`).join('')}</div>
      <div class="kc-body" style="height:${(KC_END - KC_START) * KC_HOUR}px">
        <div class="kc-hours">${hours.map((h) => `<span style="top:${(h - KC_START) * KC_HOUR}px">${h}:00</span>`).join('')}</div>
        ${days.map((d) => `<div class="kc-col${d === t ? ' today' : ''}" data-kc-col="${d}">
          ${kcFreeRanges(d).map(([a, b]) => `<button type="button" class="kc-free" style="top:${((a - KC_START * 60) / 60) * KC_HOUR}px;height:${((b - a) / 60) * KC_HOUR}px" data-kc-free="${d}" data-from="${a}" aria-label="Voľné ${fmtShort(d)} ${fromMin(a)}–${fromMin(b)}"></button>`).join('')}
          ${kcSessions(d).filter((s) => s.time).map((s) => evHtml(kcTop(s.time), ((Number(s.duration) || 60) / 60) * KC_HOUR, s.status === 'done' ? 'done' : 'planned', esc(s.time), s.status === 'done' ? 'Odtrénovaný' : 'Tréning')).join('')}
          ${kcRequests(d).map((r) => evHtml(kcTop(r.time), (dur / 60) * KC_HOUR, 'req', esc(r.time), 'Čaká')).join('')}
          ${d === t && nowMin >= KC_START * 60 && nowMin <= KC_END * 60 ? `<i class="kc-now" style="top:${((nowMin - KC_START * 60) / 60) * KC_HOUR}px"></i>` : ''}
        </div>`).join('')}
      </div>
    </div>
    <div class="kc-legend"><span><i class="lg planned"></i>Tréning</span><span><i class="lg req"></i>Čaká na potvrdenie</span>${availability() ? '<span><i class="lg free"></i>Voľné – ťukni a pošli žiadosť</span>' : ''}</div>
  </section>`;
}

/* ---------- Mesiac ---------- */
function kcMonth() {
  const ms = kcMonthStart(kcalFocus);
  const first = kcWeekStart(ms);
  const m = ms.slice(0, 7);
  const t = today();
  const weeks = [];
  for (let w = first; w.slice(0, 7) <= m || weeks.length < 4; w = addDays(w, 7)) {
    if (weeks.length && w.slice(0, 7) > m) break;
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  }
  const dots = (d) => {
    const ss = kcSessions(d);
    const out = ss.slice(0, 3).map((s) => `<i class="dot ${s.status === 'done' ? 'done' : 'planned'}"></i>`);
    if (kcRequests(d).length) out.push('<i class="dot req"></i>');
    return out.join('');
  };
  return `<section class="card kc-card">
    <div class="kc-nav">
      <button type="button" class="icon-btn" data-kc-month="-1" aria-label="Predchádzajúci mesiac">‹</button>
      <span class="kc-title">${KC_MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}</span>
      <button type="button" class="icon-btn" data-kc-month="1" aria-label="Nasledujúci mesiac">›</button>
      ${m !== t.slice(0, 7) ? '<button type="button" class="btn small" data-kc-today>Dnes</button>' : ''}
    </div>
    <div class="kc-month">
      ${DAYS_SHORT.map((x) => `<span class="kc-wd">${x}</span>`).join('')}
      ${weeks.flat().map((d) => `<button type="button" class="kc-day${d.slice(0, 7) !== m ? ' out' : ''}${d === t ? ' today' : ''}${d === kcalFocus ? ' sel' : ''}${kcFree(d).length ? ' has-free' : ''}" data-kc-pick="${d}"><b>${parseDate(d).getDate()}</b><span class="dots">${dots(d)}</span></button>`).join('')}
    </div>
  </section>
  ${kcDayPanel(kcalFocus)}`;
}

/* ---------- Detail dňa (mesiac aj ťuknutie na deň v týždni) ---------- */
function kcDayPanel(d) {
  const ss = kcSessions(d);
  const rq = kcRequests(d);
  const free = kcFree(d);
  return `<section class="card kc-daycard">
    <div class="card-head"><h2>${esc(fmtDay(d))}${daysBetween(today(), d) > 1 || daysBetween(today(), d) < -1 ? ` <span class="muted">${fmtShort(d)}</span>` : ''}</h2></div>
    ${ss.length ? sessionList(ss, '') : ''}
    ${rq.map((r) => `<div class="session planned"><span class="when">${whenHtml(r.date, r.time)}<small>${r.note ? esc(r.note) : 'Žiadosť o tréning'}</small></span><span class="spacer"></span><span class="badge planned">Čaká</span></div>`).join('')}
    ${!ss.length && !rq.length ? '<p class="empty" style="margin:4px 0 8px">V tento deň nemáš tréning.</p>' : ''}
    ${free.length ? `<h3 class="section-title">Voľné termíny trénera</h3><div class="chips kc-slots">${free.map((x) => `<button type="button" class="chip" data-kc-book="${d}" data-time="${x}">${x}</button>`).join('')}</div><p class="hint" style="margin:6px 0 0">Ťukni na čas a pošli trénerovi žiadosť.</p>`
      : d >= today() && availability() ? '<p class="hint" style="margin:6px 0 0">V tento deň už tréner nemá voľný termín.</p>' : ''}
  </section>`;
}

/* ---------- Záložka Tréningy s kalendárom ---------- */
const viewSessionsList = ROUTES.sessions;
function viewSessionsCal() {
  const list = viewSessionsList();
  if (kcalMode === 'list') return list.replace('<div class="chips chart-chips">', `${kcModes()}<div class="chips chart-chips">`);
  // hlavička a plánovanie z pôvodnej obrazovky, potom kalendár
  const head = list.slice(0, list.indexOf('<div class="chips chart-chips">'));
  return `${head}${kcModes()}${kcalMode === 'week' ? kcWeek() + kcDayPanel(kcalFocus) : kcMonth()}`;
}
ROUTES.sessions = viewSessionsCal;

// pripraviť žiadosť na vybraný termín (použije sa pôvodný formulár plánovania)
function kcBook(d, time) {
  bookOpen = true; bookDate = d; bookTime = time;
  render();
  setTimeout(() => document.getElementById('booking')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
}
const kcRender = (scrollTo) => {
  const y = window.scrollY;
  render();
  if (scrollTo) setTimeout(() => document.querySelector(scrollTo)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 40);
  else window.scrollTo(0, y);
};

document.addEventListener('click', (e) => {
  const md = e.target.closest('[data-kc-mode]');
  if (md) { kcalMode = md.dataset.kcMode; try { localStorage.setItem(KCAL_KEY, kcalMode); } catch (x) { /* ok */ } kcRender(); if (kcalMode === 'week') kcScrollWeek(); return; }
  const st = e.target.closest('[data-kc-step]');
  if (st) { kcalFocus = addDays(kcalFocus, Number(st.dataset.kcStep)); kcRender(); kcScrollWeek(); return; }
  const mo = e.target.closest('[data-kc-month]');
  if (mo) { kcalFocus = kcAddMonths(kcalFocus, Number(mo.dataset.kcMonth)); kcRender(); return; }
  if (e.target.closest('[data-kc-today]')) { kcalFocus = today(); kcRender(); kcScrollWeek(); return; }
  const pk = e.target.closest('[data-kc-pick]');
  if (pk) { kcalFocus = pk.dataset.kcPick; kcRender('.kc-daycard'); return; }
  const dh = e.target.closest('[data-kc-day]');
  if (dh) { kcalFocus = dh.dataset.kcDay; kcRender('.kc-daycard'); return; }
  const bk = e.target.closest('[data-kc-book]');
  if (bk) { kcBook(bk.dataset.kcBook, bk.dataset.time); return; }
  const fr = e.target.closest('[data-kc-free]');
  if (fr) {
    // čas podľa miesta ťuknutia, zaokrúhlený na najbližší voľný termín
    const d = fr.dataset.kcFree;
    const col = fr.closest('.kc-col').getBoundingClientRect();
    const tapMin = KC_START * 60 + ((e.clientY - col.top) / KC_HOUR) * 60;
    const free = kcFree(d);
    if (!free.length) return;
    const best = free.filter((x) => toMin(x) <= tapMin).pop() || free[0];
    kcBook(d, best);
  }
});
// týždeň: posunúť na aktuálny čas / začiatok pracovného dňa
function kcScrollWeek() {
  if (kcalMode !== 'week') return;
  requestAnimationFrame(() => {
    const body = document.querySelector('.kc-week');
    if (!body) return;
    const h = new Date().getHours();
    body.scrollTop = Math.max(0, (Math.min(Math.max(h - 1, 7), KC_END - 6) - KC_START) * KC_HOUR);
  });
}
const renderWithoutKcal = render;
render = function (...args) {
  const r = renderWithoutKcal.apply(this, args);
  if (route() === 'sessions' && kcalMode === 'week' && !document.querySelector('.kc-week')?.dataset.scrolled) {
    kcScrollWeek();
    const w = document.querySelector('.kc-week'); if (w) w.dataset.scrolled = '1';
  }
  return r;
};
// appka sa vykreslí ešte pred načítaním kalendára – ak je otvorená záložka Tréningy, prekresliť ju
if (route() === 'sessions' && client()) render();
