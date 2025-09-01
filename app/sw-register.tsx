// app/sw-register.tsx
'use client'
import { useEffect } from 'react'
import '@/lib/firebase'
import { getMessaging, isSupported, onMessage } from 'firebase/messaging'

export default function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // ---- ENV から取得（msid だけでも FCM 初期化は可） ----
    const msid = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID

    // 強制更新＆自己修復用のバージョン（更新時は数字を上げる）
    const VERSION = '11'

    const params = new URLSearchParams()
    if (msid) params.set('msid', msid)
    if (apiKey) params.set('apiKey', apiKey)
    if (projectId) params.set('projectId', projectId)
    if (appId) params.set('appId', appId)
    params.set('v', VERSION)

    // 望ましい SW の URL（msid が無ければフォールバックでクエリ無し）
    const desiredUrl = msid ? `/service-worker.js?${params.toString()}` : '/service-worker.js'

    const ensure = async () => {
      // 既存登録を取得
      const regs = await navigator.serviceWorker.getRegistrations()
      const reg = regs.find(r => r.scope === `${location.origin}/`)
      const current = reg?.active?.scriptURL || reg?.waiting?.scriptURL || reg?.installing?.scriptURL

      const hasMsid = !!current && current.includes('msid=')
      const hasVersion = !!current && current.includes(`v=${VERSION}`)

      // クエリ無し / 古い v の SW はアンレジして入れ替え（自己修復）
      if (reg && (!hasMsid || !hasVersion)) {
        console.info('[sw] migrate: unregister old SW', current)
        try { await reg.unregister() } catch {}
      }

      // 未登録 or 解除した場合は希望 URL で登録
      let activeReg = reg
      if (!reg || !hasMsid || !hasVersion) {
        try {
          activeReg = await navigator.serviceWorker.register(desiredUrl, { scope: '/' })
          console.info('[sw] registered:', activeReg.scope, activeReg.active?.scriptURL || desiredUrl)
        } catch (e) {
          console.error('[sw] register error', e)
          return
        }
      }

      if (!activeReg) return

      // 新 SW が入ったら即時反映（既存機能は保持）
      activeReg.addEventListener('updatefound', () => {
        const installing = activeReg!.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            activeReg!.waiting?.postMessage?.({ type: 'SKIP_WAITING' })
          }
        })
      })

      // 予防線：クエリが落ちても SW に初期化指示を送れるようにしておく
      const cfg: Record<string, string> = {}
      if (msid) cfg.messagingSenderId = msid
      if (apiKey) cfg.apiKey = apiKey
      if (projectId) cfg.projectId = projectId
      if (appId) cfg.appId = appId

      try {
        await navigator.serviceWorker.ready
        ;(activeReg.active || activeReg.waiting || activeReg.installing)?.postMessage({
          type: 'FCM_INIT',
          cfg,
        })
      } catch {}
    }

    ensure().catch(e => console.error('[sw] ensure error', e))

    // ページ復帰時に SW へ初期化情報を再送（クエリ落ち対策）
    const onVis = async () => {
      if (document.hidden) return
      try {
        const cfg: Record<string, string> = {}
        if (msid) cfg.messagingSenderId = msid
        if (apiKey) cfg.apiKey = apiKey
        if (projectId) cfg.projectId = projectId
        if (appId) cfg.appId = appId
        const reg = await navigator.serviceWorker.getRegistration('/')
        ;(reg?.active || reg?.waiting || reg?.installing)?.postMessage({ type: 'FCM_INIT', cfg })
      } catch {}
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // --- 前景（アプリ閲覧中）の通知トースト ---
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if (!(await isSupported())) return
        const messaging = getMessaging()

        const showToast = (title: string, body: string, link?: string) => {
          if (!mounted || typeof document === 'undefined') return
          const wrap = document.createElement('div')
          wrap.setAttribute('role', 'status')
          wrap.style.position = 'fixed'
          wrap.style.left = '50%'
          wrap.style.top = 'calc(16px + env(safe-area-inset-top, 0px))'
          wrap.style.transform = 'translateX(-50%)'
          wrap.style.zIndex = '9999'
          wrap.style.maxWidth = '92%'

          const card = document.createElement('div')
          card.style.padding = '12px 14px'
          card.style.borderRadius = '14px'
          card.style.background = 'rgba(17, 24, 39, 0.92)'
          card.style.color = '#fff'
          card.style.boxShadow = '0 10px 25px rgba(0,0,0,.25)'
          card.style.backdropFilter = 'saturate(1.2) blur(4px)'
          card.style.cursor = link ? ('pointer' as any) : 'default'

          const h = document.createElement('div')
          h.style.fontWeight = '700'
          h.style.marginBottom = '2px'
          h.style.fontSize = '14px'
          h.textContent = title || '新着メッセージ'
          const p = document.createElement('div')
          p.style.fontSize = '12px'
          p.style.opacity = '0.9'
          p.textContent = body || ''

          card.appendChild(h)
          card.appendChild(p)
          wrap.appendChild(card)
          document.body.appendChild(wrap)

          const close = () => { try { document.body.removeChild(wrap) } catch {} }
          if (link) card.onclick = () => { close(); location.href = link }
          setTimeout(close, 4000)
        }

        // デバッグ用に手動発火できる関数も公開
        ;(window as any).FCM_DEBUG_TOAST = (t: string, b: string, l?: string) => showToast(t, b, l)

        onMessage(messaging, (payload) => {
          const n: any = (payload as any)?.notification || {}
          const d: any = (payload as any)?.data || {}
          const title = n.title || d.title || '新着メッセージ'
          const body  = n.body  || d.body  || ''
          const link  = d.link || '/'
          showToast(title, body, link)
        })
      } catch {}
    })()
    return () => { mounted = false }
  }, [])

  return null
}