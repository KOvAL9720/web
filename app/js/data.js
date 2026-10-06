'use strict';

/* =========================================================
   Ukážkové dáta klientskej appky
   Použijú sa pri kóde DEMO. Skutočné dáta prichádzajú z cloudu (js/cloud.js)
   v rovnakej štruktúre.
   ========================================================= */

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };

// Prístupové kódy: kód → id klienta. Neskôr ich bude generovať appka Tréner.
// Ukážkové kódy (skutočné kódy vydáva appka Tréner a dáta prichádzajú z cloudu)
const ACCESS_CODES = { DEMO: 'c1', PETER: 'c2' };

const EXERCISES = [
  ['e1', 'Drep', 'Nohy'], ['e2', 'Hip thrust', 'Zadok'], ['e3', 'Veslovanie s činkou', 'Chrbát'],
  ['e4', 'Bench press', 'Hrudník'], ['e5', 'Kliky', 'Hrudník'], ['e6', 'Tlaky nad hlavu', 'Ramená'],
  ['e7', 'Plank', 'Core'], ['e8', 'Rumunský mŕtvy ťah', 'Nohy'], ['e9', 'Stiahnutie kladky', 'Chrbát'],
  ['e10', 'Kettlebell swing', 'Celé telo']
].map(([id, name, category]) => ({ id, name, category }));

const CLIENTS = [
  { id: 'c1', name: 'Lucia Nováková', goal: 'Spevniť postavu a zhodiť 5 kg', since: addDays(today(), -84) },
  { id: 'c2', name: 'Peter Horváth', goal: 'Nabrať silu, bench 100 kg', since: addDays(today(), -120) }
];

// Tréningy: minulé odtrénované so zapísanými výkonmi, budúce naplánované
const t = today();
const SESSIONS = [
  { id: 's1', clientId: 'c1', date: addDays(t, -21), time: '17:00', status: 'done', log: [
    { exerciseId: 'e1', sets: [{ w: 30, r: 10 }, { w: 35, r: 8 }, { w: 35, r: 8 }] },
    { exerciseId: 'e2', sets: [{ w: 40, r: 12 }, { w: 45, r: 10 }, { w: 45, r: 10 }] },
    { exerciseId: 'e4', sets: [{ w: 25, r: 10 }, { w: 27.5, r: 8 }, { w: 27.5, r: 8 }] }
  ] },
  { id: 's2', clientId: 'c1', date: addDays(t, -14), time: '17:00', status: 'done', log: [
    { exerciseId: 'e1', sets: [{ w: 35, r: 10 }, { w: 40, r: 8 }, { w: 40, r: 8 }] },
    { exerciseId: 'e2', sets: [{ w: 45, r: 12 }, { w: 50, r: 10 }, { w: 50, r: 10 }] },
    { exerciseId: 'e3', sets: [{ w: 10, r: 12 }, { w: 12, r: 10 }, { w: 12, r: 10 }] }
  ] },
  { id: 's3', clientId: 'c1', date: addDays(t, -7), time: '17:00', status: 'done', log: [
    { exerciseId: 'e1', sets: [{ w: 40, r: 8 }, { w: 42.5, r: 8 }, { w: 42.5, r: 6 }] },
    { exerciseId: 'e2', sets: [{ w: 55, r: 10 }, { w: 60, r: 8 }, { w: 60, r: 8 }] },
    { exerciseId: 'e4', sets: [{ w: 27.5, r: 10 }, { w: 30, r: 8 }, { w: 30, r: 6 }] }
  ] },
  { id: 's4', clientId: 'c1', date: addDays(t, -3), time: '17:00', status: 'done', log: [
    { exerciseId: 'e1', sets: [{ w: 42.5, r: 8 }, { w: 45, r: 6 }, { w: 45, r: 6 }] },
    { exerciseId: 'e3', sets: [{ w: 12, r: 12 }, { w: 14, r: 10 }, { w: 14, r: 10 }] },
    { exerciseId: 'e7', sets: [{ w: 0, r: 45 }, { w: 0, r: 45 }, { w: 0, r: 40 }] }
  ] },
  { id: 's5', clientId: 'c1', date: addDays(t, 1), time: '17:00', status: 'planned', note: 'Nohy + zadok' },
  { id: 's6', clientId: 'c1', date: addDays(t, 4), time: '18:00', status: 'planned', note: 'Vrch tela' },
  { id: 's7', clientId: 'c1', date: addDays(t, 8), time: '17:00', status: 'planned' },
  { id: 's8', clientId: 'c1', date: addDays(t, -10), time: '17:00', status: 'cancelled' },

  { id: 's9', clientId: 'c2', date: addDays(t, -5), time: '19:00', status: 'done', log: [
    { exerciseId: 'e4', sets: [{ w: 80, r: 5 }, { w: 85, r: 5 }, { w: 90, r: 3 }] },
    { exerciseId: 'e1', sets: [{ w: 100, r: 5 }, { w: 110, r: 5 }] }
  ] },
  { id: 's10', clientId: 'c2', date: addDays(t, 2), time: '19:00', status: 'planned' }
];

const PLANS = [
  { id: 'p1', clientId: 'c1', name: 'Deň A – nohy a zadok', items: [
    { id: 'i1', exerciseId: 'e1', sets: 3, reps: '8–10', weight: '40 kg', rest: '90 s', note: 'päty na zemi, kolená von' },
    { id: 'i2', exerciseId: 'e2', sets: 3, reps: '10–12', weight: '55 kg', rest: '90 s', note: '' },
    { id: 'i3', exerciseId: 'e8', sets: 3, reps: '10', weight: '30 kg', rest: '60 s', note: 'rovný chrbát' },
    { id: 'i4', exerciseId: 'e10', sets: 3, reps: '15', weight: '12 kg', rest: '60 s', note: '' },
    { id: 'i5', exerciseId: 'e7', sets: 3, reps: '45 s', weight: '', rest: '45 s', note: '' }
  ] },
  { id: 'p2', clientId: 'c1', name: 'Deň B – vrch tela', items: [
    { id: 'i6', exerciseId: 'e4', sets: 3, reps: '8', weight: '27,5 kg', rest: '90 s', note: '' },
    { id: 'i7', exerciseId: 'e3', sets: 3, reps: '10–12', weight: '12 kg', rest: '60 s', note: 'lakte pri tele' },
    { id: 'i8', exerciseId: 'e9', sets: 3, reps: '12', weight: '35 kg', rest: '60 s', note: '' },
    { id: 'i9', exerciseId: 'e6', sets: 3, reps: '10', weight: '8 kg', rest: '60 s', note: '' },
    { id: 'i10', exerciseId: 'e5', sets: 3, reps: 'do zlyhania', weight: 'vlastná váha', rest: '60 s', note: 'z kolien podľa potreby' }
  ] },
  { id: 'p3', clientId: 'c2', name: 'Sila – bench a drep', items: [
    { id: 'i11', exerciseId: 'e4', sets: 5, reps: '5', weight: '85 kg', rest: '3 min', note: '' },
    { id: 'i12', exerciseId: 'e1', sets: 5, reps: '5', weight: '110 kg', rest: '3 min', note: '' }
  ] }
];

const MEASUREMENTS = [
  { id: 'm1', clientId: 'c1', date: addDays(t, -84), weight: 68.4, bodyFat: 31, waist: 80, hips: 102 },
  { id: 'm2', clientId: 'c1', date: addDays(t, -56), weight: 67.1, bodyFat: 30, waist: 78, hips: 101 },
  { id: 'm3', clientId: 'c1', date: addDays(t, -28), weight: 65.8, bodyFat: 28.5, waist: 76, hips: 100 },
  { id: 'm4', clientId: 'c1', date: addDays(t, -3), weight: 64.9, bodyFat: 27.5, waist: 75, hips: 99 },
  { id: 'm5', clientId: 'c2', date: addDays(t, -120), weight: 82, bodyFat: 18, waist: 88, hips: 98 },
  { id: 'm6', clientId: 'c2', date: addDays(t, -5), weight: 85.5, bodyFat: 16, waist: 87, hips: 100 }
];

const DEMO_TRAINER = { name: 'Jakub', phone: '+421 900 000 000', whatsapp: 'https://wa.me/421900000000' };
let TRAINER = DEMO_TRAINER;

const DEMO_DB = { clients: CLIENTS, sessions: SESSIONS, plans: PLANS, exercises: EXERCISES, measurements: MEASUREMENTS };
let DB = DEMO_DB;
