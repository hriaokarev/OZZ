// middleware.ts
import { NextResponse, NextRequest } from 'next/server'

// すべてのリクエストを対象（ページも /api も止める）
export const config = { matcher: ['/((?!$).*)'] }

export function middleware(req: NextRequest) {
  // 本番だけ＆フラグONのときに完全停止
  const isProd = process.env.VERCEL_ENV === 'production'
  const locked = process.env.NEXT_PUBLIC_SITE_HARD_LOCK === '1'
  if (!(isProd && locked)) return NextResponse.next()

  return new NextResponse('Temporarily unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}