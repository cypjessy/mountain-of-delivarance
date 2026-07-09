import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence, getDoc, DocumentReference, DocumentSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Enable offline persistence so Firestore reads work even when the
// initial connection hasn't fully established (common in Capacitor
// WebView static exports). Falls back gracefully if persistence is
// already enabled or unsupported (e.g. in some mobile browsers).
enableIndexedDbPersistence(db)
  .then(() => {
    console.log("[Firebase] Offline persistence enabled");
  })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open — persistence can only be enabled in one tab at a time
      console.warn('[Firebase] Offline persistence unavailable: multiple tabs open');
    } else if (err.code === 'unimplemented') {
      // Browser doesn't support IndexedDB
      console.warn('[Firebase] Offline persistence not supported in this browser');
    } else {
      console.warn('[Firebase] Offline persistence error:', err.code || err.message);
    }
  });

/** Retry a Firestore getDoc call with exponential backoff (5 attempts).
 * Retries on ANY error — the Firestore SDK throws transient failures
 * like "Failed to fetch" or "offline" in Capacitor WebViews when
 * the connection hasn't fully established yet after Auth succeeds. */
export async function getDocWithRetry(
  docRef: DocumentReference,
  retries = 5
): Promise<DocumentSnapshot> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await getDoc(docRef);
    } catch (err: any) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("getDocWithRetry: exhausted");
}

export { app, auth, db, googleProvider };
