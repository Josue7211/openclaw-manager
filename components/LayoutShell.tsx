'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import QuickCaptureWidget from '@/components/QuickCaptureWidget'

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLogin = pathname === '/login' || pathname.startsWith('/auth/')

  if (isLogin) {
    return <body>{children}</body>
  }

  return (
    <body style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative',
      zIndex: 1,
    }}>
      <Sidebar />
      <main style={{
        flex: 1,
        overflowY: 'auto',
        padding: '28px 32px',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 1,
      }}>
        {children}
      </main>
      <QuickCaptureWidget />
    </body>
  )
}
