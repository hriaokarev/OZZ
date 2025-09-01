// app/chat/[id]/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore'



type ChatMessage = {
  id: string
  content: string
  userId: string
  createdAt?: Timestamp
}

export default function ChatPage() {
  const router = useRouter()
  const { id: chatId } = useParams() as { id: string }

  const searchParams = useSearchParams()
  // Legacy support: if someone lands on /chat/message?chatId=xxx, redirect to /chat/xxx
  useEffect(() => {
    if (chatId === 'message') {
      const q = searchParams.get('chatId')
      if (q) router.replace(`/chat/${q}`)
    }
  }, [chatId, searchParams, router])

  // UI refs
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [otherName, setOtherName] = useState<string>('メッセージ')
  const [me, setMe] = useState<string | null>(null)
  const [pinToBottom, setPinToBottom] = useState(true)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)

  // ========= helpers (scroll) =========
  const isAtBottom = (threshold = 100) => {
    const el = containerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }

  const scrollToBottom = (force = false) => {
    const el = containerRef.current
    if (!el) return
    const atBottom = isAtBottom()
    const containerScrollable = el.scrollHeight > el.clientHeight
    if (!containerScrollable) return
    if (!atBottom && !force) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    })
  }

  // keep pin state
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => setPinToBottom(isAtBottom(100))
    el.addEventListener('scroll', onScroll)
    const ro = new ResizeObserver(() => scrollToBottom(pinToBottom))
    ro.observe(el)
    const onResize = () => scrollToBottom(pinToBottom)
    window.addEventListener('resize', onResize)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current])

  // ========= auth + initial load =========
  useEffect(() => {
    if (!chatId || chatId === 'message') return
    let unsubMessages: (() => void) | null = null;
    const stop = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/register')
        return
      }
      setMe(user.uid)

      // 相手名の取得 & 入室時に自分を unreadBy から外す
      try {
        const chatRef = doc(db, 'privateChats', chatId)
        const chatSnap = await getDoc(chatRef)
        const chat = chatSnap.data() as any

        const otherId: string | undefined =
          Array.isArray(chat?.participants)
            ? chat.participants.find((uid: string) => uid !== user.uid)
            : undefined

        if (otherId) {
          const uSnap = await getDoc(doc(db, 'users', otherId))
          setOtherName((uSnap.data() as any)?.name || 'メッセージ')
        } else {
          setOtherName('メッセージ')
        }

        // unreadBy から自分を外す
        const currentUnread: string[] = Array.isArray(chat?.unreadBy) ? chat.unreadBy : []
        const newUnread = currentUnread.filter((uid) => uid !== user.uid)
        if (newUnread.length !== currentUnread.length) {
          await setDoc(chatRef, { unreadBy: newUnread }, { merge: true })
        }
      } catch {
        setOtherName('メッセージ')
      }

      // 既存のメッセージ購読があれば停止
      if (unsubMessages) {
        try { unsubMessages(); } catch {}
        unsubMessages = null;
      }

      // メッセージ購読
      const q = query(
        collection(db, 'privateChats', chatId, 'messages'),
        orderBy('createdAt', 'asc')
      )
      unsubMessages = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
        const wasAtBottom = isAtBottom(100)
        const list: ChatMessage[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => {
            const aT = a.createdAt?.toMillis?.() ?? 0
            const bT = b.createdAt?.toMillis?.() ?? 0
            return aT - bT
          })
        setMessages(list)
        setTimeout(() => scrollToBottom(wasAtBottom), 0)
      })
    })
    return () => {
      stop()
      if (unsubMessages) {
        try { unsubMessages() } catch {}
        unsubMessages = null
      }
    }
  }, [chatId, router])

  // messages 変化でスクロールを維持
  useEffect(() => {
    scrollToBottom(pinToBottom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  // ========= textarea auto-grow =========
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
    fit()
  }, [text])

  // ---- notify (server -> FCM via /api/notify) ----
  async function notifyDM(toUid: string, preview: string) {
    try {
      const idToken = await auth.currentUser?.getIdToken()
      if (!idToken) return
      // data-only 送信（通知の描画は SW 担当）
      await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          toUid,
          title: '新着メッセージ',
          body: preview.slice(0, 60),
          link: `/chat/${chatId}`,
          extra: { chatId },
        }),
      })
    } catch (e) {
      console.warn('notify error', e)
    }
  }

  // ========= send =========
  async function send() {
    const trimmed = text.trim()
    if (!trimmed || !me) return
    // 二重送信ガード（state反映前の連打にも対応）
    if (sendingRef.current || sending) return
    sendingRef.current = true
    setSending(true)
    try {
      // メッセージ追加
      await addDoc(collection(db, 'privateChats', chatId, 'messages'), {
        content: trimmed,
        userId: me,
        createdAt: serverTimestamp(),
      })

      // 受信者を特定して unreadBy に追加 + updatedAt
      const chatRef = doc(db, 'privateChats', chatId)
      const chatSnap = await getDoc(chatRef)
      const chat = chatSnap.data() as any
      const otherId: string | undefined =
        Array.isArray(chat?.participants) ? chat.participants.find((uid: string) => uid !== me) : undefined

      const update: any = {
        updatedAt: serverTimestamp(),
        lastMessage: trimmed,
        lastMessageAt: serverTimestamp(),
      }
      if (otherId) {
        const currentUnread: string[] = Array.isArray(chat?.unreadBy) ? chat.unreadBy : []
        const newUnread = Array.from(new Set([...currentUnread, otherId]))
        update.unreadBy = newUnread
      }
      await setDoc(chatRef, update, { merge: true })

      // 通知（非同期・失敗しても送信フローは継続）
      if (otherId) {
        void notifyDM(otherId, trimmed)
      }

      setText('')
      scrollToBottom(true)
      inputRef.current?.focus()
    } catch (e) {
      console.error('send error', e)
    } finally {
      setSending(false)
      sendingRef.current = false
    }
  }

  const myLetter = useMemo(() => (otherName?.[0]?.toUpperCase?.() || 'N'), [otherName])

  return (
    <div className="mx-auto min-h-screen max-w-xl border-x border-neutral-200 bg-white">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => router.back()}
              className="mr-3 grid h-9 w-9 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100"
              aria-label="戻る"
            >
              ←
            </button>
            <div className="mr-3 grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-sm font-bold text-white">
              {myLetter}
            </div>
            <div>
              <h2 className="text-[18px] font-semibold leading-none">{otherName}</h2>
              <span className="text-[13px] text-emerald-600">🟢 オンライン</span>
            </div>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100" aria-label="メニュー">
            ⋮
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className="overflow-y-auto px-4 pt-3 pb-28"
        style={{ height: 'calc(100vh - 64px)' }} // 64px ≒ header
      >
        {messages.map((m) => {
          const isMe = m.userId === me
          const created =
            m.createdAt instanceof Timestamp ? m.createdAt.toDate() : new Date()
          const t =
            created.getHours().toString().padStart(2, '0') +
            ':' +
            created.getMinutes().toString().padStart(2, '0')

          return (
            <div
              key={m.id}
              className={`max-w-[280px] p-4 mb-3 rounded-3xl ${
                isMe
                  ? 'ml-auto bg-gradient-to-br from-pink-500 to-rose-500 text-white rounded-br-lg'
                  : 'mr-auto bg-neutral-100 border border-neutral-200 text-neutral-900 rounded-bl-lg'
              }`}
            >
              <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                {m.content}
              </div>
              <div
                className={`mt-2 text-[11px] opacity-70 ${
                  isMe ? 'text-white' : 'text-neutral-500'
                }`}
              >
                {t}
              </div>
            </div>
          )
        })}
      </div>

      {/* Input (fixed bottom, centered max-w) */}
      <div
        className="fixed bottom-0 left-1/2 z-30 w-full -translate-x-1/2 bg-white px-4 py-3"
        style={{ maxWidth: '640px' }}
      >
        <div className="mx-auto flex max-w-xl items-end gap-3 border-t border-neutral-200 pt-3">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="メッセージを入力..."
            rows={1}
            className="min-h-[52px] max-h-[120px] flex-1 resize-none rounded-full border-2 border-neutral-200 bg-neutral-100 px-5 py-3 text-[16px] focus:border-pink-500 focus:outline-none"
            onKeyDown={(e) => {
              if (sending) { e.preventDefault(); return }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || !me || sending}
            aria-busy={sending}
            aria-label={sending ? '送信中' : '送信'}
            className="grid h-13 w-13 place-items-center rounded-full bg-pink-600 text-white transition-transform hover:scale-[1.04] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
          >
            <svg viewBox="0 0 24 24" className={`h-5 w-5 fill-current ${sending ? 'animate-pulse' : ''}`}>
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}