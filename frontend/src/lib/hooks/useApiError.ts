import { useMemo } from 'react'
import { ApiError } from '@/lib/api'
import { reportError } from '@/lib/error-reporter'

/**
 * Derives a user-friendly error message from a React Query error.
 *
 * Patterns found across pages today:
 *   - Personal/Dashboard: `e instanceof ApiError ? e.serviceLabel : 'Service unavailable'`
 *   - Chat: `err instanceof ApiError ? err.serviceLabel : 'OpenClaw unreachable'`
 *   - Email: `err instanceof Error ? err.message : 'Failed to fetch'`
 *   - HomeLab: `(error as Error).message`
 *   - KnowledgeBase: raw `err.message`
 *
 * This hook normalizes all of them into a single pattern.
 *
 * @param error - The error value from useQuery / useMutation (Error | null)
 * @param options.report - If true, calls reportError for logging (default: false)
 * @param options.fallback - Custom fallback message (default: 'Something went wrong')
 * @returns A user-friendly string, or null when there is no error
 */
export function useApiError(
  error: Error | null | undefined,
  options?: { report?: boolean; fallback?: string },
): string | null {
  const report = options?.report ?? false
  const fallback = options?.fallback ?? 'Something went wrong'

  return useMemo(() => {
    if (!error) return null

    if (report) {
      reportError(error, 'useApiError')
    }

    if (error instanceof ApiError) {
      // Network-level failures (status 0) get the service-specific label
      // e.g. "BlueBubbles unreachable", "Database unavailable"
      if (error.status === 0) {
        return error.serviceLabel
      }
      // HTTP errors: show status + service context
      // e.g. "API 502 — OpenClaw unreachable"
      return `API ${error.status} — ${error.serviceLabel}`
    }

    // Non-API errors: use the message if it looks meaningful, otherwise fallback
    if (error.message && error.message !== 'Error') {
      return error.message
    }

    return fallback
  }, [error, report, fallback])
}
