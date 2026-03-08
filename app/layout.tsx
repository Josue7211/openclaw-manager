import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'Mission Control — Bjorn',
  description: 'Bjorn AI Assistant Mission Control Dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        <Sidebar />
        <main style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {children}
        </main>
      </body>
    </html>
  )
}
