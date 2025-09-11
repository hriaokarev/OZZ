// app/threads/[id]/page.tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  limit,
  query,
  startAfter,
  serverTimestamp,
  runTransaction,
  increment,
  writeBatch,
  DocumentSnapshot,
} from 'firebase/firestore'

// ---- Types ----------------------------------------------------
type Message = {
  id: string
  content: string
  userId?: string
  authorName?: string
  createdAt?: any
  createdAtText?: string
}

function clipText(s?: string, max = 40) {
  if (!s) return ''
  return s.length > max ? s.slice(0, max) + '…' : s
}

// ---- Trending helpers (client-side bump/touch) -----------------
const VIEW_BUMP_COOLDOWN_MS = 60_000
const TOUCH_COOLDOWN_MS = 60_000

function postJSON(url: string, data: any) {
  try {
    const payload = JSON.stringify(data)
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([payload], { type: 'application/json' })
      ;(navigator as any).sendBeacon(url, blob)
      return
    }
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {})
  } catch {}
}

function bumpThread(threadId: string, type: 'view' | 'message') {
  if (!threadId) return
  postJSON('/api/trending/bump', { threadId, type })
}

function touchDebounced(threadId: string) {
  const key = `ozz_touch_${threadId}`
  try {
    const now = Date.now()
    const last = Number(localStorage.getItem(key) || '0')
    if (now - last < TOUCH_COOLDOWN_MS) return
    localStorage.setItem(key, String(now))
  } catch {}
  postJSON('/api/trending/touch', {})
}

function isCooldownHit(key: string, ms: number) {
  try {
    const now = Date.now()
    const last = Number(localStorage.getItem(key) || '0')
    if (now - last < ms) return true
    localStorage.setItem(key, String(now))
  } catch {}
  return false
}

export default function ThreadRoomPage() {
  const { id } = useParams<{ id: string }>()
  const threadId = id
  const router = useRouter()

  const [title, setTitle] = useState('読み込み中...')
  const [description, setDescription] = useState('')
  const [genre, setGenre] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [showShareHint, setShowShareHint] = useState(false)
  const [showFirstVisitModal, setShowFirstVisitModal] = useState(false)
  const sendingRef = useRef(false)

  const messagesBoxRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastMsgIdRef = useRef<string | null>(null)

  // ---- Paging (older logs) ---------------------------------------------
  const PAGE = 50
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const topSentinelRef = useRef<HTMLDivElement | null>(null)
  const oldestDocRef = useRef<DocumentSnapshot | null>(null)
  const olderRef = useRef<Message[]>([])

  const [showJumpToBottom, setShowJumpToBottom] = useState(false)

  const headerDesc = clipText(description, 20)

  // ---- Share helpers --------------------------------------------------
  function makeThreadUrlAbs(id: string) {
    const base = (process.env.NEXT_PUBLIC_BASE_URL as string) || (typeof window !== 'undefined' ? window.location.origin : '')
    try {
      return new URL(`/threads/${id}`, base).toString()
    } catch {
      return `${(base || '').replace(/\/$/, '')}/threads/${id}`
    }
  }

  async function shareThisThread() {
    try {
      const url = makeThreadUrlAbs(threadId)
      const titleText = title || 'スレッド'
      // LINE等でURLにtextが連結されるのを避けるため、textは渡さない
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: titleText, url })
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        alert('リンクをコピーしました')
      }
      setShowShareHint(false)
      setShowFirstVisitModal(false)
    } catch {
      // キャンセル等は無視
    }
  }

  const isNearBottom = (el: HTMLDivElement | null, threshold = 80) => {
    if (!el) return true
    const delta = el.scrollHeight - el.clientHeight - el.scrollTop
    return delta <= threshold
  }

  // 閲覧記録（1ユーザー1ドキュメント）+ 親 viewCount をトランザクションで +1（初回のみ）
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || !threadId) return
      try {
        const threadRef = doc(db, 'threads', threadId)
        const viewRef = doc(db, 'threads', threadId, 'views', user.uid)
        await runTransaction(db, async (tx) => {
          const vSnap = await tx.get(viewRef)
          if (vSnap.exists()) return // 既にカウント済み
          tx.set(viewRef, { userId: user.uid, viewedAt: serverTimestamp() })
          tx.update(threadRef, { viewCount: increment(1) })
        })

        // 24hトレンド加点（閲覧）: ローカル60秒クールダウン
        try {
          const cdKey = `ozz_bump_view_${threadId}`
          if (!isCooldownHit(cdKey, VIEW_BUMP_COOLDOWN_MS)) {
            bumpThread(threadId, 'view')
            touchDebounced(threadId)
          }
        } catch {}
      } catch (e) {
        console.error('view記録エラー', e)
      }
    })
    return () => unsub()
  }, [threadId])

  // スレッド情報
  useEffect(() => {
    if (!threadId) return
    ;(async () => {
      const threadRef = doc(db, 'threads', threadId)
      const snap = await getDoc(threadRef)
      if (snap.exists()) {
        const d = snap.data() as any
        setTitle(d.name || 'スレッド')
        setDescription(d.description || '')
        setGenre(d.genre || '')
      }
    })()
  }, [threadId])

  // メッセージ購読（最新50件）＋ olderRef のマージで全体を表示
  useEffect(() => {
    if (!threadId) return
    const messagesRef = collection(db, 'threads', threadId, 'messages')
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(PAGE))
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs
      const newestFirst = docs.map((d) => {
        const data: any = d.data()
        const t = data?.createdAt?.toDate?.() as Date | undefined
        return {
          id: d.id,
          ...data,
          createdAtText: t
            ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '',
        } as Message
      })
      const latestAsc = [...newestFirst].reverse()

      // 初回だけ、以降の古いページ読み込み用カーソルをセット
      if (!oldestDocRef.current) {
        oldestDocRef.current = docs[docs.length - 1] ?? null
        setHasMore(docs.length === PAGE)
      }

      const prevLast = lastMsgIdRef.current
      const combined = [...olderRef.current, ...latestAsc]
      const nextLast = combined.length ? combined[combined.length - 1].id : null

      setMessages(combined)

      const shouldScroll =
        !prevLast || isNearBottom(messagesBoxRef.current) || prevLast !== nextLast
      lastMsgIdRef.current = nextLast
      if (shouldScroll) {
        requestAnimationFrame(() =>
          bottomRef.current?.scrollIntoView({ behavior: 'auto' })
        )
      }
    })
    return () => unsub()
  }, [threadId])

  // 小バブルは1回だけ表示
  useEffect(() => {
    if (!threadId) return
    try {
      const key = `ozz_share_hint_seen_${threadId}`
      const seen = localStorage.getItem(key)
      if (!seen) {
        setShowShareHint(true)
        localStorage.setItem(key, '1')
      }
    } catch {}
  }, [threadId])

  useEffect(() => {
    if (!threadId) return
    try {
      const modalKey = `ozz_share_modal_seen_${threadId}`
      const seen = localStorage.getItem(modalKey)
      if (!seen) {
        setShowFirstVisitModal(true)
        localStorage.setItem(modalKey, '1') // 初回だけ
        // バブルも今後出さないように既読化
        try { localStorage.setItem(`ozz_share_hint_seen_${threadId}`, '1') } catch {}
        // 小バブルは消す
        setShowShareHint(false)
      }
    } catch {}
  }, [threadId])

  // さらに古い50件を読み込む
  const loadOlder = useCallback(async () => {
    if (loadingMore || !hasMore || !oldestDocRef.current) return
    setLoadingMore(true)

    const beforeHeight = messagesBoxRef.current?.scrollHeight ?? 0

    try {
      const baseCol = collection(db, 'threads', threadId, 'messages')
      const q = query(
        baseCol,
        orderBy('createdAt', 'desc'),
        startAfter(oldestDocRef.current),
        limit(PAGE)
      )
      const snap = await getDocs(q)
      const docsDesc = snap.docs
      const olderAsc: Message[] = docsDesc.map((d) => {
        const data: any = d.data()
        const t = data?.createdAt?.toDate?.() as Date | undefined
        return {
          id: d.id,
          ...data,
          createdAtText: t
            ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '',
        }
      }).reverse()

      // 先頭に古いページを追加し、カーソル更新
      if (olderAsc.length) {
        olderRef.current = [...olderAsc, ...olderRef.current]
        setMessages((prev) => [...olderAsc, ...prev])
        oldestDocRef.current = docsDesc[docsDesc.length - 1] ?? oldestDocRef.current
      }
      if (docsDesc.length < PAGE) setHasMore(false)
    } catch (e) {
      console.error('loadOlder error', e)
    } finally {
      setLoadingMore(false)
      // スクロール位置補正（ページが跳ねないよう維持）
      requestAnimationFrame(() => {
        const afterHeight = messagesBoxRef.current?.scrollHeight ?? 0
        const box = messagesBoxRef.current
        if (box) box.scrollTop = (afterHeight - beforeHeight) + box.scrollTop
      })
    }
  }, [threadId, loadingMore, hasMore])

  // 上端セントリネルで古いページを追加ロード
  useEffect(() => {
    const root = messagesBoxRef.current
    const el = topSentinelRef.current
    if (!root || !el) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) void loadOlder()
        })
      },
      { root, rootMargin: '200px 0px 0px 0px', threshold: 0 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [loadOlder])

  // 下端ジャンプボタンの表示制御（下端付近なら隠す）
  useEffect(() => {
    const el = messagesBoxRef.current
    if (!el) return
    const onScroll = () => setShowJumpToBottom(!isNearBottom(el, 120))
    onScroll() // 初期判定
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  async function send() {
    const content = input.trim()
    const user = auth.currentUser
    if (!content || !threadId) return
    if (!user) {
      const here = typeof window !== 'undefined'
        ? (window.location.pathname + window.location.search + window.location.hash)
        : `/threads/${threadId}`
      router.push(`/register?redirect=${encodeURIComponent(here)}`)
      return
    }

    // 二重送信ガード（state 反映前の連打にも対応）
    if (sendingRef.current || sending) return
    sendingRef.current = true
    setSending(true)

    try {
      let authorName = user.displayName || '名無し'
      try {
        const u = await getDoc(doc(db, 'users', user.uid))
        if (u.exists()) {
          authorName = (u.data() as any).name || authorName
        }
      } catch {}

      const batch = writeBatch(db)
      const msgRef = doc(collection(db, 'threads', threadId, 'messages'))
      const threadRef = doc(db, 'threads', threadId)
      batch.set(msgRef, {
        content,
        userId: user.uid,
        authorName,
        createdAt: serverTimestamp(),
      })
      batch.update(threadRef, { messageCount: increment(1) })
      await batch.commit()

      // BUMP: メッセージ投稿で24hトレンドに加点
      try { bumpThread(threadId, 'message') } catch {}

      // ランキング即時反映トリガー（失敗してもUIは継続）
      try {
        if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
          navigator.sendBeacon('/api/trending/touch')
        } else {
          // 一部環境向けフォールバック
          fetch('/api/trending/touch', { method: 'POST', keepalive: true }).catch(() => {})
        }
      } catch {}

      setInput('')
      requestAnimationFrame(() =>
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      )
    } catch (e) {
      console.error('send error', e)
    } finally {
      setSending(false)
      sendingRef.current = false
    }
  }

  const jumpToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  return (
    <div className="mx-auto min-h-screen w-full max-w-xl bg-white text-black border-x border-neutral-200">
      {/* Header */}
      <div className="fixed top-0 left-1/2 z-20 w-full max-w-xl -translate-x-1/2 bg-white/95 backdrop-blur border-b border-neutral-200">
        <div className="flex items-center justify-between px-5 py-4">
          <button
            type="button"
            onClick={() => history.back()}
            className="text-pink-600 text-[20px]"
            aria-label="戻る"
          >
            ←
          </button>
          <div className="flex min-w-0 flex-col items-center text-center">
            <h1 className="truncate text-[18px] font-semibold">{title}</h1>
            {description && (
              <p className="mt-0.5 truncate text-[13px] text-neutral-500">{headerDesc}</p>
            )}
            {genre && (
              <p className="truncate text-[13px] text-neutral-500">#{genre}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={shareThisThread}
              className="grid h-8 w-8 place-items-center rounded-md text-pink-600 hover:bg-pink-50"
              aria-label="このルームをシェア"
              title="シェア"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                <path d="M18 8a3 3 0 10-2.83-4A3 3 0 0018 8zM6 14a3 3 0 10.01 6A3 3 0 006 14zm12 0a3 3 0 10.01 6A3 3 0 0018 14zM8.8 13.3l6.5-3.2-.9-1.8-6.5 3.2.9 1.8zm0 3.4l6.5 3.2.9-1.8-6.5-3.2-.9 1.8z"/>
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowDetail(true)}
              className="grid h-8 w-8 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 text-[20px]"
              aria-haspopup="dialog"
              aria-expanded={showDetail ? 'true' : 'false'}
              aria-controls="thread-detail-dialog"
              aria-label="詳細を開く"
              title="詳細"
            >
              ⋮
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <main
        id="thread-messages"
        ref={messagesBoxRef}
        className="px-5 pt-[88px] pb-[120px] overflow-y-auto"
        style={{ height: 'calc(100vh - 64px)' }}
      >
        {/* 上端セントリネル：見えたらさらに古い50件を読み込む */}
        <div ref={topSentinelRef} className="h-px" />
        {loadingMore && (
          <div className="py-2 text-center text-xs text-neutral-500">読み込み中…</div>
        )}
        {messages.map((m) => {
          const isSelf = m.userId === auth.currentUser?.uid
          return (
            <div
              key={m.id}
              className={`mb-3 flex w-full ${isSelf ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[280px] rounded-[24px] px-5 py-4 text-[15px] leading-relaxed ${
                  isSelf
                    ? 'bg-gradient-to-br from-pink-500 to-rose-500 text-white rounded-br-md'
                    : 'bg-neutral-100 border border-neutral-200 text-neutral-900 rounded-bl-md'
                }`}
              >
                {!isSelf && m.authorName && m.userId && (
                  <Link
                    href={`/users/${m.userId}`}
                    className="mb-1 text-[12px] font-bold text-neutral-500 underline decoration-dotted hover:decoration-solid"
                    aria-label={`${m.authorName}のプロフィール`}
                  >
                    @{m.authorName}
                  </Link>
                )}
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                <div className={`mt-2 text-[11px] opacity-70 ${isSelf ? 'text-white' : 'text-neutral-500'}`}>{m.createdAtText}</div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </main>

      {showJumpToBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="fixed left-1/2 -translate-x-1/2 bottom-36 z-40 grid h-11 w-11 place-items-center rounded-full border border-neutral-200 bg-white text-pink-600 shadow-lg hover:bg-pink-50 focus:outline-none"
          aria-label="最新までスクロール"
          title="最新までスクロール"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M12 4v12M6 10l6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Chat input (fixed bottom, centered) */}
      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-xl -translate-x-1/2 bg-white px-5 py-4 border-t border-neutral-200">
        <div className="mx-auto flex w-full max-w-xl items-end gap-3">
          <textarea
            id="thread-message-input"
            className="min-h-[52px] max-h-[120px] flex-1 resize-none rounded-[24px] border-2 border-neutral-200 bg-neutral-100 px-5 py-3 text-[16px] placeholder-neutral-400 focus:border-pink-500 focus:outline-none"
            placeholder="優しい気持ちでメッセージを..."
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (sending) { e.preventDefault(); return }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />
          <button
            id="thread-send-button"
            onClick={send}
            disabled={!input.trim() || sending}
            aria-busy={sending}
            aria-label={sending ? '送信中' : '送信'}
            className="grid h-[52px] w-[52px] place-items-center rounded-full bg-pink-600 text-white transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
          >
            <svg viewBox="0 0 24 24" className={`h-5 w-5 fill-current ${sending ? 'animate-pulse' : ''}`}>
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
            </svg>
          </button>
        </div>
      </div>

      {showDetail && (
        <div
          role="dialog"
          aria-modal="true"
          id="thread-detail-dialog"
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
        >
          {/* backdrop */}
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="閉じる"
            onClick={() => setShowDetail(false)}
          />

          {/* sheet/card */}
          <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white shadow-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-bold">{title}</h2>
              <button
                type="button"
                onClick={() => setShowDetail(false)}
                className="text-neutral-500 text-xl"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>

            {description ? (
              <p className="mt-3 whitespace-pre-wrap text-[14px] text-neutral-700">{description}</p>
            ) : (
              <p className="mt-3 text-[14px] text-neutral-500">説明はありません。</p>
            )}

            {genre && (
              <p className="mt-3 text-[13px] text-neutral-500">
                ジャンル: <span className="font-medium text-neutral-700">#{genre}</span>
              </p>
            )}
          </div>
        </div>
      )}
      {showFirstVisitModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] flex items-center justify-center"
        >
          {/* backdrop */}
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="閉じる"
            onClick={() => setShowFirstVisitModal(false)}
          />

          {/* modal card */}
          <div className="relative mx-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 text-center">
              <h3 className="text-lg font-bold">このスレッドをシェアしよう！</h3>
              <p className="mt-2 text-[14px] text-neutral-600">
                友だちに共有すると、もっと盛り上がるよ。
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={shareThisThread}
                className="rounded-full bg-pink-600 px-5 py-2 text-sm font-bold text-white hover:bg-pink-700"
                aria-label="シェアする"
              >
                シェアする
              </button>
              <button
                onClick={() => setShowFirstVisitModal(false)}
                className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-100"
                aria-label="あとで"
              >
                あとで
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
