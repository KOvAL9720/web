/* =========================================================
   Klientska zóna – čítanie zdieľaných dát z cloudu (Firebase)
   Klient sa prihlási anonymne a prečíta dokument shared/{kód}.
   ========================================================= */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, deleteDoc, query, where, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyB3E6qCv4VFGeyHHvFClqjJXSkzyvnObjg',
  authDomain: 'trener-31965.firebaseapp.com',
  projectId: 'trener-31965',
  storageBucket: 'trener-31965.firebasestorage.app',
  messagingSenderId: '828584673508',
  appId: '1:828584673508:web:cf84256d49b17e54c66cf1'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = getFirestore(app);

const ready = new Promise((resolve, reject) => {
  onAuthStateChanged(auth, (user) => { if (user) resolve(user); });
  signInAnonymously(auth).catch(reject);
});

window.clientCloud = {
  // vráti zdieľané dáta pre kód, alebo null, ak kód neexistuje
  async fetch(code) {
    await ready;
    const snap = await getDoc(doc(fs, 'shared', code));
    if (!snap.exists()) return null;
    const { updatedAt, ...data } = snap.data();
    data.updatedAt = updatedAt?.toMillis ? updatedAt.toMillis() : Date.now();
    return data;
  },
  // žiadosti o tréning – podkolekcia shared/{kód}/requests
  async listRequests(code) {
    await ready;
    const qs = await getDocs(query(collection(fs, 'shared', code, 'requests'), orderBy('date')));
    return qs.docs.map((d) => { const { createdAt, ...r } = d.data(); return { id: d.id, ...r, createdAt: createdAt?.toMillis ? createdAt.toMillis() : 0 }; });
  },
  async addRequest(code, data) {
    await ready;
    const ref = await addDoc(collection(fs, 'shared', code, 'requests'), { ...data, status: 'new', createdAt: serverTimestamp() });
    return ref.id;
  },
  async cancelRequest(code, id) {
    await ready;
    await deleteDoc(doc(fs, 'shared', code, 'requests', id));
  },
  // Zablokované termíny trénera (žiadosti všetkých klientov) – len dátum, čas a dĺžka, bez mien a kódov
  async listHolds(ownerUid) {
    await ready;
    const qs = await getDocs(query(collection(fs, 'holds'), where('ownerUid', '==', ownerUid)));
    return qs.docs.map((d) => d.data()).filter((h) => typeof h.date === 'string' && typeof h.time === 'string');
  },
  // zablokuje termín; ak ho medzitým zablokoval iný klient, vráti false (dokument už existuje a cudzí sa prepísať nedá)
  async holdSlot(ownerUid, date, time, duration) {
    const user = await ready;
    const ref = doc(fs, 'holds', `${ownerUid}_${date}_${time.replace(':', '')}`);
    try {
      await setDoc(ref, { ownerUid, date, time, duration, by: user.uid, createdAt: serverTimestamp() });
      return true;
    } catch (e) {
      if (e?.code === 'permission-denied' && (await getDoc(ref).catch(() => null))?.exists()) return false;
      throw e;
    }
  },
  async releaseHold(ownerUid, date, time) {
    await ready;
    await deleteDoc(doc(fs, 'holds', `${ownerUid}_${date}_${time.replace(':', '')}`)).catch(() => {});
  }
};
window.dispatchEvent(new Event('client-cloud-ready'));
