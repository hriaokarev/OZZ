// app/search/page.tsx
'use client'

import { useEffect, useRef, useState } from "react";
import Link from 'next/link'
import { db, auth } from '@/lib/firebase'
import { fetchSearchPostsOnce, SearchPost } from '@/lib/useSearchPosts'
import FooterNav from '@/components/FooterNav'
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'

// ---- Simple runtime cache for posts (survives within SPA session)
type PostsCache = { items: SearchPost[]; ts: number };
function getPostsCache(): PostsCache {
  const g = globalThis as any;
  if (!g.__searchPostsCache) g.__searchPostsCache = { items: [], ts: 0 } as PostsCache;
  return g.__searchPostsCache as PostsCache;
}
function setPostsCache(items: SearchPost[]) {
  const c = getPostsCache();
  c.items = items;
  c.ts = Date.now();
}

export default function SearchPage() {
	const [posts, setPosts] = useState<SearchPost[]>([]);
	const [loading, setLoading] = useState(false);

	// Pull-to-refresh state
	const [pullY, setPullY] = useState(0);
	const [isPulling, setIsPulling] = useState(false);
	const [readyToRefresh, setReadyToRefresh] = useState(false);
	const startYRef = useRef<number | null>(null);
	const threshold = 70; // px

  // --- Post popup state (FAB -> Dialog) ---
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const len = content.length
  const over = len === 0 || len > 280
  const counterClass = len > 270 ? 'text-red-500' : len > 250 ? 'text-amber-500' : 'text-neutral-500'

	const load = async () => {
		setLoading(true);
		try {
			const data = await fetchSearchPostsOnce(db);
			setPosts(data);
			setPostsCache(data); // ← キャッシュにも保存
		} finally {
			setLoading(false);
		}
	};

	const onTouchStart = (e: React.TouchEvent) => {
		if (window.scrollY > 0) return; // 先頭以外では開始しない
		startYRef.current = e.touches[0].clientY;
		setIsPulling(true);
	};

	const onTouchMove = (e: React.TouchEvent) => {
		if (!isPulling || startYRef.current === null) return;
		const dy = e.touches[0].clientY - startYRef.current;
		if (dy <= 0) {
			setPullY(0);
			setReadyToRefresh(false);
			return;
		}
		// ダンピングして引っ張り量を調整
		const damped = Math.min(120, dy * 0.5);
		setPullY(damped);
		setReadyToRefresh(damped >= threshold);
		// 画面のラバーバンドを抑制
		e.preventDefault();
	};

	const onTouchEnd = async () => {
		if (!isPulling) return;
		setIsPulling(false);
		startYRef.current = null;
		if (readyToRefresh) {
			setPullY(threshold); // スナップ
			await load();
		}
		setPullY(0);
		setReadyToRefresh(false);
	};

  useEffect(() => {
    if (!taRef.current) return
    const el = taRef.current
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [content])

	useEffect(() => {
		const cache = getPostsCache();
		if (cache.items.length) {
			setPosts(cache.items); // 即描画（ネットワーク待ち無し）
		} else {
			load(); // 初回だけ取得
		}
	}, []);

  async function submitPost() {
    if (over || submittingRef.current || submitting) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const user = auth.currentUser
      const userId = user?.uid ?? 'anonymous'
      const ref = await addDoc(collection(db, 'searchPosts'), {
        content: content.trim(),
        userId,
        createdAt: serverTimestamp(),
      })

      // 楽観反映
      const optimistic: SearchPost = {
        id: ref.id,
        content: content.trim(),
        userId,
        userName: user?.displayName || 'anonymous',
      } as any
      setPosts((prev) => [optimistic, ...prev])
      const cache = getPostsCache()
      setPostsCache([optimistic, ...cache.items])

      setContent('')
      setOpen(false)
    } catch (e) {
      console.error('投稿エラー:', e)
      alert('投稿に失敗しました')
    } finally {
      setSubmitting(false)
      submittingRef.current = false
    }
  }

	return (
		<div className="max-w-xl min-h-screen mx-auto space-y-4 border-x border-neutral-200 overscroll-y-contain" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
			<div className="border-b border-neutral-200 p-4">
				<h1 className="text-2xl font-bold">つぶやき</h1>
			</div>

			{/* Pull to refresh indicator at top */}
			<div
				className="flex items-end justify-center text-xs text-neutral-500 transition-all duration-150"
				style={{ height: pullY }}
			>
				<div className="mb-2 rounded-full px-3 py-1 bg-neutral-100 border border-neutral-200 cursor-pointer" onClick={() => load()}>
					{loading ? "更新中..." : readyToRefresh ? "離して更新" : "更新"}
				</div>
			</div>

			<div>
				{posts.map((p) => (
					<div key={p.id} className="p-4 border-b border-neutral-200">
						<div className="flex items-center gap-2">
							<div className="flex min-w-11 min-h-11 rounded-full items-center justify-center bg-pink-500 text-white">{p.userName === "anonymous" ? "匿" : p.userName?.slice(0, 1)}</div>
							<div className="flex gap-2 truncate">
								{p.userId ? (
								  <Link
								    href={`/users/${p.userId}`}
								    className="truncate text-sm text-gray-800 hover:underline"
								    aria-label={`${p.userName ?? 'anonymous'}のプロフィールを開く`}
								  >
								    {p.userName ?? 'anonymous'}
								  </Link>
								) : (
								  <span className="truncate text-sm text-gray-800">{p.userName ?? 'anonymous'}</span>
								)}
								<div className="text-sm text-gray-500">@{p.userId}</div>
								{/*<div className="text-sm text-gray-800 whitespace-nowrap">{p.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>*/}
							</div>
						</div>
						<div className="ml-13 mb-4 text-gray-900">{p.content}</div>
						<div className="flex ml-13 gap-4">
							<div className="flex items-center gap-2">
								<svg className="w-4 h-4" viewBox="0 0 24 24">
									<path d="M12 3a8.5 8.5 0 1 1-4.62 15.64L6 20.9a1 1 0 0 1-1.5-.87v-2.78A8.5 8.5 0 0 1 12 3Z"></path>
								</svg>
								<span>0</span>
							</div>
							<div className="flex items-center gap-2">
								<svg className="w-4 h-4" viewBox="0 0 24 24">
									<path d="M12 8c-2.2-3.2-6.5-3.2-8.6 0-1.8 2.6-1.2 6.0 1.1 8.0l6.46 5.35a1 1 0 0 0 1.28 0l6.46-5.35c2.3-2.0 2.9-5.4 1.1-8.0-2.1-3.2-6.4-3.2-8.6 0-.17.25-.36.53-.44.66-.08-.13-.27-.41-.44-.66Z"></path>
								</svg>
								<span>0</span>
							</div>
						</div>
					</div>
				))}
			</div>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setContent('') }}>
        <DialogTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="fixed flex bottom-20 right-6 w-14 h-14 rounded-full items-center justify-center bg-pink-500 text-white text-[32px] border-none shadow-lg cursor-pointer z-20"
            aria-label="投稿を開く"
          >
            ＋
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[400px] rounded-[16px] p-8 shadow-2xl">
          <DialogHeader className="p-0">
            <DialogTitle className="text-[20px] font-extrabold">投稿</DialogTitle>
          </DialogHeader>

          {/* body */}
          <div className="mt-4">
            <Textarea
              ref={taRef}
              placeholder="つぶやきを入力してください..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={280}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  submitPost();
                }
              }}
              className="min-h-[120px] resize-none rounded-[12px] bg-white border border-neutral-200 p-4 text-[16px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
            />
          </div>

          {/* footer */}
          <DialogFooter className="items-center mt-3">
            <div className={`mr-auto text-sm ${counterClass}`}>{len} / 280</div>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="rounded-full px-5 py-2.5 bg-neutral-300 text-neutral-800 border-0 hover:bg-neutral-400/90 shadow-sm disabled:opacity-50"
              >
                キャンセル
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={submitPost}
              disabled={over || submitting}
              aria-busy={submitting}
              className="rounded-full px-5 py-2.5 bg-pink-500 hover:bg-pink-600 text-white shadow-md disabled:bg-neutral-400 disabled:opacity-50"
            >
              {submitting ? '投稿中…' : '投稿'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
			<FooterNav />
		</div>
	)
}