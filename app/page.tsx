// app/page.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import FooterNav from '@/components/FooterNav'

export default function HomePage() {
  const [showAddPopup, setShowAddPopup] = useState(false)

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

          <div className="grid grid-cols-1 gap-4">
            <TrendingCard
              title="深夜の本音トーク 💭"
              content="眠れない夜に本音で語り合いませんか？今日あった出来事、悩み、なんでもOK"
              metaLeft="@midnight_user"
              metaRight="🔥 234 • 💬 89 • 2分前"
            />
            <TrendingCard
              title="Z世代の恋愛観について 💕"
              content="最近の恋愛って昔とどう違うんだろう？リアルな声を聞かせて"
              metaLeft="@love_philosopher"
              metaRight="🔥 156 • 💬 67 • 12分前"
            />
            <TrendingCard
              title="今週のおすすめアニメ 🎬"
              content="今期のアニメで面白いのある？ネタバレなしでお願いします！"
              metaLeft="@anime_lover"
              metaRight="🔥 92 • 💬 45 • 25分前"
            />
          </div>
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

// --- UI Parts ---
function TrendingCard({
  title,
  content,
  metaLeft,
  metaRight,
}: {
  title: string
  content: string
  metaLeft: string
  metaRight: string
}) {
  return (
    <Link
      href="#"
      className="group relative block overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition hover:-translate-y-0.5 hover:border-pink-300"
    >
      {/* アクセントライン */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-pink-500 to-rose-400" />

      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="mb-3 line-clamp-3 text-sm text-neutral-600">{content}</p>
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{metaLeft}</span>
        <span>{metaRight}</span>
      </div>
    </Link>
  )
}
