// app/api/notify/route.ts
export const runtime = 'nodejs' // ★必須：firebase-adminはEdge不可

import { NextRequest, NextResponse } from 'next/server'
import * as admin from 'firebase-admin'

// ---- Admin 初期化（Vercel/ローカルの ENV から）----
// 2通りの資格情報に対応：
//  A) FIREBASE_SERVICE_ACCOUNT（JSON文字列）
//  B) FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY（\\n を改行に戻す）
if (!admin.apps.length) {
  const SA = process.env.FIREBASE_SERVICE_ACCOUNT
  if (SA) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(SA)),
    })
  } else {
    const projectId = process.env.FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase admin credentials are not set. Set FIREBASE_SERVICE_ACCOUNT or 3-part creds.')
    }
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    })
  }
}
const db = admin.firestore()

export async function POST(req: NextRequest) {
  try {
    // 認証（クライアントのidToken必須）
    const authz = req.headers.get('authorization') || ''
    const idToken = authz.startsWith('Bearer ') ? authz.slice(7) : null
    if (!idToken) return NextResponse.json({ error: 'NO_AUTH' }, { status: 401 })
    const { uid: fromUid } = await admin.auth().verifyIdToken(idToken)

    // 入力
    const { toUid, title, body, link = '/', extra = {} } = await req.json()
    if (!toUid) return NextResponse.json({ error: 'NO_TO' }, { status: 400 })

    // 受信側の通知設定（dmEnabled=false は送らない）
    const uSnap = await db.doc(`users/${toUid}`).get()
    const u = uSnap.exists ? (uSnap.data() as any) : {}
    if (u?.dmEnabled === false) return NextResponse.json({ ok: true, skipped: 'dmDisabled' })

    // 端末トークンを取得（users/{uid}/fcmTokens/{token} の doc.id がトークン）
    const tSnap = await db.collection(`users/${toUid}/fcmTokens`).get()
    const tokens = Array.from(new Set(tSnap.docs.map(d => d.id))).filter(Boolean)
    if (!tokens.length) return NextResponse.json({ ok: true, sent: 0, reason: 'noTokens' })

    // --- data-only 送信（notificationは付けない：表示はSWが担当）---
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      webpush: {
        fcmOptions: { link }, // 通知タップ遷移
        data: {
          title: title || '新着メッセージ',
          body:  body  || '',
          link,
          fromUid,
          ...extra, // chatIdなど
        },
      },
    })

    // 無効トークン掃除
    const invalid: string[] = []
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || ''
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          invalid.push(tokens[i])
        }
      }
    })
    await Promise.all(invalid.map(t => db.doc(`users/${toUid}/fcmTokens/${t}`).delete()))

    return NextResponse.json({ ok: true, sent: res.successCount, invalid })
  } catch (e: any) {
    console.error('[notify] error', e)
    return NextResponse.json({ error: 'INTERNAL', detail: String(e?.message || e) }, { status: 500 })
  }
}