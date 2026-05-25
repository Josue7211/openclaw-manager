export interface OAuthLaunchValidation {
  ok: boolean
  reason?: string
}

function normalizeBase(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function expectedOAuthCallbackUrl(backendBase: string): string {
  return `${normalizeBase(backendBase)}/api/auth/callback`
}

export function validateOAuthLaunchUrl(provider: 'github' | 'google', launchUrl: string, backendBase: string): OAuthLaunchValidation {
  let parsed: URL
  try {
    parsed = new URL(launchUrl)
  } catch {
    return { ok: false, reason: 'The sign-in provider returned an invalid URL.' }
  }

  if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    return { ok: false, reason: 'The sign-in provider returned an unsafe URL.' }
  }

  if (!parsed.pathname.endsWith('/auth/v1/authorize')) {
    return { ok: false, reason: 'The sign-in URL is not a ClawCTRL OAuth authorization URL.' }
  }

  if (parsed.searchParams.get('provider') !== provider) {
    return { ok: false, reason: 'The sign-in provider did not match the requested provider.' }
  }

  const redirectTo = parsed.searchParams.get('redirect_to')
  if (!redirectTo) {
    return { ok: false, reason: 'The sign-in URL is missing the ClawCTRL callback.' }
  }

  let redirectUrl: URL
  try {
    redirectUrl = new URL(redirectTo)
  } catch {
    return { ok: false, reason: 'The sign-in callback URL is invalid.' }
  }

  const expected = new URL(expectedOAuthCallbackUrl(backendBase))
  if (
    redirectUrl.protocol !== expected.protocol ||
    redirectUrl.host !== expected.host ||
    redirectUrl.pathname !== expected.pathname
  ) {
    return { ok: false, reason: 'The sign-in callback does not point back to this ClawCTRL backend.' }
  }

  return { ok: true }
}
