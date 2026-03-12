import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Block internal/private IPs to prevent SSRF
const BLOCKED_HOST_RE = [
  /^localhost$/i, /^127\./, /^10\./, /^0\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^\[::1\]/, /^fe80:/i, /^fc00:/i, /^fd/i,
]

function extractOg(html: string, property: string): string {
  const r1 = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i')
  const r2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i')
  return r1.exec(html)?.[1] || r2.exec(html)?.[1] || ''
}

function extractName(html: string, name: string): string {
  const r1 = new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')
  const r2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i')
  return r1.exec(html)?.[1] || r2.exec(html)?.[1] || ''
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

// GET /api/messages/link-preview?url=...
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url')
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url required' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 })
  }

  if (BLOCKED_HOST_RE.some(re => re.test(parsed.hostname))) {
    return NextResponse.json({ error: 'Blocked host' }, { status: 400 })
  }

  // Proxy social sites that block scrapers
  let fetchUrl = url
  const isTwitter = /^(www\.)?(twitter\.com|x\.com)$/i.test(parsed.hostname)
  const isInstagram = /^(www\.)?instagram\.com$/i.test(parsed.hostname)
  if (isTwitter) {
    fetchUrl = url.replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com)/, 'https://fxtwitter.com')
  }

  // Instagram: return a static preview since they block all scrapers
  // iOS works via Apple's private API deal with Meta
  if (isInstagram) {
    const pathMatch = parsed.pathname.match(/^\/(p|reel|stories)\/([^/]+)/)
    return NextResponse.json(
      {
        title: pathMatch ? `Instagram ${pathMatch[1] === 'reel' ? 'Reel' : 'Post'}` : 'Instagram',
        description: '',
        image: '',
        siteName: 'Instagram',
      },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } },
    )
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const ua = isTwitter
      ? 'Mozilla/5.0 (compatible; Twitterbot/1.0)'
      : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timeout)

    if (!res.ok) {
      return NextResponse.json({ title: '', description: '', image: '', siteName: parsed.hostname.replace(/^www\./, '') })
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('xhtml')) {
      return NextResponse.json({ title: '', description: '', image: '', siteName: parsed.hostname.replace(/^www\./, '') })
    }

    const raw = await res.text()
    const html = raw.slice(0, 50000)

    const title =
      extractOg(html, 'og:title') ||
      extractName(html, 'twitter:title') ||
      (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || '')

    const description =
      extractOg(html, 'og:description') ||
      extractName(html, 'twitter:description') ||
      extractName(html, 'description') ||
      ''

    const image =
      extractOg(html, 'og:image') ||
      extractName(html, 'twitter:image') ||
      extractName(html, 'twitter:image:src') ||
      ''

    let siteName =
      extractOg(html, 'og:site_name') ||
      parsed.hostname.replace(/^www\./, '')
    // Always show original domain for proxied fetches
    if (isTwitter) siteName = 'X (Twitter)'

    let resolvedImage = image
    if (image && !image.startsWith('http')) {
      try {
        resolvedImage = new URL(image, url).href
      } catch { resolvedImage = '' }
    }

    return NextResponse.json(
      {
        title: decodeEntities(title).slice(0, 200),
        description: decodeEntities(description).slice(0, 300),
        image: resolvedImage,
        siteName: decodeEntities(siteName),
      },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } },
    )
  } catch {
    return NextResponse.json({ error: 'Failed to fetch preview' }, { status: 502 })
  }
}
