// middleware.ts
import { NextRequest, NextResponse } from 'next/server'

// すべてのパスを対象（/_next も /api も含めて全面停止）
export const config = { matcher: ['/:path*'] }

export function middleware(_req: NextRequest) {
  // フラグが "1" のとき全面停止（環境問わず）
  if (process.env.NEXT_PUBLIC_SITE_HARD_LOCK === '1') {
    return new NextResponse(
      // 最低限のHTMLだけ返す（ブラウザに明示的に503を認識させる）
      `<!doctype html><html><head><meta charset="utf-8"/></head>
       <body style="font-family:system-ui;padding:24px">
         <h1>Service Temporarily Unavailable</h1>
         <p>The site is temporarily locked.</p>
       </body></html>`,
      {
        status: 503,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      }
    )
  }
  return NextResponse.next()
}