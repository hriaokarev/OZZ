// app/layout.tsx
import './globals.css'
import SWRegister from '@/app/sw-register' 
import TrendNotifierClient from './TrendNotifierClient'

export const metadata = {
  title: 'OZZ',
  description: 'Threads / Search / Settings',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh bg-white text-gray-900 antialiased">
        {children}
        <TrendNotifierClient />
        <SWRegister />
      </body>
    </html>
  )
}
