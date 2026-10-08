'use strict';

/* =========================================================
   Klientska zóna – Kalendár (rovnaký ako v appke Tréner)
   Režimy Deň / Týždeň / Mesiac / Zoznam. Vidieť vlastné tréningy, žiadosti
   čakajúce na trénera, obsadené termíny trénera (bez mien) a mimopracovný čas.
   Ťuknutím do voľného miesta sa pripraví žiadosť o tréning.
   Živé prepojenie: zmeny z appky Tréner (tréningy, potvrdenie žiadosti, obsadené
   termíny) prídu hneď cez cloud – bez obnovenia stránky.
   ========================================================= */
const KCAL_KEY = 'klient-cal-mode';
const KC_HOUR = 56;
const KC_DAYS = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
const KC_DAYS_LONG = ['Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota', 'Nedeľa'];
const KC_MONTHS = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];
let kcalMode = 'grid';
try { kcalMode = localStorage.getItem(KCAL_KEY) || 'grid'; } catch (e) { /* ok */ }
if (!['day', 'grid', 'month', 'list'].includes(kcalMode)) kcalMode = 'grid';
let kcalFocus = today();
const kcScroll = new Map();

const kcIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const kcWeekStart = (d) => addDays(d, -weekday(d));
const kcMonthStart = (d) => `${d.slice(0, 7)}-01`;
const kcAddMonths = (d, n) => { const x = parseDate(kcMonthStart(d)); x.setMonth(x.getMonth() + n); return kcIso(x); };
const kcTr = (n) => cnt(n, 'tréning', 'tréningy', 'tréningov');
const kcDur = (s) => Math.max(15, Number(s.duration) || 60);
const kcPlanName = (id) => DB.plans.find((p) => p.id === id)?.name || '';

// rozloženie prekrývajúcich sa blokov do stĺpcov (ako v Google kalendári)
function kcLayout(items) {
  const evs = items.map((x) => ({ ...x })).sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster = [], end = -1;
  const flush = () => {
    const lanes = [];
    for (const e of cluster) {
      let i = lanes.findIndex((x) => x <= e.start);
      if (i < 0) { i = lanes.length; lanes.push(0); }
      lanes[i] = e.end; e.lane = i;
    }
    cluster.forEach((e) => { e.lanes = lanes.length; });
    cluster = [];
  };
  for (const e of evs) { if (cluster.length && e.start >= end) flush(); cluster.push(e); end = Math.max(end, e.end); }
  flush();
  return evs;
}

/* ---------- Dáta dňa ---------- */
const kcSessions = (d) => mySessions().filter((s) => s.date === d);
const kcRequests = (d) => requests.filter((r) => r.date === d && r.status === 'new');
// obsadené termíny trénera (iní klienti) – len čas, bez mien; moje tréningy a žiadosti sa nerátajú
function kcBusy(d) {
  const av = availability();
  const dur = Number(av?.duration) || 60;
  const mineS = new Set(kcSessions(d).filter((s) => s.time).map((s) => s.time));
  const mineR = new Set(kcRequests(d).map((r) => r.time));
  const out = [];
  if (!isDemo()) for (const b of av?.busy || []) if (b[0] === d && !mineS.has(b[1])) out.push([toMin(b[1]), toMin(b[1]) + (Number(b[2]) || dur)]);
  for (const h of holds) if (h.date === d && !mineR.has(h.time)) out.push([toMin(h.time), toMin(h.time) + (Number(h.duration) || dur)]);
  return out;
}
// voľné časy (začiatky) – dnes a neskôr, v rámci dní, na ktoré sa dá objednať
function kcFree(d) {
  if (d < today()) return [];
  const av = availability();
  if (!av) return [];
  if (daysBetween(today(), d) >= Math.min(Number(av.days) || 14, 21)) return [];
  const mine = new Set(kcRequests(d).map((r) => r.time));
  return (freeSlots(d, av) || []).filter((t) => !mine.has(t));
}

/* ---------- Hlavička (ako v appke Tréner) ---------- */
const kcModeSwitch = () => `<div class="seg cal-mode" role="group" aria-label="Zobrazenie kalendára">
  ${[['day', 'Deň'], ['grid', 'Týždeň'], ['month', 'Mesiac'], ['list', 'Zoznam']].map(([k, l]) => `<button type="button" class="${kcalMode === k ? 'active' : ''}" data-kc-mode="${k}">${l}</button>`).join('')}
</div>`;
function kcHead(sub, label, prev, next, showToday) {
  return `<div class="page-head cal-page-head">
    <div><h1>Kalendár</h1><p class="muted" style="margin:0">${sub}</p></div>
    ${kcModeSwitch()}
    <div class="week-nav">
      <button type="button" class="icon-btn" data-kc-go="${prev}" aria-label="Späť">‹</button>
      <span class="label">${label}</span>
      <button type="button" class="icon-btn" data-kc-go="${next}" aria-label="Ďalej">›</button>
      ${showToday ? '<button type="button" class="btn small" data-kc-today>Dnes</button>' : ''}
      <button type="button" class="btn small primary cal-add" id="book-open">+ Tréning</button>
    </div>
  </div>`;
}

/* ---------- Deň / Týždeň – časová os ---------- */
function kcGrid() {
  const t = today();
  const dayMode = kcalMode === 'day';
  const ws = dayMode ? kcalFocus : kcWeekStart(kcalFocus);
  const we = dayMode ? ws : addDays(ws, 6);
  const days = Array.from({ length: dayMode ? 1 : 7 }, (_, i) => addDays(ws, i));
  const av = availability();
  const dur = Number(av?.duration) || 60;
  const count = days.flatMap(kcSessions).filter((s) => s.status !== 'cancelled' && !s.self).length;
  let h0 = 6, h1 = 22;
  for (const d of days) for (const s of kcSessions(d)) { const m = s.time ? toMin(s.time) : null; if (m != null) { h0 = Math.min(h0, Math.floor(m / 60)); h1 = Math.max(h1, Math.ceil((m + kcDur(s)) / 60)); } }
  h1 = Math.min(24, h1);
  const top = (m) => ((m - h0 * 60) / 60) * KC_HOUR;
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const cols = days.map((d) => {
    const timed = [];
    const untimed = [];
    for (const s of kcSessions(d)) { if (s.time) timed.push({ kind: 's', s, start: toMin(s.time), end: toMin(s.time) + kcDur(s) }); else untimed.push(s); }
    for (const r of kcRequests(d)) timed.push({ kind: 'r', r, start: toMin(r.time), end: toMin(r.time) + dur });
    for (const [a, b] of kcBusy(d)) timed.push({ kind: 'b', start: a, end: b });
    const evs = kcLayout(timed).map((e) => {
      const style = `top:${top(e.start)}px;height:${Math.max(22, ((e.end - e.start) / 60) * KC_HOUR - 2)}px;left:calc(${(e.lane / e.lanes) * 100}% + 2px);width:calc(${100 / e.lanes}% - 4px)`;
      if (e.kind === 'b') return `<div class="cal-ev busy" style="${style}" aria-label="Obsadené ${fromMin(e.start)}"><b>${fromMin(e.start)}</b><span>Obsadené</span></div>`;
      if (e.kind === 'r') return `<button type="button" class="cal-ev req" style="${style}" data-kc-req="${esc(e.r.id)}"><b>${esc(e.r.time)}</b><span>Tvoja žiadosť</span><small>Čaká na trénera</small></button>`;
      const s = e.s;
      const plan = s.planId ? kcPlanName(s.planId) : '';
      return `<div class="cal-ev st-${s.status}" style="${style}" data-kc-sess="${esc(s.id)}" role="button" tabindex="0">
        <b class="cal-t">${esc(s.time)}–${fromMin(Math.min(24 * 60 - 1, e.end))}</b><span>${esc(plan || 'Tréning')}</span><small>${s.status === 'done' ? 'Odtrénovaný' : s.status === 'cancelled' ? 'Zrušený' : `S trénerom ${esc(TRAINER.name || '')}`}</small>
      </div>`;
    }).join('');
    let off = '';
    if (av) {
      const ranges = (av.hours[String(parseDate(d).getDay())] || []).map(([a, b]) => [toMin(a), toMin(b)]).sort((a, b) => a[0] - b[0]);
      let cur = h0 * 60;
      for (const [a, b] of ranges) { if (a > cur) off += `<i class="cal-off" style="top:${top(cur)}px;height:${top(a) - top(cur)}px"></i>`; cur = Math.max(cur, b); }
      if (cur < h1 * 60) off += `<i class="cal-off" style="top:${top(cur)}px;height:${top(h1 * 60) - top(cur)}px"></i>`;
    }
    const now = d === t && nowM >= h0 * 60 && nowM <= h1 * 60 ? `<i class="cal-now" style="top:${top(nowM)}px"></i>` : '';
    const allDay = untimed.map((s) => `<span class="cal-chip ${s.self ? 'self' : `st-${s.status}`}">${s.self ? 'sám/sama' : 'tréning'}</span>`).join('');
    return {
      head: `<div class="cal-dh${d === t ? ' today' : ''}"><small>${dayMode ? KC_DAYS_LONG[weekday(d)] : KC_DAYS[weekday(d)]}</small><b>${parseDate(d).getDate()}</b>${allDay ? `<div class="cal-allday">${allDay}</div>` : ''}</div>`,
      col: `<div class="cal-col${d === t ? ' today' : ''}${kcFree(d).length ? ' has-free' : ''}" data-kc-date="${d}">${off}${now}${evs}</div>`
    };
  });
  const label = dayMode ? `${KC_DAYS_LONG[weekday(ws)]} ${fmtShort(ws)} ${parseDate(ws).getFullYear()}` : `${fmtShort(ws)} – ${fmtShort(we)} ${parseDate(we).getFullYear()}`;
  return `${kcHead(`${kcTr(count)} ${dayMode ? (ws === t ? 'dnes' : 'v tento deň') : 'v týždni'}`, label, addDays(ws, dayMode ? -1 : -7), addDays(ws, dayMode ? 1 : 7), dayMode ? ws !== t : ws !== kcWeekStart(t))}
  <p class="cal-hint muted">${av ? 'Ťukni do voľného miesta – pošleš trénerovi žiadosť o tréning' : 'Tvoje tréningy · žiadosť pošleš tlačidlom + Tréning'}</p>
  ${bookingCard()}
  <div class="cal-wrap${dayMode ? ' day' : ''}" data-week="${dayMode ? 'd' : 'w'}${ws}" data-now="${days.includes(t) ? 1 : 0}" data-h0="${h0}">
    <div class="cal-grid" style="--rows:${h1 - h0};--hpx:${KC_HOUR}px;--n:${days.length}">
      <div class="cal-corner"></div>
      ${cols.map((c) => c.head).join('')}
      <div class="cal-times">${Array.from({ length: h1 - h0 }, (_, k) => `<span style="top:${k * KC_HOUR}px">${pad(h0 + k)}:00</span>`).join('')}</div>
      ${cols.map((c) => c.col).join('')}
    </div>
  </div>`;
}

/* ---------- Mesiac ---------- */
function kcMonth() {
  const t = today();
  const ms = kcMonthStart(kcalFocus);
  const next = kcAddMonths(ms, 1);
  const gs = kcWeekStart(ms);
  const weeks = Math.ceil(daysBetween(gs, next) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(gs, i));
  const inMonth = (d) => d >= ms && d < next;
  const count = cells.filter(inMonth).flatMap(kcSessions).filter((s) => s.status !== 'cancelled' && !s.self).length;
  const cell = (d) => {
    const list = kcSessions(d);
    const items = list.map((s) => `<span class="mc-ev ${s.self ? 'self' : `st-${s.status}`}"><b>${esc(s.time || '')}</b> ${s.self ? 'sám' : esc(kcPlanName(s.planId) || 'Tréning')}</span>`);
    kcRequests(d).forEach((r) => items.push(`<span class="mc-ev req"><b>${esc(r.time)}</b> Čaká</span>`));
    const busy = list.filter((s) => s.status !== 'cancelled').length + kcRequests(d).length;
    return `<button type="button" class="mc${inMonth(d) ? '' : ' out'}${d === t ? ' today' : ''}${weekday(d) >= 5 ? ' we' : ''}${kcFree(d).length ? ' has-free' : ''}" data-kc-day="${d}" aria-label="${KC_DAYS_LONG[weekday(d)]} ${fmtShort(d)}">
      <span class="mc-n">${parseDate(d).getDate()}</span>
      <span class="mc-list">${items.slice(0, 3).join('')}${items.length > 3 ? `<span class="mc-more">+${items.length - 3}</span>` : ''}</span>
      ${busy ? `<span class="mc-dots" aria-hidden="true">${'<i></i>'.repeat(Math.min(busy, 4))}</span>` : ''}
    </button>`;
  };
  const isThis = ms === kcMonthStart(t);
  return `${kcHead(`${kcTr(count)} v mesiaci`, `${KC_MONTHS[parseDate(ms).getMonth()]} ${parseDate(ms).getFullYear()}`, kcAddMonths(ms, -1), kcAddMonths(ms, 1), !isThis)}
  <p class="cal-hint muted">Ťukni na deň – otvorí sa jeho rozvrh${availability() ? ' · podčiarknuté dni majú voľné termíny' : ''}</p>
  ${bookingCard()}
  <div class="month">
    <div class="month-head">${KC_DAYS.map((x) => `<span>${x}</span>`).join('')}</div>
    <div class="month-grid" style="--weeks:${weeks}">${cells.map(cell).join('')}</div>
  </div>`;
}

/* ---------- Záložka Kalendár ---------- */
const viewSessionsList = ROUTES.sessions;
function viewCalendar() {
  if (kcalMode === 'list') {
    return viewSessionsList()
      .replace('<h1>Tréningy</h1>', '<h1>Kalendár</h1>')
      .replace('<div class="chips chart-chips">', `${kcModeSwitch()}<div class="chips chart-chips">`);
  }
  return kcalMode === 'month' ? kcMonth() : kcGrid();
}
ROUTES.sessions = viewCalendar;

/* ---------- Výška a posun časovej osi ---------- */
function kcFit() {
  const wrap = document.querySelector('.cal-wrap');
  if (!wrap) return;
  const nav = document.querySelector('.nav');
  const nr = nav?.getBoundingClientRect();
  const bottom = nr && nr.top > innerHeight / 2 ? innerHeight - nr.top + 12 : 20;
  const top = wrap.getBoundingClientRect().top + window.scrollY;
  wrap.style.height = `${Math.max(320, innerHeight - top - bottom)}px`;
}
addEventListener('resize', () => { clearTimeout(kcFit.t); kcFit.t = setTimeout(kcFit, 100); });
function kcRestoreScroll() {
  const wrap = document.querySelector('.cal-wrap');
  if (!wrap) return;
  kcFit();
  const key = wrap.dataset.week, h0 = Number(wrap.dataset.h0);
  const saved = kcScroll.get(key);
  if (saved) { wrap.scrollTop = saved.top; wrap.scrollLeft = saved.left; }
  else {
    const first = [...wrap.querySelectorAll('.cal-ev:not(.busy)')].reduce((m, el) => Math.min(m, parseFloat(el.style.top)), Infinity);
    wrap.scrollTop = wrap.dataset.now === '1' ? Math.max(0, (Math.max(h0, Math.min(new Date().getHours() - 1, 20)) - h0) * KC_HOUR) : Number.isFinite(first) ? Math.max(0, first - 40) : (8 - h0) * KC_HOUR;
    const tc = wrap.querySelector('.cal-col.today');
    if (tc && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, tc.offsetLeft - wrap.querySelector('.cal-times').offsetWidth);
  }
  wrap.addEventListener('scroll', () => kcScroll.set(key, { top: wrap.scrollTop, left: wrap.scrollLeft }), { passive: true });
}

/* ---------- Ovládanie ---------- */
// pripraviť žiadosť na vybraný termín (pôvodný formulár plánovania nad kalendárom)
function kcBook(d, time) {
  bookOpen = true; bookDate = d; bookTime = time || '';
  render();
  setTimeout(() => document.getElementById('booking')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
}
document.addEventListener('click', async (e) => {
  const md = e.target.closest('[data-kc-mode]');
  if (md) { kcalMode = md.dataset.kcMode; try { localStorage.setItem(KCAL_KEY, kcalMode); } catch (x) { /* ok */ } render(); return; }
  const go = e.target.closest('[data-kc-go]');
  if (go) { kcalFocus = go.dataset.kcGo; render(); return; }
  if (e.target.closest('[data-kc-today]')) { kcalFocus = today(); render(); return; }
  const day = e.target.closest('[data-kc-day]');
  if (day) { kcalFocus = day.dataset.kcDay; kcalMode = 'day'; try { localStorage.setItem(KCAL_KEY, 'grid'); } catch (x) { /* ok */ } render(); return; }
  const rq = e.target.closest('[data-kc-req]');
  if (rq) {
    const r = requests.find((x) => x.id === rq.dataset.kcReq);
    if (r && confirm(`Zrušiť žiadosť o tréning ${fmtDay(r.date)} o ${r.time}?`)) cancelRequest(r.id);
    return;
  }
  const ss = e.target.closest('[data-kc-sess]');
  if (ss) {
    const s = mySessions().find((x) => x.id === ss.dataset.kcSess);
    if (s && s.status === 'planned') toastMsgK(`${fmtDay(s.date)} o ${s.time} · ak potrebuješ zmenu, napíš trénerovi v Správach`);
    return;
  }
  const col = e.target.closest('[data-kc-date]');
  if (col && !e.target.closest('.cal-ev')) {
    const d = col.dataset.kcDate;
    const wrap = col.closest('.cal-wrap');
    const h0 = Number(wrap.dataset.h0);
    const tap = h0 * 60 + ((e.clientY - col.getBoundingClientRect().top) / KC_HOUR) * 60;
    const free = kcFree(d);
    if (!availability()) { kcBook(d, ''); return; }
    if (!free.length) { toastMsgK(d < today() ? 'Tento deň už prešiel' : 'V tento deň tréner nemá voľný termín'); return; }
    // voľný termín, do ktorého ťuknutie padlo (alebo najbližší)
    const dur = Number(availability()?.duration) || 60;
    const hit = free.filter((x) => toMin(x) <= tap && toMin(x) + dur > tap).pop();
    const near = hit || free.reduce((a, b) => (Math.abs(toMin(b) - tap) < Math.abs(toMin(a) - tap) ? b : a));
    kcBook(d, near);
  }
});
const toastMsgK = (text) => (typeof toast === 'function' ? toast(text) : alert(text));

/* ---------- Živé prepojenie s appkou Tréner ---------- */
const kcLive = { code: null, subs: [], pending: false };
function kcLiveStart() {
  const code = client() && !isDemo() ? authCode : null;
  if (code === kcLive.code) return;
  kcLive.subs.forEach((un) => un());
  kcLive.subs = [];
  kcLive.code = code;
  if (!code) return;
  const start = () => {
    if (kcLive.code !== code || kcLive.subs.length) return;
    const cc = window.clientCloud;
    if (!cc?.watchShared) return;
    kcLive.subs.push(cc.watchShared(code, (snap) => {
      if (kcLive.code !== code) return;
      if (!snap) { logout('Tréner zrušil tvoj prístup. Ak je to omyl, ozvi sa mu.'); return; }
      if ((snap.updatedAt || 0) === (lastUpdated || 0)) return;
      const before = JSON.stringify(DB.sessions);
      applySnapshot(snap);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(snap)); } catch (e) { /* ok */ }
      if (JSON.stringify(DB.sessions) !== before) kcLiveRender();
    }, () => {}));
    kcLive.subs.push(cc.watchRequests(code, (list) => {
      if (kcLive.code !== code) return;
      const was = new Map(requests.map((r) => [r.id, r.status]));
      const accepted = list.find((r) => r.status === 'accepted' && was.get(r.id) === 'new');
      const declined = list.find((r) => r.status === 'declined' && was.get(r.id) === 'new');
      requests = list; requestsLoaded = true;
      if (accepted) toastMsgK(`Tréner potvrdil tréning ${fmtDay(accepted.date)} o ${accepted.time}`);
      else if (declined) toastMsgK(`Tréner termín ${fmtDay(declined.date)} o ${declined.time} odmietol – vyber iný`);
      kcLiveRender();
    }, () => {}));
    if (TRAINER.ownerUid && cc.watchHolds) kcLive.subs.push(cc.watchHolds(TRAINER.ownerUid, (list) => { holds = list; kcLiveRender(); }, () => {}));
  };
  if (window.clientCloud) start(); else window.addEventListener('client-cloud-ready', start, { once: true });
}
// prekresliť len obrazovky, ktorých sa zmena týka; pri písaní počkať, kým používateľ dopíše
function kcLiveRender() {
  if (!['sessions', ''].includes(route())) return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) {
    if (!kcLive.pending) { kcLive.pending = true; a.addEventListener('blur', () => { kcLive.pending = false; kcLiveRender(); }, { once: true }); }
    return;
  }
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

const renderWithoutKcal = render;
render = function (...args) {
  const r = renderWithoutKcal.apply(this, args);
  kcLiveStart();
  if (route() === 'sessions') kcRestoreScroll();
  const navA = document.querySelector('.nav a[href="#/sessions"] span');
  if (navA && navA.textContent !== 'Kalendár') navA.textContent = 'Kalendár';
  return r;
};
// appka sa vykreslí ešte pred načítaním kalendára – prekresliť, aby sa ukázal nový kalendár a menu
if (client()) render();
