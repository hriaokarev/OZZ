// app/users/[uid]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth, db } from '@/lib/firebase'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  addDoc,
  onSnapshot,
} from 'firebase/firestore'

type UserDoc = {
  name?: string
  region?: string
  age?: number
  intro?: string
  photoURL?: string
  createdAt?: any
}
type Thread = {
  id: string
  name: string
  createdAtText?: string
}
type SearchPost = {
  id: string
  content?: string
  createdAtText?: string
  likeCount?: number
}

export default function UserProfilePage() {
  const { uid } = useParams() as { uid: string }
  const router = useRouter()
  const [user, setUser] = useState<UserDoc | null>(null)
  const [threads, setThreads] = useState<Thread[]>([])
  const [sposts, setSposts] = useState<SearchPost[]>([])
  const [loading, setLoading] = useState(true)
  const [likeTotal, setLikeTotal] = useState(0)
  const me = auth.currentUser?.uid ?? null

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // ユーザープロフィール
        const u = await getDoc(doc(db, 'users', uid))
        if (alive) setUser((u.data() as any) ?? {})

        // そのユーザーが作った最近のスレッド（任意）
        const tq = query(
          collection(db, 'threads'),
          where('userId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(10)
        )
        const ts = await getDocs(tq)
        if (!alive) return
        setThreads(
          ts.docs.map((d) => {
            const data: any = d.data()
            const t: Date | undefined = data?.createdAt?.toDate?.()
            return {
              id: d.id,
              name: data?.name ?? '(無題)',
              createdAtText: t
                ? t.toLocaleDateString() + ' ' + t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '',
            }
          })
        )

        // そのユーザーの SearchPosts（最近の投稿）
        const pq = query(
          collection(db, 'searchPosts'),
          where('userId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(10)
        )
        const psnap = await getDocs(pq)
        if (!alive) return
        setSposts(
          psnap.docs.map((d) => {
            const data: any = d.data()
            const t: Date | undefined = data?.createdAt?.toDate?.()
            return {
              id: d.id,
              content: data?.content ?? '',
              likeCount: typeof data?.likeCount === 'number' ? data.likeCount : 0,
              createdAtText: t
                ? t.toLocaleDateString() + ' ' + t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '',
            }
          })
        )
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [uid])

  useEffect(() => {
    // このユーザーの投稿（searchPosts）に付いたいいね総数を購読
    const q = query(collection(db, 'searchPosts'), where('userId', '==', uid))
    const unsub = onSnapshot(
      q,
      (snap) => {
        let sum = 0
        snap.forEach((d) => {
          const data: any = d.data()
          const lc = typeof data?.likeCount === 'number' ? data.likeCount : 0
          sum += lc
        })
        setLikeTotal(sum)
      },
      (err) => {
        console.warn('likes snapshot failed', err)
      }
    )
    return () => unsub()
  }, [uid])

  async function openOrCreateDM() {
    if (!me) {
      router.push('/register')
      return
    }
    // 既存DMを探す: participants に自分を含むものを拾ってから相手 uid で絞り込み
    const qMe = query(
      collection(db, 'privateChats'),
      where('participants', 'array-contains', me),
      orderBy('updatedAt', 'desc'),
      limit(20)
    )
    const qs = await getDocs(qMe)
    const hit = qs.docs.find((d) => {
      const ps: string[] = Array.isArray((d.data() as any)?.participants) ? (d.data() as any).participants : []
      return ps.includes(uid)
    })

    const chatId =
      hit?.id ??
      (await addDoc(collection(db, 'privateChats'), {
        participants: [me, uid],
        unreadBy: [uid], // 相手に未読を付ける
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      })).id

    router.push(`/chat/${chatId}`)
  }

  async function shareProfile() {
    try {
      const url = typeof window !== 'undefined' ? window.location.href : ''
      const title = user?.name ?? 'プロフィール'
      if (navigator.share) {
        await navigator.share({ title, url })
      } else if (url) {
        await navigator.clipboard.writeText(url)
        alert('プロフィールのURLをコピーしました')
      }
    } catch (e) {
      console.warn('share failed', e)
    }
  }

  const letter = (user?.name?.[0] || 'U').toUpperCase()
  const handleTxt = `@${uid}`

  return (
    <div className="mx-auto max-w-[480px] min-h-screen bg-white border-x border-neutral-200">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-neutral-200">
        <div className="relative px-4 py-4">
          <button onClick={() => router.back()} className="back-link text-[14px] text-neutral-700 px-2 py-1 rounded-lg hover:bg-neutral-100">＜ 戻る</button>
          <div className="absolute left-0 right-0 text-center font-extrabold text-[20px] pointer-events-none">プロフィール</div>
        </div>
      </div>

      <div className="p-5">
        {/* プロフィールヘッダー */}
        <div className="text-center py-10">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className="h-24 w-24 rounded-full object-cover mx-auto mb-5" />
          ) : (
            <div className="h-24 w-24 mx-auto mb-5 grid place-items-center rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-white text-4xl font-extrabold">
              {letter}
            </div>
          )}

          <h2 className="font-extrabold text-[24px] leading-tight">{user?.name ?? '名前: 読み込み中...'}</h2>
          <div className="text-neutral-500 mt-1">{handleTxt}</div>

          {/* info chips */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <span className="px-3 py-1 text-[13px] rounded-full bg-neutral-100 border border-neutral-200 text-neutral-600">地域: {user?.region ?? '未設定'}</span>
            <span className="px-3 py-1 text-[13px] rounded-full bg-neutral-100 border border-neutral-200 text-neutral-600">年齢: {typeof user?.age === 'number' ? `${user.age}歳` : '未設定'}</span>
          </div>

          {/* bio */}
          {user?.intro ? (
            <p className="mt-3 text-[15px] text-neutral-600 leading-relaxed whitespace-pre-wrap">{user.intro}</p>
          ) : (
            <p className="mt-3 text-[15px] text-neutral-400">自己紹介は未設定です</p>
          )}
        </div>

        {/* stats */}
        <div className="grid grid-cols-3 gap-5 py-6 border-y border-neutral-200 my-6">
          <div className="text-center">
            <div className="text-[24px] font-extrabold text-pink-600">{threads.length + sposts.length}</div>
            <div className="text-[13px] text-neutral-500 font-medium">投稿</div>
          </div>
          <div className="text-center">
            <div className="text-[24px] font-extrabold text-pink-600">{likeTotal}</div>
            <div className="text-[13px] text-neutral-500 font-medium">いいね</div>
          </div>
          <div className="text-center">
            <div className="text-[24px] font-extrabold text-pink-600">0</div>
            <div className="text-[13px] text-neutral-500 font-medium">フォロー</div>
          </div>
        </div>

        {/* アクション */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={openOrCreateDM}
            className="btn rounded-xl bg-pink-600 text-white px-4 py-3 text-[16px] font-semibold min-h-[52px] flex-1 hover:bg-pink-600/90"
          >
            メッセージをおくる
          </button>
          <button
            onClick={shareProfile}
            className="btn-secondary rounded-xl bg-neutral-100 text-black border-2 border-neutral-200 px-4 py-3 text-[16px] font-semibold min-h-[52px] flex-1 hover:bg-neutral-200"
          >
            シェア
          </button>
        </div>

        {/* 最近のアクティビティ（=最近のスレッド） */}
        <h3 className="mb-3 font-bold">最近のアクティビティ</h3>
        {threads.length === 0 ? (
          <div className="text-neutral-500 text-sm">まだありません</div>
        ) : (
          <ul className="space-y-3">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/threads/${t.id}`} className="block rounded-2xl border border-neutral-200 bg-neutral-100 p-4 hover:bg-neutral-200 transition relative before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:bg-gradient-to-r before:from-pink-500 before:to-rose-400">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-semibold">{t.name}</span>
                    <span className="shrink-0 text-xs text-neutral-500">{t.createdAtText}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* 最近の投稿（SearchPosts） */}
        <h3 className="mb-3 mt-8 font-bold">最近の投稿</h3>
        {sposts.length === 0 ? (
          <div className="text-neutral-500 text-sm">まだありません</div>
        ) : (
          <ul className="space-y-3">
            {sposts.map((p) => (
              <li key={p.id}>
                <Link href="/post" className="block rounded-2xl border border-neutral-200 bg-neutral-100 p-4 hover:bg-neutral-200 transition relative before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:bg-gradient-to-r before:from-pink-500 before:to-rose-400">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-semibold">{p.content || '(テキストなし)'}</span>
                    <span className="shrink-0 text-xs text-neutral-500">{p.createdAtText}</span>
                  </div>
                  <div className="mt-2 text-xs text-neutral-500">♥ {p.likeCount ?? 0}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* 戻るリンク（任意） */}
        <div className="mt-8 text-center">
          <Link href="/threads" className="inline-block rounded-full border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">スレッド一覧へ</Link>
        </div>
      </div>
    </div>
  )
}