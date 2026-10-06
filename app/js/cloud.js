/* =========================================================
   Klientska zóna – čítanie zdieľaných dát z cloudu (Firebase)
   Klient sa prihlási anonymne a prečíta dokument shared/{kód}.
   ========================================================= */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

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
    const { ownerUid, updatedAt, ...data } = snap.data();
    data.updatedAt = updatedAt?.toMillis ? updatedAt.toMillis() : Date.now();
    return data;
  }
};
window.dispatchEvent(new Event('client-cloud-ready'));
