// app/page.tsx
'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import FooterNav from '@/components/FooterNav'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'

type TrendThread = {
  id: string
  name: string
  description?: string
  genre?: string
  authorName?: string
  createdAtText?: string
  createdAtMs?: number
  viewCount?: number
  messageCount?: number
}

export default function HomePage() {
  const [showAddPopup, setShowAddPopup] = useState(false)

  // トレンディング（最新50件の中から views*10 + messages の上位3件）
  const [trendThreads, setTrendThreads] = useState<TrendThread[]>([])
  const [firstLoaded, setFirstLoaded] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'threads'), orderBy('createdAt', 'desc'), limit(50))
    const unsub = onSnapshot(q, (snap) => {
      const list: TrendThread[] = snap.docs.map((d) => {
        const data: any = d.data()
        const t: Date | undefined = data?.createdAt?.toDate?.()
        return {
          id: d.id,
          name: data?.name ?? '(無題)',
          description: data?.description ?? '',
          genre: data?.genre ?? '',
          authorName: data?.authorName ?? '',
          createdAtText: t
            ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '',
          createdAtMs: t ? t.getTime() : 0,
          messageCount: typeof data?.messageCount === 'number' ? data.messageCount : 0,
          viewCount: typeof data?.viewCount === 'number' ? data.viewCount : 0,
        }
      })
      setTrendThreads(list)
      setFirstLoaded(true)
    })
    return () => {
      unsub()
    }
  }, [])

  const trendTop3 = useMemo(() => {
    const getScore = (t: TrendThread) => (t.viewCount ?? 0) * 10 + (t.messageCount ?? 0)
    const arr = [...trendThreads]
    arr.sort((a, b) => {
      const s = getScore(b) - getScore(a)
      if (s !== 0) return s
      return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0)
    })
    return arr.slice(0, 3)
  }, [trendThreads])

  return (
    <div className="mx-auto min-h-screen max-w-xl border-x border-neutral-200 bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="bg-gradient-to-br from-pink-500 to-rose-400 bg-clip-text text-2xl font-extrabold text-transparent">
            OZZ
          </h1>
          <div className="flex items-center gap-2 text-neutral-500">
            <button className="rounded-xl p-2 transition hover:bg-neutral-100" aria-label="検索">🔍</button>
            <button className="rounded-xl p-2 transition hover:bg-neutral-100" aria-label="通知">🔔</button>
          </div>
        </div>
      </header>

      <main className="px-4 pb-28 pt-4">
        {/* お知らせ */}
        <section className="mb-4">
          <div className="rounded-2xl border border-pink-200/60 bg-gradient-to-br from-pink-50 to-rose-50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">✨</span>
              <div>
                <h3 className="mb-1 font-semibold">運営からのお知らせ</h3>
                <p className="text-sm text-neutral-600">
                  UIを安定させました！ここをこうして欲しい等あれば運営までお願いします！
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ホーム画面に追加 カード */}
        <section className="mb-6">
          <button
            type="button"
            onClick={() => setShowAddPopup(true)}
            className="w-full rounded-2xl border border-pink-200/60 bg-pink-50/60 p-4 text-left transition hover:bg-pink-100/60"
          >
            <div className="flex items-start gap-3">
              <span className="text-xl">📲</span>
              <h3 className="font-semibold text-neutral-900">
                「ホーム画面に追加」していただくと、アプリのように快適にご利用いただけます！
              </h3>
            </div>
          </button>
        </section>

        {/* タイル（トレンディング） */}
        <section>
          <h2 className="mb-4 text-lg font-bold">🔥 トレンディング</h2>

          {!firstLoaded ? (
            <ul className="space-y-3">
              {[0,1,2].map((i) => (
                <li key={i} className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="h-4 w-16 bg-neutral-200 rounded mb-2 animate-pulse" />
                  <div className="h-5 w-48 bg-neutral-300 rounded mb-2 animate-pulse" />
                  <div className="h-3 w-40 bg-neutral-200 rounded animate-pulse" />
                </li>
              ))}
            </ul>
          ) : trendTop3.length === 0 ? (
            <div className="text-neutral-500 text-sm">まだありません</div>
          ) : (
            <ul className="space-y-3">
              {trendTop3.map((t, idx) => (
                <li key={t.id} className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition hover:-translate-y-0.5 hover:border-pink-300">
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-pink-500 to-rose-400" />
                  <Link href={`/threads/${t.id}`} className="block" aria-label={`スレッド ${t.name} を開く`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-neutral-500 mb-1">{(t.authorName || '未設定')}・{t.genre || '未分類'}</div>
                        <h3 className="font-semibold truncate flex items-center gap-2">
                          <>
                            {idx < 3 && (
                              <span className="inline-flex h-5 w-5 items-center justify-center" aria-hidden>
                                <svg viewBox="0 0 24 24" className={`h-4 w-4 ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-400' : 'text-amber-700'}`} fill="currentColor">
                                  <path d="M4 19h16v2H4z"/>
                                  <path d="M3 7l4.5 3.5L10.5 5l3 5.5L20 7l-2 10H5L3 7z"/>
                                </svg>
                              </span>
                            )}
                            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-pink-600 px-1 text-[11px] font-bold text-white">#{idx + 1}</span>
                          </>
                          <span className="truncate">{t.name}</span>
                        </h3>
                        {t.description && (
                          <p className="text-sm text-neutral-600 line-clamp-2 mt-1">{t.description}</p>
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
        </section>
      </main>

      {/* フッターナビ（既存） */}
      <FooterNav />

      {/* Add to Home Popup */}
      {showAddPopup && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowAddPopup(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-base font-semibold text-pink-600">📲 ホーム画面に追加する方法</h3>
            <p className="mb-3 text-sm">
              ✨「ホーム画面に追加」していただくと、アプリのように快適にご利用いただけます！
            </p>
            <ul className="mb-4 list-disc pl-5 text-sm leading-6">
              <li>iPhone: Safari → 共有 → ホーム画面に追加</li>
              <li>Android: Chrome → メニュー → ホーム画面に追加</li>
            </ul>
            <p className="mb-4 text-sm">
              ホーム画面にアイコンができ、次回からワンタップで起動できます。Androidでは通知も受け取れます。
            </p>
            <button
              onClick={() => setShowAddPopup(false)}
              className="inline-flex w-full items-center justify-center rounded-xl bg-pink-600 px-4 py-3 font-semibold text-white transition hover:bg-pink-700"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
