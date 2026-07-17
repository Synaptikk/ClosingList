// Firebase bootstrap. Lazy-initializes app + auth + firestore + storage and
// returns null if no config is present so the app still runs in local-only mode.
//
// To enable cloud sync:
//   1. firebase console → managerchecklist → Project settings → Web app
//      → paste the generated firebaseConfig values into firebaseConfig below.
//   2. Enable Firestore (Build → Firestore Database → Create database).
//   3. Enable Anonymous auth (Build → Authentication → Sign-in method).
//   4. Enable Storage  (Build → Storage → Get started).
//   5. `firebase deploy` ships rules + hosting.
//
// If apiKey is still the placeholder string the app stays in local-only mode
// (no auth attempt, no Firestore writes). Useful for offline dev / unbound forks.

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// PASTE FIREBASE CONFIG HERE
// From console.firebase.google.com → managerchecklist → Project settings → Your apps → Web app
const firebaseConfig = {
  apiKey:            "AIzaSyAcPgKnHNBJJYkI4OVJASzHUwaKj2qCxdU",
  authDomain:        "managerchecklist.firebaseapp.com",
  projectId:         "managerchecklist",
  storageBucket:     "managerchecklist.firebasestorage.app",
  messagingSenderId: "79858122887",
  appId:             "1:79858122887:web:d55701efe0c3b1da743822",
};

const PLACEHOLDER_API_KEY = 'PASTE_API_KEY';

// Returns the active store number from localStorage settings (set during login).
// Falls back to empty string so callers can detect an unset store.
export function getStoreNumber() {
  try {
    const raw = localStorage.getItem('cmc:settings');
    if (!raw) return '';
    return JSON.parse(raw)?.storeNumber || '';
  } catch {
    return '';
  }
}

let _state = null; // { app, auth, db, storage, uid } once ready

export function isFirebaseConfigured() {
  return firebaseConfig.apiKey && firebaseConfig.apiKey !== PLACEHOLDER_API_KEY;
}

export async function ensureFirebase() {
  if (!isFirebaseConfigured()) return null;
  if (_state) return _state;

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

  // initializeFirestore must run before getFirestore — gives us offline-ish
  // persistence so a flapping connection doesn't kill local edits.
  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Already initialized on this app (HMR re-run) — fall through to getFirestore.
    db = getFirestore(app);
  }

  const auth = getAuth(app);
  const storage = getStorage(app);

  // Anonymous auth. If already signed in (cached) this resolves instantly.
  const uid = await new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) { unsub(); resolve(u.uid); }
    }, reject);
    signInAnonymously(auth).catch(reject);
  });

  _state = { app, auth, db, storage, uid };
  return _state;
}

export function firebaseState() {
  return _state;
}
