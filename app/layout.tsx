// app/layout.tsx
import './globals.css'
import SWRegister from '@/app/sw-register' 
import TokenKeeper from '@/components/system/TokenKeeper'
import TrendNotifierClient from './TrendNotifierClient'

export const metadata = {
  metadataBase: new URL('https://o-zz.net'),
  title: {
    default: 'OZZ（オズ）掲示板｜今が上に来る掲示板',
    template: '%s｜OZZ',
  },
  description:
    'OZZ（オズ）掲示板は、今動いているスレが上に来る新しい掲示板。匿名OK・すぐ参加。',
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'OZZ',
    url: 'https://o-zz.net',
    title: 'OZZ（オズ）掲示板｜今が上に来る掲示板',
    description:
      'OZZ（オズ）掲示板は、今動いているスレが上に来る新しい掲示板。匿名OK・すぐ参加。',
  },
  twitter: {
    card: 'summary',
    title: 'OZZ（オズ）掲示板｜今が上に来る掲示板',
    description:
      'OZZ（オズ）掲示板は、今動いているスレが上に来る新しい掲示板。匿名OK・すぐ参加。',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh bg-white text-gray-900 antialiased">
        {children}
        <TrendNotifierClient />
        <SWRegister />
        <TokenKeeper />
      </body>
    </html>
  )
}
