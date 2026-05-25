import { describe, expect, it } from 'vitest'
import { expectedOAuthCallbackUrl, validateOAuthLaunchUrl } from '../oauth-url'

function launchUrl(provider: 'github' | 'google', redirectTo: string) {
  const url = new URL('https://supabase.aparcedo.org/auth/v1/authorize')
  url.searchParams.set('provider', provider)
  url.searchParams.set('redirect_to', redirectTo)
  url.searchParams.set('code_challenge', 'challenge')
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

describe('oauth-url', () => {
  it('accepts a provider URL that returns to the active ClawCTRL backend', () => {
    const backend = 'http://127.0.0.1:3010'

    expect(validateOAuthLaunchUrl('github', launchUrl('github', expectedOAuthCallbackUrl(backend)), backend)).toEqual({ ok: true })
  })

  it('rejects URLs that would callback to a non-ClawCTRL local auth listener', () => {
    const result = validateOAuthLaunchUrl(
      'github',
      launchUrl('github', 'http://localhost:1455/success'),
      'http://127.0.0.1:3010',
    )

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('ClawCTRL backend')
  })

  it('rejects a mismatched provider', () => {
    const result = validateOAuthLaunchUrl(
      'google',
      launchUrl('github', 'http://127.0.0.1:3010/api/auth/callback'),
      'http://127.0.0.1:3010',
    )

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('provider')
  })
})
