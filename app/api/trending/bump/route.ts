// app/api/trending/bump/route.ts
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AnyObj = Record<string, any>

// ----------------- config -----------------
const DELTA_BY_TYPE: Record<string, number> = {
  view: 3,      // 10 → 3 に変更
  message: 1,
  comment: 1,   // 互換のため残すが、実際の処理では message に正規化
}

// ----------------- util -----------------
function fail(stage: string, e: any, status = 500) {
  const msg = e?.message || String(e)
  const name = e?.name
  const stack = e?.stack
  return NextResponse.json({ ok: false, stage, name, error: msg, stack }, { status })
}

function normalizePrivateKey(raw?: string) {
  if (!raw) return ''
  let v = String(raw).trim()
  // 余計なクォートを除去
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  // \n → 実改行
  if (v.includes('\\n')) v = v.replace(/\\n/g, '\n')
  return v
}

function fiveMinuteBucket(nowMs: number = Date.now()) {
  return Math.floor(nowMs / (5 * 60 * 1000)) // 5分バケツ
}

function clientFingerprint(req: Request) {
  // デバイスID優先（ヘッダ or クエリ）、無ければIP（x-forwarded-for 先頭）、最後にUAのハッシュ短縮
  const url = new URL(req.url)
  const h = (name: string) => (req.headers.get(name) || '').trim()
  const device = (h('x-device-id') || url.searchParams.get('deviceId') || '').trim()
  let ip = h('x-forwarded-for')
  if (ip && ip.includes(',')) ip = ip.split(',')[0].trim()
  const ua = h('user-agent')
  const base = device || ip || ua || 'anon'
  // 簡易ハッシュ（衝突しても実害なし。IDに使えるように英数のみ）
  const hash = [...base].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)
  return String(Math.abs(hash))
}

function guardDocId(threadId: string, bucket: number, fp: string) {
  // シンプルなフラット階層: guards/{id}
  return `view_${threadId}_${bucket}_${fp}`.slice(0, 140)
}

function loadServiceAccountFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  let privateKey = process.env.FIREBASE_PRIVATE_KEY
  const privateKeyB64 = process.env.FIREBASE_PRIVATE_KEY_BASE64
  if (!privateKey && privateKeyB64) {
    try { privateKey = Buffer.from(privateKeyB64, 'base64').toString('utf8') } catch {}
  }
  privateKey = normalizePrivateKey(privateKey)
  if (!projectId || !clientEmail || !privateKey) throw new Error('Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY')
  return { projectId, clientEmail, privateKey }
}

async function getAdminDb() {
  // 1) あなたのプロジェクトの admin モジュール優先
  try {
    const mod: AnyObj = await import('@/lib/firebaseAdmin')
    if (mod?.adminDb) return mod.adminDb
    if (mod?.db) return mod.db
    if (mod?.default) {
      const { getFirestore } = await import('firebase-admin/firestore')
      return getFirestore(mod.default)
    }
    if (typeof mod.getFirestore === 'function') return mod.getFirestore()
    if (typeof mod.firestore === 'function') return mod.firestore()
    if (mod.admin && typeof mod.admin.firestore === 'function') return mod.admin.firestore()
  } catch {}
  // 2) 代替パス
  try {
    const mod2: AnyObj = await import('@/lib/admin')
    if (mod2?.adminDb) return mod2.adminDb
    if (mod2?.db) return mod2.db
    if (mod2?.default) {
      const { getFirestore } = await import('firebase-admin/firestore')
      return getFirestore(mod2.default)
    }
    if (typeof mod2.getFirestore === 'function') return mod2.getFirestore()
    if (typeof mod2.firestore === 'function') return mod2.firestore()
    if (mod2.admin && typeof mod2.admin.firestore === 'function') return mod2.admin.firestore()
  } catch {}
  // 3) 直イニット（env から）
  try {
    const appMod: AnyObj = await import('firebase-admin/app')
    const fsMod: AnyObj = await import('firebase-admin/firestore')
    const getApps = appMod.getApps as () => any[]
    const initializeApp = appMod.initializeApp as (opts: any) => any
    const cert = appMod.cert as (c: any) => any
    const getFirestore = fsMod.getFirestore as (app: any) => any

    const { projectId, clientEmail, privateKey } = loadServiceAccountFromEnv()
    const apps = getApps()
    const app = apps && apps.length ? apps[0] : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
    return getFirestore(app)
  } catch (e) {
    console.warn('[bump] admin direct init failed:', e)
    return null
  }
}

function nowHourKey() {
  const hour = Math.floor(Date.now() / 3600000) // UTC hour
  return { hour, key: `h${hour}` }
}

function sumLastN(trendHourly: Record<string, number>, hour: number, n: number) {
  let s = 0
  for (let h = hour; h > hour - n; h--) {
    const v = (trendHourly as any)[`h${h}`]
    if (typeof v === 'number' && Number.isFinite(v)) s += v
  }
  return s
}

// sendBeacon/text/plain 対応のゆるい入力パース
async function readInput(req: Request) {
  const url = new URL(req.url)
  const params = url.searchParams
  let threadId = ''
  let type = ''
  let delta: number | undefined

  const ct = (req.headers.get('content-type') || '').toLowerCase()
  try {
    if (ct.includes('application/json') || ct.includes('text/plain')) {
      const text = await req.text()
      if (text) {
        const j = JSON.parse(text)
        threadId = (j?.threadId ?? j?.id ?? j?.t ?? '').toString().trim()
        type = (j?.type ?? j?.kind ?? j?.k ?? '').toString().toLowerCase().trim()
        const d = Number(j?.delta)
        if (Number.isFinite(d)) delta = d
      }
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      const text = await req.text()
      const f = new URLSearchParams(text)
      threadId = (f.get('threadId') ?? f.get('id') ?? f.get('t') ?? '').toString().trim()
      type = (f.get('type') ?? f.get('kind') ?? f.get('k') ?? '').toString().toLowerCase().trim()
      const d = Number(f.get('delta'))
      if (Number.isFinite(d)) delta = d
    }
  } catch {
    // JSON 失敗は無視（下のクエリ/Referer にフォールバック）
  }

  if (!threadId) threadId = (params.get('threadId') ?? params.get('id') ?? params.get('t') ?? '').toString().trim()
  if (!type) type = (params.get('type') ?? params.get('kind') ?? params.get('k') ?? '').toString().toLowerCase().trim()
  if (!delta && params.has('delta')) {
    const d = Number(params.get('delta'))
    if (Number.isFinite(d)) delta = d
  }
  if (!threadId) {
    const ref = req.headers.get('referer') || ''
    const m = ref.match(/\/threads\/([A-Za-z0-9_-]+)/)
    if (m) threadId = m[1]
  }
  if (!type) type = 'view'
  return { threadId, type, delta }
}

// ----------------- handlers -----------------
export async function POST(req: Request) {
  // 入力
  let input: { threadId: string; type: string; delta?: number }
  try {
    input = await readInput(req)
  } catch (e) {
    return fail('parse-input', e, 400)
  }
  const threadId = input.threadId
  const typeRaw = input.type
  const rawDelta = input.delta
  let type = (typeRaw || 'view').toLowerCase()
  if (type === 'comment') type = 'message' // 一本化
  const delta = Number.isFinite(rawDelta as any) ? (rawDelta as number) : DELTA_BY_TYPE[type]
  if (!threadId || !Number.isFinite(delta) || delta === 0) {
    return fail('bad-request', new Error('threadId/type/delta invalid'), 400)
  }

  // Admin DB
  let db: any
  try {
    db = await getAdminDb()
  } catch (e) {
    return fail('init-admin', e)
  }
  if (!db) return fail('init-admin', new Error('admin-db-not-initialized'))

  // 5分ガード（viewのみ）：同一端末/同一スレで5分内の重複ビューをスキップ
  if (type === 'view') {
    const bucket = fiveMinuteBucket()
    const fp = clientFingerprint(req)
    const gid = guardDocId(threadId, bucket, fp)
    const guardRef = db.collection('guards').doc(gid)
    try {
      const { FieldValue } = await import('firebase-admin/firestore')
      await guardRef.create({
        kind: 'view',
        threadId,
        bucket,
        fp,
        createdAtMs: Date.now(),
        ttlAtMs: Date.now() + 3 * 24 * 60 * 60 * 1000, // 3日後の掃除目安（TTLポリシーがあれば自動削除）
      })
      // create に成功した場合のみ、このまま加点へ進む
    } catch (e: any) {
      // 既に存在（＝5分以内に同端末からビュー済み）の場合はスキップ
      const msg = String(e?.message || e)
      if (msg.includes('ALREADY_EXISTS') || msg.includes('already exists')) {
        return NextResponse.json({ ok: true, skipped: true, reason: 'view-dup-5min' })
      }
      // それ以外のエラーは通常の失敗として返す
      return fail('guard-create', e)
    }
  }

  // 集計
  const { hour, key } = nowHourKey()
  const ref = db.collection('threads').doc(threadId)

  try {
    await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref)
      const data = (snap.exists ? snap.data() : {}) as AnyObj

      const trendHourly: Record<string, number> = { ...(data.trendHourly || {}) }
      const curr = Number.isFinite(trendHourly[key]) ? trendHourly[key] : 0
      trendHourly[key] = curr + delta

      // 古いキーを間引く（48h保持）
      const keepFrom = hour - 48
      for (const k of Object.keys(trendHourly)) {
        const h = Number(k.slice(1))
        if (!Number.isFinite(h) || h < keepFrom) delete (trendHourly as any)[k]
      }

      const trendScore24h = sumLastN(trendHourly, hour, 24)

      // Counters (viewCount/messageCount) はクライアント側で更新する。
      // ここではトレンド用の集計フィールドのみ更新して重複加算を防ぐ。
      tx.set(ref, { trendHourly, trendScore24h }, { merge: true })
    })
  } catch (e) {
    return fail('tx-bump', e)
  }

  return NextResponse.json({ ok: true })
}

export async function GET(req: Request) {
  // 疎通 or GETクエリから簡易BUMP（検証用）
  const url = new URL(req.url)
  if (url.searchParams.has('threadId')) {
    return POST(req)
  }
  return NextResponse.json({ ok: true, bump: true })
}