/**
 * Anonymous error reporting — opt-in only.
 *
 * Privacy guarantees:
 *   - Default OFF. User must explicitly enable via Settings → Privacy.
 *   - Collects ONLY: error message, truncated stack, app version, platform, route, timestamp.
 *   - NEVER collects: message content, contact names, API keys, URLs, IPs, request bodies.
 *
 * Currently logs locally. Replace the console.info call with a POST to a
 * self-hosted endpoint when ready.
 */

const ERROR_REPORTING_KEY = 'error-reporting'

function isEnabled(): boolean {
  try {
    return localStorage.getItem(ERROR_REPORTING_KEY) === 'true'
  } catch {
    return false
  }
}

export function reportError(error: Error, context?: string) {
  if (!isEnabled()) return

  const report: Record<string, unknown> = {
    message: error.message,
    stack: error.stack?.slice(0, 500),
    version: '0.1.0',
    platform: navigator.platform,
    route: window.location.pathname,
    timestamp: Date.now(),
  }

  if (context) {
    report.context = context
  }

  // Local-only for now. In production, POST to a self-hosted endpoint.
  console.info('[ErrorReport]', JSON.stringify(report))
}
