// Copied/adapted from T3 Code apps/web/src/threadRoutes.ts.
// Kept as a vendor boundary for future chat route cutover.

export interface ScopedThreadRef {
  environmentId: string
  threadId: string
}

export type ThreadRouteTarget =
  | { kind: 'server'; threadRef: ScopedThreadRef }
  | { kind: 'draft'; draftId: string }

export function scopeThreadRef(environmentId: string, threadId: string): ScopedThreadRef {
  return { environmentId, threadId }
}

export function buildThreadRouteParams(ref: ScopedThreadRef): {
  environmentId: string
  threadId: string
} {
  return {
    environmentId: ref.environmentId,
    threadId: ref.threadId,
  }
}

export function buildDraftThreadRouteParams(draftId: string): { draftId: string } {
  return { draftId }
}

export function resolveThreadRouteRef(
  params: Partial<Record<'environmentId' | 'threadId', string | undefined>>,
): ScopedThreadRef | null {
  if (!params.environmentId || !params.threadId) return null
  return scopeThreadRef(params.environmentId, params.threadId)
}

export function resolveThreadRouteTarget(
  params: Partial<Record<'environmentId' | 'threadId' | 'draftId', string | undefined>>,
): ThreadRouteTarget | null {
  if (params.environmentId && params.threadId) {
    return {
      kind: 'server',
      threadRef: scopeThreadRef(params.environmentId, params.threadId),
    }
  }

  if (!params.draftId) return null

  return {
    kind: 'draft',
    draftId: params.draftId,
  }
}
