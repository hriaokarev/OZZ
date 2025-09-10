// app/register/page.tsx
'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, signInAnonymously, updateProfile } from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'

type Form = {
  name: string
  age: string
  gender: string
  region: string
  agree: boolean
}

const PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県',
  '埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県',
  '岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県',
  '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
]

const AGE_OPTIONS = (() => {
  const arr = ['18+']
  for (let i = 19; i <= 49; i++) arr.push(String(i))
  arr.push('50+')
  return arr
})()

const GENDER_OPTIONS = [
  '',
  '男性',
  '女性',
  'ノンバイナリー',
  '回答しない',
]

// ---- Limits ---------------------------------------------------
const NAME_MAX = 10

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState<Form>({ name: '', age: '', gender: '', region: '', agree: false })
  const [saving, setSaving] = useState(false)

  // サインイン済みなら displayName を初期値に
  useEffect(() => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (!user) return
      if (user.displayName && !form.name) {
        setForm((f) => ({ ...f, name: (user.displayName || '').slice(0, NAME_MAX) }))
      }
    })
    return () => stop()
  }, [])

  const disabled = useMemo(() => {
    return !form.name.trim() || form.name.length > NAME_MAX || !form.age || !form.region || !form.agree || saving
  }, [form, saving])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (disabled) return

    let current = auth.currentUser
    // 未ログインなら匿名サインインを試す（Firebase Authの匿名ログインを有効にしておいてください）
    if (!current) {
      try {
        const cred = await signInAnonymously(auth)
        current = cred.user
      } catch (err) {
        alert('ログインが必要です。Firebase Authで匿名ログインを有効にするか、他のログイン方法を用意してください。')
        return
      }
    }

    try {
      setSaving(true)
      // Authの表示名も同期（任意）
      const trimmed = form.name.trim().slice(0, NAME_MAX)
      if (trimmed) {
        try { await updateProfile(current!, { displayName: trimmed }) } catch {}
      }

      await setDoc(
        doc(db, 'users', current!.uid),
        {
          name: trimmed,
          age: form.age,
          gender: form.gender || null,
          region: form.region,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )

      // 任意: Push サブスクを保存（NEXT_PUBLIC_FCM_VAPID_KEY が必要）
      registerPushSubscription().catch(() => {})

      // リダイレクト先を決定（?redirect=/foo 優先、同一オリジンreferrerにフォールバック）
      let dest = '/'
      try {
        let redirect = ''
        if (typeof window !== 'undefined') {
          const sp = new URLSearchParams(window.location.search)
          redirect = sp.get('redirect') || ''
        }
        if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
          dest = redirect
        } else if (typeof document !== 'undefined' && document.referrer) {
          const u = new URL(document.referrer)
          if (typeof window !== 'undefined' && u.origin === window.location.origin) {
            dest = u.pathname + u.search + u.hash
          }
        }
        if (dest === '/register') dest = '/'
      } catch {}
      router.replace(dest)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Suspense fallback={null}>
      <div className="mx-auto max-w-xl min-h-screen border-x border-neutral-200 pb-24">
        {/* ヘッダー */}
        <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
          <div className="flex items-center justify-between p-4">
            <h1 className="text-2xl font-bold">アカウント作成</h1>
          </div>
        </div>

        <section className="p-4">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-100 p-4">
            {/* 表示名 */}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium">表示名</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: (e.target.value || '').slice(0, NAME_MAX) })}
                maxLength={NAME_MAX}
                placeholder="匿名ユーザー"
                className="w-full rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 focus:border-pink-500 focus:outline-none"
              />
              <div className="mt-1 text-right text-xs text-neutral-500" aria-live="polite">
                {form.name.length}/{NAME_MAX}
              </div>
            </div>

            {/* 年齢 */}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium">年齢</label>
              <select
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
                className="w-full rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 focus:border-pink-500 focus:outline-none"
              >
                <option value="">選択してください</option>
                {AGE_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a === '18+' ? '18歳以上' : a === '50+' ? '50歳以上' : `${a}歳`}
                  </option>
                ))}
              </select>
            </div>

            {/* 性別 */}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium">性別（任意）</label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                className="w-full rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 focus:border-pink-500 focus:outline-none"
              >
                <option value="">選択しない</option>
                {GENDER_OPTIONS.filter((g) => g !== '').map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* 地域 */}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium">地域</label>
              <select
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                className="w-full rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 focus:border-pink-500 focus:outline-none"
              >
                <option value="">選択してください</option>
                {PREFECTURES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* 利用規約 */}
            <div className="mb-2">
              <h3 className="mb-2 text-sm font-semibold text-pink-600">利用規約</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                このサービスを利用することで、ユーザーは以下の規約に同意したものとみなされます。<br />
                <br />1. 他者を誹謗中傷する行為は禁止です。
                <br />2. 公序良俗に反する投稿は禁止されています。
                <br />3. 不適切な内容は削除される場合があります。
                <br />4. 利用によるトラブルについて運営は責任を負いません。
              </p>
            </div>

            {/* 同意チェック */}
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.agree}
                onChange={(e) => setForm({ ...form, agree: e.target.checked })}
                className="h-4 w-4 rounded border-neutral-300 text-pink-600 focus:ring-pink-500"
              />
              利用規約に同意する
            </label>

            {/* 登録ボタン */}
            <div className="mt-4">
              <button
                onClick={onSubmit}
                disabled={disabled}
                className="w-full rounded-lg bg-pink-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-pink-600/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? '作成中…' : 'アカウント作成'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </Suspense>
  )
}

/* ---------- Push subscription (registerPush.js をNext向けに移植) ---------- */

async function registerPushSubscription() {
  if (typeof window === 'undefined') return
  try {
    // SW/Push 対応チェック
    if (!('serviceWorker' in navigator)) return

    // SW登録が未対応の環境(LINE内蔵ブラウザ等)では無視
    if (!navigator.serviceWorker) return
    let registration: ServiceWorkerRegistration | null = null
    try {
      registration = await navigator.serviceWorker.ready
    } catch {}
    if (!registration) {
      // Some environments (and some TS DOM typings) don't expose getRegistration on the type.
      // Use a guarded call to avoid TypeScript errors and runtime issues.
      const swc = (navigator as any).serviceWorker
      if (swc && typeof swc.getRegistration === 'function') {
        registration = (await swc.getRegistration()) ?? null
      }
    }
    if (!registration) return

    // 通知許可（OSダイアログ）
    if (typeof Notification === 'undefined') return
    try {
      if (Notification.permission === 'default') {
        const p = await Notification.requestPermission()
        if (p !== 'granted') return
      } else if (Notification.permission !== 'granted') {
        return
      }
    } catch { return }

    // FCM対応か確認（iOSなどで未対応端末がある）
    const { isSupported, getMessaging, getToken } = await import('firebase/messaging')
    if (!(await isSupported())) return

    // VAPID 公開鍵（Firebase Web Push用）
    const vapid = process.env.NEXT_PUBLIC_FCM_VAPID_KEY
    if (!vapid) return

    // FCM トークン取得（data-only 送信と相性が良い）
    const messaging = getMessaging()
    const token = await getToken(messaging, {
      vapidKey: vapid,
      serviceWorkerRegistration: registration,
    })
    if (!token) return

    // Firestore に保存（users/{uid}/fcmTokens/{token}）
    const user = auth.currentUser
    if (!user) return
    await setDoc(
      doc(db, 'users', user.uid, 'fcmTokens', token),
      {
        dm: true,
        ua: navigator.userAgent,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  } catch {
  }
}