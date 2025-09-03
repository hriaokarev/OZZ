// app/threads/page.tsx
'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import FooterNav from '@/components/FooterNav'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  limit,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'

// ---- Types ----------------------------------------------------
type Thread = {
  id: string
  name: string
  description?: string
  genre?: string
  userId?: string | null
  authorName?: string
  createdAt?: any
  createdAtMs?: number
  createdAtText?: string
  messageCount?: number
  viewCount?: number
}

// ---- Limits ---------------------------------------------------
const NAME_MAX = 20
const DESC_MAX = 300

// ---- Page -----------------------------------------------------
export default function ThreadsPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [genre, setGenre] = useState('雑談')
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const nameCacheRef = useRef<Map<string, string>>(new Map())
  const pendingRef = useRef<Set<string>>(new Set())
  const [authorNameMap, setAuthorNameMap] = useState<Record<string, string>>({})

  // 表示モード: トレンド / 新着 / 作成順 / ジャンル別人気
  const [mode, setMode] = useState<'trend' | 'new' | 'created' | 'genre:雑談' | 'genre:恋愛' | 'genre:ゲーム' | 'genre:１８禁'>('trend')

  // 各スレッドのライブ件数（views/messages）を保持
  const [liveCounts, setLiveCounts] = useState<Record<string, { views: number; messages: number }>>({})
  const countsUnsubsRef = useRef<Record<string, { views?: () => void; messages?: () => void }>>({})

  const disabled = useMemo(
    () => !name.trim() || name.length > NAME_MAX || description.length > DESC_MAX,
    [name, description]
  )

  const displayThreads = useMemo(() => {
    const getScore = (t: Thread) => {
      const lc = liveCounts[t.id]
      const views = lc?.views ?? (t.viewCount ?? 0)
      const msgs = lc?.messages ?? (t.messageCount ?? 0)
      return views * 10 + msgs
    }
    let arr = [...threads]
    if (mode === 'trend') {
      arr.sort((a, b) => {
        const s = getScore(b) - getScore(a)
        if (s !== 0) return s
        return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0)
      })
      return arr
    }
    if (mode === 'new') {
      arr.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))
      return arr
    }
    if (mode === 'created') {
      arr.sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0))
      return arr
    }
    // genre:*
    if (mode.startsWith('genre:')) {
      const g = mode.split(':')[1]
      arr = arr.filter((t) => (t.genre || '') === g)
      arr.sort((a, b) => {
        const s = getScore(b) - getScore(a)
        if (s !== 0) return s
        return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0)
      })
      return arr
    }
    return arr
  }, [threads, liveCounts, mode])

  // 一覧: 最新50件のみ購読（高速・省コスト）
  useEffect(() => {
    const q = query(
      collection(db, 'threads'),
      orderBy('createdAt', 'desc'),
      limit(50)
    )
    const unsub = onSnapshot(q, (snap) => {
      const list: Thread[] = snap.docs.map((d) => {
        const data: any = d.data()
        const t = data?.createdAt?.toDate?.() as Date | undefined
        return {
          id: d.id,
          name: data?.name ?? '',
          description: data?.description ?? '',
          genre: data?.genre ?? '',
          userId: data?.userId ?? null,
          authorName: data?.authorName ?? '',
          messageCount: data?.messageCount ?? 0, // あれば表示（無ければ0）
          viewCount: data?.viewCount ?? 0,       // あれば表示（無ければ0）
          createdAtText: t
            ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '',
          createdAtMs: t ? t.getTime() : 0,
        }
      })
      setThreads(list)

      // --- 各スレッドの views / messages サブコレクションを購読して件数を反映 ---
      const currentIds = new Set(list.map((t) => t.id))

      // 不要になった購読を解除
      for (const id of Object.keys(countsUnsubsRef.current)) {
        if (!currentIds.has(id)) {
          try { countsUnsubsRef.current[id].views && countsUnsubsRef.current[id].views!() } catch {}
          try { countsUnsubsRef.current[id].messages && countsUnsubsRef.current[id].messages!() } catch {}
          delete countsUnsubsRef.current[id]
          setLiveCounts((prev) => {
            const cp = { ...prev }
            delete cp[id]
            return cp
          })
        }
      }

      // 新規スレッドに購読を張る
      for (const t of list) {
        if (!countsUnsubsRef.current[t.id]) {
          const unsubViews = onSnapshot(
            collection(db, 'threads', t.id, 'views'),
            (snap) => {
              setLiveCounts((prev) => ({
                ...prev,
                [t.id]: { views: snap.size || 0, messages: prev[t.id]?.messages ?? 0 },
              }))
            }
          )
          const unsubMsgs = onSnapshot(
            collection(db, 'threads', t.id, 'messages'),
            (snap) => {
              setLiveCounts((prev) => ({
                ...prev,
                [t.id]: { views: prev[t.id]?.views ?? (t.viewCount ?? 0), messages: snap.size || 0 },
              }))
            }
          )
          countsUnsubsRef.current[t.id] = { views: unsubViews, messages: unsubMsgs }
        }
      }

      // authorName が無いものは users/{uid} から一度だけ引いて補完 + サーバーへ書き戻し
      for (const t of list) {
        const uid = t.userId
        const threadId = t.id
        if (!uid) continue

        // 既に doc 側に authorName が入っていればキャッシュに記録だけしてスキップ
        if (t.authorName && t.authorName.trim()) {
          if (!nameCacheRef.current.has(uid)) nameCacheRef.current.set(uid, t.authorName)
          if (!authorNameMap[uid]) setAuthorNameMap((prev) => ({ ...prev, [uid]: t.authorName as string }))
          continue
        }

        // 既に解決済み/取得中ならスキップ
        if (nameCacheRef.current.has(uid) || authorNameMap[uid] || pendingRef.current.has(uid)) continue
        pendingRef.current.add(uid)
        getDoc(doc(db, 'users', uid))
          .then(async (snap) => {
            if (snap.exists()) {
              const nm = ((snap.data() as any)?.name || '名無し') as string
              nameCacheRef.current.set(uid, nm)
              setAuthorNameMap((prev) => ({ ...prev, [uid]: nm }))
              setThreads((prev) => prev.map((p) => (p.userId === uid && (!p.authorName || p.authorName === '') ? { ...p, authorName: nm } : p)))
              // Firestore にも authorName をバックフィル（以降は遅延取得不要に）
              try {
                await setDoc(doc(db, 'threads', threadId), { authorName: nm }, { merge: true })
              } catch {}
            }
          })
          .finally(() => {
            pendingRef.current.delete(uid)
          })
      }
    })
    return () => {
      unsub()
      // サブコレ購読も全解除
      for (const id of Object.keys(countsUnsubsRef.current)) {
        try { countsUnsubsRef.current[id].views && countsUnsubsRef.current[id].views!() } catch {}
        try { countsUnsubsRef.current[id].messages && countsUnsubsRef.current[id].messages!() } catch {}
      }
      countsUnsubsRef.current = {}
    }
  }, [authorNameMap])

  // 作成
  async function createThread(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (disabled || loading) return
    setLoading(true)
    try {
      const user = auth.currentUser
      let authorName = user?.displayName || '名無し'
      if (user) {
        try {
          const u = await getDoc(doc(db, 'users', user.uid))
          if (u.exists()) {
            authorName = (u.data() as any)?.name || authorName
          }
        } catch {/* noop */}
      }

      const ref = await addDoc(collection(db, 'threads'), {
        name: name.trim().slice(0, NAME_MAX),
        description: description.trim().slice(0, DESC_MAX),
        genre: (genre.trim() || '雑談'),
        userId: user?.uid ?? null,
        authorName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // 一覧の高速化用に将来使えるメタ
        messageCount: 0,
        viewCount: 0,
      })

      // 入力クリア & 作成したスレッドへ
      setName('')
      setDescription('')
      setGenre('')
      setModalOpen(false)
      router.push(`/threads/${ref.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl min-h-screen border-x border-neutral-200 pb-24">
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-2xl font-bold">スレッド</h1>
          <div className="flex items-center gap-2 text-neutral-500">
            <button type="button" aria-label="検索" className="h-9 w-9 grid place-items-center rounded-md hover:bg-neutral-100">🔍</button>
            <button type="button" aria-label="統計" className="h-9 w-9 grid place-items-center rounded-md hover:bg-neutral-100">📊</button>
          </div>
        </div>
      </div>

      {/* カテゴリチップ（装飾） */}
      <div className="px-4 pt-3 pb-1 flex gap-3 overflow-x-auto">
        {(() => {
          const chip = (label: string, isActive: boolean, onClick: () => void) => (
            <button
              type="button"
              onClick={onClick}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                isActive ? 'border-pink-500 bg-pink-100' : 'border-neutral-300 bg-neutral-100 hover:border-pink-400'
              }`}
            >
              {label}
            </button>
          )
          return (
            <>
              {chip('🔥 トレンド', mode === 'trend', () => setMode('trend'))}
              {chip('🆕 新着', mode === 'new', () => setMode('new'))}
              {chip('📅 作成順', mode === 'created', () => setMode('created'))}
              {chip('💭 雑談', mode === 'genre:雑談', () => setMode('genre:雑談'))}
              {chip('💕 恋愛', mode === 'genre:恋愛', () => setMode('genre:恋愛'))}
              {chip('🎮 ゲーム', mode === 'genre:ゲーム', () => setMode('genre:ゲーム'))}
              {chip('🔞 １８禁', mode === 'genre:１８禁', () => setMode('genre:１８禁'))}
            </>
          )
        })()}
      </div>

      {/* 一覧（1枚内に表示） */}
      <div className="px-2">
        {displayThreads.length === 0 ? (
          <div className="text-center text-neutral-500 py-10">
            スレッドはまだありません
          </div>
        ) : (
          <ul className="space-y-3">
            {displayThreads.map((t, idx) => (
              <li key={t.id} className="relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 p-4 transition-all hover:-translate-y-0.5 hover:border-pink-300">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-pink-500 to-rose-500" />
                <Link href={`/threads/${t.id}`} aria-label={`スレッド ${t.name} を開く`} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-neutral-500 mb-1">
                        {(t.authorName || '未設定')}・{t.genre || '未分類'}
                      </div>
                      <h2 className="font-semibold truncate flex items-center gap-2">
                        {(mode === 'trend' || mode.startsWith('genre:')) && (
                          <>
                            {idx < 3 && (
                              <span className="inline-flex h-5 w-5 items-center justify-center" aria-hidden>
                                <svg
                                  viewBox="0 0 24 24"
                                  className={`h-4 w-4 ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-400' : 'text-amber-700'}`}
                                  fill="currentColor"
                                >
                                  <path d="M4 19h16v2H4z"/>
                                  <path d="M3 7l4.5 3.5L10.5 5l3 5.5L20 7l-2 10H5L3 7z"/>
                                </svg>
                              </span>
                            )}
                            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-pink-600 px-1 text-[11px] font-bold text-white">#{idx + 1}</span>
                          </>
                        )}
                        <span className="truncate">{t.name}</span>
                      </h2>
                      {t.description && (
                        <p className="text-sm text-neutral-600 line-clamp-2 mt-1">
                          {t.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
                        {t.createdAtText && <span>{t.createdAtText}</span>}
                        <span>👁 {liveCounts[t.id]?.views ?? (t.viewCount ?? 0)}人 見た</span>
                        <span>💬 {liveCounts[t.id]?.messages ?? (t.messageCount ?? 0)}件</span>
                      </div>
                    </div>
                    <span className="shrink-0 text-lg text-neutral-400">›</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* FAB（スレッド作成） */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label="スレッド作成"
        className="fixed bottom-24 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-white text-2xl shadow-lg hover:scale-105 transition-transform"
      >
        ＋
      </button>

      {/* スレッド作成ポップアップ */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false)
          }}
        >
          <form
            onSubmit={createThread}
            className="w-[90%] max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            aria-modal="true"
            role="dialog"
          >
            <div className="text-lg font-bold text-center mb-4">スレッド作成</div>
            <div className="space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
                maxLength={NAME_MAX}
                placeholder="ルーム名を入力"
                className="w-full rounded-xl border-2 border-neutral-200 bg-neutral-100 px-4 py-3 focus:border-pink-500 focus:outline-none"
              />
              <div className="mt-1 text-right text-xs text-neutral-500" aria-live="polite">
                {name.length}/{NAME_MAX}
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
                placeholder="ルーム説明を入力"
                rows={3}
                maxLength={DESC_MAX}
                className="w-full rounded-xl border-2 border-neutral-200 bg-neutral-100 px-4 py-3 focus:border-pink-500 focus:outline-none"
              />
              <div
                className={`mt-1 text-right text-xs ${description.length >= DESC_MAX ? 'text-pink-600' : 'text-neutral-500'}`}
                aria-live="polite"
              >
                {description.length}/{DESC_MAX}
              </div>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full rounded-xl border-2 border-neutral-200 bg-neutral-100 px-4 py-3 focus:border-pink-500 focus:outline-none"
              >
                <option value="雑談">雑談</option>
                <option value="恋愛">恋愛</option>
                <option value="ゲーム">ゲーム</option>
                <option value="１８禁">１８禁</option>
              </select>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 rounded-lg bg-neutral-100 px-4 py-3"
              >キャンセル</button>
              <button
                type="submit"
                disabled={disabled || loading}
                className="flex-1 rounded-lg bg-pink-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
              >{loading ? '作成中…' : '作成'}</button>
            </div>
          </form>
        </div>
      )}

	  <FooterNav />
    </div>
  )
}