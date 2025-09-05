"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDoc, onSnapshot, orderBy, limit, query, serverTimestamp, runTransaction, increment, writeBatch } from "firebase/firestore";
import Link from "next/link";

// ---------------- Types ----------------
type Message = {
  id: string
  content: string
  userId?: string
  authorName?: string
  createdAt?: any
  createdAtText?: string
}

type Thread = {
  id: string
  name?: string
  description?: string
  genre?: string
  viewCount?: number
  messageCount?: number
}

// ---------------- Utils ----------------
function clipText(s?: string, max = 40) {
  if (!s) return ""
  return s.length > max ? s.slice(0, max) + "…" : s
}

function formatHm(d?: Date | null) {
  if (!d) return ""
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(d)
}

function isNearBottom(el: HTMLDivElement | null, threshold = 80) {
  if (!el) return true
  const delta = el.scrollHeight - el.clientHeight - el.scrollTop
  return delta <= threshold
}

// ---------------- Hooks (in-file) ----------------
function useViewOnce(threadId?: string) {
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || !threadId) return
      try {
        const threadRef = doc(db, "threads", threadId)
        const viewRef = doc(db, "threads", threadId, "views", user.uid)
        await runTransaction(db, async (tx) => {
          const vSnap = await tx.get(viewRef)
          if (vSnap.exists()) return
          tx.set(viewRef, { userId: user.uid, viewedAt: serverTimestamp() })
          tx.update(threadRef, { viewCount: increment(1) })
        })
      } catch (e) {
        console.error("view記録エラー", e)
      }
    })
    return () => unsub()
  }, [threadId])
}

function useThreadMeta(threadId?: string) {
  const [title, setTitle] = useState("読み込み中...")
  const [description, setDescription] = useState("")
  const [genre, setGenre] = useState("")

  useEffect(() => {
    if (!threadId) return
      ; (async () => {
        const threadRef = doc(db, "threads", threadId)
        const snap = await getDoc(threadRef)
        if (snap.exists()) {
          const d = snap.data() as Thread
          setTitle(d.name || "スレッド")
          setDescription(d.description || "")
          setGenre(d.genre || "")
        } else {
          setTitle("スレッド")
          setDescription("")
          setGenre("")
        }
      })()
  }, [threadId])

  const headerDesc = useMemo(() => clipText(description, 20), [description])
  return { title, description, genre, headerDesc }
}

function useMessages(threadId?: string, pageSize = 50) {
  const [messages, setMessages] = useState<Message[]>([])

  useEffect(() => {
    if (!threadId) return
    const messagesRef = collection(db, "threads", threadId, "messages")
    const q = query(messagesRef, orderBy("createdAt", "desc"), limit(pageSize))
    const unsub = onSnapshot(q, (snap) => {
      const newestFirst = snap.docs.map((d) => {
        const data = d.data() as any
        const t = data?.createdAt?.toDate?.() as Date | undefined
        return {
          id: d.id,
          ...data,
          createdAtText: t ? formatHm(t) : "",
        } as Message
      })
      setMessages([...newestFirst].reverse())
    })
    return () => unsub()
  }, [threadId, pageSize])

  return messages
}

export default function ThreadRoomPage() {
  const { id } = useParams<{ id: string }>()
  const threadId = id
  const router = useRouter()

  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  const messagesBoxRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const lastMsgIdRef = useRef<string | null>(null)
  const sendingRef = useRef<boolean>(false)

  useViewOnce(threadId)
  const { title, description, genre, headerDesc } = useThreadMeta(threadId)
  const messages = useMessages(threadId, 50)

  // auto-stick to bottom if near bottom or first load/new message
  useEffect(() => {
    const list = messages
    const prevLast = lastMsgIdRef.current
    const nextLast = list.length ? list[list.length - 1].id : null
    const shouldScroll =
      !prevLast || isNearBottom(messagesBoxRef.current) || prevLast !== nextLast
    lastMsgIdRef.current = nextLast
    if (shouldScroll) {
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }))
    }
  }, [messages])

  const send = useCallback(async () => {
    const content = input.trim()
    const user = auth.currentUser
    if (!content || !threadId) return
    if (!user) {
      router.push(`/register?next=/threads/${threadId}`)
      return
    }
    if (sendingRef.current || sending) return
    sendingRef.current = true
    setSending(true)
    try {
      let authorName = user.displayName || "名無し"
      try {
        const u = await getDoc(doc(db, "users", user.uid))
        if (u.exists()) {
          authorName = (u.data() as any).name || authorName
        }
      } catch { }
      const batch = writeBatch(db)
      const msgRef = doc(collection(db, "threads", threadId, "messages"))
      const threadRef = doc(db, "threads", threadId)
      batch.set(msgRef, {
        content,
        userId: user.uid,
        authorName,
        createdAt: serverTimestamp(),
      })
      batch.update(threadRef, { messageCount: increment(1) })
      await batch.commit()
      try {
        if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
          navigator.sendBeacon("/api/trending/touch")
        } else {
          fetch("/api/trending/touch", { method: "POST", keepalive: true }).catch(() => { })
        }
      } catch { }
      setInput("")
      requestAnimationFrame(() =>
        bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
      )
    } catch (e) {
      console.error("send error", e)
    } finally {
      setSending(false)
      sendingRef.current = false
    }
  }, [input, sending, threadId, router])

  return (
    <div className="max-w-xl min-h-screen mx-auto border-x border-neutral-200">
      {/* Header */}
      <header className="fixed w-full max-w-xl top-0 left-1/2 -translate-x-1/2 z-30 border-x border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="flex h-20 items-center justify-between px-4 py-2">
          <button
            onClick={() => history.back()}
            className="h-9 w-9 rounded-md text-[20px] text-pink-600 hover:bg-neutral-500/20"
            aria-label="戻る"
          >
            ←
          </button>
          <div className="flex min-w-0 flex-col items-center text-center">
            <div className="truncate text-sm text-neutral-500">{headerDesc}</div>
            <div className="truncate text-base font-medium">{title}</div>
          </div>
          <button
            onClick={() => setShowDetail(true)}
            className="h-9 w-9 rounded-md text-[20px] text-pink-600 hover:bg-neutral-500/20"
            aria-haspopup="dialog"
            aria-expanded={showDetail ? "true" : "false"}
            aria-controls="thread-detail-dialog"
            aria-label="詳細を開く"
          >
            ⓘ
          </button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex w-full mx-auto flex-1 flex-col">
        <div
          ref={messagesBoxRef}
          className="flex-1 overflow-y-auto px-3 py-24"
          role="log"
          aria-live="polite"
        >
          {messages.map((m) => {
            const isSelf = m.userId === auth.currentUser?.uid
            return (
              <div key={m.id} className={`flex w-full mb-3 ${isSelf ? "justify-end" : "justify-start"}`}>
                <div className="block max-w-2xs">
                  {!isSelf && m.authorName && m.userId && (
                    <Link
                      href={`/users/${m.userId}`}
                      className="block mb-1 text-[12px] font-bold text-neutral-500 hover:underline"
                      aria-label={`${m.authorName}のプロフィール`}
                    >
                      @{m.authorName}
                    </Link>
                  )}
                  <div
                    className={
                      "inline-block whitespace-pre-wrap break-words rounded-2xl p-3 text-[15px] " +
                      (isSelf
                        ? "ml-auto bg-gradient-to-br from-pink-500 to-rose-500 text-white rounded-br-md"
                        : "bg-neutral-100 border border-neutral-200 text-neutral-900 rounded-bl-md")
                    }
                  >
                    {m.content}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-400">{m.createdAtText}</div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Chat input */}
      <div className="fixed w-full max-w-xl bottom-0 left-1/2 -translate-x-1/2 z-30 px-5 py-4 bg-white/80 backdrop-blur border-x border-t border-neutral-200">
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
              if (e.key === "Enter" && !e.shiftKey) {
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
            aria-label={sending ? "送信中" : "送信"}
            className="grid h-[52px] w-[52px] place-items-center rounded-full bg-pink-600 text-white transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
          >
            <svg viewBox="0 0 24 24" className={`h-5 w-5 fill-current ${sending ? "animate-pulse" : ""}`}>
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Detail sheet */}
      {showDetail && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setShowDetail(false)}
            aria-hidden="true"
          />
          <div
            id="thread-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="スレッド詳細"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-screen-sm rounded-t-2xl border border-neutral-200 bg-white p-4 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-lg font-semibold">{title}</div>
              <button
                onClick={() => setShowDetail(false)}
                className="text-xl text-neutral-500"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="space-y-2 text-[15px]">
              <div>
                {description ? (
                  <p className="whitespace-pre-wrap break-words">{description}</p>
                ) : (
                  <p className="text-neutral-500">説明はありません。</p>
                )}
              </div>
              {genre && <div className="text-neutral-600">ジャンル: #{genre}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
