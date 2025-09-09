// /app/api/trending/touch/route.ts
// ランキング再計算＆配信用ドキュメント更新（診断付き）

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// =====================
// Firestore Admin 初期化
// =====================
import type { Firestore } from 'firebase-admin/firestore'

let _db: Firestore | null = null

function getPrivateKey(): string | undefined {
  const pk = process.env.FIREBASE_PRIVATE_KEY
  if (pk) return pk.replace(/\\n/g, '\n')
  const b64 = process.env.FIREBASE_PRIVATE_KEY_BASE64
  if (b64) return Buffer.from(b64, 'base64').toString('utf8')
}

async function getAdminDb(): Promise<Firestore | null> {
  if (_db) return _db
  try {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app')
    const { getFirestore } = await import('firebase-admin/firestore')

    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = getPrivateKey()

    if (!projectId || !clientEmail || !privateKey) return null

    if (getApps().length === 0) {
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId,
      })
    }
    _db = getFirestore()
    return _db
  } catch (e) {
    console.error('[touch] init-admin error', e)
    return null
  }
}

// 失敗→詳細ログ＆JSON
function fail(stage: string, e: any) {
  const msg = e?.message || String(e)
  const name = e?.name
  const stack = e?.stack
  console.error('[touch]', stage, name || '', msg, stack || '')
  return NextResponse.json({ ok: false, stage, name, error: msg, stack }, { status: 500 })
}

function checkAdminEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = getPrivateKey()
  return {
    projectIdOk: !!projectId,
    clientEmailOk: !!clientEmail,
    privateKeyOk: !!privateKey,
  }
}

// =====================
// GET: 診断/案内
// =====================
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  if (url.searchParams.get('diag') === '1') {
    const envCheck = checkAdminEnv()
    let adminOk = false
    let dbPing = 'skip'
    try {
      const db = await getAdminDb()
      if (db) {
        adminOk = true
        try {
          await db.collection('system').limit(1).get()
          dbPing = 'ok'
        } catch (e: any) {
          dbPing = 'fail: ' + (e?.message || String(e))
        }
      }
    } catch (e: any) {
      adminOk = false
      dbPing = 'init-fail: ' + (e?.message || String(e))
    }
    return NextResponse.json({ ok: true, diag: { envCheck, adminOk, dbPing, node: process.versions.node } })
  }
  const dry = url.searchParams.get('dry') === '1'
  return NextResponse.json({ ok: true, touch: true, dry, hint: 'トレンドランキングを再計算して公開するにはPOSTします。診断のために?diag=1を追加します。' })
}

// =====================
// POST: 再計算
// =====================
export async function POST(req: NextRequest) {
  try {
    // ロック中は即終了（環境次第で使う）
    if (process.env.NEXT_PUBLIC_SITE_HARD_LOCK === '1') {
      return NextResponse.json({ ok: false, stage: 'locked' }, { status: 503 })
    }

    // Admin 準備
    const envCheck = checkAdminEnv()
    if (!envCheck.projectIdOk || !envCheck.clientEmailOk || !envCheck.privateKeyOk) {
      return NextResponse.json({ ok: false, stage: 'env-missing', details: envCheck }, { status: 500 })
    }

    const db = await getAdminDb()
    if (!db) return fail('init-admin', new Error('admin-db-not-initialized'))

    // 疎通テスト
    try { await db.collection('system').limit(1).get() } catch (e) { return fail('db-ping', e) }

    const url = new URL(req.url)
    const force = url.searchParams.get('force') === '1'

    // 現在の状態を取得
    const stateRef = db.collection('system').doc('trending_state')
    const snap = await stateRef.get()
    const prev = (snap.exists ? snap.data() : {}) as any
    const prevRanks: Record<string, number> = prev?.ranks || {}
    const prevSeq: number = Number(prev?.seq || 0)
    const lastTouchAtMs: number = Number(prev?.lastTouchAtMs || 0)

    // クールダウン（60秒）
    const now = Date.now()
    if (!force && lastTouchAtMs && now - lastTouchAtMs < 60_000) {
      return NextResponse.json({ ok: true, skipped: true, cooldownMs: 60_000 - (now - lastTouchAtMs) })
    }

    // スレ取得（最大200件）
    const threadsSnap = await db.collection('threads').limit(200).get()

    type Row = { id: string; title: string; genre?: string | null; viewCount?: number; messageCount?: number; trendScore24h?: number }
    const rows: Row[] = []
    threadsSnap.forEach((d) => {
      const v = d.data() || {}
      rows.push({
        id: d.id,
        title: (v.name as string) || 'スレッド',
        genre: (v.genre as string) ?? null,
        viewCount: Number(v.viewCount || 0),
        messageCount: Number(v.messageCount || 0),
        trendScore24h: typeof v.trendScore24h === 'number' ? v.trendScore24h : undefined,
      })
    })

    // スコア（24h がなければフォールバック）
    const W_VIEW = 3
    const W_MSG = 1
    const scored = rows.map((r) => ({
      ...r,
      score: typeof r.trendScore24h === 'number' ? r.trendScore24h : (r.viewCount || 0) * W_VIEW + (r.messageCount || 0) * W_MSG,
    }))

    scored.sort((a, b) => b.score - a.score)

    const limit = Math.min(scored.length, 50)
    const ranks: Record<string, number> = {}
    const top3: { id: string; title: string; rank: number; score: number }[] = []
    for (let i = 0; i < limit; i++) {
      const r = scored[i]
      const rank = i + 1
      ranks[r.id] = rank
      if (rank <= 3) top3.push({ id: r.id, title: r.title, rank, score: r.score })
    }

    // 変動検出（undefined を書かない）
    const changedRaw: { id: string; from?: number; to: number }[] = []
    for (const id of Object.keys(ranks)) {
      const to = ranks[id]
      const from = prevRanks[id]
      if (!from || to < from) changedRaw.push({ id, from, to })
    }
    const changed = changedRaw
      .slice(0, 10)
      .map((c) => (Number.isFinite(c.from as number) ? { id: c.id, from: c.from as number, to: c.to } : { id: c.id, to: c.to }))

    const changedTop = changed.filter((c) => c.to <= 3).sort((a, b) => a.to - b.to)[0]

    const payload = {
      ranks,
      top3,
      changed,
      seq: prevSeq + (changedTop ? 1 : 0),
      lastTouchAtMs: Date.now(),
    }

    try {
      await stateRef.set(payload, { merge: true })
    } catch (e) {
      return fail('write-state', e)
    }

    // ---- FCM通知（Top3変動時のみ。NOTIFY_FCM=1 で送信） ----
    let notified = 0
    if (changedTop && process.env.NOTIFY_FCM === '1') {
      try {
        const { getMessaging } = await import('firebase-admin/messaging')
        const messaging = getMessaging()

        const threadId = changedTop.id
        const rk = Number(changedTop.to)
        const title = (top3.find((t) => t.id === threadId)?.title) || 'スレッド'
        const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_PUBLIC_ORIGIN || ''
        const link = base ? `${base}/threads/${threadId}` : `/threads/${threadId}`

        const MAX = Math.min(Math.max(Number(process.env.FCM_MAX_TOKENS || '1000'), 1), 10000)
        const tokens: string[] = []
        const seen = new Set<string>()

        const cgSnap = await db.collectionGroup('fcmTokens').limit(MAX).get()
        cgSnap.forEach((d) => {
          const v: any = d.data() || {}
          const token: string = v.token || d.id
          if (token && token.length > 50 && !seen.has(token)) {
            seen.add(token)
            tokens.push(token)
          }
        })

        for (let i = 0; i < tokens.length; i += 500) {
          const batch = tokens.slice(i, i + 500)
          if (batch.length === 0) break
          const resp = await messaging.sendEachForMulticast({
            tokens: batch,
            notification: {
              title: 'トレンド更新',
              body: `「${title}」が第${rk}位にランクイン`,
            },
            data: {
              type: 'TRENDING',
              threadId,
              rank: String(rk),
              title,
              link,
            },
            webpush: { fcmOptions: { link } },
          })
          notified += resp.successCount || 0
          // ※無効トークンの削除は運用方針決定後に対応可
        }
      } catch (e) {
        console.error('[touch] fcm-send error', e)
      }
    }

    return NextResponse.json({ ok: true, skipped: false, top3, changed, seq: payload.seq, notified })
  } catch (e) {
    return fail('unknown', e)
  }
}