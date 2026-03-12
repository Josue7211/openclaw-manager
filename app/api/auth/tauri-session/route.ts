import { NextResponse } from 'next/server'

// Server-side store for pending Tauri OAuth tokens (single-user, in-memory)
let pendingSession: { access_token: string; refresh_token: string } | null = null
let pendingAt = 0

export function setPendingSession(tokens: { access_token: string; refresh_token: string }) {
  pendingSession = tokens
  pendingAt = Date.now()
}

// GET: Tauri WebView polls this to pick up tokens after OAuth in system browser
export async function GET() {
  // Expire after 5 minutes
  if (pendingSession && Date.now() - pendingAt > 5 * 60 * 1000) {
    pendingSession = null
  }

  if (!pendingSession) {
    return NextResponse.json({ session: null })
  }

  const tokens = pendingSession
  pendingSession = null // One-time use
  return NextResponse.json({ session: tokens })
}
