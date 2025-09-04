import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore'
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging'

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}
const app = getApps().length ? getApps()[0] : initializeApp(cfg)

export const auth = getAuth(app)
export const db = getFirestore(app)
// Enable Firestore IndexedDB persistence (multi-tab). Guard so it only runs in browser and once (HMR safe).
if (typeof window !== 'undefined') {
  // @ts-ignore - flag only for guarding double init in dev
  if (!(window as any).__fs_persistence_enabled__) {
    enableMultiTabIndexedDbPersistence(db).catch((err) => {
      // Ignore unsupported/failed-precondition; fallback to memory. Log only in dev.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Firestore persistence not enabled:', (err && (err.code || err.message)) || err)
      }
    })
    // @ts-ignore
    ;(window as any).__fs_persistence_enabled__ = true
  }
}
export const getMessagingSafe = async (): Promise<Messaging | null> =>
  (await isSupported()) ? getMessaging(app) : null