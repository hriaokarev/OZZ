// app/api/trending/touch/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/admin'

// Admin SDK を使うので Node ランタイムを強制
export const runtime = 'nodejs'
// 念のためキャッシュを完全無効化
export const dynamic = 'force-dynamic'

// 連打対策（直近の更新から一定時間はスキップ）
const MIN_INTERVAL_MS = 5000
const POP_SIZE = 50
const EXEC_TIMEOUT_MS = 6000 // ハング対策の安全タイムアウト

async function computeAndUpdate() {
  console.time('[touch] query-threads')
  // threads 取得（直近50）
  const snap = await adminDb
    .collection('threads')
    .orderBy('createdAt', 'desc')
    .limit(POP_SIZE)
    .get()
  console.timeEnd('[touch] query-threads')

  type T = { title?: string; name?: string; threadName?: string; roomName?: string; createdAt?: FirebaseFirestore.Timestamp; viewCount?: number; messageCount?: number }
  const rows = snap.docs.map((d) => {
    const t = d.data() as T
    const resolvedTitle =
      t.title?.toString().trim() ||
      t.name?.toString().trim() ||
      t.threadName?.toString().trim() ||
      t.roomName?.toString().trim() ||
      'スレッド'
    return {
      id: d.id,
      title: resolvedTitle,
      createdAtMs: t.createdAt ? t.createdAt.toMillis() : 0,
      viewCount: t.viewCount ?? 0,
      messageCount: t.messageCount ?? 0,
    }
  })

  const scored = rows
    .map((t) => ({ ...t, score: (t.viewCount ?? 0) * 10 + (t.messageCount ?? 0) }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : b.createdAtMs - a.createdAtMs))

  const top3 = scored.slice(0, 3).map((t, i) => ({ id: t.id, title: t.title, rank: i + 1, score: t.score }))

  const stateRef = adminDb.collection('system').doc('trending_state')
  const stateSnap = await stateRef.get()
  const prev = (stateSnap.exists ? stateSnap.data() : {}) as any

  // 直近の更新からのインターバル
  const now = Date.now()
  const updatedAt = prev.updatedAt || 0
  if (now - updatedAt < MIN_INTERVAL_MS) {
    return { skipped: true, reason: 'interval', top3, changed: prev.changed ?? [], seq: prev.seq ?? 0 }
  }

  // ranks 差分
  const prevRanks: Record<string, number> = prev.ranks || {}
  const ranks: Record<string, number> = {}
  scored.forEach((t, idx) => (ranks[t.id] = idx + 1))

  const changed = scored
    .filter((t, idx) => {
      const newRank = idx + 1
      if (newRank > 3) return false
      const oldRank = prevRanks[t.id]
      return oldRank === undefined || oldRank > newRank
    })
    .map((t) => ({ threadId: t.id, newRank: ranks[t.id] }))

  const seq = (prev.seq ?? 0) + (changed.length > 0 ? 1 : 0)

  await stateRef.set({ ranks, updatedAt: now, top3, changed, seq }, { merge: true })

  return { skipped: false, top3, changed, seq }
}

function noStore(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')
  return res
}

async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    // ヘルスチェック用（処理を一切せず即返す）
    if (searchParams.get('ping') === '1') {
      return noStore(NextResponse.json({ ok: true, ping: true }))
    }

    // ドライラン（書き込み無しで疎通だけ確認）
    if (searchParams.get('dry') === '1') {
      console.time('[touch] dry-run')
      const snap = await adminDb
        .collection('threads')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get()
      console.timeEnd('[touch] dry-run')
      return noStore(
        NextResponse.json({ ok: true, skipped: false, dry: true, ids: snap.docs.map((d) => d.id) }),
      )
    }

    // 本処理 + タイムアウトレース
    const work = computeAndUpdate()
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), EXEC_TIMEOUT_MS),
    )
    const out = await Promise.race([work, timeout])

    return noStore(NextResponse.json({ ok: true, ...(out as object) }))
  } catch (e) {
    console.error('[touch] error', e)
    return noStore(NextResponse.json({ ok: false, error: String(e) }, { status: 500 }))
  }
}

export async function GET(req: NextRequest) {
  return handler(req)
}

export async function POST(req: NextRequest) {
  return handler(req)
}