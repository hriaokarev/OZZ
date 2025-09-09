// app/api/fcm/test/route.ts
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const secret = process.env.FCM_TEST_SECRET || process.env.CRON_SECRET
    const provided = req.headers.get('x-test-secret') || req.headers.get('authorization')
    if (!secret || !provided || !provided.includes(secret)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const target: 'topic' | 'token' = (body?.target === 'token' ? 'token' : 'topic')
    const topic = String(body?.topic || 'trending')
    const token = body?.token as string | undefined

    const threadId = String(body?.threadId || 'TEST_THREAD')
    const title = String(body?.title || 'テスト通知')
    const rank = String(body?.rank || '1')
    const link = String(body?.link || `/threads/${threadId}`)

    // Admin Messaging の取得（firebaseAdmin を優先、無ければ admin にフォールバック）
    let mod: any
    try {
      mod = await import('@/lib/firebaseAdmin')
    } catch {
      try { mod = await import('@/lib/admin') } catch {}
    }
    const m =
      mod?.adminMessaging ||
      (typeof mod?.messaging === 'function' ? mod.messaging() : undefined) ||
      (typeof mod?.admin?.messaging === 'function' ? mod.admin.messaging() : undefined) ||
      null

    if (!m || typeof m.send !== 'function') {
      return NextResponse.json({ ok: false, error: 'messaging-not-ready(import)' }, { status: 500 })
    }

    const message: any = {
      data: { type: 'TRENDING', threadId, title, rank, link },
    }

    if (target === 'token') {
      if (!token) return NextResponse.json({ ok: false, error: 'no-token' }, { status: 400 })
      message.token = token
    } else {
      message.topic = topic
    }

    const id = await m.send(message)
    return NextResponse.json({ ok: true, id, target: target === 'token' ? `token:${token?.slice(0, 10)}…` : `topic:${topic}` })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
