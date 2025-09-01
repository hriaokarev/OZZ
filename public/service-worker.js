// ==== FCM（Web Push） + PWA キャッシュ（自己修復対応）====
// ※ 既存機能は維持しつつ、クエリ無しで登録された場合でも postMessage で初期化できるようにする

// --- Firebase compat（SW は ESM 不可） ---
self.importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
self.importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

// --- FCM 初期化（重複防止） ---
self.__fcmInited = false
function initFCM(cfg) {
  if (self.__fcmInited) return
  try {
    firebase.initializeApp(cfg)
    const messaging = firebase.messaging()

    // バックグラウンド受信（data/notification どちらでも表示）
    messaging.onBackgroundMessage(({ notification, data }) => {
      // 既に notification が付いているメッセージはブラウザ側で表示される想定 → SWでは描画しない
      const hasNotification = !!(notification && (notification.title || notification.body))
      if (hasNotification) {
        // console.debug('[sw] skip showNotification: payload has notification')
        return
      }

      // data-only の場合だけ SW で描画
      const title = (data && (data.title || data.notificationTitle)) || '新着メッセージ'
      const body  = (data && (data.body  || data.notificationBody))  || ''
      const url   = (data && (data.link  || data.url))               || '/'
      self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url },
      })
    })

    // 通知タップ → 既存タブにフォーカス or 新規
    self.addEventListener('notificationclick', (event) => {
      event.notification.close()
      const url = event.notification.data?.url || '/'
      event.waitUntil((async () => {
        const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true })
        const existed = wins.find((w) => w.url.includes(url))
        if (existed) return existed.focus()
        return clients.openWindow(url)
      })())
    })

    self.__fcmInited = true
    console.log('[sw] FCM initialized')
  } catch (err) {
    console.error('[sw] FCM init error', err)
  }
}

// --- クエリから設定を読む（msid だけでも OK） ---
const u = new URL(self.location.href)
const cfg = {
  apiKey: u.searchParams.get('apiKey') || undefined,
  projectId: u.searchParams.get('projectId') || undefined,
  messagingSenderId: u.searchParams.get('messagingSenderId') || u.searchParams.get('msid') || undefined,
  appId: u.searchParams.get('appId') || undefined,
}

if (cfg.messagingSenderId) {
  // msid だけでも初期化可
  initFCM(cfg)
} else {
  console.warn('[sw] no msid in scriptURL → waiting postMessage fallback')
}

// --- クライアントからの制御メッセージ ---
self.addEventListener('message', (e) => {
  const data = e.data || {}
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }
  if (data.type === 'FCM_INIT') {
    const cfg = data.cfg || {}
    if (!self.__fcmInited) initFCM(cfg)
  }
})

// ========================
// 以降はあなたのキャッシュ戦略（既存維持）
// ========================

const CACHE = 'app-cache-v3' // ← バージョン上げて確実に入れ替え
const ASSETS = [
  '/', // 404 しないなら保持。不要なら外してOK
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    for (const url of ASSETS) {
      try {
        const res = await fetch(url, { cache: 'no-cache' })
        if (res.ok) await cache.put(url, res.clone())
      } catch (e) {
        console.warn('[sw] asset cache skip:', url)
      }
    }
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // HTMLナビゲーション: network-first
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        const cache = await caches.open(CACHE)
        cache.put(req, res.clone())
        return res
      } catch {
        const cache = await caches.open(CACHE)
        return (await cache.match(req)) || (await cache.match('/'))
      }
    })())
    return
  }

  // 同一オリジンの静的: stale-while-revalidate
  if (url.origin === self.location.origin && req.method === 'GET') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(req)
      const fetchPromise = fetch(req)
        .then((res) => { cache.put(req, res.clone()); return res })
        .catch(() => cached)
      return cached || fetchPromise
    })())
  }
})