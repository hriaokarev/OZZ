// lib/firebaseAdmin.ts
import { initializeApp, getApps, cert, AppOptions } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

function getConfig(): AppOptions {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT as string);
    return { credential: cert(sa) };
  }
  // 3分割方式
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return { credential: cert({ projectId, clientEmail, privateKey }) };
}

const app = getApps().length ? getApps()[0] : initializeApp(getConfig());

export const adminMessaging = getMessaging(app);
export default app;