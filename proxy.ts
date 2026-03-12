import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

// API key for protecting API routes — set via MC_API_KEY env var
const API_KEY = process.env.MC_API_KEY || ''

// Internal pipeline routes that agents call server-to-server (no auth needed from localhost)
const INTERNAL_PATHS = [
  '/api/notify',
  '/api/health',
]

// Simple sliding-window rate limiter for state-changing (POST/PUT/DELETE) requests
const RATE_WINDOW_MS = 60_000 // 1 minute
const RATE_MAX_REQUESTS = 30  // max 30 mutations per minute per IP
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

let lastCleanup = 0

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  if (now - lastCleanup > RATE_WINDOW_MS) {
    lastCleanup = now
    for (const [key, bucket] of rateBuckets) {
      if (now > bucket.resetAt) rateBuckets.delete(key)
    }
  }
  const bucket = rateBuckets.get(ip)
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  bucket.count++
  return bucket.count <= RATE_MAX_REQUESTS
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip auth for static assets
  if (pathname.startsWith('/_next/') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // Skip auth for login page and auth callback
  if (pathname === '/login' || pathname.startsWith('/auth/')) {
    return NextResponse.next()
  }

  // ── Supabase session check ──
  let supabaseResponse = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — MUST happen before checking user
  const { data: { user } } = await supabase.auth.getUser()

  // Check MFA enforcement
  let needsMfa = false
  let needsEnroll = false
  if (user) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal) {
      if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
        // Has TOTP enrolled but hasn't verified this session
        needsMfa = true
      } else if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal1') {
        // No TOTP enrolled — force them to set it up
        needsEnroll = true
      }
    }
  }

  // Force to login page if MFA not enrolled or not verified
  if (!user || needsMfa || needsEnroll) {
    // API routes: check for API key before returning 401
    if (pathname.startsWith('/api/')) {
      // Allow internal server-to-server calls
      if (INTERNAL_PATHS.some(p => pathname.startsWith(p))) {
        return supabaseResponse
      }

      const provided =
        req.headers.get('x-api-key') ||
        req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
        req.nextUrl.searchParams.get('api_key')

      if (provided === API_KEY && API_KEY) {
        // API key valid — fall through to rate limiting / CSRF checks below
      } else {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    } else {
      // Page routes: redirect to login (preserve auth cookies so login page can detect session)
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('next', pathname)
      const redirect = NextResponse.redirect(loginUrl)
      supabaseResponse.cookies.getAll().forEach(cookie => {
        redirect.cookies.set(cookie.name, cookie.value)
      })
      return redirect
    }
  }

  // ── API route protection ──
  if (!pathname.startsWith('/api/')) {
    return supabaseResponse
  }

  // Rate-limit state-changing requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded — try again shortly' },
        { status: 429, headers: { 'Retry-After': '60' } },
      )
    }
  }

  // Allow internal server-to-server calls (pipeline, notify)
  if (INTERNAL_PATHS.some(p => pathname.startsWith(p))) {
    return supabaseResponse
  }

  // If no API key configured, allow all (development only)
  if (!API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Server misconfigured — MC_API_KEY is required in production' },
        { status: 500 },
      )
    }
    return supabaseResponse
  }

  // Allow same-origin browser requests (CSRF protection via Sec-Fetch-Site)
  const secFetchSite = req.headers.get('sec-fetch-site')
  if (secFetchSite === 'same-origin') {
    return supabaseResponse
  }

  // Fallback: check Origin or Referer header matches request host
  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')
  const host = req.headers.get('host')
  if (host) {
    try {
      if (origin && new URL(origin).host === host) return supabaseResponse
      if (referer && new URL(referer).host === host) return supabaseResponse
    } catch { /* invalid URL, fall through to API key check */ }
  }

  // Check API key from header or query param (for non-browser clients)
  const provided =
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.nextUrl.searchParams.get('api_key')

  if (provided !== API_KEY) {
    return NextResponse.json(
      { error: 'Unauthorized — provide X-API-Key header or api_key query param' },
      { status: 401 },
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
