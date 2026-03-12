import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  let next = searchParams.get('next') ?? '/'
  if (!next.startsWith('/')) next = '/'

  if (code) {
    const supabase = await createAuthClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const base = request.headers.get('x-forwarded-host')
        ? `https://${request.headers.get('x-forwarded-host')}`
        : origin

      // Check MFA status before redirecting
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
        // Has TOTP enrolled — needs to verify
        return NextResponse.redirect(`${base}/login?mfa=verify&next=${encodeURIComponent(next)}`)
      } else if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal1') {
        // No TOTP enrolled — needs to set up
        return NextResponse.redirect(`${base}/login?mfa=enroll&next=${encodeURIComponent(next)}`)
      }

      return NextResponse.redirect(`${base}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
