'use client'
import { useEffect, useRef } from 'react'
import { auth, db /*, app*/ } from '@/lib/firebase'
import { doc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'

const VAPID = process.env.NEXT_PUBLIC_VAPID_KEY || '' // ← 既にあるキー名に合わせて

export default function TokenKeeper() {
  const busy = useRef(false)

  async function refreshToken(reason: string) {
    if (busy.current) return
    busy.current = true
    try {
      const user = auth.currentUser
      if (!user) return
      // FCMが使える環境だけ動かす
      const { isSupported, getMessaging, getToken } = await import('firebase/messaging')
      if (!(await isSupported())) return

      const reg = await navigator.serviceWorker.ready
      // `app` を lib/firebase が export している想定（していなければ export 追加）
      const messaging = getMessaging()

      // 権限が default ならここで促す（自動リクエストは好みで）
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission().catch(() => {})
      }
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return

      const token = await getToken(messaging, {
        vapidKey: VAPID,
        serviceWorkerRegistration: reg,
      })
      if (!token) return

      const key = `fcm:lastToken:${user.uid}`
      const old = localStorage.getItem(key)

      // Firestore に upsert（users/{uid}/fcmTokens/{token}）
      await setDoc(
        doc(db, 'users', user.uid, 'fcmTokens', token),
        {
          platform: 'web',
          ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          updatedAt: serverTimestamp(),
          reason,
        },
        { merge: true }
      )

      // 以前と違うトークンなら、古い方を掃除（任意）
      if (old && old !== token) {
        try { await deleteDoc(doc(db, 'users', user.uid, 'fcmTokens', old)) } catch {}
      }
      localStorage.setItem(key, token)
      localStorage.setItem('fcm:lastCheckedAt', String(Date.now()))
    } finally {
      busy.current = false
    }
  }

  useEffect(() => {
    // ログイン時に1回
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) refreshToken('signin')
    })

    // 24h 経過で自動更新
    const i = window.setInterval(() => {
      const last = Number(localStorage.getItem('fcm:lastCheckedAt') || 0)
      if (Date.now() - last > 24 * 60 * 60 * 1000) refreshToken('interval24h')
    }, 60 * 1000)

    // 復帰（バックグラウンド→前面）で12h超なら更新
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const last = Number(localStorage.getItem('fcm:lastCheckedAt') || 0)
      if (Date.now() - last > 12 * 60 * 60 * 1000) refreshToken('visible12h')
    }
    document.addEventListener('visibilitychange', onVis)

    // SW更新時は取り直す
    navigator.serviceWorker.addEventListener?.('controllerchange', () => {
      refreshToken('sw-update')
    })

    return () => {
      unsub()
      clearInterval(i)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return null
}