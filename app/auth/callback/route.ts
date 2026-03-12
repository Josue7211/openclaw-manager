import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabase/server'
import { setPendingCode } from '@/app/api/auth/tauri-session/route'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const isTauri = searchParams.get('tauri') === '1'
  let next = searchParams.get('next') ?? '/'
  if (!next.startsWith('/')) next = '/'

  console.log('[auth/callback] code:', code ? code.slice(0, 8) + '...' : 'NONE', 'isTauri:', isTauri)

  if (code) {
    // Tauri flow: don't exchange here (system browser lacks the PKCE verifier).
    // Store the code so the WebView can poll for it and exchange client-side.
    if (isTauri) {
      setPendingCode(code)

      return new NextResponse(
        `<!DOCTYPE html>
<html><head><title>Mission Control</title>
<style>
  body { background: #0a0a0c; color: #e4e4ec; font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { text-align: center; padding: 40px; background: rgba(22,22,28,0.65); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 20px; max-width: 340px; }
  h1 { font-size: 18px; margin: 12px 0 8px; }
  p { font-size: 13px; color: #9898a8; margin: 0; }
</style></head>
<body><div class="card">
  <div style="font-size:32px">&#x1F9AC;</div>
  <h1>Signed in!</h1>
  <p>You can close this tab and return to Mission Control.</p>
</div></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      )
    }

    // Normal browser flow: exchange and redirect
    const supabase = await createAuthClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const base = request.headers.get('x-forwarded-host')
        ? `https://${request.headers.get('x-forwarded-host')}`
        : origin

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
        return NextResponse.redirect(`${base}/login?mfa=verify&next=${encodeURIComponent(next)}`)
      } else if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal1') {
        return NextResponse.redirect(`${base}/login?mfa=enroll&next=${encodeURIComponent(next)}`)
      }

      return NextResponse.redirect(`${base}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
