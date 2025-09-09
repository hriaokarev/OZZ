import type { Metadata } from 'next'
import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'
import { headers } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function getAdminDb(): Firestore | null {
  try {
    const projectId   = process.env.FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    let privateKey    = process.env.FIREBASE_PRIVATE_KEY
    if (!projectId || !clientEmail || !privateKey) return null
    privateKey = privateKey.replace(/\\n/g, '\n')
    if (!getApps().length) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey } as any) })
    }
    return getFirestore()
  } catch {
    return null
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  // Next.js 14+/15: params can be a Promise — must await
  const { id } = await params

  const db = getAdminDb()

  let title = 'スレッド'
  let description = ''

  if (db) {
    try {
      const snap = await db.doc(`threads/${id}`).get()
      if (snap.exists) {
        const d = snap.data() as any
        title = (d?.name || title).toString().slice(0, 70)
        description = (d?.description || '').toString().slice(0, 160)
      }
    } catch {
      // ignore admin failures
    }
  }

  // Build absolute canonical
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = host.includes('localhost') ? 'http' : 'https'
  const baseEnv = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
  const base = baseEnv || (host ? `${proto}://${host}` : '')
  const canonical = base ? `${base}/threads/${id}` : undefined

  return {
    title,
    description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      type: 'website',
      url: canonical,
      title,
      description,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default function ThreadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}