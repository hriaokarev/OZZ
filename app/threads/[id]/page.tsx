// app/threads/[id]/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  limit,
  query,
  serverTimestamp,
  runTransaction,
  increment,
  writeBatch,
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
  const sendingRef = useRef(false)

  const messagesBoxRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastMsgIdRef = useRef<string | null>(null)

  const headerDesc = clipText(description, 20)

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

  // メッセージ購読（最新50件のみ取得 → 昇順表示）
  useEffect(() => {
    if (!threadId) return
    const messagesRef = collection(db, 'threads', threadId, 'messages')
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(50))
    const unsub = onSnapshot(q, (snap) => {
      const newestFirst = snap.docs.map((d) => {
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
      const list = [...newestFirst].reverse()

      const prevLast = lastMsgIdRef.current
      const nextLast = list.length ? list[list.length - 1].id : null
      setMessages(list)

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

  async function send() {
    const content = input.trim()
    const user = auth.currentUser
    if (!content || !threadId) return
    if (!user) {
      router.push(`/register?next=/threads/${threadId}`)
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
          <button
            type="button"
            onClick={() => setShowDetail(true)}
            className="text-neutral-400 text-[20px]"
            aria-haspopup="dialog"
            aria-expanded={showDetail ? 'true' : 'false'}
            aria-controls="thread-detail-dialog"
            aria-label="詳細を開く"
          >
            ⋮
          </button>
        </div>
      </div>

      {/* Messages */}
      <main
        id="thread-messages"
        ref={messagesBoxRef}
        className="px-5 pt-[88px] pb-[120px] overflow-y-auto"
        style={{ height: 'calc(100vh - 64px)' }}
      >
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
    </div>
  )
}
