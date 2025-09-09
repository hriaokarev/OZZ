'use client'

import { useEffect, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useRouter } from 'next/navigation'

type Notice = { title: string; url: string }

export default function TrendNotifierClient() {
  const [notice, setNotice] = useState<Notice | null>(null)
  const [show, setShow] = useState(false)
  const hideTimer = useRef<number | null>(null)
  const initialized = useRef(false)
  const router = useRouter()

  useEffect(() => {
    const onSWMessage = (e: any) => {
      const data = e?.data || {}
      if (data?.type !== 'TRENDING') return
      const threadId = data.threadId || data.id
      const rk = Number(data.rank ?? data.newRank ?? data.to ?? 0)
      const title = data.title || 'スレッド'
      if (!threadId || !rk) return
      setNotice({ title: `「${title}」が第${rk}位にランクイン`, url: data.link || `/threads/${threadId}` })
      setTimeout(() => setShow(true), 0)
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', onSWMessage as any)
        return () => navigator.serviceWorker.removeEventListener('message', onSWMessage as any)
      }
    } catch {}
  }, [])

  useEffect(() => {
    const ref = doc(db, 'system', 'trending_state')
    const unsub = onSnapshot(ref, (snap) => {
      const s = snap.data() as any
      if (!s) return
      const seq = typeof s.seq === 'number' ? s.seq : 0

      // 初回は“現状を既読”としてキャリブレーション（いきなり通知を出さない）
      if (!initialized.current) {
        initialized.current = true
        try { localStorage.setItem('trend_last_seq', String(seq)) } catch {}
        return
      }

      const last = Number((() => {
        try { return localStorage.getItem('trend_last_seq') } catch { return '0' }
      })() || '0')

      if (seq <= last) return
      try { localStorage.setItem('trend_last_seq', String(seq)) } catch {}

      // changed は配列想定（なければ何もしない）
      const changedArr = Array.isArray(s.changed) ? s.changed : []
      if (changedArr.length === 0) return
      const top = changedArr[0] || {}
      const threadId = top.threadId || top.id
      const rk = Number(top.newRank ?? top.to ?? 0)
      if (!threadId || !rk) return
      const title =
        (Array.isArray(s.top3) ? s.top3.find((t: any) => t.id === threadId)?.title : undefined) ||
        s.title ||
        'スレッド'

      setNotice({
        title: `「${title}」が第${rk}位にランクイン`,
        url: `/threads/${threadId}`,
      })
      // 次フレームで入場アニメ
      setTimeout(() => setShow(true), 0)
    })

    return () => unsub()
  }, [])

  useEffect(() => {
    if (!notice) return
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      // 先にフェードアウト
      setShow(false)
      // アニメーション終了後に外す（300msに合わせる）
      window.setTimeout(() => setNotice(null), 320)
    }, 7000) // 表示時間を少し長め（7秒）
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [notice])

  if (!notice) return null

  return (
    <div
      data-pos="top"
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-3 top-5 md:top-6 bottom-auto"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <button
        onClick={() => router.push(notice.url)}
        className={`pointer-events-auto flex max-w-[92%] items-center gap-3 rounded-2xl bg-neutral-900/90 px-4 py-3 text-left text-white shadow-xl backdrop-blur-md transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] ${show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}`}
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400/90 text-neutral-900 font-bold">
          ★
        </span>
        <span className="text-sm leading-snug">
          {notice.title}
          <span className="ml-2 underline">開く</span>
        </span>
      </button>
    </div>
  )
}