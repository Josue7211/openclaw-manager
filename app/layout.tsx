import type { Metadata } from 'next'
import { headers } from 'next/headers'
import './globals.css'
import LayoutShell from '@/components/LayoutShell'

export const metadata: Metadata = {
  title: 'Mission Control — Bjorn',
  description: 'Bjorn AI Assistant Mission Control Dashboard',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Force dynamic rendering — dashboard requires client navigation context
  await headers()

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&family=JetBrains+Mono:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <LayoutShell>{children}</LayoutShell>
    </html>
  )
}
