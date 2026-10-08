'use strict';

/* =========================================================
   Klientska zóna – správy s trénerom a týždenný check-in
   Správy sú v cloude pod kódom klienta: shared/{kód}/messages.
   Neprečítané = od trénera, novšie než posledné otvorenie záložky Správy.
   V ukážke (DEMO kód) sa správy len zobrazia v zariadení.
   ========================================================= */
const chatState = { code: null, un: null, msgs: [], ci: false, ciVals: {} };
const chatSeenKey = () => `klient-chat-seen-${authCode || ''}`;
const chatSeen = () => { try { return Number(localStorage.getItem(chatSeenKey())) || 0; } catch (e) { return 0; } };
const chatSetSeen = (t) => { try { localStorage.setItem(chatSeenKey(), String(t)); } catch (e) { /* ok */ } };
const chatUnread = () => chatState.msgs.filter((m) => m.from === 'trainer' && m.at > chatSeen()).length;
const chatMarkSeen = () => { const last = chatState.msgs.reduce((t, m) => Math.max(t, m.at), 0); if (last > chatSeen()) chatSetSeen(last); };

const CHAT_DEMO = () => {
  const d = (days, h) => { const t = new Date(); t.setDate(t.getDate() - days); t.setHours(h, 12, 0, 0); return t.getTime(); };
  return [
    { id: 'd1', from: 'trainer', kind: 'text', text: 'Ahoj! Ako sa cítiš po včerajšom tréningu? 💪', at: d(2, 18) },
    { id: 'd2', from: 'client', kind: 'text', text: 'Nohy cítim, ale dobre 😅 Vo štvrtok platí?', at: d(2, 19) },
    { id: 'd3', from: 'trainer', kind: 'text', text: 'Platí, o 17:00. Nezabudni sa dobre vyspať.', at: d(1, 8) }
  ];
};

/* ---------- Počúvanie cloudu ---------- */
function chatWatch() {
  const c = client();
  const code = c ? authCode : null;
  if (code === chatState.code) return;
  chatState.un?.();
  chatState.un = null;
  chatState.code = code;
  chatState.msgs = [];
  if (!code) return;
  if (isDemo()) { chatState.msgs = CHAT_DEMO(); chatUpdated(); return; }
  const start = () => {
    if (chatState.code !== code || chatState.un) return;
    chatState.un = window.clientCloud.watchMessages(code, (list) => { chatState.msgs = list; chatUpdated(); }, () => {});
  };
  if (window.clientCloud) start(); else window.addEventListener('client-cloud-ready', start, { once: true });
}
function chatUpdated() {
  if (route() === 'chat') { chatMarkSeen(); chatThreadUi(); }
  chatBadges();
  const due = document.getElementById('checkin-due');
  if (due && !checkinDue()) due.remove();
}
function chatBadges() {
  const n = route() === 'chat' ? 0 : chatUnread();
  document.querySelectorAll('[data-chat-badge]').forEach((el) => { el.textContent = n > 9 ? '9+' : String(n); el.hidden = !n; });
}

// ikonky check-inu a správ (čiarové, tyrkysové – namiesto emoji)
const CI_SVG = {
  weight: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M8.3 11a3.7 3.7 0 0 1 7.4 0"/><path d="M12 11l1.6-2.2"/>',
  sleep: '<path d="M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1z"/>',
  energy: '<path d="M13 3L5.5 13.5H11l-1 7.5 7.5-10.5H12z"/>',
  diet: '<path d="M12 7.5c-1.6-1.5-5.2-1.5-6.6 1.3-1.5 3 .2 8.6 3.2 10.8 1.2.9 2.2.5 3.4.1 1.2.4 2.2.8 3.4-.1 3-2.2 4.7-7.8 3.2-10.8-1.4-2.8-5-2.8-6.6-1.3z"/><path d="M12 7.5c0-2 .9-3.6 3-4.5"/>',
  stress: '<circle cx="12" cy="12" r="8.5"/><path d="M8.6 13.8a4 4 0 0 0 6.8 0"/><path d="M9.3 9.6h.01M14.7 9.6h.01" stroke-width="2.6"/>',
  checkin: '<rect x="5.5" y="4.5" width="13" height="16" rx="2.5"/><path d="M9.5 3.5h5v3h-5z"/><path d="M9 11.5l1.8 1.8L15 9.5M9 16.5h6"/>',
  note: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="M12.8 7.2l4 4"/>',
  chat: '<path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-4.6A8.5 8.5 0 1 1 20.5 12z"/>'
};
const ciIc = (k) => `<span class="ci-ic" aria-hidden="true"><svg viewBox="0 0 24 24">${CI_SVG[k]}</svg></span>`;

/* ---------- Check-in ---------- */
const lastCheckin = () => chatState.msgs.filter((m) => m.from === 'client' && m.kind === 'checkin').pop();
// výzva: v deň check-inu (ak ešte nebol posledné 2 dni) alebo keď od posledného prešlo viac než 8 dní
function checkinDue() {
  const day = TRAINER?.checkinDay;
  if (!Number.isInteger(day) || day < 0 || !client()) return false;
  const last = lastCheckin();
  const since = last ? (Date.now() - last.at) / 86400000 : Infinity;
  return (weekday(today()) === day && since > 2) || (last && since > 8);
}
const CHECKIN_ROWS = [['sleep', 'Spánok', 'Ako si spal/a?'], ['energy', 'Energia', 'Koľko si mal/a energie?'], ['diet', 'Strava', 'Ako sa ti darilo so stravou?'], ['stress', 'Pohoda', 'Ako sa cítiš psychicky?']];
const ciDots = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? `<span class="ci-dots" aria-label="${v} z 5">${'●'.repeat(v)}<i>${'●'.repeat(5 - v)}</i></span>` : '–');
function checkinCardHtml(ci = {}) {
  return `<b class="ci-title">${ciIc('checkin')} Týždenný check-in</b>
    <div class="ci-grid">
      ${typeof ci.weight === 'number' ? `<span class="ci-lbl">${ciIc('weight')} Váha</span><b>${fmtNum(ci.weight)} kg</b>` : ''}
      ${CHECKIN_ROWS.map(([k, label]) => `<span class="ci-lbl">${ciIc(k)} ${label}</span>${ciDots(ci[k])}`).join('')}
    </div>
    ${ci.note ? `<p class="ci-note">${esc(ci.note)}</p>` : ''}`;
}
function checkinFormHtml() {
  const v = chatState.ciVals;
  return `<section class="card checkin-form" id="checkin-form">
    <div class="card-head"><h2>${ciIc('checkin')} Týždenný check-in</h2><button type="button" class="icon-btn" data-ci="close" aria-label="Zavrieť">✕</button></div>
    <label class="field ci-weight"><span>${ciIc('weight')} Váha (kg) – nepovinné</span><input id="ci-weight" type="text" inputmode="decimal" placeholder="napr. 72,5" value="${esc(v.weight ?? '')}"></label>
    ${CHECKIN_ROWS.map(([k, label, q]) => `<div class="ci-row"><span>${ciIc(k)} ${label}<small>${q}</small></span>
      <div class="ci-scale" role="radiogroup" aria-label="${esc(label)}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="ci-pick${v[k] === n ? ' on' : ''}" role="radio" aria-checked="${v[k] === n}" data-ci="pick" data-k="${k}" data-n="${n}">${n}</button>`).join('')}</div></div>`).join('')}
    <label class="field"><span>${ciIc('note')} Ako sa ti darilo tento týždeň?</span><textarea id="ci-note" rows="3" maxlength="600" placeholder="Čo išlo dobre, čo nie, otázky na trénera…">${esc(v.note || '')}</textarea></label>
    <p class="hint">1 = zle, 5 = výborne</p>
    <button type="button" class="btn primary" data-ci="send" style="width:100%">Odoslať trénerovi</button>
    <p class="muted" id="ci-msg" style="margin:8px 0 0"></p>
  </section>`;
}

/* ---------- Záložka Správy ---------- */
const chatTime = (t) => new Date(t).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
const chatIso = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function chatThreadHtml() {
  const list = chatState.msgs;
  if (!list.length) return `<p class="empty chat-empty">Napíš trénerovi ${esc(TRAINER.name || '')} – odpoveď uvidíš tu.</p>`;
  let day = '';
  return list.map((m) => {
    const d = fmtDay(chatIso(m.at));
    const sep = d !== day ? `<div class="chat-day">${esc(d)}</div>` : '';
    day = d;
    const mine = m.from === 'client';
    const body = m.kind === 'checkin' ? checkinCardHtml(m.checkin) : esc(m.text || '').replace(/\n/g, '<br>');
    return `${sep}<div class="msg ${mine ? 'mine' : 'theirs'}${m.kind === 'checkin' ? ' checkin' : ''}"><div class="bubble">${body}</div><time>${chatTime(m.at)}</time></div>`;
  }).join('');
}
function viewChat() {
  chatMarkSeen();
  return `<div class="page-head chat-head"><div><h1>Správy</h1><p class="muted" style="margin:0">${TRAINER.name && TRAINER.name !== 'Tréner' ? `Tvoj tréner ${esc(TRAINER.name)}` : 'Tvoj tréner'}</p></div>
    ${TRAINER.checkinDay >= 0 ? `<button type="button" class="btn small" data-ci="open">${ciIc('checkin')} Check-in</button>` : ''}</div>
  ${chatState.ci ? checkinFormHtml() : ''}
  <section class="card chat-card"><div class="chat-thread" id="chat-thread">${chatThreadHtml()}</div></section>
  <form class="chat-compose" id="chat-compose">
    <textarea id="chat-input" rows="1" maxlength="2000" placeholder="Napíš trénerovi…" aria-label="Správa"></textarea>
    <button type="submit" class="btn primary chat-send" aria-label="Odoslať"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg></button>
  </form>
  <p class="muted chat-err" id="chat-err"></p>`;
}
function chatThreadUi() {
  const el = document.getElementById('chat-thread');
  if (!el) return;
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120;
  el.innerHTML = chatThreadHtml();
  if (atBottom) chatScrollEnd();
}
const chatScrollEnd = () => requestAnimationFrame(() => window.scrollTo(0, document.documentElement.scrollHeight));

async function chatSend(data, okText) {
  const err = document.getElementById('chat-err');
  if (err) err.textContent = '';
  if (isDemo()) { chatState.msgs.push({ id: 'l' + Date.now(), from: 'client', at: Date.now(), ...data }); chatUpdated(); return true; }
  try {
    await cloudReady();
    await window.clientCloud.sendMessage(authCode, TRAINER.ownerUid, data);
    chatNotifyTrainer(data);
    if (okText) toastMsg(okText);
    return true;
  } catch (e) {
    const msg = e?.code === 'permission-denied' ? 'Správu sa nepodarilo odoslať – tréner ešte nezapol správy.' : 'Správu sa nepodarilo odoslať. Skontroluj internet.';
    if (err) err.textContent = msg; else toastMsg(msg);
    return false;
  }
}
function toastMsg(text) {
  let t = document.getElementById('chat-toast');
  if (!t) { t = document.createElement('div'); t.id = 'chat-toast'; t.className = 'chat-toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = text;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(t.tm); t.tm = setTimeout(() => t.classList.remove('show'), 2600);
}
// upozornenie trénerovi do appky ntfy (ak ho má zapnuté) – rovnako ako pri žiadosti o tréning
function chatNotifyTrainer(data) {
  const topic = TRAINER.ntfy;
  if (!topic || !/^[\w-]{1,64}$/.test(topic)) return;
  const name = client()?.name || 'klient';
  const q = new URLSearchParams({ title: data.kind === 'checkin' ? `Check-in – ${name}` : `Správa – ${name}`, tags: data.kind === 'checkin' ? 'clipboard' : 'speech_balloon', click: 'https://koval9720.github.io/trainer-app/' });
  const body = data.kind === 'checkin' ? (data.checkin?.note || 'Týždenný check-in vyplnený') : data.text;
  fetch(`https://ntfy.sh/${topic}?${q}`, { method: 'POST', body: String(body).slice(0, 300) }).catch(() => {});
}

// udalosti v záložke Správy (formulár správy a check-inu)
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'chat-compose') return;
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = ''; input.style.height = '';
  if (!(await chatSend({ kind: 'text', text }))) input.value = text;
  else chatScrollEnd();
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'chat-input') { const t = e.target; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 140)}px`; }
  if (e.target.id === 'ci-weight') chatState.ciVals.weight = e.target.value;
  if (e.target.id === 'ci-note') chatState.ciVals.note = e.target.value;
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey && matchMedia('(hover: hover)').matches) { e.preventDefault(); e.target.form.requestSubmit(); }
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-ci]');
  if (!b) return;
  const a = b.dataset.ci;
  if (a === 'open') {
    if (route() !== 'chat') { chatState.ci = true; location.hash = '#/chat'; return; }
    chatState.ci = !chatState.ci; render();
    if (chatState.ci) document.getElementById('checkin-form')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } else if (a === 'close') { chatState.ci = false; render(); }
  else if (a === 'pick') {
    chatState.ciVals[b.dataset.k] = Number(b.dataset.n);
    b.parentElement.querySelectorAll('.ci-pick').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
  } else if (a === 'send') {
    const v = chatState.ciVals;
    const msg = document.getElementById('ci-msg');
    const w = Number(String(v.weight || '').replace(',', '.'));
    if (v.weight && !(w >= 20 && w <= 400)) { msg.textContent = 'Skontroluj váhu (20–400 kg).'; return; }
    const missing = CHECKIN_ROWS.filter(([k]) => !v[k]);
    if (missing.length) { msg.textContent = `Vyber ešte: ${missing.map(([, l]) => l).join(', ')}.`; return; }
    const checkin = { sleep: v.sleep, energy: v.energy, diet: v.diet, stress: v.stress, ...(v.weight ? { weight: Math.round(w * 10) / 10 } : {}), ...(v.note?.trim() ? { note: v.note.trim().slice(0, 600) } : {}) };
    b.disabled = true; b.textContent = 'Odosielam…';
    if (await chatSend({ kind: 'checkin', checkin }, 'Check-in odoslaný trénerovi')) {
      chatState.ci = false; chatState.ciVals = {};
      render(); chatScrollEnd();
    } else { b.disabled = false; b.textContent = 'Odoslať trénerovi'; }
  }
});

/* ---------- Napojenie na appku ---------- */
ROUTES.chat = viewChat;
function chatDecorate() {
  chatWatch();
  chatBadges();
  if (!client()) return;
  if (route() === '' && checkinDue() && !document.getElementById('checkin-due')) {
    const hero = document.querySelector('#main .hero');
    hero?.insertAdjacentHTML('afterend', `<button type="button" class="notice notice-chat" id="checkin-due" data-ci="open"><span>${ciIc('checkin')} <b>Týždenný check-in</b> – daj trénerovi vedieť, ako sa ti darilo</span><span class="chev" aria-hidden="true">›</span></button>`);
  }
  if (route() === 'chat') chatScrollEnd();
}
const renderWithoutChat = render;
render = function (...args) {
  const draft = document.getElementById('chat-input')?.value || '';   // rozpísaná správa prežije obnovenie obrazovky
  const r = renderWithoutChat.apply(this, args);
  const input = document.getElementById('chat-input');
  if (input && draft) input.value = draft;
  chatDecorate();
  return r;
};
chatDecorate();
