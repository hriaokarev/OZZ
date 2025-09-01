"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from 'next/link'
import FooterNav from "@/components/FooterNav";

// ▼ Firebase クライアント（プロジェクト側の初期化に合わせて調整してください）
//   例: `@/lib/firebase` で `db, auth` を export している想定
//   もしパスが異なる場合は下記の import を合わせて変更してください。
import { db, auth } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
  doc,
  getDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// Firestore の型（最低限）
type ChatDoc = {
  participants: string[];
  updatedAt?: { toDate?: () => Date } | null;
  unreadBy?: string[];
};

type ChatItem = {
  id: string;
  otherUid: string;
  otherName: string;
  updatedAtText: string;
  unread: boolean;
  lastMessage?: string;
  updatedAtMs?: number;
};

// ---- Runtime cache for DM list (lives during the SPA session) ----
type ListCache = {
  items: ChatItem[]
  unsubList?: () => void
  msgUnsubs: Map<string, () => void>
  userUid?: string,
  nameCache: Map<string, string>
}

function getListCache(): ListCache {
  const g = globalThis as any
  if (!g.__dmListCache) {
    g.__dmListCache = {
      items: [],
      msgUnsubs: new Map<string, () => void>(),
      unsubList: undefined,
      userUid: undefined,
      nameCache: new Map<string, string>(),
    } as ListCache
  }
  return g.__dmListCache as ListCache
}

function ChatList() {
  const router = useRouter();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);

  // DM一覧のキャッシュ+購読（購読は使い回し、アンマウントでも解除しない）
  useEffect(() => {
    const cache = getListCache();

    // 親ドキュメントのみで更新する方針に変更：ここでは何もしない
    const ensureMsgWatcher = (chatId: string) => {
      // 親ドキュメントのみで更新する方針に変更：ここでは何もしない
      return;
    };

    // まずキャッシュから即表示
    if (cache.items.length) {
      setItems(cache.items);
      setLoading(false);
    }

    const stopAuth = onAuthStateChanged(auth, (user) => {
      // ログアウト時: 既存の購読を解除しキャッシュをクリア
      if (!user) {
        if (cache.unsubList) {
          try { cache.unsubList(); } catch {}
          cache.unsubList = undefined;
        }
        for (const [, unsub] of Array.from(cache.msgUnsubs.entries())) {
          try { unsub(); } catch {}
        }
        cache.msgUnsubs.clear();
        cache.items = [];
        cache.userUid = undefined;
        if (cache.nameCache) cache.nameCache.clear();
        setItems([]);
        setLoading(false);
        return;
      }

      // ユーザーが切り替わった場合はキャッシュを初期化
      if (cache.userUid && cache.userUid !== user.uid) {
        if (cache.unsubList) { try { cache.unsubList(); } catch {} }
        for (const [, unsub] of cache.msgUnsubs) { try { unsub(); } catch {} }
        cache.msgUnsubs.clear();
        cache.items = [];
        cache.unsubList = undefined;
      }
      cache.userUid = user.uid;

      // 既存の購読があっても必ず貼り直す（戻ってきたときに確実に再アタッチ）
      if (cache.unsubList) {
        try { cache.unsubList(); } catch {}
        cache.unsubList = undefined;
      }
      // キャッシュをまず表示（即描画）
      setItems(cache.items);

      try {
        const qChats = query(
          collection(db, 'privateChats'),
          where('participants', 'array-contains', user.uid),
          orderBy('updatedAt', 'desc')
        );

        cache.unsubList = onSnapshot(
          qChats,
          { includeMetadataChanges: true },
          async (snap) => {
            setLoading(true);
            let listChanged = false;

            for (const ch of snap.docChanges()) {
              const d = ch.doc;
              const data = (d.data() as Partial<ChatDoc>) || {};
              const participants = Array.isArray(data.participants) ? data.participants : [];
              const otherUid = participants.find((uid) => uid && uid !== user.uid) || '';

              if (!otherUid) {
                console.warn('[ChatList] skip malformed chat doc:', d.id, data);
                continue;
              }

              // otherName: resolve once & cache
              let otherName = cache.nameCache.get(otherUid) || '名無し';
              if (!cache.nameCache.has(otherUid)) {
                try {
                  const u = await getDoc(doc(db, 'users', otherUid));
                  if (u.exists()) {
                    const nm = ((u.data() as any)?.name ?? '名無し').toString().trim();
                    cache.nameCache.set(otherUid, nm);
                    otherName = nm;
                  }
                } catch {}
              }

              const updatedAtAny: any = (data as any)?.updatedAt;
              const updatedAt = updatedAtAny && typeof updatedAtAny.toDate === 'function' ? (updatedAtAny.toDate() as Date) : undefined;
              const updatedAtText = updatedAt ? updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
              const updatedAtMs = updatedAt ? updatedAt.getTime() : 0;
              const unreadBy = Array.isArray(data.unreadBy) ? data.unreadBy : [];
              const unread = user.uid ? unreadBy.includes(user.uid) : false;

              if (ch.type === 'removed') {
                const idx = cache.items.findIndex((p) => p.id === d.id);
                if (idx >= 0) {
                  cache.items.splice(idx, 1);
                  const unsubMsg = cache.msgUnsubs.get(d.id);
                  if (unsubMsg) {
                    try { unsubMsg(); } catch {}
                    cache.msgUnsubs.delete(d.id);
                  }
                  listChanged = true;
                }
                continue;
              }

              // added or modified
              const idx = cache.items.findIndex((p) => p.id === d.id);
              const nextItem: ChatItem = {
                id: d.id,
                otherUid,
                otherName,
                updatedAtText,
                unread,
                updatedAtMs,
                lastMessage:
                  typeof (data as any)?.lastMessage === 'string'
                    ? ((data as any).lastMessage as string)
                    : (idx >= 0 ? cache.items[idx].lastMessage : undefined),
              };

              if (idx === -1) {
                cache.items.push(nextItem);
                listChanged = true;
              } else {
                const prev = cache.items[idx];
                if (
                  prev.otherUid !== nextItem.otherUid ||
                  prev.otherName !== nextItem.otherName ||
                  prev.updatedAtText !== nextItem.updatedAtText ||
                  prev.unread !== nextItem.unread ||
                  prev.updatedAtMs !== nextItem.updatedAtMs ||
                  prev.lastMessage !== nextItem.lastMessage
                ) {
                  cache.items[idx] = { ...prev, ...nextItem };
                  listChanged = true;
                }
              }
            }

            if (listChanged) {
              cache.items.sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0));
              setItems([...cache.items]);
            }


            setLoading(false);
          },
          (err) => {
            console.error('[ChatList] chat list snapshot error:', err);
            setLoading(false);
          }
        );
      } catch (e) {
        console.error('[ChatList] query setup failed:', e);
        setLoading(false);
      }
    });

    // アンマウント時は Auth 監視だけ停止（Firestore一覧の購読も確実に解除してフラグを戻す）
    return () => {
      try { stopAuth(); } catch {}
      // Firestore一覧の購読も確実に解除してフラグを戻す（再マウント時に必ず再アタッチ）
      const cache = getListCache();
      if (cache.unsubList) {
        try { cache.unsubList(); } catch {}
        cache.unsubList = undefined;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    console.debug("[ChatList] items length:", items.length);
  }, [items]);

  if (loading) {
    return (
      <div className="px-4 pb-28">
        <div className="py-6 text-sm text-neutral-500">読み込み中…</div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="px-4 pb-28">
        <div className="py-10 text-center text-neutral-500">DM はまだありません</div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-28">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => router.push(`/chat/${it.id}`)}
          className="w-full flex items-center gap-4 py-3 border-b border-neutral-200 hover:bg-neutral-50 rounded-xl px-2 -mx-2 cursor-pointer text-left"
        >
          <Link
            href={`/users/${it.otherUid}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`${it.otherName}のプロフィール`}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-rose-400 text-white font-semibold hover:opacity-90"
          >
            {it.otherName?.[0] ?? 'U'}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium truncate">{it.otherName}</p>
              <span className="shrink-0 text-xs text-neutral-500">{it.updatedAtText}</span>
            </div>
            <p className="mt-1 text-sm text-neutral-500 truncate">
              {it.lastMessage || "（メッセージなし）"}
            </p>
          </div>
          {it.unread && (
            <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-white text-[10px] font-bold">●</span>
          )}
        </button>
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <div className="max-w-xl min-h-screen mx-auto space-y-4 border-x border-neutral-200">
      <div className="border-b border-neutral-200 p-4">
        <h1 className="text-2xl font-bold">メッセージ</h1>
      </div>

      {/* ▼ DM リスト */}
      <ChatList />

      {/* 既存のフッターナビはそのまま */}
      <FooterNav />
    </div>
  );
}