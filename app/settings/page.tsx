// app/settings/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { auth, db, getMessagingSafe } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, getDocFromCache, getDocFromServer, setDoc, collection, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getToken } from 'firebase/messaging'
import FooterNav from '@/components/FooterNav'

import EnablePush from '@/components/EnablePush'

type UserPrefs = {
  name?: string
  region?: string
  age?: string
  gender?: string
  comment?: string
  pushEnabled?: boolean
  dmEnabled?: boolean
  nightMode?: boolean
  mentionEnabled?: boolean
}

const PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県',
  '埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県',
  '岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県',
  '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
]

// ---- Limits ---------------------------------------------------
const NAME_MAX = 10
const COMMENT_MAX = 30
const GENDER_OPTIONS = ['', '男性', '女性', 'ノンバイナリー', '回答しない']

// ---- Push helpers -------------------------------------------------
async function ensurePushTokenAndSync(opts: { dmEnabled: boolean }) {
  try {
    // 0) 基本チェック
    if (typeof window === 'undefined') throw new Error('window undefined')
    if (!('Notification' in window)) throw new Error('Notification API not available')

    console.log('[push] step0: permission=', Notification.permission)
    if (Notification.permission !== 'granted') {
      const p = await Notification.requestPermission()
      console.log('[push] step0b: requestPermission ->', p)
      if (p !== 'granted') return
    }

    if (!('serviceWorker' in navigator)) throw new Error('serviceWorker not supported')
    const regs = await navigator.serviceWorker.getRegistrations()
    console.log('[push] step1: SW registrations=', regs.map(r => r.scope))

    const swReg = await navigator.serviceWorker.ready
    if (!swReg) throw new Error('service worker not ready')
    console.log('[push] step1b: SW ready scope=', swReg.scope)

    const messaging = await getMessagingSafe()
    if (!messaging) {
      console.warn('[push] step2: messaging not supported on this browser')
      return
    }

    const vapidKey = process.env.NEXT_PUBLIC_FCM_VAPID_KEY
    if (!vapidKey) throw new Error('VAPID key missing (NEXT_PUBLIC_FCM_VAPID_KEY)')
    console.log('[push] step3: vapid present')

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swReg,
    })
    console.log('[push] step4: getToken ->', token)
    if (!token) throw new Error('getToken returned empty')

    const uid = auth.currentUser?.uid
    if (!uid) throw new Error('no auth user')

    await setDoc(
      doc(db, 'users', uid, 'fcmTokens', token),
      {
        ua: navigator.userAgent,
        dm: !!opts.dmEnabled,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    console.log('[push] step5: saved token to Firestore')
  } catch (e) {
    console.error('[push] ERROR:', e)
  }
}

async function updateAllTokenFlags(dmEnabled: boolean) {
  try {
    const uid = auth.currentUser?.uid
    if (!uid) return
    const snap = await getDocs(collection(db, 'users', uid, 'fcmTokens'))
    const ops: Promise<any>[] = []
    snap.forEach((d) => {
      ops.push(updateDoc(d.ref, { dm: dmEnabled, updatedAt: serverTimestamp() }))
    })
    await Promise.allSettled(ops)
    console.log('[push] step6: updated existing tokens dm=', dmEnabled, 'count=', snap.size)
  } catch (e) {
    console.warn('[push] skip updateAllTokenFlags:', e)
  }
}

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [prefs, setPrefs] = useState<UserPrefs>({
    name: '',
    region: '',
    age: '',
    gender: '',
    comment: '',
    pushEnabled: true,
    dmEnabled: true,
    nightMode: false,
    mentionEnabled: true,
  })

  // 認証監視 & 初期読み込み
  useEffect(() => {
    const stop = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/register')
        return
      }
      try {
        const ref = doc(db, 'users', user.uid)
        let cacheShown = false
        // 1) まず IndexedDB のキャッシュから即座に表示（あれば）
        try {
          const cached = await getDocFromCache(ref)
          if (cached.exists()) {
            const d = cached.data() as any
            setPrefs((p) => ({
              ...p,
              name: d.name ?? '',
              region: d.region ?? '',
              age: d.age ?? '',
              gender: d.gender ?? '',
              comment: d.comment ?? '',
              pushEnabled: d.pushEnabled ?? true,
              dmEnabled: d.dmEnabled ?? true,
              nightMode: d.nightMode ?? false,
              mentionEnabled: d.mentionEnabled ?? true,
            }))
            setLoading(false)
            cacheShown = true
          }
        } catch {}

        // 2) 次にサーバーから最新を取得して上書き（オンライン時）
        try {
          const fresh = await getDocFromServer(ref)
          if (fresh.exists()) {
            const d = fresh.data() as any
            setPrefs((p) => ({
              ...p,
              name: d.name ?? '',
              region: d.region ?? '',
              age: d.age ?? '',
              gender: d.gender ?? '',
              comment: d.comment ?? '',
              pushEnabled: d.pushEnabled ?? true,
              dmEnabled: d.dmEnabled ?? true,
              nightMode: d.nightMode ?? false,
              mentionEnabled: d.mentionEnabled ?? true,
            }))
            if (!cacheShown) setLoading(false)
          } else if (!cacheShown) {
            setLoading(false)
          }
        } catch {
          if (!cacheShown) setLoading(false)
        }
      } catch {
        setLoading(false)
      }
    })
    return () => stop()
  }, [router])

  async function save() {
    const user = auth.currentUser
    if (!user) return
    setSaving(true)
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          name: (prefs.name ?? '').trim().slice(0, NAME_MAX),
          region: prefs.region ?? '',
          age: prefs.age ?? '',
          gender: prefs.gender ?? '',
          comment: (prefs.comment ?? '').trim().slice(0, COMMENT_MAX),
          pushEnabled: !!prefs.pushEnabled,
          dmEnabled: !!prefs.dmEnabled,
          nightMode: !!prefs.nightMode,
          mentionEnabled: !!prefs.mentionEnabled,
          updatedAt: new Date(),
        },
        { merge: true },
      )
    } finally {
      setSaving(false)
    }
  }

  async function onToggleDm(next: boolean) {
    setPrefs((p) => ({ ...p, dmEnabled: next }))
    const user = auth.currentUser
    if (!user) return

    try {
      // 1) プロファイルにフラグ保存
      await setDoc(
        doc(db, 'users', user.uid),
        { dmEnabled: next, updatedAt: serverTimestamp() },
        { merge: true },
      )
      console.log('[push] stepA: user.dmEnabled saved', next)

      // 2) 有効化時は必ずこの端末のトークンを発行・保存
      if (next) {
        await ensurePushTokenAndSync({ dmEnabled: true })
      }

      // 3) 既存端末の dm フラグを反映（読めなくてもスキップ）
      await updateAllTokenFlags(next)

      console.log('[push] DONE: onToggleDm', next)
    } catch (e) {
      console.error('[push] onToggleDm failed:', e)
      alert('通知設定の更新に失敗しました。もう一度お試しください。')
    }
  }

  const disabled = !prefs.name?.trim()

  return (
    <div className="mx-auto max-w-xl min-h-screen border-x border-neutral-200 pb-24">
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-2xl font-bold">設定</h1>
        </div>
      </div>

      {/* アカウント */}
      <section className="p-4">
        <div className="rounded-2xl border border-neutral-200 bg-neutral-100 p-4">
          <h2 className="mb-5 text-base font-semibold">アカウント</h2>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium">表示名</label>
            <input
              value={prefs.name ?? ''}
              onChange={(e) => setPrefs({ ...prefs, name: (e.target.value || '').slice(0, NAME_MAX) })}
              maxLength={NAME_MAX}
              placeholder="表示名"
              className="w-full rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 focus:border-pink-500 focus:outline-none"
            />
            <div className="mt-1 text-right text-xs text-neutral-500" aria-live="polite">
              {(prefs.name?.length ?? 0)}/{NAME_MAX}
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium">地域</label>
            <select
              value={prefs.region}
              onChange={(e) => setPrefs({ ...prefs, region: e.target.value })}
              className="w-full rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 focus:border-pink-500 focus:outline-none"
            >
              <option value="">選択してください</option>
              {PREFECTURES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium">年齢</label>
            <input
              inputMode="numeric"
              value={prefs.age}
              onChange={(e) => setPrefs({ ...prefs, age: e.target.value })}
              placeholder="例: 20"
              className="w-full rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 focus:border-pink-500 focus:outline-none"
            />
          </div>

          {/* 性別（任意） */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium">性別（任意）</label>
            <select
              value={prefs.gender || ''}
              onChange={(e) => setPrefs({ ...prefs, gender: e.target.value })}
              className="w-full rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 focus:border-pink-500 focus:outline-none"
            >
              <option value="">選択しない</option>
              {GENDER_OPTIONS.filter((g) => g !== '').map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* コメント（任意・30文字） */}
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium">コメント（任意・{COMMENT_MAX}文字）</label>
            <input
              value={prefs.comment ?? ''}
              onChange={(e) => setPrefs({ ...prefs, comment: (e.target.value || '').slice(0, COMMENT_MAX) })}
              maxLength={COMMENT_MAX}
              placeholder="ひとことコメント"
              className="w-full rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 focus:border-pink-500 focus:outline-none"
            />
            <div className="mt-1 text-right text-xs text-neutral-500" aria-live="polite">
              {(prefs.comment?.length ?? 0)}/{COMMENT_MAX}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={disabled || saving}
              className="rounded-lg bg-pink-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-pink-600/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
            {!prefs.name?.trim() && (
              <span className="text-xs text-neutral-500">表示名は必須です</span>
            )}
          </div>

          <div className="mt-6 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            <RowLink title="プロフィール編集" desc="表示名、自己紹介、アバターの変更" href="/settings/profile" />
            <RowLink title="プライバシー設定" desc="匿名レベル、表示される情報の管理" href="#" />
            <RowLink title="ブロック・ミュート" desc="不快なユーザーやコンテンツの管理" href="#" last />
          </div>
        </div>
      </section>

      {/* 通知 */}
      <section className="px-4">
        <div className="rounded-2xl border border-neutral-200 bg-neutral-100 p-4">
          <h2 className="mb-5 text-base font-semibold">通知</h2>

          <ToggleRow
            title="プッシュ通知"
            desc="新着メッセージやいいねの通知"
            checked={!!prefs.pushEnabled}
            onChange={(v) => setPrefs({ ...prefs, pushEnabled: v })}
          />
          <ToggleRow
            title="DM通知"
            desc="ダイレクトメッセージの通知"
            checked={!!prefs.dmEnabled}
            onChange={(v) => setPrefs({ ...prefs, dmEnabled: v })}
          />
          <ToggleRow
            title="深夜モード"
            desc="22:00-6:00の通知を制限"
            checked={!!prefs.nightMode}
            onChange={(v) => setPrefs({ ...prefs, nightMode: v })}
          />
          <ToggleRow
            title="メンション通知"
            desc="スレッドでメンションされた時の通知"
            checked={!!prefs.mentionEnabled}
            onChange={(v) => setPrefs({ ...prefs, mentionEnabled: v })}
            last
          />
        </div>
      </section>

      {/* アプリ情報 */}
      <section className="p-4">
        <div className="rounded-2xl border border-neutral-200 bg-neutral-100 p-4">
          <h2 className="mb-5 text-base font-semibold">アプリ情報</h2>

          <RowLink title="利用規約" desc="サービス利用に関する規約" href="#" />
          <RowLink title="プライバシーポリシー" desc="個人情報の取り扱いについて" href="#" />
          <RowLink title="ヘルプ・サポート" desc="よくある質問、お問い合わせ" href="#" />
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold">バージョン</div>
              <div className="text-sm text-neutral-500">OZZ v2.2</div>
            </div>
          </div>
        </div>
      </section>

      {/* ローディング（初期） */}
      {loading && (
        <div className="px-4 pb-4">
          <div className="animate-pulse rounded-2xl border border-neutral-200 bg-neutral-100 p-4 h-40" />
        </div>
      )}

      <FooterNav />
    </div>
  )
}

/* ------- small UI pieces ------- */

function RowLink(props: { title: string; desc: string; href: string; last?: boolean }) {
  return (
    <Link
      href={props.href}
      className={`flex items-center justify-between py-4 px-3 hover:bg-neutral-50 transition-colors ${props.last ? '' : 'border-b border-neutral-200'}`}
    >
      <div>
        <div className="settings-label font-semibold">{props.title}</div>
        <div className="settings-desc text-sm text-neutral-500">{props.desc}</div>
      </div>
      <span className="text-lg text-neutral-400">›</span>
    </Link>
  )
}

function ToggleRow(props: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-4 ${props.last ? '' : 'border-b border-neutral-200'}`}>
      <div>
        <div className="font-semibold">{props.title}</div>
        <div className="text-sm text-neutral-500">{props.desc}</div>
      </div>
      <button
        type="button"
        aria-pressed={props.checked}
        onClick={() => props.onChange(!props.checked)}
        className={`relative h-7 w-14 rounded-full transition-colors ${props.checked ? 'bg-pink-500' : 'bg-neutral-300'}`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${props.checked ? 'translate-x-7' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  )
}