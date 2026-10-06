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
const mySessions = () => DB.sessions.filter((s) => s.clientId === clientId).sort(bySessionTime);
const myPlans = () => DB.plans.filter((p) => p.clientId === clientId);
const myMeasurements = () => DB.measurements.filter((m) => m.clientId === clientId).sort((a, b) => a.date.localeCompare(b.date));

const normCode = (raw) => String(raw || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
const intlPhone = (phone) => { const p = String(phone || '').replace(/[^\d+]/g, ''); return p.startsWith('+') ? p.slice(1) : p.startsWith('00') ? p.slice(2) : p.startsWith('0') ? '421' + p.slice(1) : p; };

// Dáta z cloudu → rovnaká štruktúra, akú používajú obrazovky
function applySnapshot(snap) {
  const cid = snap.clientId;
  DB = {
    clients: [{ id: cid, name: snap.client?.name || 'Klient', goal: snap.client?.goal || '', since: snap.client?.since || '', photo: snap.client?.photo || '' }],
    sessions: (snap.sessions || []).map((x) => ({ ...x, clientId: cid })),
    plans: (snap.plans || []).map((p) => ({ ...p, clientId: cid })),
    exercises: snap.exercises || [],
    measurements: (snap.measurements || []).map((m) => ({ ...m, clientId: cid }))
  };
  const phone = snap.trainer?.phone || '';
  const photo = typeof snap.trainer?.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(snap.trainer.photo) ? snap.trainer.photo : '';
  TRAINER = { name: snap.trainer?.name || 'Tréner', phone, whatsapp: phone ? `https://wa.me/${intlPhone(phone)}` : '', photo };
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
  await Promise.race([cloudReady(), new Promise((r) => setTimeout(r, 6000))]);
  if (!window.clientCloud) return { ok: false, msg: 'Nepodarilo sa pripojiť k serveru. Skús to o chvíľu.' };
  try {
    const snap = await window.clientCloud.fetch(code);
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
  clientId = null; authCode = null; logoutMsg = msg;
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
    login(m[1]).then((r) => { if (!r.ok) { logoutMsg = r.msg; } render(); if (r.ok) refresh(); });
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
    ${next ? `<h2 class="hero-title">${fmtDay(next.date)} o ${esc(next.time)}</h2><p class="hero-sub">${next.note ? esc(next.note) + ' · ' : ''}${DAYS[weekday(next.date)]} ${fmtShort(next.date)}</p>` : `<h2 class="hero-title">Zatiaľ nič naplánované</h2><p class="hero-sub">Dohodni si termín s trénerom.</p>`}
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
      <span class="avatar lg">${t.photo ? `<img src="${t.photo}" alt="" decoding="sync">` : initials(t.name)}</span>
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
  const tag = s.status === 'done' ? '<span class="badge done">Odtrénovaný</span>' : s.status === 'cancelled' ? '<span class="badge cancelled">Zrušený</span>' : '<span class="badge planned">Naplánovaný</span>';
  const log = open && s.log ? `<div class="log">${s.log.map((e) => `<div><span>${esc(exName(e.exerciseId))}</span><span>${e.sets.map(fmtSet).join(' · ')}</span></div>`).join('')}</div>` : '';
  return `<div class="session ${s.status}${s.log ? ' open' : ''}" ${s.log ? `data-toggle="${s.id}"` : ''}>
    <span class="when">${fmtDay(s.date)}${s.time ? ` o ${esc(s.time)}` : ''}<small>${s.note ? esc(s.note) : s.log ? `${cnt(s.log.length, 'cvik', 'cviky', 'cvikov')} · ťukni pre výkony` : DAYS[weekday(s.date)]}</small></span>
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
  <div class="page-head"><div><h1>Tréningy</h1><p class="muted">${cnt(lists.done.length, 'odtrénovaný tréning', 'odtrénované tréningy', 'odtrénovaných tréningov')}</p></div></div>
  <div class="chips chart-chips">${chips.map(([k, l]) => `<button class="chip${sessionsFilter === k ? ' active' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
  <section class="card">${sessionList(lists[sessionsFilter], sessionsFilter === 'upcoming' ? 'Žiadny naplánovaný tréning.' : 'Zatiaľ žiadne tréningy.')}</section>`;
}

function viewPlan() {
  const plans = myPlans();
  if (!plans.length) return `<div class="page-head"><div><h1>Tréningový plán</h1></div></div><section class="card"><p class="empty">Tréner ti zatiaľ nepripravil plán.</p></section>`;
  return `
  <div class="page-head"><div><h1>Tréningový plán</h1><p class="muted">Na dni, keď trénuješ sám/sama.</p></div></div>
  ${plans.map((p) => `<section class="card">
    <div class="card-head"><h2>${esc(p.name)}</h2><span class="badge">${cnt(p.items.length, 'cvik', 'cviky', 'cvikov')}</span></div>
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
  <div class="page-head"><div><h1>Progres</h1><p class="muted">Merania od trénera a tvoje osobné rekordy.</p></div></div>
  <section class="card">
    <div class="card-head"><h2>Merania</h2><span class="badge">${cnt(ms.length, 'meranie', 'merania', 'meraní')}</span></div>
    ${ms.length ? `<div class="chips chart-chips">${avail.map(([k, l]) => `<button class="chip${k === metric ? ' active' : ''}" data-metric="${k}">${l}</button>`).join('')}</div>
      ${points.length ? chartSummary(points, unit, label) + chartHtml(points, unit) : ''}
      <table style="margin-top:14px"><thead><tr><th>Dátum</th><th class="num">kg</th><th class="num">% tuk</th><th class="num">pás</th><th class="num">boky</th></tr></thead><tbody>
      ${[...ms].reverse().map((m, i, arr) => { const p = arr[i + 1] || {}; return `<tr><td>${fmtShort(m.date)}</td><td class="num">${fmtNum(m.weight)}${delta(m.weight, p.weight)}</td><td class="num">${fmtNum(m.bodyFat)}${delta(m.bodyFat, p.bodyFat)}</td><td class="num">${fmtNum(m.waist)}${delta(m.waist, p.waist)}</td><td class="num">${fmtNum(m.hips)}${delta(m.hips, p.hips)}</td></tr>`; }).join('')}
      </tbody></table>` : '<p class="empty">Zatiaľ žiadne merania.</p>'}
  </section>
  <section class="card">
    <div class="card-head"><h2>Osobné rekordy</h2><span class="badge">${recs.length}</span></div>
    ${recs.length ? `<div class="records">${recs.map((r, i) => `<div class="record"><span class="medal">${i === 0 ? '🏆' : '💪'}</span><div><b>${esc(r.name)}</b><small>${fmtShort(r.date)} ${parseDate(r.date).getFullYear()}</small></div><span class="val">${fmtSet(r.set)}</span></div>`).join('')}</div>` : '<p class="empty">Rekordy sa objavia po prvom tréningu so zapísanými výkonmi.</p>'}
  </section>`;
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
    <p class="demo">Kód ti pošle tréner. Chceš si to len pozrieť? Skús <code>DEMO</code>.</p>
  </div></div>`;
}

/* ---------- Vykreslenie ---------- */
const ROUTES = { '': viewHome, sessions: viewSessions, plan: viewPlan, progress: viewProgress };
function route() { return location.hash.replace(/^#\/?/, '').split('/')[0]; }

function render(animate = true) {
  const app = document.getElementById('app');
  const c = client();
  if (!c) {
    document.body.classList.add('login');
    app.innerHTML = viewLogin();
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Overujem…';
      logoutMsg = '';
      const r = await login(document.getElementById('code').value);
      if (r.ok) { location.hash = ''; render(); refresh(); }
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
  if (t) { const id = t.dataset.toggle; openLogs.has(id) ? openLogs.delete(id) : openLogs.add(id); render(); }
});
window.addEventListener('hashchange', render);
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
const wait = reduceMotion.matches ? 0 : Math.max(0, 750 - performance.now());
Promise.all([bgReady, new Promise((r) => setTimeout(r, wait))]).then(() => {
  if (splash) splash.classList.add('hide');
  document.body.classList.add('ready');
  if (!reduceMotion.matches) animateEnter();
  setTimeout(() => splash?.remove(), 450);
});
