export const metadata = {
  title: 'OZZ（オズ）掲示板とは｜OZZ',
  description:
    'OZZ（オズ）掲示板は、作成順ではなく直近の会話量でスレが浮く、今が上に来る掲示板です。匿名OK・数タップでスレ立て。',
  alternates: { canonical: 'https://o-zz.net/about' },
}

export default function AboutPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-fuchsia-100 via-white to-pink-50">
      {/* 背景のデコ（グラデ＆ぼかし） */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-gradient-to-r from-pink-400 via-fuchsia-400 to-indigo-400 opacity-30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-gradient-to-tr from-rose-300 to-amber-300 opacity-30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-gradient-to-tr from-sky-300 to-violet-300 opacity-30 blur-3xl" />

      {/* HERO */}
      <section className="relative mx-auto max-w-5xl px-4 pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-pink-300/40 bg-white/60 px-3 py-1 text-xs font-medium text-pink-700 backdrop-blur">
          <span className="inline-block h-2 w-2 rounded-full bg-pink-500 animate-pulse" />
          今が上に来る掲示板
        </div>
        <h1 className="mt-4 bg-gradient-to-r from-pink-600 via-fuchsia-600 to-indigo-600 bg-clip-text text-4xl font-black tracking-tight text-transparent md:text-6xl">
          OZZ 掲示板
        </h1>
        <p className="mx-auto mt-4 max-w-3xl text-sm md:text-base text-neutral-700">
          作成順でも総いいねでもない。<strong>直近の会話量</strong>でスレが浮き沈みする、新時代の掲示板。匿名OK・すぐ参加。
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-pink-700 shadow-sm ring-1 ring-pink-200 backdrop-blur">匿名OK</span>
          <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-fuchsia-700 shadow-sm ring-1 ring-fuchsia-200 backdrop-blur">即レス歓迎</span>
          <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-200 backdrop-blur">スマホ最適化</span>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a href="/" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-600 to-fuchsia-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-pink-300/40 transition hover:brightness-110">
            いますぐ始める
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </a>
          <a href="/threads" className="inline-flex items-center gap-2 rounded-full bg-white/80 px-5 py-3 text-sm font-bold text-pink-700 ring-1 ring-pink-200 backdrop-blur transition hover:bg-white">
            スレ一覧を見る
          </a>
        </div>
      </section>

      {/* FEATURES タイル */}
      <section className="relative mx-auto max-w-6xl px-4 pb-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: '“いま”が上がる', desc: '直近の反応があるスレほど目立つ。雑談が流れにくい仕組み。', icon: (
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M3 12a9 9 0 1 0 18 0A9 9 0 0 0 3 12Zm10-5v6h5v2h-7V7h2Z"/></svg>
            ), color: 'from-pink-500 to-rose-500' },
            { title: '匿名で気軽', desc: '余計な準備なし。思い立ったらすぐ一言。', icon: (
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-5.33 0-8 2.67-8 6h16c0-3.33-2.67-6-8-6Z"/></svg>
            ), color: 'from-fuchsia-500 to-violet-500' },
            { title: '再燃歓迎', desc: '過去スレも盛り上がれば再浮上。話題を育てやすい。', icon: (
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3a9 9 0 1 0 8.94 7.89A7 7 0 1 1 13 3Z"/></svg>
            ), color: 'from-indigo-500 to-sky-500' },
            { title: '軽くて速い', desc: 'スマホファーストのUIでサクサク閲覧。', icon: (
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14v12H5z"/><path d="M8 20h8"/></svg>
            ), color: 'from-amber-500 to-orange-500' },
          ].map((f, i) => (
            <div key={i} className="group relative overflow-hidden rounded-2xl bg-white/70 p-5 shadow-xl ring-1 ring-white/50 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white">
              <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${f.color} opacity-30 blur-2xl transition group-hover:opacity-50`} />
              <div className="relative flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-pink-600 ring-1 ring-pink-200 shadow">
                  {f.icon}
                </div>
              </div>
              <h3 className="mt-3 text-lg font-extrabold tracking-tight text-neutral-900">{f.title}</h3>
              <p className="mt-1 text-sm text-neutral-700">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 使い方 / タイムライン風カード */}
      <section className="relative mx-auto max-w-5xl px-4 pb-10">
        <div className="rounded-3xl bg-white/70 p-6 shadow-2xl ring-1 ring-white/60 backdrop-blur">
          <h2 className="text-xl font-black text-neutral-900">基本の使い方（3ステップ）</h2>
          <ol className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { n: 1, t: '人気/新着から開く', d: 'トップに最新の動きが並びます。' },
              { n: 2, t: 'ひとこと返信', d: 'スタンプ感覚でもOK。最初は軽く。' },
              { n: 3, t: '盛り上がったらシェア', d: '再浮上してさらに人が集まる。' },
            ].map((s) => (
              <li key={s.n} className="rounded-2xl border border-pink-200/60 bg-gradient-to-b from-white to-white/70 p-4 shadow">
                <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-pink-600 to-fuchsia-600 text-xs font-bold text-white shadow">{s.n}</div>
                <h3 className="mt-2 text-sm font-bold text-neutral-900">{s.t}</h3>
                <p className="mt-1 text-xs text-neutral-700">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 話題チップス */}
      <section className="relative mx-auto max-w-5xl px-4 pb-10">
        <h2 className="text-xl font-black text-neutral-900">こんな話題が集まります</h2>
        <p className="mt-2 text-sm text-neutral-700">学校・地域の雑談、推し活、ゲーム/アニメ、ガジェット、受験/就活、日常の小ネタまで。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {['雑談','推し活','ゲーム','アニメ','ガジェット','受験','就活','相談','ニュース','小ネタ'].map((tag)=> (
            <span key={tag} className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-200 backdrop-blur shadow-sm">#{tag}</span>
          ))}
        </div>
      </section>

      {/* 安心・安全 */}
      <section className="relative mx-auto max-w-5xl px-4 pb-12">
        <div className="rounded-3xl bg-gradient-to-br from-pink-50/80 to-indigo-50/80 p-6 ring-1 ring-white/60 backdrop-blur">
          <h2 className="text-xl font-black text-neutral-900">安心・安全への取り組み</h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              'ガイドライン違反（誹謗中傷・個人情報・出会い目的の誘導等）は非表示/削除',
              '通報からの対応を優先、迷ったら通報',
              '不適切な内容や画像は露出を制限し、必要に応じて広告停止',
              '個人情報の共有はNG。安全第一で運営',
            ].map((li, idx) => (
              <li key={idx} className="flex items-start gap-2 rounded-2xl bg-white/80 p-3 text-sm text-neutral-800 ring-1 ring-white">
                <svg className="mt-0.5 h-4 w-4 text-pink-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m20 6-11 11-5-5"/></svg>
                <span>{li}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative mx-auto max-w-5xl px-4 pb-16">
        <h2 className="text-xl font-black text-neutral-900">よくある質問</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <details className="group rounded-2xl border border-neutral-200 bg-white/80 p-4 backdrop-blur">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-neutral-900">
              アカウントは必要ですか？
              <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs text-pink-700">Q</span>
            </summary>
            <p className="mt-2 text-sm text-neutral-700">閲覧はそのまま、投稿はログインが必要になる場合があります。案内に従って進めてください。</p>
          </details>
          <details className="group rounded-2xl border border-neutral-200 bg-white/80 p-4 backdrop-blur">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-neutral-900">
              古いスレはどうなりますか？
              <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs text-pink-700">Q</span>
            </summary>
            <p className="mt-2 text-sm text-neutral-700">古くても、やり取りが増えれば再び上がってきます。気になる話題は遠慮なく再開してください。</p>
          </details>
          <details className="group rounded-2xl border border-neutral-200 bg-white/80 p-4 backdrop-blur md:col-span-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-neutral-900">
              広告は表示されますか？
              <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs text-pink-700">Q</span>
            </summary>
            <p className="mt-2 text-sm text-neutral-700">一部ページでは広告を表示します。規約に反する内容のページでは広告を制限/停止します。</p>
          </details>
        </div>
      </section>

      {/* CTA */}
      <section className="sticky bottom-0 z-10 mx-auto w-full border-t border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-4 sm:flex-row">
          <p className="text-sm font-semibold text-neutral-800">OZZはみんなで育てる掲示板。まずは参加してみよう！</p>
          <div className="flex gap-3">
            <a href="/" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-600 to-fuchsia-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-pink-300/40 transition hover:brightness-110">ホームへ</a>
            <a href="/threads" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-pink-700 ring-1 ring-pink-200 transition hover:bg-pink-50">スレ一覧</a>
          </div>
        </div>
      </section>
    </main>
  )
}