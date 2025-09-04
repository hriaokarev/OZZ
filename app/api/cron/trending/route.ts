// app/api/cron/trending/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminMsg } from '@/lib/admin';

export const runtime = 'nodejs'; // Admin SDKを使うためNodeランタイム

// VercelのScheduled Functionsヘッダ or 任意のshared secretをチェック
function authorized(req: NextRequest) {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const auth = req.headers.get('authorization') || '';
  const token = (auth.startsWith('Bearer ') && auth.slice(7)) || '';
  return !!token && token === process.env.CRON_SECRET;
}

type Thread = {
  title?: string;
  genre?: string;
  createdAt?: FirebaseFirestore.Timestamp;
  viewCount?: number;
  messageCount?: number;
};

const COOLDOWN_MS = 10 * 60 * 1000; // 10分
const POP_SIZE = 50;

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 403 });
  }

  // 1) 直近50件（createdAt desc）を取得
  const snap = await adminDb
    .collection('threads')
    .orderBy('createdAt', 'desc')
    .limit(POP_SIZE)
    .get();

  const threads = snap.docs.map((d) => {
    const data = d.data() as Thread;
    return {
      id: d.id,
      title: data.title || 'スレッド',
      genre: data.genre || '',
      createdAtMs: data.createdAt ? data.createdAt.toMillis() : 0,
      viewCount: data.viewCount ?? 0,
      messageCount: data.messageCount ?? 0,
    };
  });

  // 2) スコア計算（同点は新しい方を上位）
  const scored = threads
    .map((t) => ({
      ...t,
      score: (t.viewCount ?? 0) * 10 + (t.messageCount ?? 0),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.createdAtMs - a.createdAtMs;
    });

  // Top3 のスナップショット
  const top3 = scored.slice(0, 3).map((t, i) => ({ id: t.id, title: t.title, rank: i + 1, score: t.score }))

  // 3) 前回状態を取得
  const stateRef = adminDb.collection('system').doc('trending_state');
  const stateSnap = await stateRef.get();
  const prev = (stateSnap.exists ? stateSnap.data() : {}) as {
    ranks?: Record<string, number>;
    lastNotified?: Record<string, number>;
    updatedAt?: number;
  } & { seq?: number };

  const prevRanks = prev.ranks || {};
  const lastNotified = prev.lastNotified || {};
  const prevSeq = (prev as any).seq ?? 0

  // 4) 今回の順位マップ
  const ranks: Record<string, number> = {};
  scored.forEach((t, idx) => (ranks[t.id] = idx + 1));

  // 5) 通知対象の抽出（3位以内に「上がった」もの、かつクールダウン10分）
  const now = Date.now();
  const targets = scored.filter((t, idx) => {
    const newRank = idx + 1;
    if (newRank > 3) return false; // 3位まで
    const oldRank = prevRanks[t.id]; // undefinedなら初登場
    const wentUp = oldRank === undefined || oldRank > newRank;
    if (!wentUp) return false;
    const last = lastNotified[t.id] || 0;
    return now - last >= COOLDOWN_MS;
  });

  // 6) 送るべきメッセージを作成（※ FCMは環境変数でON時のみ送信）
  const messages = targets.map((t) => {
    const rk = ranks[t.id];
    const title =
      rk === 1 ? 'トレンド1位！' : rk === 2 ? 'トレンド2位！' : 'トレンド3位！';
    const body = `「${t.title}」が第${rk}位にランクインしました`;
    const link = `/threads/${t.id}`; // SWが補完して開く（相対パスでOK）
    return { threadId: t.id, title, body, link, rank: rk };
  });

  const changed = targets.map((t) => ({ threadId: t.id, newRank: ranks[t.id] }))
  const seq = changed.length > 0 ? prevSeq + 1 : prevSeq

  // 7) 配信用トークンを集める（/users/*/fcmTokens/* のcollectionGroup）
  //    ※ユーザー数が増えたらトピック配信 or シャーディングコレクションに移行
  let tokens: string[] = [];
  if (messages.length > 0) {
    const tokSnap = await adminDb.collectionGroup('fcmTokens').get();
    tokens = tokSnap.docs
      .map((d) => (d.get('token') as string) || '')
      .filter(Boolean);
  }

  // 8) 配信（最大500件ずつ）— NOTIFY_FCM==='1' のときだけ
  const results: any[] = [];
  if (process.env.NOTIFY_FCM === '1' && tokens.length && messages.length) {
    const chunk = <T,>(arr: T[], size: number) =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size),
      );

    const tokenChunks = chunk(tokens, 500);

    for (const msg of messages) {
      for (const tk of tokenChunks) {
        const res = await adminMsg.sendEachForMulticast({
          tokens: tk,
          notification: { title: msg.title, body: msg.body },
          webpush: { fcmOptions: { link: msg.link } },
          data: {
            type: 'TRENDING_RANK_UP',
            threadId: msg.threadId,
            rank: String(msg.rank),
            url: msg.link,
          },
        });
        results.push({ threadId: msg.threadId, success: res.successCount, failure: res.failureCount });
      }
      // クールダウンの更新
      lastNotified[msg.threadId] = now;
    }
  }

  // 9) 状態を保存（今回の順位＋lastNotified＋top3/changed/seq）
  await stateRef.set(
    {
      ranks,
      lastNotified,
      updatedAt: now,
      top3,
      changed,
      seq,
    },
    { merge: true },
  );

  return NextResponse.json({
    ok: true,
    checked: scored.length,
    notified: messages.map((m) => ({ threadId: m.threadId, rank: m.rank })),
    results,
  });
}