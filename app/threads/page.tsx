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
  const [genre, setGenre] = useState('')
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const nameCacheRef = useRef<Map<string, string>>(new Map())
  const pendingRef = useRef<Set<string>>(new Set())
  const [authorNameMap, setAuthorNameMap] = useState<Record<string, string>>({})

  const disabled = useMemo(
    () => !name.trim() || name.length > NAME_MAX || description.length > DESC_MAX,
    [name, description]
  )

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
        }
      })
      setThreads(list)

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
    return () => unsub()
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
        genre: genre.trim(),
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
        <button className="shrink-0 rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-sm hover:border-pink-400">🔥 トレンド</button>
        <button className="shrink-0 rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-sm hover:border-pink-400">💭 雑談</button>
        <button className="shrink-0 rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-sm hover:border-pink-400">💕 恋愛</button>
        <button className="shrink-0 rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-sm hover:border-pink-400">🎮 ゲーム</button>
        <button className="shrink-0 rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-sm hover:border-pink-400">📚 学習</button>
      </div>

      {/* 一覧（1枚内に表示） */}
      <div className="px-2">
        {threads.length === 0 ? (
          <div className="text-center text-neutral-500 py-10">
            スレッドはまだありません
          </div>
        ) : (
          <ul className="space-y-3">
            {threads.map((t) => (
              <li key={t.id} className="relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 p-4 transition-all hover:-translate-y-0.5 hover:border-pink-300">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-pink-500 to-rose-500" />
                <Link href={`/threads/${t.id}`} aria-label={`スレッド ${t.name} を開く`} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-neutral-500 mb-1">
                        {(t.authorName || '未設定')}・{t.genre || '未分類'}
                      </div>
                      <h2 className="font-semibold truncate">{t.name}</h2>
                      {t.description && (
                        <p className="text-sm text-neutral-600 line-clamp-2 mt-1">
                          {t.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
                        {t.createdAtText && <span>{t.createdAtText}</span>}
                        <span>👁 {t.viewCount ?? 0}人 見た</span>
                        <span>💬 {t.messageCount ?? 0}件</span>
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
                <option value="れんあい">れんあい</option>
                <option value="ゲーム">ゲーム</option>
                <option value="学習">学習</option>
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