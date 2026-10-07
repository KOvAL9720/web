'use strict';

/* =========================================================
   Klientska zóna – prihlásenie kódom, prehľad, tréningy, plán, progres
   Dáta: kód DEMO → ukážka (js/data.js), skutočný kód → cloud (js/cloud.js)
   ========================================================= */

const CODE_KEY = 'klient-zona-code';
const CACHE_KEY = 'klient-zona-data';
const DAYS = ['pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota', 'nedeľa'];
const DAYS_SHORT = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
const METRICS = [['weight', 'Váha', 'kg'], ['bodyFat', 'Tuk', '%'], ['waist', 'Pás', 'cm'], ['hips', 'Boky', 'cm']];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const weekday = (s) => (parseDate(s).getDay() + 6) % 7;
const fmtShort = (s) => { const d = parseDate(s); return `${d.getDate()}. ${d.getMonth() + 1}.`; };
const fmtNum = (n, digits = 1) => (n == null || n === '' ? '–' : Number(n).toLocaleString('sk-SK', { maximumFractionDigits: digits }));
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const pl = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
const cnt = (n, one, few, many) => `${n} ${pl(n, one, few, many)}`;
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const fmtDay = (s) => {
  const diff = daysBetween(today(), s);
  if (diff === 0) return 'Dnes';
  if (diff === 1) return 'Zajtra';
  if (diff === -1) return 'Včera';
  const d = DAYS[weekday(s)];
  return `${d[0].toUpperCase()}${d.slice(1)} ${fmtShort(s)}`;
};
const bySessionTime = (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''));

const exName = (id) => DB.exercises.find((e) => e.id === id)?.name || 'Cvik';
const fmtSet = (st) => (st.w ? `${fmtNum(st.w, 2)} kg × ${fmtNum(st.r, 0)}` : `${fmtNum(st.r, 0)}${st.r >= 20 ? ' s' : '×'}`);
const betterSet = (a, b) => (a.w ?? 0) - (b.w ?? 0) || (a.r ?? 0) - (b.r ?? 0);
const topSet = (sets) => sets.reduce((a, b) => (betterSet(b, a) > 0 ? b : a));

/* ---------- Prihlásenie ---------- */
let clientId = null;
let authCode = null;
try { authCode = localStorage.getItem(CODE_KEY); } catch (e) { /* úložisko nedostupné */ }

const client = () => DB.clients.find((c) => c.id === clientId);
// tréningy od trénera + tréningy, ktoré si klient zapísal sám
const mySessions = () => [...DB.sessions.filter((s) => s.clientId === clientId), ...entries.filter((e) => e.type === 'workout').map((e) => ({ id: 'k' + e.id, entryId: e.id, clientId, date: e.date, time: '', status: 'done', self: true, note: e.note || '', log: e.log && e.log.length ? e.log : undefined }))].sort(bySessionTime);
const myPlans = () => DB.plans.filter((p) => p.clientId === clientId);
const myMeasurements = () => [...DB.measurements.filter((m) => m.clientId === clientId), ...entries.filter((e) => e.type === 'measure').map((e) => ({ id: 'k' + e.id, entryId: e.id, clientId, date: e.date, weight: e.weight ?? null, bodyFat: e.bodyFat ?? null, waist: e.waist ?? null, hips: e.hips ?? null, self: true }))].sort((a, b) => a.date.localeCompare(b.date));

const normCode = (raw) => String(raw || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
const intlPhone = (phone) => { const p = String(phone || '').replace(/[^\d+]/g, ''); return p.startsWith('+') ? p.slice(1) : p.startsWith('00') ? p.slice(2) : p.startsWith('0') ? '421' + p.slice(1) : p; };

// Dáta z cloudu → rovnaká štruktúra, akú používajú obrazovky
function applySnapshot(snap) {
  const cid = snap.clientId;
  DB = {
    clients: [{ id: cid, name: snap.client?.name || 'Klient', goal: snap.client?.goal || '', since: snap.client?.since || '', photo: /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(snap.client?.photo || '') ? snap.client.photo : '' }],
    sessions: (snap.sessions || []).map((x) => ({ ...x, clientId: cid })),
    plans: (snap.plans || []).map((p) => ({ ...p, clientId: cid })),
    exercises: snap.exercises || [],
    measurements: (snap.measurements || []).map((m) => ({ ...m, clientId: cid }))
  };
  const phone = snap.trainer?.phone || '';
  TRAINER = { name: snap.trainer?.name || 'Tréner', phone, whatsapp: phone ? `https://wa.me/${intlPhone(phone)}` : '', ownerUid: snap.ownerUid || '', availability: snap.availability || null, ntfy: typeof snap.notify?.ntfy === 'string' ? snap.notify.ntfy : '' };
  clientId = cid;
  lastUpdated = snap.updatedAt || null;
}
let lastUpdated = null;

const cloudReady = () => (window.clientCloud ? Promise.resolve() : new Promise((r) => window.addEventListener('client-cloud-ready', r, { once: true })));

async function login(raw) {
  const code = normCode(raw);
  if (!code) return { ok: false, msg: 'Zadaj prístupový kód.' };
  if (ACCESS_CODES[code]) {
    DB = DEMO_DB; TRAINER = DEMO_TRAINER; clientId = ACCESS_CODES[code]; authCode = code;
    try { localStorage.setItem(CODE_KEY, code); localStorage.removeItem(CACHE_KEY); } catch (e) { /* ok */ }
    return { ok: true };
  }
  if (!navigator.onLine) return { ok: false, msg: 'Si offline – na prvé prihlásenie treba internet.' };
  await Promise.race([cloudReady(), new Promise((r) => setTimeout(r, 9000))]);
  if (!window.clientCloud) return { ok: false, msg: 'Nepodarilo sa pripojiť k serveru – pravdepodobne slabý signál. Skontroluj internet a skús to znova (prípadne appku zavri a otvor).' };
  try {
    const snap = await Promise.race([window.clientCloud.fetch(code), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))]);
    if (!snap) return { ok: false, msg: 'Tento kód nepoznáme. Skontroluj ho alebo sa ozvi trénerovi.' };
    applySnapshot(snap); authCode = code;
    try { localStorage.setItem(CODE_KEY, code); localStorage.setItem(CACHE_KEY, JSON.stringify(snap)); } catch (e) { /* ok */ }
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e?.code === 'permission-denied' ? 'Prístup bol zamietnutý. Ozvi sa trénerovi.' : 'Nepodarilo sa načítať dáta. Skontroluj internet a skús znova.' };
  }
}

// Pri ďalšom otvorení: hneď ukázať uložené dáta, na pozadí stiahnuť nové
async function refresh() {
  if (!authCode || ACCESS_CODES[authCode] || !navigator.onLine) return;
  requestsLoaded = false;
  loadRequests().then(() => render());
  try {
    await cloudReady();
    const snap = await window.clientCloud.fetch(authCode);
    if (!snap) { logout('Tréner zrušil tvoj prístup. Ak je to omyl, ozvi sa mu.'); return; }
    if ((snap.updatedAt || 0) !== (lastUpdated || 0)) {
      applySnapshot(snap);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(snap)); } catch (e) { /* ok */ }
      render();
    }
  } catch (e) { /* bez siete – ostávajú uložené dáta */ }
}

let logoutMsg = '';
function logout(msg = '') {
  clientId = null; authCode = null; logoutMsg = msg; requests = []; entries = []; holds = []; requestsLoaded = false; bookOpen = false; bookDate = ''; bookTime = '';
  DB = DEMO_DB; TRAINER = DEMO_TRAINER;
  try { localStorage.removeItem(CODE_KEY); localStorage.removeItem(CACHE_KEY); } catch (e) { /* ok */ }
  location.hash = '';
  render();
}

// Štart: kód z odkazu (#/k/KÓD), uložený kód + uložené dáta, alebo prihlásenie (volá sa na konci súboru)
function boot() {
  const m = location.hash.match(/^#\/k\/([A-Za-z0-9-]+)/);
  if (m) {
    history.replaceState(null, '', location.pathname + location.search + '#/');
    render();
    login(m[1]).then((r) => { if (!r.ok) { logoutMsg = r.msg; } render(r.ok); if (r.ok) refresh(); });
    return;
  }
  if (authCode && ACCESS_CODES[authCode]) { DB = DEMO_DB; TRAINER = DEMO_TRAINER; clientId = ACCESS_CODES[authCode]; return; }
  if (authCode) {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { /* ok */ }
    if (cached) { applySnapshot(cached); refresh(); }
    else { const code = authCode; authCode = null; login(code).then((r) => { if (!r.ok) logoutMsg = r.msg; render(); }); }
  }
}

/* ---------- Obrazovky ---------- */
function viewHome() {
  const c = client();
  const all = mySessions();
  const upcoming = all.filter((s) => s.status === 'planned' && s.date >= today());
  const done = all.filter((s) => s.status === 'done');
  const next = upcoming[0];
  const ms = myMeasurements();
  const first = ms[0], last = ms[ms.length - 1];
  const dw = first && last && first !== last ? Math.round((last.weight - first.weight) * 10) / 10 : null;
  const weekStart = addDays(today(), -weekday(today()));
  const thisWeek = all.filter((s) => s.status !== 'cancelled' && s.date >= weekStart && s.date < addDays(weekStart, 7));
  return `
  <div class="page-head"><div><h1>Ahoj, ${esc(c.name.split(' ')[0])} 👋</h1><p class="muted">${esc(c.goal)}</p></div></div>
  <section class="hero">
    <span class="eyebrow">Najbližší tréning</span>
    ${next ? `<h2 class="hero-title">${whenHtml(next.date, next.time)}</h2><p class="hero-sub">${next.note ? esc(next.note) + ' · ' : ''}${DAYS[weekday(next.date)]} ${fmtShort(next.date)}</p>` : `<h2 class="hero-title">Zatiaľ nič naplánované</h2><p class="hero-sub">Dohodni si termín s trénerom.</p>`}
    <div class="row">${TRAINER.whatsapp ? `<a class="btn primary" href="${TRAINER.whatsapp}" target="_blank" rel="noopener">Napísať trénerovi</a>` : ''}<a class="btn" href="#/sessions">Všetky tréningy</a></div>
  </section>
  <div class="stats">
    <div class="stat"><b>${done.length}</b><span>odtrénované</span></div>
    <div class="stat"><b>${thisWeek.length}</b><span>tento týždeň</span></div>
    <div class="stat"><b>${dw == null ? '–' : (dw > 0 ? '+' : '') + fmtNum(dw)}</b><span>kg od začiatku</span></div>
  </div>
  <section class="card">
    <div class="card-head"><h2>Tento týždeň</h2><span class="badge">${DAYS_SHORT[0]} ${fmtShort(weekStart)} – ${DAYS_SHORT[6]} ${fmtShort(addDays(weekStart, 6))}</span></div>
    ${sessionList(thisWeek, 'Tento týždeň nemáš žiadny tréning.')}
  </section>
  ${trainerCard()}
  ${myPlans().length ? `<section class="card"><div class="card-head"><h2>Tvoj plán</h2><a class="btn small" href="#/plan">Otvoriť</a></div>${myPlans().map((p) => `<div class="session"><span class="when">${esc(p.name)}<small>${cnt(p.items.length, 'cvik', 'cviky', 'cvikov')}</small></span></div>`).join('')}</section>` : ''}`;
}

// Profil trénera – meno a kontakt (z nastavení appky Tréner)
function trainerCard() {
  const t = TRAINER;
  if (!t?.name) return '';
  const phone = (t.phone || '').replace(/\s/g, '');
  return `<section class="card trainer-card">
    <div class="card-head"><h2>Tvoj tréner</h2></div>
    <div class="trainer-row">
      <span class="avatar lg">${initials(t.name)}</span>
      <div class="info"><strong>${esc(t.name)}</strong>${phone ? `<small>${esc(t.phone)}</small>` : '<small class="muted">Osobný tréner</small>'}</div>
    </div>
    ${phone ? `<div class="row" style="margin-top:12px">
      <a class="btn primary" href="${t.whatsapp}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn" href="sms:${esc(phone)}">SMS</a>
      <a class="btn" href="tel:${esc(phone)}">Zavolať</a>
    </div>` : ''}
  </section>`;
}

function sessionRow(s, open = false) {
  const tag = s.self ? '<span class="badge self">Sám/sama</span>' : s.status === 'done' ? '<span class="badge done">Odtrénovaný</span>' : s.status === 'cancelled' ? '<span class="badge cancelled">Zrušený</span>' : '<span class="badge planned">Naplánovaný</span>';
  const log = open && s.log ? `<div class="log">${s.log.map((e) => `<div><span>${esc(exName(e.exerciseId))}</span><span>${e.sets.map(fmtSet).join(' · ')}</span></div>`).join('')}</div>` : '';
  return `<div class="session ${s.status}${s.log ? ' open' : ''}" ${s.log ? `data-toggle="${s.id}"` : ''}>
    <span class="when">${whenHtml(s.date, s.time)}<small>${s.note ? esc(s.note) : s.log ? `${cnt(s.log.length, 'cvik', 'cviky', 'cvikov')} · ťukni pre výkony` : DAYS[weekday(s.date)]}</small></span>
    <span class="spacer"></span>${tag}${log}
  </div>`;
}
const sessionList = (list, emptyText) => (list.length ? list.map((s) => sessionRow(s, openLogs.has(s.id))).join('') : `<p class="empty">${emptyText}</p>`);
const openLogs = new Set();

let sessionsFilter = 'upcoming';
function viewSessions() {
  const all = mySessions();
  const lists = {
    upcoming: all.filter((s) => s.status === 'planned' && s.date >= today()),
    done: all.filter((s) => s.status === 'done').reverse(),
    all: [...all].reverse()
  };
  const chips = [['upcoming', 'Najbližšie'], ['done', 'Odtrénované'], ['all', 'Všetky']];
  return `
  <div class="page-head"><div><h1>Tréningy</h1><p class="muted">${cnt(lists.done.length, 'odtrénovaný tréning', 'odtrénované tréningy', 'odtrénovaných tréningov')}</p></div>
    <div class="row"><button class="btn" data-log-workout="">+ Zapísať tréning</button>${bookOpen || lists.upcoming.length || sessionsFilter !== 'upcoming' ? `<button class="btn primary" id="book-open">${bookOpen ? 'Zavrieť' : '+ Naplánovať tréning'}</button>` : ''}</div></div>
  ${bookingCard()}
  <div class="chips chart-chips">${chips.map(([k, l]) => `<button class="chip${sessionsFilter === k ? ' active' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
  <section class="card">${lists[sessionsFilter].length ? sessionList(lists[sessionsFilter]) : `<p class="empty">${sessionsFilter === 'upcoming' ? 'Žiadny naplánovaný tréning.' : 'Zatiaľ žiadne tréningy.'}</p>${sessionsFilter === 'upcoming' && !bookOpen ? '<button class="btn primary" id="book-open" style="width:100%;margin-top:10px">+ Naplánovať tréning</button>' : ''}`}</section>`;
}

/* ---------- Nahlásenie na tréning (žiadosť trénerovi) ---------- */
let requests = [];           // moje žiadosti (z cloudu alebo ukážka)
let holds = [];
let entries = [];             // moje vlastné zápisy (meranie, tréning sám)              // termíny, o ktoré už požiadal niekto (aj iný klient) – sú obsadené
let requestsLoaded = false;
let bookDate = '';
let bookTime = '';
let bookOpen = false;
const REQ_STATUS = { new: ['Čaká na potvrdenie', 'planned'], accepted: ['Potvrdené', 'done'], declined: ['Odmietnuté', 'cancelled'] };
const TIMES = Array.from({ length: 31 }, (_, i) => `${pad(6 + Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);
// „Piatok 9. 10. o 07:00“ – zlom riadku len za názvom dňa, nie medzi dátumom a časom
const whenHtml = (d, t) => `${esc(fmtDay(d)).replace(/(\d\.) (?=\d)/g, '$1\u00a0')}${t ? `\u00a0o\u00a0${esc(t)}` : ''}`;
const isDemo = () => !!ACCESS_CODES[authCode];

async function loadRequests() {
  if (isDemo() || !authCode) { requestsLoaded = true; return; }
  try {
    await cloudReady();
    const [rq, hd, en] = await Promise.all([window.clientCloud.listRequests(authCode), TRAINER.ownerUid && window.clientCloud.listHolds ? window.clientCloud.listHolds(TRAINER.ownerUid).catch(() => []) : [], window.clientCloud.listEntries ? window.clientCloud.listEntries(authCode).catch(() => entries) : entries]);
    requests = rq; holds = hd; entries = en; requestsLoaded = true;
  }
  catch (e) { requestsLoaded = true; }
}

/* Voľné termíny: pracovné hodiny trénera mínus obsadené tréningy (posiela ich appka Tréner) */
const toMin = (x) => { const [h, m] = String(x).split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
function availability() {
  if (isDemo()) {
    return { hours: { 1: [['07:00', '20:00']], 2: [['07:00', '20:00']], 3: [['07:00', '20:00']], 4: [['07:00', '20:00']], 5: [['07:00', '18:00']], 6: [['08:00', '12:00']] },
      duration: 60, step: 30, days: 14, busy: DB.sessions.filter((x) => x.status === 'planned' && x.time).map((x) => [x.date, x.time, x.duration || 60]) };
  }
  const a = TRAINER.availability;
  return a && a.hours && typeof a.hours === 'object' && Object.values(a.hours).some((r) => Array.isArray(r) && r.length) ? a : null;
}
// null = tréner nemá nastavené hodiny (ponúknu sa všetky časy), [] = v ten deň nič voľné
function freeSlots(d, av) {
  if (!av) return null;
  const ranges = av.hours[String(parseDate(d).getDay())] || [];
  const dur = Number(av.duration) || 60, step = Number(av.step) || 30;
  const busy = [...(av.busy || []), ...holds.map((h) => [h.date, h.time, h.duration])].filter((b) => b[0] === d).map((b) => [toMin(b[1]), toMin(b[1]) + (Number(b[2]) || dur)]);
  const now = new Date();
  const minStart = d === today() ? now.getHours() * 60 + now.getMinutes() + 60 : 0; // dnes najskôr o hodinu
  const out = [];
  for (const [a, b] of ranges) {
    for (let m = toMin(a); m + dur <= toMin(b); m += step) {
      if (m < minStart) continue;
      if (busy.some(([x, y]) => m < y && m + dur > x)) continue;
      out.push(fromMin(m));
    }
  }
  return out;
}

function bookingCard() {
  const t = today();
  const av = availability();
  const days = Array.from({ length: Math.min(Number(av?.days) || 14, 21) }, (_, i) => addDays(t, i));
  const slotsOf = (d) => freeSlots(d, av);
  const busy = new Set(mySessions().filter((s) => s.status === 'planned').map((s) => s.date));
  const pending = requests.filter((r) => r.date >= t).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const dayLabel = (d) => `${DAYS_SHORT[weekday(d)]} ${fmtShort(d)}`;
  if (!bookOpen && !pending.length) return '';
  return `<section class="card" id="booking">
    <div class="card-head"><h2>Naplánovať tréning</h2>${pending.length ? `<span class="badge planned">${cnt(pending.filter((r) => r.status === 'new').length, 'žiadosť', 'žiadosti', 'žiadostí')}</span>` : ''}</div>
    ${bookOpen ? `<p class="muted" style="margin-top:-6px">Vyber deň a čas – tréner ti termín potvrdí.</p>
    <div class="chips book-days">${days.map((d) => { const fr = slotsOf(d); const none = fr && !fr.length; return `<button class="chip${bookDate === d ? ' active' : ''}${none ? ' off' : ''}" data-book-date="${d}" ${none ? 'disabled aria-disabled="true"' : ''}>${d === t ? 'Dnes' : d === addDays(t, 1) ? 'Zajtra' : dayLabel(d)}${busy.has(d) ? ' ·' : ''}</button>`; }).join('')}</div>
    ${av ? '<p class="hint" style="margin:-4px 0 10px">Ponúkajú sa len voľné termíny trénera.</p>' : ''}
    ${bookDate ? `<div class="chips book-times">${(slotsOf(bookDate) || TIMES).map((x) => `<button class="chip${bookTime === x ? ' active' : ''}" data-book-time="${x}">${x}</button>`).join('') || '<span class="muted">V tento deň už nie je voľný termín.</span>'}</div>
      <div class="field"><label for="book-note">Poznámka (nepovinné)</label><input id="book-note" placeholder="napr. môžem aj o hodinu neskôr"></div>
      <button class="btn primary" id="book-send" ${bookTime ? '' : 'disabled'}>Poslať žiadosť${bookTime ? ` · ${fmtDay(bookDate)} ${bookTime}` : ''}</button>` : ''}` : ''}
    ${pending.length ? `<h3 class="section-title" style="margin-top:18px">Moje žiadosti</h3><ul class="list">${pending.map((r) => `<li class="session ${REQ_STATUS[r.status]?.[1] || 'planned'}">
      <span class="when">${whenHtml(r.date, r.time)}<small>${r.note ? esc(r.note) : DAYS[weekday(r.date)]}</small></span>
      <span class="spacer"></span><span class="badge ${REQ_STATUS[r.status]?.[1] || 'planned'}">${r.status === 'new' ? '<span class="long">Čaká na potvrdenie</span><span class="short">Čaká</span>' : esc(REQ_STATUS[r.status]?.[0] || r.status)}</span>
      ${r.status === 'new' ? `<button class="icon-btn small" data-cancel-req="${esc(r.id)}" aria-label="Zrušiť žiadosť">✕</button>` : ''}
    </li>`).join('')}</ul>` : ''}
    <p class="hint" id="book-msg" style="margin:10px 0 0"></p>
  </section>`;
}

async function sendRequest() {
  const btn = document.getElementById('book-send');
  const msg = document.getElementById('book-msg');
  if (!bookDate || !bookTime) return;
  const note = (document.getElementById('book-note')?.value || '').trim().slice(0, 200);
  if (requests.some((r) => r.date === bookDate && r.time === bookTime && r.status !== 'declined')) { msg.textContent = 'Na tento termín už máš žiadosť.'; return; }
  btn.disabled = true; btn.textContent = 'Posielam…';
  const data = { date: bookDate, time: bookTime, note, clientName: client()?.name || '', ownerUid: TRAINER.ownerUid || '' };
  try {
    if (isDemo()) { requests.push({ id: 'r' + Date.now(), ...data, status: 'new', createdAt: Date.now() }); }
    else {
      await cloudReady();
      const owner = TRAINER.ownerUid;
      const dur = Number(availability()?.duration) || 60;
      if (owner && window.clientCloud.holdSlot && !(await window.clientCloud.holdSlot(owner, bookDate, bookTime, dur))) {
        await loadRequests();
        bookTime = '';
        render();
        document.getElementById('book-msg').textContent = 'Tento termín si medzitým zabral niekto iný – vyber iný čas.';
        return;
      }
      let id;
      try { id = await window.clientCloud.addRequest(authCode, data); }
      catch (e) { if (owner) window.clientCloud.releaseHold?.(owner, bookDate, bookTime); throw e; }
      if (owner) holds.push({ ownerUid: owner, date: bookDate, time: bookTime, duration: dur });
      requests.push({ id, ...data, status: 'new', createdAt: Date.now() });
      notifyTrainer(data);
    }
    bookDate = ''; bookTime = ''; bookOpen = false;
    render();
    document.getElementById('book-msg').textContent = 'Žiadosť odoslaná – tréner ti termín potvrdí.';
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Poslať žiadosť';
    msg.textContent = e?.code === 'permission-denied' ? 'Odoslanie zamietnuté – ozvi sa trénerovi.' : 'Nepodarilo sa odoslať. Skontroluj internet.';
  }
}

// upozornenie trénerovi do appky ntfy (ak si ho zapol) – jednoduchá požiadavka bez CORS predletu, chyba sa ignoruje
function notifyTrainer(r) {
  const topic = TRAINER.ntfy;
  if (!topic || !/^[\w-]{1,64}$/.test(topic)) return;
  const q = new URLSearchParams({ title: `Žiadosť o tréning – ${r.clientName || 'klient'}`, tags: 'calendar', click: 'https://koval9720.github.io/trainer-app/' });
  fetch(`https://ntfy.sh/${topic}?${q}`, { method: 'POST', body: `${fmtDay(r.date)} o ${r.time}${r.note ? `\n${r.note}` : ''}` }).catch(() => {});
}

async function cancelRequest(id) {
  try {
    const r = requests.find((x) => x.id === id);
    if (!isDemo()) {
      await cloudReady();
      await window.clientCloud.cancelRequest(authCode, id);
      // termín je znova voľný aj pre ostatných klientov
      if (r && TRAINER.ownerUid) { window.clientCloud.releaseHold?.(TRAINER.ownerUid, r.date, r.time); holds = holds.filter((h) => !(h.date === r.date && h.time === r.time)); }
    }
    requests = requests.filter((x) => x.id !== id);
    render();
  } catch (e) { document.getElementById('book-msg').textContent = 'Žiadosť sa nepodarilo zrušiť.'; }
}

function viewPlan() {
  const plans = myPlans();
  if (!plans.length) return `<div class="page-head"><div><h1>Tréningový plán</h1></div></div><section class="card"><p class="empty">Tréner ti zatiaľ nepripravil plán.</p><p class="muted" style="margin:0 0 12px">Ak si cvičil/a sám/sama, zapíš si to – tréner to uvidí.</p><button class="btn primary" data-log-workout="" style="width:100%">+ Zapísať tréning</button></section>`;
  return `
  <div class="page-head"><div><h1>Tréningový plán</h1><p class="muted">Na dni, keď trénuješ sám/sama.</p></div></div>
  ${plans.map((p) => `<section class="card">
    <div class="card-head"><h2>${esc(p.name)}</h2><span class="row"><span class="badge">${cnt(p.items.length, 'cvik', 'cviky', 'cvikov')}</span><button class="btn small primary" data-log-workout="${esc(p.id)}">Zapísať tréning</button></span></div>
    <ul class="plan-items">${p.items.map((it, i) => {
      const dose = [it.sets && it.reps ? `${it.sets} × ${it.reps}` : it.sets ? `${it.sets} sérií` : it.reps || '', it.weight || '', it.rest ? `pauza ${it.rest}` : ''].filter(Boolean).join(' · ');
      return `<li><span class="n">${i + 1}</span><div class="info"><strong>${esc(exName(it.exerciseId))}</strong><div class="dose">${esc(dose)}</div>${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}</div></li>`;
    }).join('')}</ul>
  </section>`).join('')}`;
}

let chartN = 0;
function chartHtml(points, unit) {
  const xs = points.map((p) => parseDate(p.date).getTime());
  const x0 = xs[0];
  const span = xs[xs.length - 1] - x0 || 1;
  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) { hi += 1; lo -= 1; }
  const padV = (hi - lo) * 0.18;
  lo -= padV; hi += padV;
  const X = (i) => (points.length === 1 ? 50 : 3 + ((xs[i] - x0) / span) * 94);
  const Y = (v) => 8 + ((hi - v) / (hi - lo)) * 84;
  const pts = points.map((p, i) => [X(i), Y(p.value)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(2)} 100 L${pts[0][0].toFixed(2)} 100 Z`;
  const id = `cg${++chartN}`;
  const last = points.length - 1;
  const label = (i, cls) => `<span class="chart-val ${cls}" style="left:${pts[i][0]}%;top:${pts[i][1]}%">${fmtNum(points[i].value)}</span>`;
  return `<div class="chart" role="img" aria-label="Graf: ${points.map((p) => `${fmtShort(p.date)} ${fmtNum(p.value)} ${unit}`).join(', ')}">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46b3a7" stop-opacity=".32"/><stop offset="1" stop-color="#46b3a7" stop-opacity="0"/></linearGradient>
        <linearGradient id="${id}l" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0"><stop offset="0" stop-color="#8fdcd2"/><stop offset="1" stop-color="#7fb3d5"/></linearGradient>
      </defs>
      <path d="${area}" fill="url(#${id}a)"/>
      <path d="${line}" fill="none" stroke="url(#${id}l)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>
    ${pts.map(([x, y], i) => `<span class="chart-dot${i === last ? ' last' : ''}" style="left:${x}%;top:${y}%"></span>`).join('')}
    ${label(0, 'first')}${last ? label(last, 'last') : ''}
  </div>
  <div class="chart-axis"><span>${fmtShort(points[0].date)} ${parseDate(points[0].date).getFullYear()}</span><span>${fmtShort(points[last].date)} ${parseDate(points[last].date).getFullYear()}</span></div>`;
}
function chartSummary(points, unit, label) {
  const first = points[0], last = points[points.length - 1];
  const d = Math.round((last.value - first.value) * 100) / 100;
  const days = daysBetween(first.date, last.date);
  return `<div class="chart-sum">
    <div><span>${esc(label)} teraz</span><b>${fmtNum(last.value)} <small>${unit}</small></b></div>
    <div><span>Zmena${days ? ` za ${days < 60 ? cnt(days, 'deň', 'dni', 'dní') : cnt(Math.round(days / 7), 'týždeň', 'týždne', 'týždňov')}` : ''}</span><b class="chg">${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtNum(Math.abs(d))} <small>${unit}</small></b></div>
  </div>`;
}

let metric = 'weight';
function records() {
  const best = new Map();
  for (const s of mySessions()) {
    if (s.status !== 'done' || !s.log) continue;
    for (const e of s.log) {
      const top = topSet(e.sets);
      const cur = best.get(e.exerciseId);
      if (!cur || betterSet(top, cur.set) > 0) best.set(e.exerciseId, { set: top, date: s.date });
    }
  }
  return [...best].map(([exerciseId, r]) => ({ name: exName(exerciseId), ...r })).sort((a, b) => (b.set.w ?? 0) - (a.set.w ?? 0));
}
function viewProgress() {
  const ms = myMeasurements();
  const avail = METRICS.filter(([k]) => ms.some((m) => m[k] != null));
  if (!avail.some(([k]) => k === metric)) metric = avail[0]?.[0];
  const [key, label, unit] = METRICS.find(([k]) => k === metric) || [];
  const points = key ? ms.filter((m) => m[key] != null).map((m) => ({ date: m.date, value: m[key] })) : [];
  const delta = (v, p) => (v == null || p == null ? '' : `<span class="d ${v < p ? 'delta-down' : v > p ? 'delta-up' : ''}">${v > p ? '+' : ''}${fmtNum(v - p)}</span>`);
  const recs = records();
  return `
  <div class="page-head"><div><h1>Progres</h1><p class="muted">Merania, tvoje zápisy a osobné rekordy.</p></div></div>
  <section class="card">
    <div class="card-head"><h2>Merania</h2><span class="row"><span class="badge">${cnt(ms.length, 'meranie', 'merania', 'meraní')}</span><button class="btn small primary" data-log-measure>+ Zapísať</button></span></div>
    ${ms.length ? `<div class="chips chart-chips">${avail.map(([k, l]) => `<button class="chip${k === metric ? ' active' : ''}" data-metric="${k}">${l}</button>`).join('')}</div>
      ${points.length ? chartSummary(points, unit, label) + chartHtml(points, unit) : ''}
      <table style="margin-top:14px"><thead><tr><th>Dátum</th><th class="num">kg</th><th class="num">% tuk</th><th class="num">pás</th><th class="num">boky</th></tr></thead><tbody>
      ${[...ms].reverse().map((m, i, arr) => { const p = arr[i + 1] || {}; return `<tr><td>${fmtShort(m.date)}${m.self ? ' <small class="muted">(ja)</small>' : ''}</td><td class="num">${fmtNum(m.weight)}${delta(m.weight, p.weight)}</td><td class="num">${fmtNum(m.bodyFat)}${delta(m.bodyFat, p.bodyFat)}</td><td class="num">${fmtNum(m.waist)}${delta(m.waist, p.waist)}</td><td class="num">${fmtNum(m.hips)}${delta(m.hips, p.hips)}</td></tr>`; }).join('')}
      </tbody></table>` : '<p class="empty">Zatiaľ žiadne merania.</p>'}
  </section>
  <section class="card">
    <div class="card-head"><h2>Osobné rekordy</h2><span class="badge">${recs.length}</span></div>
    ${recs.length ? `<div class="records">${recs.map((r, i) => `<div class="record"><span class="medal">${i === 0 ? '🏆' : '💪'}</span><div><b>${esc(r.name)}</b><small>${fmtShort(r.date)} ${parseDate(r.date).getFullYear()}</small></div><span class="val">${fmtSet(r.set)}</span></div>`).join('')}</div>` : '<p class="empty">Rekordy sa objavia po prvom tréningu so zapísanými výkonmi.</p>'}
  </section>
  ${myEntriesCard()}`;
}

/* ---------- Vlastné zápisy klienta: meranie a tréning, ktorý odcvičil sám ---------- */
const numVal = (v) => { const t = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.'); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
let toastT = 0;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600);
}

function myEntriesCard() {
  const list = [...entries].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  if (!list.length) return '';
  const what = (e) => e.type === 'measure'
    ? ['Meranie', [e.weight != null ? `${fmtNum(e.weight)} kg` : '', e.bodyFat != null ? `${fmtNum(e.bodyFat)} % tuk` : '', e.waist != null ? `pás ${fmtNum(e.waist)}` : '', e.hips != null ? `boky ${fmtNum(e.hips)}` : ''].filter(Boolean).join(' · ')]
    : ['Tréning sám/sama', e.log?.length ? cnt(e.log.length, 'cvik', 'cviky', 'cvikov') : (e.note || '')];
  return `<section class="card">
    <div class="card-head"><h2>Moje zápisy</h2><span class="badge">${list.length}</span></div>
    <p class="muted" style="margin-top:-6px">Tréner ich vidí vo svojej appke.</p>
    <ul class="list">${list.map((e) => { const [t, d] = what(e); return `<li class="session">
      <span class="when">${esc(t)} · ${whenHtml(e.date)}<small>${esc(d)}</small></span><span class="spacer"></span>
      <button class="icon-btn small" data-del-entry="${esc(e.id)}" aria-label="Zmazať zápis">✕</button>
    </li>`; }).join('')}</ul>
  </section>`;
}

function entryDialog(title, body, onSave) {
  document.getElementById('entry-dlg')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<dialog id="entry-dlg"><form method="dialog">
    <header class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Zavrieť">✕</button></header>
    <div class="modal-body">${body}<p class="error" id="entry-err" style="flex-basis:100%;margin:0"></p></div>
    <footer class="modal-foot"><span class="spacer"></span><button type="button" class="btn" data-close>Zrušiť</button><button type="submit" class="btn primary">Uložiť</button></footer>
  </form></dialog>`);
  const dlg = document.getElementById('entry-dlg');
  dlg.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => dlg.close(); });
  dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 50));
  dlg.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const err = dlg.querySelector('#entry-err');
    const btn = dlg.querySelector('button[type=submit]');
    let data;
    try { data = onSave(dlg); } catch (x) { err.textContent = x.message; return; }
    btn.disabled = true; btn.textContent = 'Ukladám…';
    try {
      if (isDemo()) entries.push({ id: 'd' + Date.now(), ...data, createdAt: Date.now() });
      else { await cloudReady(); const id = await window.clientCloud.addEntry(authCode, TRAINER.ownerUid, data); entries.push({ id, ...data, createdAt: Date.now() }); }
      dlg.close(); render(); toast('Uložené – tréner to uvidí');
    } catch (x) {
      btn.disabled = false; btn.textContent = 'Uložiť';
      err.textContent = x?.code === 'permission-denied' ? 'Uloženie zamietnuté – skontroluj hodnoty alebo sa ozvi trénerovi.' : 'Nepodarilo sa uložiť. Skontroluj internet.';
    }
  };
  dlg.showModal();
}
const dateField = () => `<div class="field half"><label for="e-date">Dátum</label><input id="e-date" type="date" value="${today()}" max="${today()}" required></div>`;
const numField = (id, label, half = true) => `<div class="field${half ? ' half' : ''}"><label for="${id}">${label}</label><input id="${id}" type="text" inputmode="decimal" autocomplete="off"></div>`;
const checkDate = (dlg) => { const d = dlg.querySelector('#e-date').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today()) throw new Error('Vyber dátum (nie v budúcnosti).'); return d; };

function openMeasureForm() {
  entryDialog('Zapísať meranie', `${dateField()}${numField('e-weight', 'Váha (kg)')}${numField('e-fat', 'Tuk (%)')}${numField('e-waist', 'Pás (cm)')}${numField('e-hips', 'Boky (cm)')}`, (dlg) => {
    const date = checkDate(dlg);
    const out = { type: 'measure', date };
    for (const [id, key, lo, hi, name] of [['e-weight', 'weight', 20, 400, 'Váha'], ['e-fat', 'bodyFat', 1, 80, 'Tuk'], ['e-waist', 'waist', 30, 250, 'Pás'], ['e-hips', 'hips', 30, 250, 'Boky']]) {
      const v = numVal(dlg.querySelector('#' + id).value);
      if (v == null) continue;
      if (Number.isNaN(v) || v < lo || v > hi) throw new Error(`${name}: zadaj číslo od ${lo} do ${hi}.`);
      out[key] = Math.round(v * 10) / 10;
    }
    if (Object.keys(out).length < 3) throw new Error('Vyplň aspoň jednu hodnotu.');
    return out;
  });
}

function openWorkoutForm(planId) {
  const plans = myPlans();
  const plan = plans.find((p) => p.id === planId) || plans[0];
  if (!plan) { openFreeWorkoutForm(); return; }
  const rows = plan.items.map((it, i) => {
    const n = Math.min(Math.max(parseInt(it.sets, 10) || 3, 1), 8);
    return `<div class="field log-ex" data-ex="${esc(it.exerciseId)}"><label>${i + 1}. ${esc(exName(it.exerciseId))}${it.reps ? ` <span class="muted" style="text-transform:none;letter-spacing:0">· plán ${esc(String(it.sets || ''))}${it.sets ? ' × ' : ''}${esc(String(it.reps))}</span>` : ''}</label>
      ${Array.from({ length: n }, (_, k) => `<div class="log-set"><span class="muted">${k + 1}.</span><input type="text" inputmode="decimal" placeholder="kg" data-w aria-label="Séria ${k + 1} – kg"><input type="text" inputmode="numeric" placeholder="opak." data-r aria-label="Séria ${k + 1} – opakovania"></div>`).join('')}</div>`;
  }).join('');
  const planPick = plans.length > 1 ? `<div class="field half"><label for="e-plan">Plán</label><select id="e-plan">${plans.map((p) => `<option value="${esc(p.id)}" ${p === plan ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>` : '';
  entryDialog(`Tréning sám/sama – ${plan.name}`, `${dateField()}${planPick}<p class="hint" style="flex-basis:100%;margin:0">Vyplň, čo si odcvičil/a – prázdne série sa neuložia. Pri cvikoch bez záťaže stačia opakovania (alebo sekundy).</p>${rows}<div class="field"><label for="e-note">Poznámka (nepovinné)</label><input id="e-note" maxlength="300" placeholder="napr. ako si sa cítil/a"></div>`, (dlg) => {
    const date = checkDate(dlg);
    const log = [];
    for (const ex of dlg.querySelectorAll('.log-ex')) {
      const sets = [];
      for (const row of ex.querySelectorAll('.log-set')) {
        const w = numVal(row.querySelector('[data-w]').value), r = numVal(row.querySelector('[data-r]').value);
        if (w == null && r == null) continue;
        if (Number.isNaN(w) || Number.isNaN(r) || (w != null && (w < 0 || w > 500)) || (r != null && (r < 0 || r > 1000))) throw new Error(`${exName(ex.dataset.ex)}: skontroluj čísla.`);
        sets.push({ w: w == null ? null : Math.round(w * 4) / 4, r: r == null ? null : Math.round(r) });
      }
      if (sets.length) log.push({ exerciseId: ex.dataset.ex, sets });
    }
    const note = (dlg.querySelector('#e-note').value || '').trim().slice(0, 300);
    if (!log.length && !note) throw new Error('Vyplň aspoň jednu sériu alebo poznámku.');
    return { type: 'workout', date, ...(log.length ? { log } : {}), ...(note ? { note } : {}) };
  });
  const sel = document.getElementById('e-plan');
  if (sel) sel.onchange = () => { document.getElementById('entry-dlg').close(); openWorkoutForm(sel.value); };
}

// klient bez plánu: tréning popíše vlastnými slovami
function openFreeWorkoutForm() {
  entryDialog('Zapísať tréning', `${dateField()}<div class="field"><label for="e-note">Čo si cvičil/a</label><textarea id="e-note" rows="4" maxlength="300" placeholder="napr. beh 5 km za 28 min, kliky 3 × 20, plank 3 × 1 min"></textarea><span class="hint">Tréner to uvidí vo svojej appke.</span></div>`, (dlg) => {
    const date = checkDate(dlg);
    const note = (dlg.querySelector('#e-note').value || '').trim().slice(0, 300);
    if (!note) throw new Error('Napíš, čo si cvičil/a.');
    return { type: 'workout', date, note };
  });
}

async function deleteEntry(id) {
  if (!confirm('Zmazať tento zápis?')) return;
  try {
    if (!isDemo()) { await cloudReady(); await window.clientCloud.deleteEntry(authCode, id); }
    entries = entries.filter((e) => e.id !== id);
    render(); toast('Zápis zmazaný');
  } catch (e) { toast('Zápis sa nepodarilo zmazať'); }
}

function viewLogin() {
  return `<div class="login-wrap"><div class="login-box">
    <a class="back" href="../">← Späť na web</a>
    <img class="logo" src="../icons/icon.svg" alt="" style="display:block">
    <h1>Klientska zóna</h1>
    <p>Zadaj prístupový kód, ktorý si dostal/a od trénera.</p>
    <form id="login-form">
      <label for="code">Prístupový kód</label>
      <input id="code" name="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="KÓD" required>
      <button class="btn primary block" type="submit">Prihlásiť sa</button>
      <p class="error" id="login-error">${esc(logoutMsg)}</p>
    </form>
  </div></div>`;
}

/* ---------- Vykreslenie ---------- */
const ROUTES = { '': viewHome, sessions: viewSessions, plan: viewPlan, progress: viewProgress };
function route() { return location.hash.replace(/^#\/?/, '').split('/')[0]; }

function render(animate = false) {
  const app = document.getElementById('app');
  const c = client();
  if (c && !requestsLoaded && ['sessions', 'progress', '', 'plan'].includes(route())) loadRequests().then(() => render());
  if (!c) {
    document.body.classList.add('login');
    app.innerHTML = viewLogin();
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Overujem…';
      logoutMsg = '';
      const r = await login(document.getElementById('code').value);
      if (r.ok) { location.hash = ''; render(true); refresh(); }
      else { btn.disabled = false; btn.textContent = 'Prihlásiť sa'; document.getElementById('login-error').textContent = r.msg; }
    });
    document.getElementById('code').focus();
    return;
  }
  document.body.classList.remove('login');
  const r = route();
  const view = ROUTES[r] || viewHome;
  app.innerHTML = `
  <header class="topbar">
    <a href="#/" class="brand"><span class="avatar">${c.photo ? `<img src="${c.photo}" alt="" decoding="sync">` : initials(c.name)}</span><span>${esc(c.name)}<small>Tréner: ${esc(TRAINER.name)}</small></span></a>
    <button class="topbar-btn text" id="logout" type="button">Odhlásiť</button>
  </header>
  <main id="main">${view()}</main>
  <nav class="nav" aria-label="Hlavná navigácia">
    <a href="#/" class="${r === '' ? 'active' : ''}"><svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg><span>Prehľad</span></a>
    <a href="#/sessions" class="${r === 'sessions' ? 'active' : ''}"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg><span>Tréningy</span></a>
    <a href="#/plan" class="${r === 'plan' ? 'active' : ''}"><svg viewBox="0 0 24 24"><path d="M9 5h10M9 12h10M9 19h10M5 5h.01M5 12h.01M5 19h.01"/></svg><span>Plán</span></a>
    <a href="#/progress" class="${r === 'progress' ? 'active' : ''}"><svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M14 7h7v7"/></svg><span>Progres</span></a>
  </nav>`;
  document.getElementById('logout').addEventListener('click', () => logout());
  window.scrollTo(0, 0);
  if (animate && !reduceMotion.matches) animateEnter();
}

/* ---------- Animácie (ako v appke Tréner) ---------- */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
function animateEnter() {
  const main = document.getElementById('main');
  if (!main) return;
  main.classList.remove('animate');
  void main.offsetWidth;
  main.classList.add('animate');
  const els = main.querySelectorAll(':scope > *, .stats > .stat, .card .list > li, .plan-items > li, .records > .record');
  let i = 0;
  els.forEach((el) => { el.style.animationDelay = `${Math.min(i++, 14) * 45}ms`; });
  clearTimeout(animateEnter.t);
  animateEnter.t = setTimeout(() => main.classList.remove('animate'), 1400);
  main.querySelectorAll('.stat b').forEach(countUp);
}
// Číslo „nabehne“ od nuly po svoju hodnotu
function countUp(el) {
  if (!/^\d+$/.test(el.textContent.trim())) return;
  const target = parseInt(el.textContent, 10);
  if (!Number.isFinite(target) || target === 0) return;
  const start = performance.now();
  const dur = 900;
  const step = (now) => {
    const t = Math.min((now - start) / dur, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  el.textContent = '0';
  requestAnimationFrame(step);
}

document.addEventListener('click', (e) => {
  const f = e.target.closest('[data-filter]');
  if (f) { sessionsFilter = f.dataset.filter; render(); return; }
  const m = e.target.closest('[data-metric]');
  if (m) { metric = m.dataset.metric; render(); return; }
  const t = e.target.closest('[data-toggle]');
  if (t) { const id = t.dataset.toggle; openLogs.has(id) ? openLogs.delete(id) : openLogs.add(id); render(); return; }
  if (e.target.closest('#book-open')) { bookOpen = !bookOpen; if (!bookOpen) { bookDate = ''; bookTime = ''; } render(); if (bookOpen) document.getElementById('booking')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
  const bd = e.target.closest('[data-book-date]');
  if (bd) { bookDate = bd.dataset.bookDate; bookTime = ''; render(); document.getElementById('booking')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
  const bt = e.target.closest('[data-book-time]');
  if (bt) { const note = document.getElementById('book-note')?.value || ''; bookTime = bt.dataset.bookTime; render(); const n = document.getElementById('book-note'); if (n) n.value = note; return; }
  if (e.target.closest('#book-send')) { sendRequest(); return; }
  const lw = e.target.closest('[data-log-workout]');
  if (lw) { openWorkoutForm(lw.dataset.logWorkout); return; }
  if (e.target.closest('[data-log-measure]')) { openMeasureForm(); return; }
  const de = e.target.closest('[data-del-entry]');
  if (de) { deleteEntry(de.dataset.delEntry); return; }
  const cr = e.target.closest('[data-cancel-req]');
  if (cr) { cancelRequest(cr.dataset.cancelReq); }
});
window.addEventListener('hashchange', () => render());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
// Štart: úvodná čiara, fotka pozadia sa roztmaví až po načítaní, potom nabehne obsah
const bgReady = new Promise((resolve) => {
  const img = new Image();
  img.src = '../icons/bg-gym.jpg';
  const done = () => resolve();
  (img.decode ? img.decode() : Promise.resolve()).then(done, done);
  setTimeout(done, 1500);
}).then(() => document.body.classList.add('bg-ready'));
boot();
render(false);
const splash = document.getElementById('splash');
// Opakované otvorenie (klient už prihlásený): obsah hneď, bez úvodnej čiary a bez animácií – iPhone inak
// ukáže posledný stav appky, potom tmavú obrazovku a znova obsah, čo pôsobí ako blikanie
if (clientId) {
  document.body.classList.add('no-anim', 'bg-ready', 'ready');
  splash?.remove();
} else {
  const wait = reduceMotion.matches ? 0 : Math.max(0, 500 - performance.now());
  Promise.all([bgReady, new Promise((r) => setTimeout(r, wait))]).then(() => {
    if (splash) splash.classList.add('hide');
    document.body.classList.add('ready');
    if (!reduceMotion.matches) animateEnter();
    setTimeout(() => splash?.remove(), 450);
  });
}
// po prihlásení už animácie bežia normálne
document.addEventListener('click', () => document.body.classList.remove('no-anim'), { once: true });

// Offline a okamžité spustenie: súbory z pamäte telefónu, nová verzia na pozadí
// Nová verzia appky: keď ju service worker prevezme, stránka sa sama obnoví (ak práve nič nevypĺňaš – inak pri odchode)
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; } // prvá inštalácia – nič neobnovovať
    const go = () => { if (!reloading) { reloading = true; location.reload(); } };
    if (!document.querySelector('dialog[open]')) go();
    else document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') go(); }, { once: true });
  });
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
  });
}

/* Potiahni a obnov – ťah prstom zhora nadol na začiatku stránky načíta najnovšie dáta z cloudu */
function pullToRefresh(onRefresh) {
  const el = document.createElement('div');
  el.className = 'ptr';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>';
  document.body.append(el);
  const MAX = 96, TRIGGER = 64;
  let y0 = null, pull = 0, busy = false;
  const show = (p) => {
    el.style.transform = `translate(-50%, ${p - 44}px) rotate(${p * 4}deg)`;
    el.style.opacity = String(Math.min(1, p / TRIGGER));
    el.classList.toggle('ready', p >= TRIGGER);
  };
  const blocked = (t) => document.querySelector('dialog[open]') || t.closest?.('input, textarea, select, .chips, .book-days, .book-times');
  addEventListener('touchstart', (e) => {
    y0 = !busy && window.scrollY <= 0 && e.touches.length === 1 && !blocked(e.target) ? e.touches[0].clientY : null;
    pull = 0;
    if (y0 != null) el.classList.add('drag');
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    pull = dy > 0 && window.scrollY <= 0 ? Math.min(MAX, dy * 0.5) : 0;
    show(pull);
  }, { passive: true });
  const end = async () => {
    if (y0 == null) return;
    y0 = null;
    el.classList.remove('drag');
    if (pull < TRIGGER) { show(0); return; }
    busy = true;
    show(TRIGGER);
    el.classList.add('spin');
    navigator.vibrate?.(10);
    const t0 = Date.now();
    try { await onRefresh(); } catch (e) { /* bez siete */ }
    await new Promise((r) => setTimeout(r, Math.max(0, 700 - (Date.now() - t0))));
    el.classList.remove('spin');
    show(0);
    busy = false;
  };
  addEventListener('touchend', end, { passive: true });
  addEventListener('touchcancel', end, { passive: true });
}
pullToRefresh(async () => {
  if (!authCode) return;
  lastUpdated = null; // načítať a prekresliť aj keď sa nič nezmenilo
  await refresh();
  await loadRequests();
  render();
});
