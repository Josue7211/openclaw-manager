/*
 * Thin clawctrl adapter around T3 Code apps/web/src/threadRoutes.ts
 * (MIT License). clawctrl still accepts the legacy `?session=` gateway
 * key, but active chat navigation now also stamps and resolves T3-style
 * scoped thread params: `environmentId` + `threadId`.
 */

import {
  buildThreadRouteParams,
  resolveThreadRouteTarget,
  scopeThreadRef,
} from '@/vendor/t3/project/threadRoutes'

export interface ThreadRouteSessionLike {
  key: string
  environmentId?: string
  [key: string]: unknown
}

const DEFAULT_ENVIRONMENT_ID = 'local'

function compactString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function environmentIdForThreadRoute(
  session: ThreadRouteSessionLike | null | undefined,
  fallbackEnvironmentId?: string | null,
): string {
  return compactString(session?.environmentId)
    ?? compactString(fallbackEnvironmentId)
    ?? DEFAULT_ENVIRONMENT_ID
}

export function applyChatThreadRouteParams(
  params: URLSearchParams,
  input: {
    sessionKey: string
    session?: ThreadRouteSessionLike | null
    fallbackEnvironmentId?: string | null
  },
): URLSearchParams {
  const ref = scopeThreadRef(
    environmentIdForThreadRoute(input.session, input.fallbackEnvironmentId),
    input.sessionKey,
  )
  const t3Params = buildThreadRouteParams(ref)
  params.delete('new')
  params.delete('draftId')
  params.set('session', input.sessionKey)
  params.set('environmentId', t3Params.environmentId)
  params.set('threadId', t3Params.threadId)
  return params
}

export function resolveChatThreadRouteSessionKey(params: URLSearchParams): string | null {
  const target = resolveThreadRouteTarget({
    environmentId: compactString(params.get('environmentId')) ?? undefined,
    threadId: compactString(params.get('threadId')) ?? undefined,
    draftId: compactString(params.get('draftId')) ?? undefined,
  })
  if (target?.kind === 'server') return target.threadRef.threadId
  return compactString(params.get('session'))
}
