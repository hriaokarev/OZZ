export const metadata = {
  title: 'OZZ（オズ）掲示板とは｜OZZ',
  description: 'OZZ（オズ）掲示板は、作成順ではなく直近の会話量でスレが浮く、今が上に来る掲示板です。匿名OK・数タップでスレ立て。',
  alternates: { canonical: 'https://o-zz.net/about' },
}

export default function AboutPage() {
  return (
    <main>
      <h1>OZZ（オズ）掲示板とは</h1>
      <p>
        OZZは「いま動いているスレ」を自動で上に出す掲示板です。作成順でも総いいねでもなく、
        直近の会話でランキングが変わります。匿名で気楽に参加でき、盛り上がっている話題を見つけやすいのが特徴です。
      </p>
      <ul>
        <li>匿名OK・数タップでスレ立て</li>
        <li>トレンドで迷子にならない</li>
        <li>再燃歓迎：動けば上がる</li>
      </ul>
      <p>まずは人気スレや新着からどうぞ。</p>
    </main>
  )
}