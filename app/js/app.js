'use strict';

/* =========================================================
   Klientska zóna – prihlásenie kódom, prehľad, tréningy, plán, progres
   Dáta zatiaľ z js/data.js (ukážka); neskôr zo zdieľanej databázy.
   ========================================================= */

const SESSION_KEY = 'klient-zona-id';
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
try { clientId = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY); } catch (e) { /* úložisko nedostupné */ }

const client = () => DB.clients.find((c) => c.id === clientId);
const mySessions = () => DB.sessions.filter((s) => s.clientId === clientId).sort(bySessionTime);
const myPlans = () => DB.plans.filter((p) => p.clientId === clientId);
const myMeasurements = () => DB.measurements.filter((m) => m.clientId === clientId).sort((a, b) => a.date.localeCompare(b.date));

function login(code) {
  const id = ACCESS_CODES[code.trim().toUpperCase()];
  if (!id) return false;
  clientId = id;
  try { localStorage.setItem(SESSION_KEY, id); } catch (e) { /* ok */ }
  return true;
}
function logout() {
  clientId = null;
  try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ok */ }
  location.hash = '';
  render();
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
  <div class="page-head"><h1>Ahoj, ${esc(c.name.split(' ')[0])} 👋</h1><p>${esc(c.goal)}</p></div>
  <section class="card hero-card">
    <span class="eyebrow">Najbližší tréning</span>
    ${next ? `<b>${fmtDay(next.date)} o ${esc(next.time)}</b><p class="sub">${next.note ? esc(next.note) + ' · ' : ''}${DAYS[weekday(next.date)]} ${fmtShort(next.date)}</p>` : `<b>Zatiaľ nič naplánované</b><p class="sub">Dohodni si termín s trénerom.</p>`}
    <div class="row"><a class="btn primary" href="${TRAINER.whatsapp}">Napísať trénerovi</a><a class="btn" href="#/sessions">Všetky tréningy</a></div>
  </section>
  <div class="stats" style="margin-top:14px">
    <div class="stat"><b>${done.length}</b><span>odtrénované</span></div>
    <div class="stat"><b>${thisWeek.length}</b><span>tento týždeň</span></div>
    <div class="stat"><b>${dw == null ? '–' : (dw > 0 ? '+' : '') + fmtNum(dw)}</b><span>kg od začiatku</span></div>
  </div>
  <section class="card">
    <div class="card-head"><h2>Tento týždeň</h2><span class="badge">${DAYS_SHORT[0]} ${fmtShort(weekStart)} – ${DAYS_SHORT[6]} ${fmtShort(addDays(weekStart, 6))}</span></div>
    ${sessionList(thisWeek, 'Tento týždeň nemáš žiadny tréning.')}
  </section>
  ${myPlans().length ? `<section class="card"><div class="card-head"><h2>Tvoj plán</h2><a class="icon-btn" href="#/plan">Otvoriť</a></div>${myPlans().map((p) => `<div class="session"><span class="when">${esc(p.name)}<small>${cnt(p.items.length, 'cvik', 'cviky', 'cvikov')}</small></span></div>`).join('')}</section>` : ''}`;
}

function sessionRow(s, open = false) {
  const tag = s.status === 'done' ? '<span class="tag ok">Odtrénovaný</span>' : s.status === 'cancelled' ? '<span class="tag">Zrušený</span>' : '<span class="tag primary">Naplánovaný</span>';
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
  <div class="page-head"><h1>Tréningy</h1><p>${cnt(lists.done.length, 'odtrénovaný tréning', 'odtrénované tréningy', 'odtrénovaných tréningov')}</p></div>
  <div class="chips">${chips.map(([k, l]) => `<button class="chip${sessionsFilter === k ? ' active' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
  <section class="card">${sessionList(lists[sessionsFilter], sessionsFilter === 'upcoming' ? 'Žiadny naplánovaný tréning.' : 'Zatiaľ žiadne tréningy.')}</section>`;
}

function viewPlan() {
  const plans = myPlans();
  if (!plans.length) return `<div class="page-head"><h1>Tréningový plán</h1></div><section class="card"><p class="empty">Tréner ti zatiaľ nepripravil plán.</p></section>`;
  return `
  <div class="page-head"><h1>Tréningový plán</h1><p>Na dni, keď trénuješ sám/sama.</p></div>
  ${plans.map((p) => `<section class="card">
    <div class="card-head"><h2>${esc(p.name)}</h2><span class="badge">${cnt(p.items.length, 'cvik', 'cviky', 'cvikov')}</span></div>
    ${p.items.map((it, i) => {
      const dose = [it.sets && it.reps ? `${it.sets} × ${it.reps}` : it.sets ? `${it.sets} sérií` : it.reps || '', it.weight || '', it.rest ? `pauza ${it.rest}` : ''].filter(Boolean).join(' · ');
      return `<div class="plan-item"><span class="no">${i + 1}</span><div><div class="name">${esc(exName(it.exerciseId))}</div><div class="dose">${esc(dose)}</div>${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}</div></div>`;
    }).join('')}
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
        <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7ebf" stop-opacity=".32"/><stop offset="1" stop-color="#ff7ebf" stop-opacity="0"/></linearGradient>
        <linearGradient id="${id}l" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0"><stop offset="0" stop-color="#ffa8d5"/><stop offset="1" stop-color="#b98cff"/></linearGradient>
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
  const delta = (v, p) => (v == null || p == null ? '' : `<span class="d ${v < p ? 'down' : v > p ? 'up' : ''}">${v > p ? '+' : ''}${fmtNum(v - p)}</span>`);
  const recs = records();
  return `
  <div class="page-head"><h1>Progres</h1><p>Merania od trénera a tvoje osobné rekordy.</p></div>
  <section class="card">
    <div class="card-head"><h2>Merania</h2><span class="badge">${cnt(ms.length, 'meranie', 'merania', 'meraní')}</span></div>
    ${ms.length ? `<div class="chips">${avail.map(([k, l]) => `<button class="chip${k === metric ? ' active' : ''}" data-metric="${k}">${l}</button>`).join('')}</div>
      ${points.length ? chartSummary(points, unit, label) + chartHtml(points, unit) : ''}
      <table class="measure" style="margin-top:14px"><thead><tr><th>Dátum</th><th>kg</th><th>% tuk</th><th>pás</th><th>boky</th></tr></thead><tbody>
      ${[...ms].reverse().map((m, i, arr) => { const p = arr[i + 1] || {}; return `<tr><td>${fmtShort(m.date)}</td><td>${fmtNum(m.weight)}${delta(m.weight, p.weight)}</td><td>${fmtNum(m.bodyFat)}${delta(m.bodyFat, p.bodyFat)}</td><td>${fmtNum(m.waist)}${delta(m.waist, p.waist)}</td><td>${fmtNum(m.hips)}${delta(m.hips, p.hips)}</td></tr>`; }).join('')}
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
    <div class="logo"><svg viewBox="0 0 24 24"><path d="M6 5v14M18 5v14M3 8v8M21 8v8M6 12h12"/></svg></div>
    <h1>Klientska zóna</h1>
    <p>Zadaj prístupový kód, ktorý si dostal/a od trénera.</p>
    <form id="login-form">
      <label for="code">Prístupový kód</label>
      <input id="code" name="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="KÓD" required>
      <button class="btn primary block" type="submit">Prihlásiť sa</button>
      <p class="error" id="login-error"></p>
    </form>
    <p class="demo">Ukážka: skús kód <code>DEMO</code></p>
  </div></div>`;
}

/* ---------- Vykreslenie ---------- */
const ROUTES = { '': viewHome, sessions: viewSessions, plan: viewPlan, progress: viewProgress };
function route() { return location.hash.replace(/^#\/?/, '').split('/')[0]; }

function render() {
  const app = document.getElementById('app');
  const c = client();
  if (!c) {
    document.body.classList.add('login');
    app.innerHTML = viewLogin();
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (login(document.getElementById('code').value)) { location.hash = ''; render(); }
      else document.getElementById('login-error').textContent = 'Tento kód nepoznáme. Skontroluj ho alebo sa ozvi trénerovi.';
    });
    document.getElementById('code').focus();
    return;
  }
  document.body.classList.remove('login');
  const r = route();
  const view = ROUTES[r] || viewHome;
  app.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="avatar">${initials(c.name)}</span><span>${esc(c.name)}<small>Tréner: ${esc(TRAINER.name)}</small></span></div>
    <button class="icon-btn" id="logout" type="button">Odhlásiť</button>
  </header>
  <main id="main" class="enter">${view()}</main>
  <nav class="nav" aria-label="Hlavná navigácia">
    <a href="#/" class="${r === '' ? 'active' : ''}"><svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg><span>Prehľad</span></a>
    <a href="#/sessions" class="${r === 'sessions' ? 'active' : ''}"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg><span>Tréningy</span></a>
    <a href="#/plan" class="${r === 'plan' ? 'active' : ''}"><svg viewBox="0 0 24 24"><path d="M9 5h10M9 12h10M9 19h10M5 5h.01M5 12h.01M5 19h.01"/></svg><span>Plán</span></a>
    <a href="#/progress" class="${r === 'progress' ? 'active' : ''}"><svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M14 7h7v7"/></svg><span>Progres</span></a>
  </nav>`;
  document.getElementById('logout').addEventListener('click', logout);
  window.scrollTo(0, 0);
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
render();
