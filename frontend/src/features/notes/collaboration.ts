import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const COLLAB_PROTOCOL = 'clawcontrol-notes-local-collab'
const COLLAB_VERSION = 1
const PEER_TTL_MS = 15_000
const PRESENCE_INTERVAL_MS = 5_000
const TRANSPORT_POLL_MS = 3_000

export type LocalCollabMessageType = 'presence' | 'leave' | 'draft' | 'operation' | 'cursor'

export interface LocalCollabPeer {
  id: string
  name: string
  seenAt: number
  cursor?: LocalCollabCursor
}

export interface LocalCollabMessage {
  protocol: typeof COLLAB_PROTOCOL
  version: typeof COLLAB_VERSION
  eventId: string
  clientId: string
  sequence: number
  type: LocalCollabMessageType
  documentId: string
  peer: LocalCollabPeer
  content?: string
  baseChecksum?: string
  contentChecksum?: string
  operations?: LocalTextOperation[]
  crdtOperations?: LocalCrdtOperation[]
  richOperations?: LocalRichTextOperation[]
  cursor?: LocalCollabCursor
  updatedAt: number
}

export interface LocalCollabCursor {
  anchor: number
  head: number
  updatedAt: number
}

export interface LocalTextOperation {
  id: string
  baseChecksum: string
  baseStart: number
  baseEnd: number
  insert: string
  checksum: string
}

export interface LocalCrdtCharacter {
  id: string
  afterId: string | null
  value: string
  deleted?: boolean
}

export type LocalCrdtOperation =
  | { type: 'insert'; id: string; afterId: string | null; value: string }
  | { type: 'delete'; id: string }

export interface LocalRichTextBlock {
  id: string
  afterId: string | null
  type: 'heading' | 'paragraph' | 'list' | 'taskList' | 'table' | 'quote' | 'code' | 'horizontalRule'
  markdown: string
  deleted?: boolean
}

export type LocalRichTextOperation =
  | { type: 'insert'; id: string; afterId: string | null; blockType: LocalRichTextBlock['type']; markdown: string }
  | { type: 'update'; id: string; blockType: LocalRichTextBlock['type']; markdown: string }
  | {
      type: 'mark'
      id: string
      mark: 'bold' | 'italic' | 'code' | 'link' | 'strike' | 'underline' | 'highlight' | 'color'
      textStart: number
      textEnd: number
      href?: string
      color?: string
    }
  | { type: 'tableCell'; id: string; row: number; column: number; markdown: string }
  | { type: 'tableRow'; id: string; index: number; cells: string[] }
  | { type: 'tableRowDelete'; id: string; index: number; cells: string[] }
  | { type: 'tableColumn'; id: string; index: number; cells: string[] }
  | { type: 'tableColumnDelete'; id: string; index: number; cells: string[] }
  | { type: 'listItem'; id: string; index: number; markdown: string }
  | { type: 'listItemInsert'; id: string; index: number; markdown: string }
  | { type: 'listItemDelete'; id: string; index: number; markdown: string }
  | { type: 'line'; id: string; index: number; markdown: string }
  | { type: 'lineInsert'; id: string; index: number; markdown: string }
  | { type: 'lineDelete'; id: string; index: number; markdown: string }
  | { type: 'delete'; id: string }

export interface LocalCollabDraft {
  id: string
  clientId?: string
  sequence?: number
  peer: LocalCollabPeer
  content: string
  baseChecksum: string
  contentChecksum: string
  operations?: LocalTextOperation[]
  crdtOperations?: LocalCrdtOperation[]
  richOperations?: LocalRichTextOperation[]
  source?: 'draft' | 'operation'
  updatedAt: number
}

export type LocalCollabMergeResult =
  | { status: 'same'; content: string }
  | { status: 'apply-remote'; content: string }
  | { status: 'merge-remote'; content: string }
  | { status: 'keep-local'; content: string }
  | { status: 'conflict'; content: string; remoteContent: string }

export interface LocalCollabTransport {
  publish: (message: LocalCollabMessage) => Promise<void>
  list: (documentId: string, since: number) => Promise<LocalCollabMessage[]>
  getCrdtState?: (documentId: string) => Promise<LocalCrdtState | null>
  saveCrdtState?: (state: LocalCrdtState) => Promise<void>
}

export interface LocalCollabTransportProvider {
  id: string
  transport: LocalCollabTransport
}

export interface LocalCollabTransportStatus {
  id: string
  ok: boolean
  lastError?: string
  lastPublishedAt?: number
  lastListedAt?: number
  lastCrdtStateAt?: number
  pendingMirrorCount?: number
}

export interface LayeredLocalCollabTransport extends LocalCollabTransport {
  status: () => LocalCollabTransportStatus[]
}

export type LocalCollabProviderSummaryState = 'ready' | 'waiting' | 'degraded' | 'offline'

export interface LocalCollabProviderSummary {
  state: LocalCollabProviderSummaryState
  label: string
  detail: string
  activeProviders: number
  failingProviders: number
}

export interface LocalCrdtState {
  documentId: string
  characters: LocalCrdtCharacter[]
  checksum: string
  clientId?: string | null
  sequence: number
  updatedAt: number
}

export function localCollabChannelName(documentId: string): string {
  return `clawcontrol-notes:${documentId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)}`
}

export function summarizeLocalCollabProviderStatuses(
  statuses: LocalCollabTransportStatus[],
): LocalCollabProviderSummary {
  if (statuses.length === 0) {
    return {
      state: 'waiting',
      label: 'Collab waiting',
      detail: 'No collaboration providers are configured for this note.',
      activeProviders: 0,
      failingProviders: 0,
    }
  }

  const failing = statuses.filter(status => !status.ok)
  const active = statuses.filter(status => status.ok && collabProviderHasActivity(status))
  const inactiveOk = statuses.filter(status => status.ok && !collabProviderHasActivity(status))
  const pendingMirrorCount = statuses.reduce((total, status) => total + (status.pendingMirrorCount ?? 0), 0)
  if (failing.length === statuses.length) {
    return {
      state: 'offline',
      label: 'Collab offline',
      detail: `All providers need attention: ${failing.map(collabProviderIssueLabel).join(', ')}`,
      activeProviders: active.length,
      failingProviders: failing.length,
    }
  }
  if (failing.length > 0) {
    return {
      state: 'degraded',
      label: 'Collab degraded',
      detail: `${failing.map(collabProviderIssueLabel).join(', ')}. ${
        pendingMirrorCount > 0
          ? `${pendingMirrorCount} event${pendingMirrorCount === 1 ? '' : 's'} queued for mirror. `
          : ''
      }Local saves still stay protected.`,
      activeProviders: active.length,
      failingProviders: failing.length,
    }
  }
  if (pendingMirrorCount > 0) {
    return {
      state: 'waiting',
      label: 'Collab catching up',
      detail: `${pendingMirrorCount} event${pendingMirrorCount === 1 ? '' : 's'} still mirroring to paired providers. Local saves still stay protected.`,
      activeProviders: active.length,
      failingProviders: 0,
    }
  }
  if (active.length > 0 && inactiveOk.length > 0) {
    return {
      state: 'waiting',
      label: 'Collab pending',
      detail: `${active.length}/${statuses.length} provider${statuses.length === 1 ? '' : 's'} active; waiting on ${inactiveOk.map(status => status.id).join(', ')}. Local saves still stay protected.`,
      activeProviders: active.length,
      failingProviders: 0,
    }
  }
  if (active.length === 0) {
    return {
      state: 'waiting',
      label: 'Collab idle',
      detail: `${statuses.length} provider${statuses.length === 1 ? '' : 's'} configured, waiting for document activity.`,
      activeProviders: 0,
      failingProviders: 0,
    }
  }
  if (active.length === 1 && statuses.length === 1 && collabProviderIsLocal(active[0])) {
    return {
      state: 'ready',
      label: 'Local saved',
      detail: 'Local SQLite collaboration log is active. Remote sync is not configured.',
      activeProviders: 1,
      failingProviders: 0,
    }
  }
  return {
    state: 'ready',
    label: 'Collab ready',
    detail: `${active.length}/${statuses.length} provider${statuses.length === 1 ? '' : 's'} active.`,
    activeProviders: active.length,
    failingProviders: 0,
  }
}

export function orderLocalCollabMessages(messages: LocalCollabMessage[]): LocalCollabMessage[] {
  return [...messages].sort(compareLocalCollabMessages)
}

export function createLayeredLocalCollabTransport(
  providers: LocalCollabTransportProvider[],
): LayeredLocalCollabTransport {
  const safeProviders = providers.filter(provider => provider.id.trim())
  const cursors = new Map<string, Map<string, number>>()
  const statuses = new Map<string, LocalCollabTransportStatus>()
  const knownEvents = new Map<string, Set<string>>()
  const pendingMirrorEvents = new Map<string, Map<string, LocalCollabMessage>>()
  safeProviders.forEach(provider => {
    statuses.set(provider.id, { id: provider.id, ok: true })
    knownEvents.set(provider.id, new Set())
  })

  const updateStatus = (id: string, patch: Partial<LocalCollabTransportStatus>) => {
    statuses.set(id, {
      id,
      ok: patch.lastError ? false : true,
      ...statuses.get(id),
      ...patch,
    })
  }

  const updatePendingMirrorStatuses = () => {
    for (const provider of safeProviders) {
      const known = knownEvents.get(provider.id) ?? new Set<string>()
      let pendingMirrorCount = 0
      for (const pending of pendingMirrorEvents.values()) {
        for (const eventId of pending.keys()) {
          if (!known.has(eventId)) pendingMirrorCount += 1
        }
      }
      updateStatus(provider.id, { pendingMirrorCount })
    }
  }

  const providerSince = (providerId: string, documentId: string, fallback: number) => {
    return cursors.get(providerId)?.get(documentId) ?? fallback
  }

  const updateProviderCursor = (providerId: string, documentId: string, events: LocalCollabMessage[]) => {
    if (events.length === 0) return
    const nextSince = Math.max(...events.map(event => event.updatedAt))
    const providerCursors = cursors.get(providerId) ?? new Map<string, number>()
    providerCursors.set(documentId, Math.max(providerCursors.get(documentId) ?? 0, nextSince))
    cursors.set(providerId, providerCursors)
  }

  const markProviderEventsKnown = (providerId: string, events: LocalCollabMessage[]) => {
    if (events.length === 0) return
    const known = knownEvents.get(providerId) ?? new Set<string>()
    events.forEach(event => known.add(event.eventId))
    knownEvents.set(providerId, known)
    updatePendingMirrorStatuses()
  }

  const queuePendingMirrorEvent = (event: LocalCollabMessage) => {
    const pending = pendingMirrorEvents.get(event.documentId) ?? new Map<string, LocalCollabMessage>()
    pending.set(event.eventId, event)
    pendingMirrorEvents.set(event.documentId, pending)
    updatePendingMirrorStatuses()
  }

  const pendingMirrorCandidates = (documentId: string, events: LocalCollabMessage[]) => {
    const byEventId = new Map<string, LocalCollabMessage>()
    for (const event of orderLocalCollabMessages([...(pendingMirrorEvents.get(documentId)?.values() ?? []), ...events])) {
      byEventId.set(event.eventId, event)
    }
    return orderLocalCollabMessages([...byEventId.values()])
  }

  const prunePendingMirrorEvents = (documentId: string) => {
    const pending = pendingMirrorEvents.get(documentId)
    if (!pending) return
    for (const eventId of [...pending.keys()]) {
      if (safeProviders.every(provider => knownEvents.get(provider.id)?.has(eventId))) {
        pending.delete(eventId)
      }
    }
    if (pending.size === 0) pendingMirrorEvents.delete(documentId)
    updatePendingMirrorStatuses()
  }

  return {
    async publish(message) {
      const results = await Promise.allSettled(
        safeProviders.map(async provider => {
          await provider.transport.publish(message)
          markProviderEventsKnown(provider.id, [message])
          updateStatus(provider.id, { ok: true, lastError: undefined, lastPublishedAt: Date.now() })
        }),
      )
      const failures: PromiseRejectedResult[] = []
      results.forEach((result, index) => {
        if (result.status !== 'rejected') return
        failures.push(result)
        const provider = safeProviders[index]
        if (!provider) return
        updateStatus(provider.id, { ok: false, lastError: collabErrorMessage(result.reason) })
      })
      if (failures.length === safeProviders.length && failures.length > 0) {
        throw new Error(
          `All collaboration providers failed: ${failures.map(failure => collabErrorMessage(failure.reason)).join('; ')}`,
        )
      }
      if (failures.length === 0) {
        safeProviders.forEach(provider => updateProviderCursor(provider.id, message.documentId, [message]))
      } else {
        queuePendingMirrorEvent(message)
      }
    },
    async list(documentId, since) {
      const results = await Promise.allSettled(
        safeProviders.map(async provider => {
          const sinceForProvider = providerSince(provider.id, documentId, since)
          const events = (await provider.transport.list(documentId, sinceForProvider)).filter(
            event => event.updatedAt > sinceForProvider,
          )
          markProviderEventsKnown(provider.id, events)
          updateProviderCursor(provider.id, documentId, events)
          updateStatus(provider.id, { ok: true, lastError: undefined, lastListedAt: Date.now() })
          return events
        }),
      )
      const events: LocalCollabMessage[] = []
      const readableProviders: LocalCollabTransportProvider[] = []
      results.forEach((result, index) => {
        const provider = safeProviders[index]
        if (!provider) return
        if (result.status === 'fulfilled') {
          readableProviders.push(provider)
          events.push(...result.value)
        } else {
          updateStatus(provider.id, { ok: false, lastError: collabErrorMessage(result.reason) })
        }
      })
      const byEventId = new Map<string, LocalCollabMessage>()
      for (const event of orderLocalCollabMessages(events)) {
        byEventId.set(event.eventId, event)
      }
      const orderedEvents = orderLocalCollabMessages([...byEventId.values()])
      await mirrorLocalCollabEvents(
        readableProviders,
        knownEvents,
        pendingMirrorCandidates(documentId, orderedEvents),
        updateStatus,
        markProviderEventsKnown,
      )
      prunePendingMirrorEvents(documentId)
      return orderedEvents
    },
    async getCrdtState(documentId) {
      const providersWithState = safeProviders.filter(provider => provider.transport.getCrdtState)
      const results = await Promise.allSettled(
        providersWithState.map(async provider => {
          const state = await provider.transport.getCrdtState?.(documentId)
          updateStatus(provider.id, { ok: true, lastError: undefined, lastCrdtStateAt: Date.now() })
          return state
        }),
      )
      const states: LocalCrdtState[] = []
      results.forEach((result, index) => {
        const provider = providersWithState[index]
        if (result.status === 'fulfilled') {
          if (result.value) states.push(result.value)
        } else {
          if (provider) updateStatus(provider.id, { ok: false, lastError: collabErrorMessage(result.reason) })
        }
      })
      const newest = states.sort(compareLocalCrdtStateFreshness)[0] ?? null
      if (newest) {
        await mirrorLocalCollabCrdtState(providersWithState, results, newest, updateStatus)
      }
      return newest
    },
    async saveCrdtState(state) {
      const providersWithState = safeProviders.filter(provider => provider.transport.saveCrdtState)
      const results = await Promise.allSettled(
        providersWithState.map(async provider => {
          await provider.transport.saveCrdtState?.(state)
          updateStatus(provider.id, { ok: true, lastError: undefined, lastCrdtStateAt: Date.now() })
        }),
      )
      const failures: PromiseRejectedResult[] = []
      results.forEach((result, index) => {
        if (result.status !== 'rejected') return
        failures.push(result)
        const provider = providersWithState[index]
        if (!provider) return
        updateStatus(provider.id, { ok: false, lastError: collabErrorMessage(result.reason) })
      })
      if (failures.length === providersWithState.length && failures.length > 0) {
        throw new Error(
          `All collaboration CRDT state providers failed: ${failures.map(failure => collabErrorMessage(failure.reason)).join('; ')}`,
        )
      }
    },
    status() {
      return [...statuses.values()]
    },
  }
}

export function compareLocalCollabMessages(left: LocalCollabMessage, right: LocalCollabMessage): number {
  return (
    left.sequence - right.sequence ||
    left.clientId.localeCompare(right.clientId) ||
    left.updatedAt - right.updatedAt ||
    left.eventId.localeCompare(right.eventId)
  )
}

function compareLocalCrdtStateFreshness(left: LocalCrdtState, right: LocalCrdtState): number {
  return (
    right.sequence - left.sequence ||
    right.updatedAt - left.updatedAt ||
    (right.clientId ?? '').localeCompare(left.clientId ?? '') ||
    right.checksum.localeCompare(left.checksum)
  )
}

async function mirrorLocalCollabEvents(
  providers: LocalCollabTransportProvider[],
  knownEvents: Map<string, Set<string>>,
  events: LocalCollabMessage[],
  updateStatus: (id: string, patch: Partial<LocalCollabTransportStatus>) => void,
  markProviderEventsKnown: (providerId: string, events: LocalCollabMessage[]) => void,
) {
  if (providers.length < 2 || events.length === 0) return
  await Promise.allSettled(
    providers.map(async provider => {
      const known = knownEvents.get(provider.id) ?? new Set<string>()
      const missing = events.filter(event => !known.has(event.eventId))
      if (missing.length === 0) return
      const results = await Promise.allSettled(missing.map(event => provider.transport.publish(event)))
      const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failure) {
        updateStatus(provider.id, { ok: false, lastError: collabErrorMessage(failure.reason) })
        return
      }
      markProviderEventsKnown(provider.id, missing)
      updateStatus(provider.id, { ok: true, lastError: undefined, lastPublishedAt: Date.now() })
    }),
  )
}

async function mirrorLocalCollabCrdtState(
  providers: LocalCollabTransportProvider[],
  results: PromiseSettledResult<LocalCrdtState | null | undefined>[],
  newest: LocalCrdtState,
  updateStatus: (id: string, patch: Partial<LocalCollabTransportStatus>) => void,
) {
  await Promise.allSettled(
    providers.map(async (provider, index) => {
      if (!provider.transport.saveCrdtState) return
      const result = results[index]
      const current = result?.status === 'fulfilled' ? result.value ?? null : null
      const isCurrent =
        current &&
        current.checksum === newest.checksum &&
        current.sequence >= newest.sequence &&
        current.updatedAt >= newest.updatedAt
      if (isCurrent) return
      try {
        await provider.transport.saveCrdtState(newest)
        updateStatus(provider.id, { ok: true, lastError: undefined, lastCrdtStateAt: Date.now() })
      } catch (error) {
        updateStatus(provider.id, { ok: false, lastError: collabErrorMessage(error) })
      }
    }),
  )
}

export function buildLocalCollabMessage(
  type: LocalCollabMessageType,
  documentId: string,
  peer: LocalCollabPeer,
  content?: string,
  baseContent = '',
  cursor?: LocalCollabCursor,
): LocalCollabMessage {
  const now = Date.now()
  const baseChecksum = content === undefined ? undefined : collaborationChecksum(baseContent)
  const contentChecksum = content === undefined ? undefined : collaborationChecksum(content)
  return {
    protocol: COLLAB_PROTOCOL,
    version: COLLAB_VERSION,
    eventId: localCollabEventId(),
    clientId: peer.id,
    sequence: now,
    type,
    documentId,
    peer: { ...peer, seenAt: now },
    content,
    baseChecksum,
    contentChecksum,
    operations: content === undefined ? undefined : buildLocalTextOperations(baseContent, content),
    cursor,
    updatedAt: now,
  }
}

export function isLocalCollabMessage(value: unknown, documentId: string): value is LocalCollabMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<LocalCollabMessage>
  return (
    message.protocol === COLLAB_PROTOCOL &&
    message.version === COLLAB_VERSION &&
    typeof message.eventId === 'string' &&
    message.eventId.length > 0 &&
    typeof message.clientId === 'string' &&
    message.clientId.length > 0 &&
    typeof message.sequence === 'number' &&
    Number.isInteger(message.sequence) &&
    message.sequence >= 0 &&
    (message.type === 'presence' ||
      message.type === 'leave' ||
      message.type === 'draft' ||
      message.type === 'operation' ||
      message.type === 'cursor') &&
    message.documentId === documentId &&
    !!message.peer &&
    typeof message.peer.id === 'string' &&
    typeof message.peer.name === 'string' &&
    typeof message.peer.seenAt === 'number' &&
    ((message.type !== 'draft' && message.type !== 'operation') ||
      (typeof message.content === 'string' &&
        typeof message.baseChecksum === 'string' &&
        typeof message.contentChecksum === 'string' &&
        (message.type !== 'operation' ||
          ((message.operations !== undefined &&
            isLocalTextOperationList(message.operations, message.baseChecksum) &&
            message.operations.length > 0) ||
            (message.crdtOperations !== undefined &&
              isLocalCrdtOperationList(message.crdtOperations) &&
              message.crdtOperations.length > 0) ||
            (message.richOperations !== undefined &&
              isLocalRichTextOperationList(message.richOperations) &&
              message.richOperations.length > 0))) &&
        (message.operations === undefined || isLocalTextOperationList(message.operations, message.baseChecksum)) &&
        (message.crdtOperations === undefined || isLocalCrdtOperationList(message.crdtOperations)) &&
        (message.richOperations === undefined || isLocalRichTextOperationList(message.richOperations)))) &&
    (message.type !== 'cursor' || isLocalCollabCursor(message.cursor)) &&
    (message.cursor === undefined || isLocalCollabCursor(message.cursor)) &&
    typeof message.updatedAt === 'number'
  )
}

export function collaborationChecksum(content: string): string {
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function mergeLocalCollabDraft(
  localContent: string,
  localBaseContent: string,
  draft: LocalCollabDraft,
): LocalCollabMergeResult {
  const localChecksum = collaborationChecksum(localContent)
  const localBaseChecksum = collaborationChecksum(localBaseContent)
  if (localChecksum === draft.contentChecksum) return { status: 'same', content: localContent }
  if (localChecksum === draft.baseChecksum || localChecksum === localBaseChecksum) {
    return { status: 'apply-remote', content: draft.content }
  }
  if (draft.contentChecksum === localBaseChecksum) return { status: 'keep-local', content: localContent }
  const richMerged = mergeLocalRichTextOperationDraft(localBaseContent, localContent, draft)
  if (richMerged) return { status: 'merge-remote', content: richMerged }
  const crdtMerged = mergeLocalCrdtOperationDraft(localBaseContent, localContent, draft)
  if (crdtMerged) return { status: 'merge-remote', content: crdtMerged }
  const operationMerged = mergeLocalTextOperationDraft(localBaseContent, localContent, draft)
  if (operationMerged) return { status: 'merge-remote', content: operationMerged }
  const merged = mergeNonOverlappingLineChanges(localBaseContent, localContent, draft.content)
  if (merged) return { status: 'merge-remote', content: merged }
  return { status: 'conflict', content: localContent, remoteContent: draft.content }
}

export function autoMergeLocalCollabOperation(
  localContent: string,
  localBaseContent: string,
  draft: LocalCollabDraft,
): LocalCollabMergeResult | null {
  if (draft.source !== 'operation') return null
  const result = mergeLocalCollabDraft(localContent, localBaseContent, draft)
  return result.status === 'conflict' ? null : result
}

export function buildLocalTextOperations(baseContent: string, nextContent: string): LocalTextOperation[] {
  const range = changedTextRange(baseContent, nextContent)
  if (!range) return []
  const baseChecksum = collaborationChecksum(baseContent)
  const insert = nextContent.slice(range.nextStart, range.nextEnd)
  const checksum = collaborationChecksum(`${baseChecksum}:${range.baseStart}:${range.baseEnd}:${insert}`)
  return [
    {
      id: `op-${checksum}`,
      baseChecksum,
      baseStart: range.baseStart,
      baseEnd: range.baseEnd,
      insert,
      checksum,
    },
  ]
}

export function applyLocalTextOperations(baseContent: string, operations: LocalTextOperation[]): string | null {
  if (operations.some(operation => operation.baseChecksum !== collaborationChecksum(baseContent))) return null
  const sorted = [...operations].sort((a, b) => a.baseStart - b.baseStart || a.id.localeCompare(b.id))
  for (let index = 1; index < sorted.length; index += 1) {
    if (textOperationsConflict(sorted[index - 1], sorted[index])) return null
  }

  let offset = 0
  let result = baseContent
  for (const operation of sorted) {
    const start = operation.baseStart + offset
    const end = operation.baseEnd + offset
    result = `${result.slice(0, start)}${operation.insert}${result.slice(end)}`
    offset += operation.insert.length - (operation.baseEnd - operation.baseStart)
  }
  return result
}

export function localCrdtDocumentFromText(content: string, clientId = 'base'): LocalCrdtCharacter[] {
  const safeClientId = safeCrdtIdPart(clientId)
  let afterId: string | null = null
  return Array.from(content).map((value, index) => {
    const id = `m:${safeClientId}:${index.toString(36).padStart(6, '0')}`
    const character = { id, afterId, value }
    afterId = id
    return character
  })
}

export function readLocalCrdtText(document: LocalCrdtCharacter[]): string {
  return orderLocalCrdtCharacters(document)
    .filter(character => !character.deleted)
    .map(character => character.value)
    .join('')
}

export function buildLocalCrdtInsertOperations(
  document: LocalCrdtCharacter[],
  index: number,
  text: string,
  clientId: string,
  sequence: number,
): LocalCrdtOperation[] {
  const visible = orderLocalCrdtCharacters(document).filter(character => !character.deleted)
  const safeIndex = Math.max(0, Math.min(Math.floor(index), visible.length))
  const safeClientId = safeCrdtIdPart(clientId)
  let afterId = safeIndex === 0 ? null : visible[safeIndex - 1]?.id ?? null
  return Array.from(text).map((value, offset) => {
    const id = `crdt:${safeClientId}:${sequence.toString(36)}:${offset.toString(36)}`
    const operation: LocalCrdtOperation = { type: 'insert', id, afterId, value }
    afterId = id
    return operation
  })
}

export function buildLocalCrdtDeleteOperations(
  document: LocalCrdtCharacter[],
  start: number,
  end: number,
): LocalCrdtOperation[] {
  const visible = orderLocalCrdtCharacters(document).filter(character => !character.deleted)
  const safeStart = Math.max(0, Math.min(Math.floor(start), visible.length))
  const safeEnd = Math.max(safeStart, Math.min(Math.floor(end), visible.length))
  return visible.slice(safeStart, safeEnd).map(character => ({ type: 'delete', id: character.id }))
}

export function buildLocalCrdtOperations(
  baseContent: string,
  nextContent: string,
  clientId: string,
  sequence: number,
): LocalCrdtOperation[] {
  return buildLocalCrdtOperationsFromDocument(localCrdtDocumentFromText(baseContent), baseContent, nextContent, clientId, sequence)
}

export function buildLocalCrdtOperationsFromDocument(
  document: LocalCrdtCharacter[],
  baseContent: string,
  nextContent: string,
  clientId: string,
  sequence: number,
): LocalCrdtOperation[] {
  const range = changedTextRange(baseContent, nextContent)
  if (!range) return []
  const deleted = buildLocalCrdtDeleteOperations(document, range.baseStart, range.baseEnd)
  const insertedText = nextContent.slice(range.nextStart, range.nextEnd)
  const inserted =
    insertedText.length === 0
      ? []
      : buildLocalCrdtInsertOperations(document, range.baseStart, insertedText, clientId, sequence)
  return [...deleted, ...inserted]
}

export function applyLocalCrdtOperations(
  document: LocalCrdtCharacter[],
  operations: LocalCrdtOperation[],
): LocalCrdtCharacter[] {
  const next = new Map<string, LocalCrdtCharacter>()
  document.forEach(character => {
    next.set(character.id, { ...character })
  })

  const inserts = operations
    .filter((operation): operation is Extract<LocalCrdtOperation, { type: 'insert' }> => operation.type === 'insert')
    .sort(compareLocalCrdtOperations)
  inserts.forEach(operation => {
    if (next.has(operation.id)) return
    next.set(operation.id, {
      id: operation.id,
      afterId: operation.afterId,
      value: operation.value,
    })
  })

  const deletes = operations.filter(
    (operation): operation is Extract<LocalCrdtOperation, { type: 'delete' }> => operation.type === 'delete',
  )
  deletes.forEach(operation => {
    const character = next.get(operation.id)
    if (character) character.deleted = true
  })

  return Array.from(next.values()).filter(character => character.afterId === null || next.has(character.afterId))
}

export function mergeLocalCrdtOperationSets(
  document: LocalCrdtCharacter[],
  operationSets: LocalCrdtOperation[][],
): LocalCrdtCharacter[] {
  const operations = operationSets.flat().sort(compareLocalCrdtOperations)
  return applyLocalCrdtOperations(document, operations)
}

export function compareLocalCrdtOperations(left: LocalCrdtOperation, right: LocalCrdtOperation): number {
  return left.id.localeCompare(right.id) || left.type.localeCompare(right.type)
}

export function mergeLocalCrdtOperationDraft(
  localBaseContent: string,
  localContent: string,
  draft: LocalCollabDraft,
): string | null {
  if (!draft.crdtOperations || draft.crdtOperations.length === 0) return null
  const baseChecksum = collaborationChecksum(localBaseContent)
  if (draft.baseChecksum !== baseChecksum) return null

  const baseDocument = localCrdtDocumentFromText(localBaseContent)
  const remoteFromCrdt = readLocalCrdtText(applyLocalCrdtOperations(baseDocument, draft.crdtOperations))
  if (remoteFromCrdt !== draft.content) return null

  const localOperations = buildLocalCrdtOperations(localBaseContent, localContent, 'local', 0)
  if (localOperations.length === 0) return draft.content

  return readLocalCrdtText(mergeLocalCrdtOperationSets(baseDocument, [localOperations, draft.crdtOperations]))
}

export function localRichTextDocumentFromMarkdown(content: string, clientId = 'base'): LocalRichTextBlock[] {
  const safeClientId = safeCrdtIdPart(clientId)
  let afterId: string | null = null
  return splitMarkdownBlocks(content).map((markdown, index) => {
    const id = `block:${safeClientId}:${index.toString(36).padStart(4, '0')}:${collaborationChecksum(markdown)}`
    const block: LocalRichTextBlock = {
      id,
      afterId,
      type: richTextBlockType(markdown),
      markdown,
    }
    afterId = id
    return block
  })
}

export function readLocalRichTextMarkdown(document: LocalRichTextBlock[]): string {
  return orderLocalRichTextBlocks(document)
    .filter(block => !block.deleted)
    .map(block => block.markdown)
    .join('\n\n')
}

export function buildLocalRichTextOperations(
  baseContent: string,
  nextContent: string,
  clientId: string,
  sequence: number,
): LocalRichTextOperation[] {
  return buildLocalRichTextOperationsFromDocument(
    localRichTextDocumentFromMarkdown(baseContent),
    nextContent,
    clientId,
    sequence,
  )
}

export function buildLocalRichTextOperationsFromDocument(
  document: LocalRichTextBlock[],
  nextContent: string,
  clientId: string,
  sequence: number,
): LocalRichTextOperation[] {
  const baseBlocks = orderLocalRichTextBlocks(document).filter(block => !block.deleted)
  const nextBlocks = splitMarkdownBlocks(nextContent)
  const range = changedBlockRange(baseBlocks.map(block => block.markdown), nextBlocks)
  if (!range) return []
  const removed = baseBlocks.slice(range.baseStart, range.baseEnd)
  const inserted = nextBlocks.slice(range.nextStart, range.nextEnd)
  if (removed.length === inserted.length) {
    return removed.flatMap((block, index): LocalRichTextOperation[] => {
      const markdown = inserted[index] ?? ''
      if (!markdown || block.markdown === markdown) return []
      const markOperations = buildLocalRichTextMarkOperations(block, markdown)
      if (markOperations) return markOperations
      const tableCellOperations = buildLocalRichTextTableCellOperations(block, markdown)
      if (tableCellOperations) return tableCellOperations
      const tableRowOperations = buildLocalRichTextTableRowOperations(block, markdown)
      if (tableRowOperations) return tableRowOperations
      const tableRowDeleteOperations = buildLocalRichTextTableRowDeleteOperations(block, markdown)
      if (tableRowDeleteOperations) return tableRowDeleteOperations
      const tableColumnOperations = buildLocalRichTextTableColumnOperations(block, markdown)
      if (tableColumnOperations) return tableColumnOperations
      const tableColumnDeleteOperations = buildLocalRichTextTableColumnDeleteOperations(block, markdown)
      if (tableColumnDeleteOperations) return tableColumnDeleteOperations
      const listItemOperations = buildLocalRichTextListItemOperations(block, markdown)
      if (listItemOperations) return listItemOperations
      const listItemInsertOperations = buildLocalRichTextListItemInsertOperations(block, markdown)
      if (listItemInsertOperations) return listItemInsertOperations
      const listItemDeleteOperations = buildLocalRichTextListItemDeleteOperations(block, markdown)
      if (listItemDeleteOperations) return listItemDeleteOperations
      const lineOperations = buildLocalRichTextLineOperations(block, markdown)
      if (lineOperations) return lineOperations
      const lineInsertOperations = buildLocalRichTextLineInsertOperations(block, markdown)
      if (lineInsertOperations) return lineInsertOperations
      const lineDeleteOperations = buildLocalRichTextLineDeleteOperations(block, markdown)
      if (lineDeleteOperations) return lineDeleteOperations
      return [{ type: 'update', id: block.id, blockType: richTextBlockType(markdown), markdown }]
    })
  }

  const operations: LocalRichTextOperation[] = removed.map(block => ({ type: 'delete', id: block.id }))
  const safeClientId = safeCrdtIdPart(clientId)
  let afterId = range.baseStart === 0 ? null : baseBlocks[range.baseStart - 1]?.id ?? null
  inserted.forEach((markdown, index) => {
    const id = `block:${safeClientId}:${sequence.toString(36)}:${index.toString(36)}:${collaborationChecksum(markdown)}`
    operations.push({ type: 'insert', id, afterId, blockType: richTextBlockType(markdown), markdown })
    afterId = id
  })
  return operations
}

export function applyLocalRichTextOperations(
  document: LocalRichTextBlock[],
  operations: LocalRichTextOperation[],
): LocalRichTextBlock[] {
  const next = new Map<string, LocalRichTextBlock>()
  document.forEach(block => {
    next.set(block.id, { ...block })
  })

  operations
    .filter((operation): operation is Extract<LocalRichTextOperation, { type: 'insert' }> => operation.type === 'insert')
    .sort(compareLocalRichTextOperations)
    .forEach(operation => {
      if (next.has(operation.id)) return
      next.set(operation.id, {
        id: operation.id,
        afterId: operation.afterId,
        type: operation.blockType,
        markdown: operation.markdown,
      })
    })

  operations.forEach(operation => {
    const block = next.get(operation.id)
    if (!block) return
    if (operation.type === 'delete') {
      block.deleted = true
    } else if (operation.type === 'update') {
      block.type = operation.blockType
      block.markdown = operation.markdown
    }
  })

  const marksByBlock = new Map<string, Extract<LocalRichTextOperation, { type: 'mark' }>[]>()
  operations.forEach(operation => {
    if (operation.type !== 'mark') return
    const marks = marksByBlock.get(operation.id) ?? []
    marks.push(operation)
    marksByBlock.set(operation.id, marks)
  })
  marksByBlock.forEach((marks, id) => {
    const block = next.get(id)
    if (!block || block.deleted) return
    const marked = applyRichTextMarks(block.markdown, marks)
    block.markdown = marked
    block.type = richTextBlockType(marked)
  })

  const tableCellsByBlock = new Map<string, Extract<LocalRichTextOperation, { type: 'tableCell' }>[]>()
  operations.forEach(operation => {
    if (operation.type !== 'tableCell') return
    const cells = tableCellsByBlock.get(operation.id) ?? []
    cells.push(operation)
    tableCellsByBlock.set(operation.id, cells)
  })
  tableCellsByBlock.forEach((cells, id) => {
    const block = next.get(id)
    if (!block || block.deleted) return
    const table = applyRichTextTableCellOperations(block.markdown, cells)
    if (!table) return
    block.markdown = table
    block.type = richTextBlockType(table)
  })

  const tableRowsByBlock = new Map<string, Array<Extract<LocalRichTextOperation, { type: 'tableRow' | 'tableRowDelete' }>>>()
  operations.forEach(operation => {
    if (operation.type !== 'tableRow' && operation.type !== 'tableRowDelete') return
    const rows = tableRowsByBlock.get(operation.id) ?? []
    rows.push(operation)
    tableRowsByBlock.set(operation.id, rows)
  })
  const tableColumnsByBlock = new Map<string, Array<Extract<LocalRichTextOperation, { type: 'tableColumn' | 'tableColumnDelete' }>>>()
  operations.forEach(operation => {
    if (operation.type !== 'tableColumn' && operation.type !== 'tableColumnDelete') return
    const columns = tableColumnsByBlock.get(operation.id) ?? []
    columns.push(operation)
    tableColumnsByBlock.set(operation.id, columns)
  })
  const tableStructuralIds = new Set([...tableRowsByBlock.keys(), ...tableColumnsByBlock.keys()])
  tableStructuralIds.forEach(id => {
    const block = next.get(id)
    if (!block || block.deleted) return
    const rows = tableRowsByBlock.get(id) ?? []
    const columns = tableColumnsByBlock.get(id) ?? []
    let table: string | null = null
    if (rows.length > 0 && columns.length > 0) {
      table = applyRichTextTableRowColumnStructuralOperations(block.markdown, rows, columns)
    } else {
      table = block.markdown
      if (rows.length > 0) table = applyRichTextTableRowOperations(table, rows) ?? table
      if (columns.length > 0) table = applyRichTextTableColumnOperations(table, columns) ?? table
    }
    if (!table || table === block.markdown) return
    block.markdown = table
    block.type = richTextBlockType(table)
  })

  const listItemsByBlock = new Map<string, Extract<LocalRichTextOperation, { type: 'listItem' }>[]>()
  operations.forEach(operation => {
    if (operation.type !== 'listItem') return
    const items = listItemsByBlock.get(operation.id) ?? []
    items.push(operation)
    listItemsByBlock.set(operation.id, items)
  })
  listItemsByBlock.forEach((items, id) => {
    const block = next.get(id)
    if (!block || block.deleted) return
    const list = applyRichTextListItemOperations(block.markdown, items)
    if (!list) return
    block.markdown = list
    block.type = richTextBlockType(list)
  })

  const listStructureByBlock = new Map<string, Array<Extract<LocalRichTextOperation, { type: 'listItemInsert' | 'listItemDelete' }>>>()
  operations.forEach(operation => {
    if (operation.type !== 'listItemInsert' && operation.type !== 'listItemDelete') return
    const structural = listStructureByBlock.get(operation.id) ?? []
    structural.push(operation)
    listStructureByBlock.set(operation.id, structural)
  })
  listStructureByBlock.forEach((structural, id) => {
    const block = next.get(id)
    if (!block || block.deleted) return
    const list = applyRichTextListStructuralOperations(block.markdown, structural)
    if (!list) return
    block.markdown = list
    block.type = richTextBlockType(list)
  })

  const linesByBlock = new Map<string, Extract<LocalRichTextOperation, { type: 'line' }>[]>()
  operations.forEach(operation => {
    if (operation.type !== 'line') return
    const lines = linesByBlock.get(operation.id) ?? []
    lines.push(operation)
    linesByBlock.set(operation.id, lines)
  })
  linesByBlock.forEach((lines, id) => {
    const block = next.get(id)
    if (!block || block.deleted) return
    const updated = applyRichTextLineOperations(block.markdown, lines)
    if (!updated) return
    block.markdown = updated
    block.type = richTextBlockType(updated)
  })

  const lineStructureByBlock = new Map<string, Array<Extract<LocalRichTextOperation, { type: 'lineInsert' | 'lineDelete' }>>>()
  operations.forEach(operation => {
    if (operation.type !== 'lineInsert' && operation.type !== 'lineDelete') return
    const structural = lineStructureByBlock.get(operation.id) ?? []
    structural.push(operation)
    lineStructureByBlock.set(operation.id, structural)
  })
  lineStructureByBlock.forEach((structural, id) => {
    const block = next.get(id)
    if (!block || block.deleted) return
    const updated = applyRichTextLineStructuralOperations(block.markdown, structural)
    if (!updated) return
    block.markdown = updated
    block.type = richTextBlockType(updated)
  })

  return Array.from(next.values()).filter(block => block.afterId === null || next.has(block.afterId))
}

export function mergeLocalRichTextOperationSets(
  document: LocalRichTextBlock[],
  operationSets: LocalRichTextOperation[][],
): LocalRichTextBlock[] | null {
  if (richTextOperationSetsConflict(operationSets)) return null
  return applyLocalRichTextOperations(document, operationSets.flat().sort(compareLocalRichTextOperations))
}

export function mergeLocalRichTextOperationDraft(
  localBaseContent: string,
  localContent: string,
  draft: LocalCollabDraft,
): string | null {
  if (!draft.richOperations || draft.richOperations.length === 0) return null
  const baseDocument = localRichTextDocumentFromMarkdown(localBaseContent)
  const remoteFromRichOps = readLocalRichTextMarkdown(applyLocalRichTextOperations(baseDocument, draft.richOperations))
  if (remoteFromRichOps !== draft.content) return null
  const localOperations = buildLocalRichTextOperationsFromDocument(baseDocument, localContent, 'local', 0)
  if (localOperations.length === 0) return draft.content
  const merged = mergeLocalRichTextOperationSets(baseDocument, [localOperations, draft.richOperations])
  return merged ? readLocalRichTextMarkdown(merged) : null
}

export function mergeLocalTextOperationDraft(
  localBaseContent: string,
  localContent: string,
  draft: LocalCollabDraft,
): string | null {
  if (!draft.operations || draft.operations.length === 0) return null
  const baseChecksum = collaborationChecksum(localBaseContent)
  if (draft.operations.some(operation => operation.baseChecksum !== baseChecksum)) return null
  const remoteFromOperations = applyLocalTextOperations(localBaseContent, draft.operations)
  if (remoteFromOperations !== draft.content) return null
  const localOperations = buildLocalTextOperations(localBaseContent, localContent)
  if (localOperations.length === 0) return draft.content
  const rebasedRemoteOperations = rebaseLocalTextOperations(localContent, draft.operations, localOperations)
  if (!rebasedRemoteOperations) return null
  return applyLocalTextOperations(localContent, rebasedRemoteOperations)
}

export function rebaseLocalTextOperations(
  currentContent: string,
  operations: LocalTextOperation[],
  throughOperations: LocalTextOperation[],
): LocalTextOperation[] | null {
  const currentChecksum = collaborationChecksum(currentContent)
  const sortedThrough = [...throughOperations].sort((a, b) => a.baseStart - b.baseStart || a.id.localeCompare(b.id))
  const rebased: LocalTextOperation[] = []
  for (const operation of operations) {
    let offset = 0
    for (const through of sortedThrough) {
      if (textOperationsConflict(through, operation)) return null
      const delta = through.insert.length - (through.baseEnd - through.baseStart)
      const sameInsertionPoint =
        through.baseStart === through.baseEnd &&
        operation.baseStart === operation.baseEnd &&
        through.baseStart === operation.baseStart
      if (through.baseEnd < operation.baseStart) {
        offset += delta
      } else if (through.baseEnd === operation.baseStart) {
        if (!sameInsertionPoint || through.id < operation.id) offset += delta
      } else if (sameInsertionPoint && through.id < operation.id) {
        offset += delta
      }
    }
    const baseStart = operation.baseStart + offset
    const baseEnd = operation.baseEnd + offset
    const checksum = collaborationChecksum(`${currentChecksum}:${baseStart}:${baseEnd}:${operation.insert}`)
    rebased.push({
      ...operation,
      id: `op-${checksum}`,
      baseChecksum: currentChecksum,
      baseStart,
      baseEnd,
      checksum,
    })
  }
  return rebased
}

export function mergeNonOverlappingLineChanges(
  baseContent: string,
  localContent: string,
  remoteContent: string,
): string | null {
  const baseLines = splitLines(baseContent)
  const localLines = splitLines(localContent)
  const remoteLines = splitLines(remoteContent)
  const localRange = changedLineRange(baseLines, localLines)
  const remoteRange = changedLineRange(baseLines, remoteLines)
  if (!localRange || !remoteRange) return null
  const sameInsertionPoint =
    localRange.baseStart === localRange.baseEnd &&
    remoteRange.baseStart === remoteRange.baseEnd &&
    localRange.baseStart === remoteRange.baseStart
  if (sameInsertionPoint) return null
  const characterMerge = mergeSingleLineCharacterChanges(
    baseLines,
    localLines,
    remoteLines,
    localRange,
    remoteRange,
  )
  if (characterMerge) return characterMerge
  if (localRange.baseEnd <= remoteRange.baseStart) {
    const offset = localLines.length - baseLines.length
    return joinLines([
      ...localLines.slice(0, remoteRange.baseStart + offset),
      ...remoteLines.slice(remoteRange.nextStart, remoteRange.nextEnd),
      ...localLines.slice(remoteRange.baseEnd + offset),
    ])
  }
  if (remoteRange.baseEnd <= localRange.baseStart) {
    return joinLines([
      ...localLines.slice(0, remoteRange.baseStart),
      ...remoteLines.slice(remoteRange.nextStart, remoteRange.nextEnd),
      ...localLines.slice(remoteRange.baseEnd),
    ])
  }
  return null
}

export function mergeSingleLineCharacterChanges(
  baseLines: string[],
  localLines: string[],
  remoteLines: string[],
  localRange: LineChangeRange,
  remoteRange: LineChangeRange,
): string | null {
  const sameBaseLine =
    localRange.baseEnd === localRange.baseStart + 1 &&
    remoteRange.baseEnd === remoteRange.baseStart + 1 &&
    localRange.baseStart === remoteRange.baseStart &&
    localRange.nextEnd === localRange.nextStart + 1 &&
    remoteRange.nextEnd === remoteRange.nextStart + 1
  if (!sameBaseLine) return null

  const localLine = localLines[localRange.nextStart]
  const remoteLine = remoteLines[remoteRange.nextStart]
  const baseLine = baseLines[localRange.baseStart]
  const localTextRange = changedTextRange(baseLine, localLine)
  const remoteTextRange = changedTextRange(baseLine, remoteLine)
  if (!localTextRange || !remoteTextRange) return null
  if (localTextRange.baseStart < remoteTextRange.baseEnd && remoteTextRange.baseStart < localTextRange.baseEnd) {
    return null
  }

  const mergedLine =
    localTextRange.baseEnd <= remoteTextRange.baseStart
      ? spliceText(localLine, remoteTextRange, remoteLine, localLine.length - baseLine.length)
      : spliceText(localLine, remoteTextRange, remoteLine, 0)
  return joinLines([
    ...localLines.slice(0, localRange.nextStart),
    mergedLine,
    ...localLines.slice(localRange.nextEnd),
  ])
}

interface LineChangeRange {
  baseStart: number
  baseEnd: number
  nextStart: number
  nextEnd: number
}

function changedLineRange(baseLines: string[], nextLines: string[]): LineChangeRange | null {
  let prefix = 0
  while (prefix < baseLines.length && prefix < nextLines.length && baseLines[prefix] === nextLines[prefix]) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix + prefix < baseLines.length &&
    suffix + prefix < nextLines.length &&
    baseLines[baseLines.length - 1 - suffix] === nextLines[nextLines.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const baseEnd = baseLines.length - suffix
  const nextEnd = nextLines.length - suffix
  if (prefix === baseEnd && prefix === nextEnd) return null
  return { baseStart: prefix, baseEnd, nextStart: prefix, nextEnd }
}

interface TextChangeRange {
  baseStart: number
  baseEnd: number
  nextStart: number
  nextEnd: number
}

function changedTextRange(base: string, next: string): TextChangeRange | null {
  let prefix = 0
  while (prefix < base.length && prefix < next.length && base[prefix] === next[prefix]) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix + prefix < base.length &&
    suffix + prefix < next.length &&
    base[base.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const baseEnd = base.length - suffix
  const nextEnd = next.length - suffix
  if (prefix === baseEnd && prefix === nextEnd) return null
  return { baseStart: prefix, baseEnd, nextStart: prefix, nextEnd }
}

function spliceText(localLine: string, remoteRange: TextChangeRange, remoteLine: string, offset: number): string {
  const insertStart = remoteRange.baseStart + offset
  const insertEnd = remoteRange.baseEnd + offset
  return [
    localLine.slice(0, insertStart),
    remoteLine.slice(remoteRange.nextStart, remoteRange.nextEnd),
    localLine.slice(insertEnd),
  ].join('')
}

function orderLocalCrdtCharacters(document: LocalCrdtCharacter[]): LocalCrdtCharacter[] {
  const byParent = new Map<string, LocalCrdtCharacter[]>()
  document.forEach(character => {
    const parent = character.afterId ?? ''
    const children = byParent.get(parent) ?? []
    children.push(character)
    byParent.set(parent, children)
  })
  byParent.forEach(children => children.sort((left, right) => left.id.localeCompare(right.id)))

  const ordered: LocalCrdtCharacter[] = []
  const seen = new Set<string>()
  const visit = (parentId: string) => {
    const children = byParent.get(parentId) ?? []
    children.forEach(character => {
      if (seen.has(character.id)) return
      seen.add(character.id)
      ordered.push(character)
      visit(character.id)
    })
  }
  visit('')
  return ordered
}

function orderLocalRichTextBlocks(document: LocalRichTextBlock[]): LocalRichTextBlock[] {
  const byParent = new Map<string, LocalRichTextBlock[]>()
  document.forEach(block => {
    const parent = block.afterId ?? ''
    const children = byParent.get(parent) ?? []
    children.push(block)
    byParent.set(parent, children)
  })
  byParent.forEach(children => children.sort((left, right) => left.id.localeCompare(right.id)))

  const ordered: LocalRichTextBlock[] = []
  const seen = new Set<string>()
  const visit = (parentId: string) => {
    const children = byParent.get(parentId) ?? []
    children.forEach(block => {
      if (seen.has(block.id)) return
      seen.add(block.id)
      ordered.push(block)
      visit(block.id)
    })
  }
  visit('')
  return ordered
}

function safeCrdtIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 96) || 'local'
}

function isLocalTextOperationList(value: unknown, baseChecksum: string): value is LocalTextOperation[] {
  if (!Array.isArray(value)) return false
  return value.every(operation => {
    if (!operation || typeof operation !== 'object') return false
    const item = operation as Partial<LocalTextOperation>
    return (
      typeof item.id === 'string' &&
      item.id.startsWith('op-') &&
      item.baseChecksum === baseChecksum &&
      typeof item.baseStart === 'number' &&
      Number.isInteger(item.baseStart) &&
      item.baseStart >= 0 &&
      typeof item.baseEnd === 'number' &&
      Number.isInteger(item.baseEnd) &&
      item.baseEnd >= item.baseStart &&
      typeof item.insert === 'string' &&
      typeof item.checksum === 'string'
    )
  })
}

function isLocalCrdtOperationList(value: unknown): value is LocalCrdtOperation[] {
  if (!Array.isArray(value)) return false
  return value.every(operation => {
    if (!operation || typeof operation !== 'object') return false
    const item = operation as Partial<LocalCrdtOperation>
    if (item.type === 'insert') {
      return (
        typeof item.id === 'string' &&
        item.id.length > 0 &&
        item.id.length <= 256 &&
        (item.afterId === null || typeof item.afterId === 'string') &&
        typeof item.value === 'string' &&
        item.value.length > 0
      )
    }
    return item.type === 'delete' && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 256
  })
}

function isLocalRichTextOperationList(value: unknown): value is LocalRichTextOperation[] {
  if (!Array.isArray(value)) return false
  return value.every(operation => {
    if (!operation || typeof operation !== 'object') return false
    const item = operation as Record<string, unknown>
    if (item.type === 'delete') return typeof item.id === 'string' && validRichTextId(item.id)
    if (item.type === 'tableCell') {
      return (
        typeof item.id === 'string' &&
        validRichTextId(item.id) &&
        typeof item.row === 'number' &&
        Number.isInteger(item.row) &&
        item.row >= 0 &&
        typeof item.column === 'number' &&
        Number.isInteger(item.column) &&
        item.column >= 0 &&
        typeof item.markdown === 'string' &&
        item.markdown.length <= 5_000
      )
    }
    if (item.type === 'tableRow') {
      return (
        typeof item.id === 'string' &&
        validRichTextId(item.id) &&
        typeof item.index === 'number' &&
        Number.isInteger(item.index) &&
        item.index >= 0 &&
        Array.isArray(item.cells) &&
        item.cells.length > 0 &&
        item.cells.length <= 50 &&
        item.cells.every(cell => typeof cell === 'string' && cell.length <= 5_000)
      )
    }
    if (item.type === 'tableRowDelete') {
      return (
        typeof item.id === 'string' &&
        validRichTextId(item.id) &&
        typeof item.index === 'number' &&
        Number.isInteger(item.index) &&
        item.index >= 0 &&
        Array.isArray(item.cells) &&
        item.cells.length > 0 &&
        item.cells.length <= 50 &&
        item.cells.every(cell => typeof cell === 'string' && cell.length <= 5_000)
      )
    }
    if (item.type === 'tableColumn' || item.type === 'tableColumnDelete') {
      return (
        typeof item.id === 'string' &&
        validRichTextId(item.id) &&
        typeof item.index === 'number' &&
        Number.isInteger(item.index) &&
        item.index >= 0 &&
        Array.isArray(item.cells) &&
        item.cells.length > 0 &&
        item.cells.length <= 50 &&
        item.cells.every(cell => typeof cell === 'string' && cell.length <= 5_000)
      )
    }
    if (item.type === 'listItem') {
      return (
        typeof item.id === 'string' &&
        validRichTextId(item.id) &&
        typeof item.index === 'number' &&
        Number.isInteger(item.index) &&
        item.index >= 0 &&
        typeof item.markdown === 'string' &&
        item.markdown.length > 0 &&
        item.markdown.length <= 5_000
      )
    }
    if (item.type === 'listItemInsert') {
      return (
        typeof item.id === 'string' &&
        validRichTextId(item.id) &&
        typeof item.index === 'number' &&
        Number.isInteger(item.index) &&
        item.index >= 0 &&
        typeof item.markdown === 'string' &&
        item.markdown.length > 0 &&
        item.markdown.length <= 5_000
      )
    }
    if (item.type === 'listItemDelete') {
      return (
        typeof item.id === 'string' &&
        validRichTextId(item.id) &&
        typeof item.index === 'number' &&
        Number.isInteger(item.index) &&
        item.index >= 0 &&
        typeof item.markdown === 'string' &&
        item.markdown.length > 0 &&
        item.markdown.length <= 5_000
      )
    }
    if (item.type === 'line') {
      return (
        typeof item.id === 'string' &&
        validRichTextId(item.id) &&
        typeof item.index === 'number' &&
        Number.isInteger(item.index) &&
        item.index >= 0 &&
        typeof item.markdown === 'string' &&
        item.markdown.length > 0 &&
        item.markdown.length <= 5_000
      )
    }
    if (item.type === 'lineInsert' || item.type === 'lineDelete') {
      return (
        typeof item.id === 'string' &&
        validRichTextId(item.id) &&
        typeof item.index === 'number' &&
        Number.isInteger(item.index) &&
        item.index >= 0 &&
        typeof item.markdown === 'string' &&
        item.markdown.length > 0 &&
        item.markdown.length <= 5_000
      )
    }
    if (item.type === 'mark') {
      return (
        typeof item.id === 'string' &&
        validRichTextId(item.id) &&
        isLocalRichTextMark(item.mark) &&
        typeof item.textStart === 'number' &&
        Number.isInteger(item.textStart) &&
        item.textStart >= 0 &&
        typeof item.textEnd === 'number' &&
        Number.isInteger(item.textEnd) &&
        item.textEnd > item.textStart &&
        (item.href === undefined || typeof item.href === 'string') &&
        (item.color === undefined || typeof item.color === 'string')
      )
    }
    if (item.type !== 'insert' && item.type !== 'update') return false
    return (
      typeof item.id === 'string' &&
      validRichTextId(item.id) &&
      (item.type === 'update' || item.afterId === null || typeof item.afterId === 'string') &&
      typeof item.markdown === 'string' &&
      item.markdown.length > 0 &&
      item.markdown.length <= 20_000 &&
      isLocalRichTextBlockType(item.blockType)
    )
  })
}

function validRichTextId(id: string): boolean {
  return id.length > 0 && id.length <= 256
}

function isLocalRichTextBlockType(value: unknown): value is LocalRichTextBlock['type'] {
  return (
    value === 'heading' ||
    value === 'paragraph' ||
    value === 'list' ||
    value === 'taskList' ||
    value === 'table' ||
    value === 'quote' ||
    value === 'code' ||
    value === 'horizontalRule'
  )
}

function isLocalRichTextMark(value: unknown): value is Extract<LocalRichTextOperation, { type: 'mark' }>['mark'] {
  return (
    value === 'bold' ||
    value === 'italic' ||
    value === 'code' ||
    value === 'link' ||
    value === 'strike' ||
    value === 'underline' ||
    value === 'highlight' ||
    value === 'color'
  )
}

function compareLocalRichTextOperations(left: LocalRichTextOperation, right: LocalRichTextOperation): number {
  return left.id.localeCompare(right.id) || left.type.localeCompare(right.type)
}

function richTextOperationSetsConflict(operationSets: LocalRichTextOperation[][]): boolean {
  const seen = new Map<string, string>()
  const markRanges = new Map<string, Array<Extract<LocalRichTextOperation, { type: 'mark' }>>>()
  const tableCells = new Map<string, string>()
  const tableRows = new Map<string, string>()
  const tableRowDeletes = new Map<string, string>()
  const tableColumns = new Map<string, string>()
  const tableColumnDeletes = new Map<string, string>()
  const listItems = new Map<string, string>()
  const listItemInserts = new Map<string, string>()
  const listItemDeletes = new Map<string, string>()
  const lines = new Map<string, string>()
  const lineInserts = new Map<string, string>()
  const lineDeletes = new Map<string, string>()
  const tableColumnsTouched = (id: string) =>
    Array.from(tableColumns.keys()).some(key => key.startsWith(`${id}:`)) ||
    Array.from(tableColumnDeletes.keys()).some(key => key.startsWith(`${id}:`))
  const tableRowDeleteTouchesCell = (id: string, row: number) => tableRowDeletes.has(`${id}:${row}`)
  const tableColumnDeleteTouchesCell = (id: string, column: number) => tableColumnDeletes.has(`${id}:${column}`)
  const tableCellsTouchRow = (id: string, row: number) =>
    Array.from(tableCells.keys()).some(key => key.startsWith(`${id}:${row}:`))
  const tableCellsTouchColumn = (id: string, column: number) =>
    Array.from(tableCells.keys()).some(key => {
      const prefix = `${id}:`
      if (!key.startsWith(prefix)) return false
      const [, cellColumn] = key.slice(prefix.length).split(':')
      return Number(cellColumn) === column
    })
  for (const operations of operationSets) {
    const touched = new Map<string, string>()
    operations.forEach(operation => {
      if (operation.type === 'insert') return
      if (operation.type === 'tableCell') {
        if (
          seen.has(operation.id) ||
          markRanges.has(operation.id) ||
          tableRowDeleteTouchesCell(operation.id, operation.row) ||
          tableColumnDeleteTouchesCell(operation.id, operation.column) ||
          Array.from(listItems.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lines.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))
        ) {
          touched.set(operation.id, `table-cell-conflict:${operation.row}:${operation.column}`)
          return
        }
        const cellKey = `${operation.id}:${operation.row}:${operation.column}`
        const valueKey = tableCells.get(cellKey)
        const nextValueKey = richTextOperationConflictKey(operation)
        if (valueKey !== undefined && valueKey !== nextValueKey) {
          touched.set(operation.id, `table-cell-conflict:${operation.row}:${operation.column}`)
          return
        }
        tableCells.set(cellKey, nextValueKey)
        return
      }
      if (operation.type === 'tableRow') {
        if (
          seen.has(operation.id) ||
          markRanges.has(operation.id) ||
          Array.from(listItems.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lines.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))
        ) {
          touched.set(operation.id, `table-row-conflict:${operation.index}`)
          return
        }
        const rowKey = `${operation.id}:${operation.index}:${operation.cells.join('\u001f')}`
        tableRows.set(rowKey, richTextOperationConflictKey(operation))
        return
      }
      if (operation.type === 'tableRowDelete') {
        if (
          seen.has(operation.id) ||
          markRanges.has(operation.id) ||
          tableCellsTouchRow(operation.id, operation.index) ||
          Array.from(listItems.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lines.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))
        ) {
          touched.set(operation.id, `table-row-delete-conflict:${operation.index}`)
          return
        }
        const rowKey = `${operation.id}:${operation.index}`
        const valueKey = tableRowDeletes.get(rowKey)
        const nextValueKey = richTextOperationConflictKey(operation)
        if (valueKey !== undefined && valueKey !== nextValueKey) {
          touched.set(operation.id, `table-row-delete-conflict:${operation.index}`)
          return
        }
        tableRowDeletes.set(rowKey, nextValueKey)
        return
      }
      if (operation.type === 'tableColumn') {
        if (
          seen.has(operation.id) ||
          markRanges.has(operation.id) ||
          Array.from(listItems.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lines.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))
        ) {
          touched.set(operation.id, `table-column-conflict:${operation.index}`)
          return
        }
        const columnKey = `${operation.id}:${operation.index}:${operation.cells.join('\u001f')}`
        tableColumns.set(columnKey, richTextOperationConflictKey(operation))
        return
      }
      if (operation.type === 'tableColumnDelete') {
        if (
          seen.has(operation.id) ||
          markRanges.has(operation.id) ||
          tableCellsTouchColumn(operation.id, operation.index) ||
          Array.from(listItems.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lines.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))
        ) {
          touched.set(operation.id, `table-column-delete-conflict:${operation.index}`)
          return
        }
        const columnKey = `${operation.id}:${operation.index}`
        const valueKey = tableColumnDeletes.get(columnKey)
        const nextValueKey = richTextOperationConflictKey(operation)
        if (valueKey !== undefined && valueKey !== nextValueKey) {
          touched.set(operation.id, `table-column-delete-conflict:${operation.index}`)
          return
        }
        tableColumnDeletes.set(columnKey, nextValueKey)
        return
      }
      if (operation.type === 'listItem') {
        if (
          seen.has(operation.id) ||
          markRanges.has(operation.id) ||
          Array.from(tableCells.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRows.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRowDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          tableColumnsTouched(operation.id) ||
          listItemDeletes.has(`${operation.id}:${operation.index}`) ||
          Array.from(lines.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))
        ) {
          touched.set(operation.id, `list-item-conflict:${operation.index}`)
          return
        }
        const itemKey = `${operation.id}:${operation.index}`
        const valueKey = listItems.get(itemKey)
        const nextValueKey = richTextOperationConflictKey(operation)
        if (valueKey !== undefined && valueKey !== nextValueKey) {
          touched.set(operation.id, `list-item-conflict:${operation.index}`)
          return
        }
        listItems.set(itemKey, nextValueKey)
        return
      }
      if (operation.type === 'listItemInsert') {
        if (
          seen.has(operation.id) ||
          markRanges.has(operation.id) ||
          Array.from(tableCells.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRows.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRowDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          tableColumnsTouched(operation.id) ||
          Array.from(lines.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))
        ) {
          touched.set(operation.id, `list-item-insert-conflict:${operation.index}`)
          return
        }
        const itemKey = `${operation.id}:${operation.index}:${operation.markdown}`
        listItemInserts.set(itemKey, richTextOperationConflictKey(operation))
        return
      }
      if (operation.type === 'listItemDelete') {
        if (
          seen.has(operation.id) ||
          markRanges.has(operation.id) ||
          Array.from(tableCells.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRows.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRowDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          tableColumnsTouched(operation.id) ||
          listItems.has(`${operation.id}:${operation.index}`) ||
          Array.from(lines.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))
        ) {
          touched.set(operation.id, `list-item-delete-conflict:${operation.index}`)
          return
        }
        const itemKey = `${operation.id}:${operation.index}`
        const valueKey = listItemDeletes.get(itemKey)
        const nextValueKey = richTextOperationConflictKey(operation)
        if (valueKey !== undefined && valueKey !== nextValueKey) {
          touched.set(operation.id, `list-item-delete-conflict:${operation.index}`)
          return
        }
        listItemDeletes.set(itemKey, nextValueKey)
        return
      }
      if (operation.type === 'line') {
        if (
          seen.has(operation.id) ||
          markRanges.has(operation.id) ||
          Array.from(tableCells.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRows.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRowDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          tableColumnsTouched(operation.id) ||
          Array.from(listItems.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          lineDeletes.has(`${operation.id}:${operation.index}`)
        ) {
          touched.set(operation.id, `line-conflict:${operation.index}`)
          return
        }
        const lineKey = `${operation.id}:${operation.index}`
        const valueKey = lines.get(lineKey)
        const nextValueKey = richTextOperationConflictKey(operation)
        if (valueKey !== undefined && valueKey !== nextValueKey) {
          touched.set(operation.id, `line-conflict:${operation.index}`)
          return
        }
        lines.set(lineKey, nextValueKey)
        return
      }
      if (operation.type === 'lineInsert') {
        if (
          seen.has(operation.id) ||
          markRanges.has(operation.id) ||
          Array.from(tableCells.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRows.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRowDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          tableColumnsTouched(operation.id) ||
          Array.from(listItems.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))
        ) {
          touched.set(operation.id, `line-insert-conflict:${operation.index}`)
          return
        }
        const lineKey = `${operation.id}:${operation.index}:${operation.markdown}`
        lineInserts.set(lineKey, richTextOperationConflictKey(operation))
        return
      }
      if (operation.type === 'lineDelete') {
        if (
          seen.has(operation.id) ||
          markRanges.has(operation.id) ||
          Array.from(tableCells.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRows.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRowDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          tableColumnsTouched(operation.id) ||
          Array.from(listItems.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          lines.has(`${operation.id}:${operation.index}`)
        ) {
          touched.set(operation.id, `line-delete-conflict:${operation.index}`)
          return
        }
        const lineKey = `${operation.id}:${operation.index}`
        const valueKey = lineDeletes.get(lineKey)
        const nextValueKey = richTextOperationConflictKey(operation)
        if (valueKey !== undefined && valueKey !== nextValueKey) {
          touched.set(operation.id, `line-delete-conflict:${operation.index}`)
          return
        }
        lineDeletes.set(lineKey, nextValueKey)
        return
      }
      if (operation.type === 'mark') {
        if (
          seen.has(operation.id) ||
          Array.from(tableCells.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRows.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(tableRowDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          tableColumnsTouched(operation.id) ||
          Array.from(listItems.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(listItemDeletes.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lines.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineInserts.keys()).some(key => key.startsWith(`${operation.id}:`)) ||
          Array.from(lineDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))
        ) {
          touched.set(operation.id, `mark-conflict:${operation.mark}:${operation.textStart}:${operation.textEnd}`)
          return
        }
        const ranges = markRanges.get(operation.id) ?? []
        if (ranges.some(range => richTextMarkOperationsConflict(range, operation))) {
          touched.set(operation.id, `mark-conflict:${operation.mark}:${operation.textStart}:${operation.textEnd}`)
          return
        }
        ranges.push(operation)
        markRanges.set(operation.id, ranges)
        return
      }
      if (markRanges.has(operation.id)) {
        touched.set(operation.id, `mark-conflict:${operation.type}`)
        return
      }
      if (Array.from(tableCells.keys()).some(key => key.startsWith(`${operation.id}:`))) {
        touched.set(operation.id, `table-cell-conflict:${operation.type}`)
        return
      }
      if (Array.from(tableRows.keys()).some(key => key.startsWith(`${operation.id}:`))) {
        touched.set(operation.id, `table-row-conflict:${operation.type}`)
        return
      }
      if (Array.from(tableRowDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))) {
        touched.set(operation.id, `table-row-delete-conflict:${operation.type}`)
        return
      }
      if (Array.from(tableColumns.keys()).some(key => key.startsWith(`${operation.id}:`))) {
        touched.set(operation.id, `table-column-conflict:${operation.type}`)
        return
      }
      if (Array.from(tableColumnDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))) {
        touched.set(operation.id, `table-column-delete-conflict:${operation.type}`)
        return
      }
      if (Array.from(listItems.keys()).some(key => key.startsWith(`${operation.id}:`))) {
        touched.set(operation.id, `list-item-conflict:${operation.type}`)
        return
      }
      if (Array.from(listItemInserts.keys()).some(key => key.startsWith(`${operation.id}:`))) {
        touched.set(operation.id, `list-item-insert-conflict:${operation.type}`)
        return
      }
      if (Array.from(listItemDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))) {
        touched.set(operation.id, `list-item-delete-conflict:${operation.type}`)
        return
      }
      if (Array.from(lines.keys()).some(key => key.startsWith(`${operation.id}:`))) {
        touched.set(operation.id, `line-conflict:${operation.type}`)
        return
      }
      if (Array.from(lineInserts.keys()).some(key => key.startsWith(`${operation.id}:`))) {
        touched.set(operation.id, `line-insert-conflict:${operation.type}`)
        return
      }
      if (Array.from(lineDeletes.keys()).some(key => key.startsWith(`${operation.id}:`))) {
        touched.set(operation.id, `line-delete-conflict:${operation.type}`)
        return
      }
      touched.set(operation.id, richTextOperationConflictKey(operation))
    })
    for (const [id, key] of touched) {
      if (
        key.startsWith('mark-conflict:') ||
        key.startsWith('table-cell-conflict:') ||
        key.startsWith('table-row-conflict:') ||
        key.startsWith('table-row-delete-conflict:') ||
        key.startsWith('table-column-conflict:') ||
        key.startsWith('table-column-delete-conflict:') ||
        key.startsWith('list-item-conflict:') ||
        key.startsWith('list-item-insert-conflict:') ||
        key.startsWith('list-item-delete-conflict:') ||
        key.startsWith('line-conflict:') ||
        key.startsWith('line-insert-conflict:') ||
        key.startsWith('line-delete-conflict:')
      ) {
        return true
      }
      const existing = seen.get(id)
      if (existing !== undefined && existing !== key) return true
      seen.set(id, key)
    }
  }
  return false
}

function richTextOperationConflictKey(operation: LocalRichTextOperation): string {
  if (operation.type === 'delete') return 'delete'
  if (operation.type === 'update') return `update:${operation.blockType}:${operation.markdown}`
  if (operation.type === 'mark') {
    return `mark:${operation.mark}:${operation.textStart}:${operation.textEnd}:${operation.href ?? ''}:${operation.color ?? ''}`
  }
  if (operation.type === 'tableCell') return `tableCell:${operation.row}:${operation.column}:${operation.markdown}`
  if (operation.type === 'tableRow') return `tableRow:${operation.index}:${operation.cells.join('\u001f')}`
  if (operation.type === 'tableRowDelete') return `tableRowDelete:${operation.index}:${operation.cells.join('\u001f')}`
  if (operation.type === 'tableColumn') return `tableColumn:${operation.index}:${operation.cells.join('\u001f')}`
  if (operation.type === 'tableColumnDelete') return `tableColumnDelete:${operation.index}:${operation.cells.join('\u001f')}`
  if (operation.type === 'listItem') return `listItem:${operation.index}:${operation.markdown}`
  if (operation.type === 'listItemInsert') return `listItemInsert:${operation.index}:${operation.markdown}`
  if (operation.type === 'listItemDelete') return `listItemDelete:${operation.index}:${operation.markdown}`
  if (operation.type === 'line') return `line:${operation.index}:${operation.markdown}`
  if (operation.type === 'lineInsert') return `lineInsert:${operation.index}:${operation.markdown}`
  if (operation.type === 'lineDelete') return `lineDelete:${operation.index}:${operation.markdown}`
  return `insert:${operation.id}`
}

function richTextMarkOperationsConflict(
  left: Extract<LocalRichTextOperation, { type: 'mark' }>,
  right: Extract<LocalRichTextOperation, { type: 'mark' }>,
): boolean {
  if (left.id !== right.id) return false
  if (left.textEnd <= right.textStart || right.textEnd <= left.textStart) return false
  if (left.textStart === right.textStart && left.textEnd === right.textEnd) {
    if (left.mark === 'code' || right.mark === 'code') return left.mark !== right.mark
    if (left.mark === 'link' && right.mark === 'link') return left.href !== right.href
    if (left.mark === right.mark && (left.color ?? '') !== (right.color ?? '')) return true
    return false
  }
  if (left.mark === 'code' || right.mark === 'code') return left.mark !== right.mark
  if (left.mark === right.mark) return left.href !== right.href || left.color !== right.color
  if (left.mark === 'link' && right.mark === 'link') return left.href !== right.href
  return false
}

function buildLocalRichTextMarkOperations(
  block: LocalRichTextBlock,
  nextMarkdown: string,
): LocalRichTextOperation[] | null {
  if (stripInlineMarkdown(block.markdown) !== stripInlineMarkdown(nextMarkdown)) return null
  const baseMarks = parseInlineMarkdownMarks(block.markdown)
  const nextMarks = parseInlineMarkdownMarks(nextMarkdown)
  const additions = nextMarks.filter(mark => !baseMarks.some(base => richTextMarkOperationKey(base) === richTextMarkOperationKey(mark)))
  if (additions.length === 0) return null
  return additions.map(mark => ({ ...mark, id: block.id }))
}

function applyRichTextMarks(markdown: string, marks: Extract<LocalRichTextOperation, { type: 'mark' }>[]): string {
  let result = stripInlineMarkdown(markdown)
  const blockId = marks[0]?.id ?? ''
  const existingMarks = parseInlineMarkdownMarks(markdown).map(mark => ({ ...mark, id: blockId }))
  const combinedMarks = dedupeRichTextMarks([...existingMarks, ...marks])
  if (hasPartialRichTextMarkOverlap(combinedMarks)) {
    return applySegmentedRichTextMarks(result, combinedMarks)
  }
  const ranges = new Map<string, Extract<LocalRichTextOperation, { type: 'mark' }>[]>()
  combinedMarks.forEach(mark => {
    const key = `${mark.textStart}:${mark.textEnd}`
    const range = ranges.get(key) ?? []
    range.push(mark)
    ranges.set(key, range)
  })
  const sorted = Array.from(ranges.values()).sort(
    (left, right) => (right[0]?.textStart ?? 0) - (left[0]?.textStart ?? 0) || (right[0]?.textEnd ?? 0) - (left[0]?.textEnd ?? 0),
  )
  for (const range of sorted) {
    const first = range[0]
    if (!first) continue
    const text = result.slice(first.textStart, first.textEnd)
    const wrapped = wrapRichTextMarkRange(text, range)
    result = `${result.slice(0, first.textStart)}${wrapped}${result.slice(first.textEnd)}`
  }
  return result
}

function dedupeRichTextMarks(
  marks: Extract<LocalRichTextOperation, { type: 'mark' }>[],
): Extract<LocalRichTextOperation, { type: 'mark' }>[] {
  const seen = new Set<string>()
  const deduped: Extract<LocalRichTextOperation, { type: 'mark' }>[] = []
  for (const mark of marks) {
    const key = `${mark.id}:${richTextMarkOperationKey(mark)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(mark)
  }
  return deduped
}

function hasPartialRichTextMarkOverlap(marks: Extract<LocalRichTextOperation, { type: 'mark' }>[]): boolean {
  for (let leftIndex = 0; leftIndex < marks.length; leftIndex += 1) {
    const left = marks[leftIndex]
    if (!left) continue
    for (let rightIndex = leftIndex + 1; rightIndex < marks.length; rightIndex += 1) {
      const right = marks[rightIndex]
      if (!right || left.id !== right.id) continue
      if (left.textEnd <= right.textStart || right.textEnd <= left.textStart) continue
      if (left.textStart !== right.textStart || left.textEnd !== right.textEnd) return true
    }
  }
  return false
}

function applySegmentedRichTextMarks(
  text: string,
  marks: Extract<LocalRichTextOperation, { type: 'mark' }>[],
): string {
  const points = new Set<number>([0, text.length])
  marks.forEach(mark => {
    points.add(Math.max(0, Math.min(text.length, mark.textStart)))
    points.add(Math.max(0, Math.min(text.length, mark.textEnd)))
  })
  const sortedPoints = [...points].sort((left, right) => left - right)
  return sortedPoints
    .slice(0, -1)
    .map((start, index) => {
      const end = sortedPoints[index + 1] ?? start
      if (start === end) return ''
      const segment = text.slice(start, end)
      const activeMarks = marks.filter(mark => mark.textStart <= start && mark.textEnd >= end)
      return activeMarks.length > 0 ? wrapRichTextMarkRangeAsHtml(segment, activeMarks) : segment
    })
    .join('')
}

function wrapRichTextMarkRange(text: string, marks: Extract<LocalRichTextOperation, { type: 'mark' }>[]): string {
  const hasCode = marks.some(mark => mark.mark === 'code')
  const hasBold = marks.some(mark => mark.mark === 'bold')
  const hasItalic = marks.some(mark => mark.mark === 'italic')
  const hasStrike = marks.some(mark => mark.mark === 'strike')
  const hasUnderline = marks.some(mark => mark.mark === 'underline')
  const highlight = marks.find(mark => mark.mark === 'highlight')
  const color = marks.find(mark => mark.mark === 'color')
  const link = marks.find(mark => mark.mark === 'link')
  let wrapped = hasCode ? `\`${text}\`` : hasBold && hasItalic ? `***${text}***` : hasBold ? `**${text}**` : hasItalic ? `*${text}*` : text
  if (hasStrike) wrapped = `~~${wrapped}~~`
  if (hasUnderline) wrapped = `<u>${wrapped}</u>`
  if (color?.color) wrapped = `<span style="color: ${color.color}">${wrapped}</span>`
  if (highlight) {
    wrapped = highlight.color
      ? `<mark data-color="${highlight.color}" style="background-color: ${highlight.color}">${wrapped}</mark>`
      : `==${wrapped}==`
  }
  if (link?.href) wrapped = `[${wrapped}](${link.href})`
  return wrapped
}

function wrapRichTextMarkRangeAsHtml(
  text: string,
  marks: Extract<LocalRichTextOperation, { type: 'mark' }>[],
): string {
  const hasCode = marks.some(mark => mark.mark === 'code')
  const hasBold = marks.some(mark => mark.mark === 'bold')
  const hasItalic = marks.some(mark => mark.mark === 'italic')
  const hasStrike = marks.some(mark => mark.mark === 'strike')
  const hasUnderline = marks.some(mark => mark.mark === 'underline')
  const highlight = marks.find(mark => mark.mark === 'highlight')
  const color = marks.find(mark => mark.mark === 'color')
  const link = marks.find(mark => mark.mark === 'link')
  let wrapped = escapeHtml(text)
  if (hasCode) wrapped = `<code>${wrapped}</code>`
  if (hasBold) wrapped = `<strong>${wrapped}</strong>`
  if (hasItalic) wrapped = `<em>${wrapped}</em>`
  if (hasStrike) wrapped = `<s>${wrapped}</s>`
  if (hasUnderline) wrapped = `<u>${wrapped}</u>`
  if (color?.color) wrapped = `<span style="color: ${color.color}">${wrapped}</span>`
  if (highlight) {
    wrapped = highlight.color
      ? `<mark data-color="${highlight.color}" style="background-color: ${highlight.color}">${wrapped}</mark>`
      : `<mark>${wrapped}</mark>`
  }
  if (link?.href) wrapped = `<a href="${escapeHtmlAttribute(link.href)}">${wrapped}</a>`
  return wrapped
}

function richTextMarkOperationKey(operation: Omit<Extract<LocalRichTextOperation, { type: 'mark' }>, 'id'>): string {
  return `${operation.mark}:${operation.textStart}:${operation.textEnd}:${operation.href ?? ''}:${operation.color ?? ''}`
}

function stripInlineMarkdown(markdown: string): string {
  return markdown
    .replace(/<a\s+href="[^"]*">([\s\S]*?)<\/a>/g, '$1')
    .replace(/<span\s+style="color:\s*#[0-9a-fA-F]{3,8};?">([\s\S]*?)<\/span>/g, '$1')
    .replace(/<mark(?:\s+data-color="#[0-9a-fA-F]{3,8}")?(?:\s+style="background-color:\s*#[0-9a-fA-F]{3,8};?")?>([\s\S]*?)<\/mark>/g, '$1')
    .replace(/<strong>([\s\S]*?)<\/strong>/g, '$1')
    .replace(/<em>([\s\S]*?)<\/em>/g, '$1')
    .replace(/<s>([\s\S]*?)<\/s>/g, '$1')
    .replace(/<code>([\s\S]*?)<\/code>/g, '$1')
    .replace(/<u>([\s\S]*?)<\/u>/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

function parseInlineMarkdownMarks(markdown: string): Array<Omit<Extract<LocalRichTextOperation, { type: 'mark' }>, 'id'>> {
  const marks: Array<Omit<Extract<LocalRichTextOperation, { type: 'mark' }>, 'id'>> = []
  let plainIndex = 0
  const pattern =
    /(<a\s+href="[^"]*">[\s\S]*?<\/a>)|(<span\s+style="color:\s*#[0-9a-fA-F]{3,8};?">[\s\S]*?<\/span>)|(<mark(?:\s+data-color="#[0-9a-fA-F]{3,8}")?(?:\s+style="background-color:\s*#[0-9a-fA-F]{3,8};?")?>[\s\S]*?<\/mark>)|(<strong>[\s\S]*?<\/strong>)|(<em>[\s\S]*?<\/em>)|(<s>[\s\S]*?<\/s>)|(<code>[\s\S]*?<\/code>)|(<u>[\s\S]*?<\/u>)|(\[[^\]]+\]\([^)]+\))|(==[^=]+==)|(\*\*\*[^*]+\*\*\*)|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(`[^`]+`)|(\*[^*]+\*)/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(markdown))) {
    plainIndex += stripInlineMarkdown(markdown.slice(cursor, match.index)).length
    const raw = match[0]
    const text = stripInlineMarkdown(raw)
    const textEnd = plainIndex + text.length
    const nested = parseNestedHtmlInlineMarks(raw, plainIndex)
    if (raw.startsWith('<a')) {
      marks.push({ type: 'mark', mark: 'link', textStart: plainIndex, textEnd, href: raw.match(/^<a\s+href="([^"]*)">/)?.[1] })
      marks.push(...nested)
    } else if (raw.startsWith('<span')) {
      marks.push({ type: 'mark', mark: 'color', textStart: plainIndex, textEnd, color: raw.match(/color:\s*(#[0-9a-fA-F]{3,8})/)?.[1] })
      marks.push(...nested)
    } else if (raw.startsWith('<mark')) {
      marks.push({
        type: 'mark',
        mark: 'highlight',
        textStart: plainIndex,
        textEnd,
        color: raw.match(/(?:data-color|background-color):?\s*=?["']?(#[0-9a-fA-F]{3,8})/)?.[1],
      })
      marks.push(...nested)
    } else if (raw.startsWith('<strong>')) {
      marks.push({ type: 'mark', mark: 'bold', textStart: plainIndex, textEnd })
      marks.push(...nested)
    } else if (raw.startsWith('<em>')) {
      marks.push({ type: 'mark', mark: 'italic', textStart: plainIndex, textEnd })
      marks.push(...nested)
    } else if (raw.startsWith('<s>')) {
      marks.push({ type: 'mark', mark: 'strike', textStart: plainIndex, textEnd })
      marks.push(...nested)
    } else if (raw.startsWith('<code>')) {
      marks.push({ type: 'mark', mark: 'code', textStart: plainIndex, textEnd })
      marks.push(...nested)
    } else if (raw.startsWith('<u>')) {
      marks.push({ type: 'mark', mark: 'underline', textStart: plainIndex, textEnd })
      marks.push(...nested)
    } else if (raw.startsWith('[')) {
      marks.push({ type: 'mark', mark: 'link', textStart: plainIndex, textEnd, href: raw.match(/^\[[^\]]+\]\(([^)]+)\)$/)?.[1] })
    } else if (raw.startsWith('==')) {
      marks.push({ type: 'mark', mark: 'highlight', textStart: plainIndex, textEnd })
    } else if (raw.startsWith('***')) {
      marks.push({ type: 'mark', mark: 'bold', textStart: plainIndex, textEnd })
      marks.push({ type: 'mark', mark: 'italic', textStart: plainIndex, textEnd })
    } else {
      const richMark = raw.startsWith('**')
        ? 'bold'
        : raw.startsWith('~~')
          ? 'strike'
          : raw.startsWith('`')
            ? 'code'
            : 'italic'
      marks.push({ type: 'mark', mark: richMark, textStart: plainIndex, textEnd })
    }
    plainIndex += text.length
    cursor = match.index + match[0].length
  }
  return marks
}

function parseNestedHtmlInlineMarks(
  raw: string,
  offset: number,
): Array<Omit<Extract<LocalRichTextOperation, { type: 'mark' }>, 'id'>> {
  const inner = raw.match(/^<[^>]+>([\s\S]*)<\/[a-z]+>$/i)?.[1]
  if (!inner || inner === raw) return []
  return parseInlineMarkdownMarks(inner).map(mark => ({
    ...mark,
    textStart: mark.textStart + offset,
    textEnd: mark.textEnd + offset,
  }))
}

interface MarkdownTableBlock {
  rows: string[][]
  separatorIndex: number
}

function buildLocalRichTextTableCellOperations(
  block: LocalRichTextBlock,
  nextMarkdown: string,
): LocalRichTextOperation[] | null {
  if (block.type !== 'table' || richTextBlockType(nextMarkdown) !== 'table') return null
  const baseTable = parseMarkdownTableBlock(block.markdown)
  const nextTable = parseMarkdownTableBlock(nextMarkdown)
  if (!baseTable || !nextTable) return null
  if (!sameMarkdownTableShape(baseTable, nextTable)) return null
  const operations: LocalRichTextOperation[] = []
  const editableRows = markdownTableEditableRowIndexes(baseTable)
  editableRows.forEach((actualRow, row) => {
    baseTable.rows[actualRow].forEach((cell, column) => {
      const nextCell = nextTable.rows[actualRow]?.[column] ?? ''
      if (cell !== nextCell) operations.push({ type: 'tableCell', id: block.id, row, column, markdown: nextCell })
    })
  })
  return operations.length > 0 ? operations : null
}

function applyRichTextTableCellOperations(
  markdown: string,
  operations: Extract<LocalRichTextOperation, { type: 'tableCell' }>[],
): string | null {
  const table = parseMarkdownTableBlock(markdown)
  if (!table) return null
  const editableRows = markdownTableEditableRowIndexes(table)
  operations.forEach(operation => {
    const actualRow = editableRows[operation.row]
    if (actualRow === undefined) return
    if (!table.rows[actualRow] || operation.column >= table.rows[actualRow].length) return
    table.rows[actualRow][operation.column] = operation.markdown
  })
  return stringifyMarkdownTableBlock(table)
}

function buildLocalRichTextTableRowOperations(
  block: LocalRichTextBlock,
  nextMarkdown: string,
): LocalRichTextOperation[] | null {
  if (block.type !== 'table' || richTextBlockType(nextMarkdown) !== 'table') return null
  const baseTable = parseMarkdownTableBlock(block.markdown)
  const nextTable = parseMarkdownTableBlock(nextMarkdown)
  if (!baseTable || !nextTable) return null
  if (!sameMarkdownTableHeader(baseTable, nextTable)) return null
  const baseRows = markdownTableEditableRowIndexes(baseTable).map(index => baseTable.rows[index])
  const nextRows = markdownTableEditableRowIndexes(nextTable).map(index => nextTable.rows[index])
  if (baseRows.some(row => !row) || nextRows.some(row => !row)) return null
  const inserted = insertedMarkdownTableRows(baseRows as string[][], nextRows as string[][])
  if (!inserted) return null
  return inserted.map(row => ({ type: 'tableRow', id: block.id, index: row.index, cells: row.cells }))
}

function buildLocalRichTextTableRowDeleteOperations(
  block: LocalRichTextBlock,
  nextMarkdown: string,
): LocalRichTextOperation[] | null {
  if (block.type !== 'table' || richTextBlockType(nextMarkdown) !== 'table') return null
  const baseTable = parseMarkdownTableBlock(block.markdown)
  const nextTable = parseMarkdownTableBlock(nextMarkdown)
  if (!baseTable || !nextTable) return null
  if (!sameMarkdownTableHeader(baseTable, nextTable)) return null
  const baseRows = markdownTableEditableRowIndexes(baseTable).map(index => baseTable.rows[index])
  const nextRows = markdownTableEditableRowIndexes(nextTable).map(index => nextTable.rows[index])
  if (baseRows.some(row => !row) || nextRows.some(row => !row)) return null
  const deleted = deletedMarkdownTableRows(baseRows as string[][], nextRows as string[][])
  if (!deleted) return null
  return deleted.map(row => ({ type: 'tableRowDelete', id: block.id, index: row.index, cells: row.cells }))
}

function insertedMarkdownTableRows(
  baseRows: string[][],
  nextRows: string[][],
): Array<{ index: number; cells: string[] }> | null {
  if (nextRows.length <= baseRows.length) return null
  const width = baseRows[0]?.length ?? nextRows[0]?.length ?? 0
  if (width === 0 || nextRows.some(row => row.length !== width) || baseRows.some(row => row.length !== width)) return null
  const operations: Array<{ index: number; cells: string[] }> = []
  let baseIndex = 0
  nextRows.forEach(row => {
    const baseRow = baseRows[baseIndex]
    if (baseRow && sameMarkdownTableRow(baseRow, row)) {
      baseIndex += 1
    } else {
      operations.push({ index: baseIndex, cells: row })
    }
  })
  if (baseIndex !== baseRows.length || operations.length === 0) return null
  return operations
}

function deletedMarkdownTableRows(
  baseRows: string[][],
  nextRows: string[][],
): Array<{ index: number; cells: string[] }> | null {
  if (nextRows.length >= baseRows.length) return null
  const width = baseRows[0]?.length ?? nextRows[0]?.length ?? 0
  if (width === 0 || nextRows.some(row => row.length !== width) || baseRows.some(row => row.length !== width)) return null
  const operations: Array<{ index: number; cells: string[] }> = []
  let nextIndex = 0
  baseRows.forEach((row, index) => {
    const nextRow = nextRows[nextIndex]
    if (nextRow && sameMarkdownTableRow(row, nextRow)) {
      nextIndex += 1
    } else {
      operations.push({ index, cells: row })
    }
  })
  if (nextIndex !== nextRows.length || operations.length === 0) return null
  return operations
}

function applyRichTextTableRowOperations(
  markdown: string,
  operations: Array<Extract<LocalRichTextOperation, { type: 'tableRow' | 'tableRowDelete' }>>,
): string | null {
  const table = parseMarkdownTableBlock(markdown)
  if (!table) return null
  const width = table.rows[table.separatorIndex]?.length ?? 0
  if (width === 0) return null
  const editableRows = markdownTableEditableRowIndexes(table)
  const rowsBySlot = new Map<string, string[][]>()
  const deletedIndexes = new Map<number, string[]>()
  operations
    .filter(operation => operation.type === 'tableRow' && operation.index >= 0 && operation.index <= editableRows.length && operation.cells.length === width)
    .forEach(operation => {
      const key = String(operation.index)
      const rows = rowsBySlot.get(key) ?? []
      if (!rows.some(row => sameMarkdownTableRow(row, operation.cells))) rows.push(operation.cells)
      rowsBySlot.set(key, rows)
    })
  operations
    .filter(operation => operation.type === 'tableRowDelete' && operation.index >= 0 && operation.index < editableRows.length && operation.cells.length === width)
    .forEach(operation => {
      const actualIndex = editableRows[operation.index]
      const row = actualIndex === undefined ? undefined : table.rows[actualIndex]
      if (actualIndex !== undefined && actualIndex > table.separatorIndex && row && sameMarkdownTableRow(row, operation.cells)) {
        deletedIndexes.set(operation.index, operation.cells)
      }
    })
  if (rowsBySlot.size === 0 && deletedIndexes.size === 0) return null
  rowsBySlot.forEach(rows => rows.sort(compareMarkdownTableRows))
  const nextRows: string[][] = []
  let editableIndex = 0
  table.rows.forEach((row, actualIndex) => {
    if (editableRows[editableIndex] === actualIndex) {
      nextRows.push(...(rowsBySlot.get(String(editableIndex)) ?? []))
      if (!deletedIndexes.has(editableIndex)) nextRows.push(row)
      editableIndex += 1
    } else {
      nextRows.push(row)
    }
  })
  nextRows.push(...(rowsBySlot.get(String(editableRows.length)) ?? []))
  return stringifyMarkdownTableBlock({ ...table, rows: nextRows })
}

function applyRichTextTableRowColumnStructuralOperations(
  markdown: string,
  rowOperations: Array<Extract<LocalRichTextOperation, { type: 'tableRow' | 'tableRowDelete' }>>,
  columnOperations: Array<Extract<LocalRichTextOperation, { type: 'tableColumn' | 'tableColumnDelete' }>>,
): string | null {
  const table = parseMarkdownTableBlock(markdown)
  if (!table) return null
  const width = table.rows[table.separatorIndex]?.length ?? 0
  const height = table.rows.length
  if (width === 0 || height === 0) return null
  const editableRows = markdownTableEditableRowIndexes(table)
  const rowsBySlot = new Map<string, string[][]>()
  rowOperations
    .filter(operation => operation.type === 'tableRow' && operation.index >= 0 && operation.index <= editableRows.length && operation.cells.length === width)
    .forEach(operation => {
      const key = String(operation.index)
      const rows = rowsBySlot.get(key) ?? []
      if (!rows.some(row => sameMarkdownTableRow(row, operation.cells))) rows.push(operation.cells)
      rowsBySlot.set(key, rows)
    })
  const deletedRowIndexes = new Set<number>()
  rowOperations
    .filter(operation => operation.type === 'tableRowDelete' && operation.index >= 0 && operation.index < editableRows.length && operation.cells.length === width)
    .forEach(operation => {
      const actualIndex = editableRows[operation.index]
      const row = actualIndex === undefined ? undefined : table.rows[actualIndex]
      if (actualIndex !== undefined && actualIndex > table.separatorIndex && row && sameMarkdownTableRow(row, operation.cells)) {
        deletedRowIndexes.add(actualIndex)
      }
    })
  const columnInsertsBySlot = new Map<string, string[][]>()
  columnOperations
    .filter(operation => operation.type === 'tableColumn' && operation.index >= 0 && operation.index <= width && validMarkdownTableColumnOperation(table, operation.cells))
    .forEach(operation => {
      const key = String(operation.index)
      const inserts = columnInsertsBySlot.get(key) ?? []
      if (!inserts.some(column => sameMarkdownTableRow(column, operation.cells))) inserts.push(operation.cells)
      columnInsertsBySlot.set(key, inserts)
    })
  const baseColumns = markdownTableColumns(table)
  const deletedColumnIndexes = new Set<number>()
  columnOperations
    .filter(operation => operation.type === 'tableColumnDelete' && operation.index >= 0 && operation.index < baseColumns.length && operation.cells.length === height)
    .forEach(operation => {
      const column = baseColumns[operation.index]
      if (column && sameMarkdownTableRow(column, operation.cells)) deletedColumnIndexes.add(operation.index)
    })
  if (
    rowsBySlot.size === 0 &&
    deletedRowIndexes.size === 0 &&
    columnInsertsBySlot.size === 0 &&
    deletedColumnIndexes.size === 0
  ) {
    return null
  }
  if (width - deletedColumnIndexes.size + Array.from(columnInsertsBySlot.values()).flat().length < 1) return null
  rowsBySlot.forEach(rows => rows.sort(compareMarkdownTableRows))
  columnInsertsBySlot.forEach(inserts => inserts.sort(compareMarkdownTableRows))
  const structuralRows: Array<{ cells: string[]; baseRowIndex: number | null }> = []
  let editableIndex = 0
  table.rows.forEach((row, actualIndex) => {
    if (editableRows[editableIndex] === actualIndex) {
      structuralRows.push(...(rowsBySlot.get(String(editableIndex)) ?? []).map(cells => ({ cells, baseRowIndex: null })))
      if (!deletedRowIndexes.has(actualIndex)) structuralRows.push({ cells: row, baseRowIndex: actualIndex })
      editableIndex += 1
    } else {
      structuralRows.push({ cells: row, baseRowIndex: actualIndex })
    }
  })
  structuralRows.push(...(rowsBySlot.get(String(editableRows.length)) ?? []).map(cells => ({ cells, baseRowIndex: null })))
  const rows = structuralRows.map(row => {
    const cells: string[] = []
    for (let columnIndex = 0; columnIndex <= width; columnIndex += 1) {
      ;(columnInsertsBySlot.get(String(columnIndex)) ?? []).forEach(column => {
        cells.push(row.baseRowIndex === null ? '' : column[row.baseRowIndex] ?? '')
      })
      if (columnIndex < width && !deletedColumnIndexes.has(columnIndex)) cells.push(row.cells[columnIndex] ?? '')
    }
    return cells
  })
  if (rows.length === table.rows.length && rows.every((row, index) => sameMarkdownTableRow(row, table.rows[index] ?? []))) return null
  const separator = rows[table.separatorIndex]
  if (!separator || !separator.every(isMarkdownTableSeparatorCell)) return null
  return stringifyMarkdownTableBlock({ ...table, rows })
}

function buildLocalRichTextTableColumnOperations(
  block: LocalRichTextBlock,
  nextMarkdown: string,
): LocalRichTextOperation[] | null {
  if (block.type !== 'table' || richTextBlockType(nextMarkdown) !== 'table') return null
  const baseTable = parseMarkdownTableBlock(block.markdown)
  const nextTable = parseMarkdownTableBlock(nextMarkdown)
  if (!baseTable || !nextTable || !sameMarkdownTableColumnShape(baseTable, nextTable)) return null
  const inserted = insertedMarkdownTableColumns(markdownTableColumns(baseTable), markdownTableColumns(nextTable))
  if (!inserted) return null
  return inserted.map(column => ({ type: 'tableColumn', id: block.id, index: column.index, cells: column.cells }))
}

function buildLocalRichTextTableColumnDeleteOperations(
  block: LocalRichTextBlock,
  nextMarkdown: string,
): LocalRichTextOperation[] | null {
  if (block.type !== 'table' || richTextBlockType(nextMarkdown) !== 'table') return null
  const baseTable = parseMarkdownTableBlock(block.markdown)
  const nextTable = parseMarkdownTableBlock(nextMarkdown)
  if (!baseTable || !nextTable || !sameMarkdownTableColumnShape(baseTable, nextTable)) return null
  const deleted = deletedMarkdownTableColumns(markdownTableColumns(baseTable), markdownTableColumns(nextTable))
  if (!deleted) return null
  return deleted.map(column => ({ type: 'tableColumnDelete', id: block.id, index: column.index, cells: column.cells }))
}

function insertedMarkdownTableColumns(
  baseColumns: string[][],
  nextColumns: string[][],
): Array<{ index: number; cells: string[] }> | null {
  if (nextColumns.length <= baseColumns.length) return null
  const height = baseColumns[0]?.length ?? nextColumns[0]?.length ?? 0
  if (height === 0 || nextColumns.some(column => column.length !== height) || baseColumns.some(column => column.length !== height)) return null
  const operations: Array<{ index: number; cells: string[] }> = []
  let baseIndex = 0
  nextColumns.forEach(column => {
    const baseColumn = baseColumns[baseIndex]
    if (baseColumn && sameMarkdownTableRow(baseColumn, column)) {
      baseIndex += 1
    } else {
      operations.push({ index: baseIndex, cells: column })
    }
  })
  if (baseIndex !== baseColumns.length || operations.length === 0) return null
  return operations
}

function deletedMarkdownTableColumns(
  baseColumns: string[][],
  nextColumns: string[][],
): Array<{ index: number; cells: string[] }> | null {
  if (nextColumns.length >= baseColumns.length) return null
  const height = baseColumns[0]?.length ?? nextColumns[0]?.length ?? 0
  if (height === 0 || nextColumns.some(column => column.length !== height) || baseColumns.some(column => column.length !== height)) return null
  const operations: Array<{ index: number; cells: string[] }> = []
  let nextIndex = 0
  baseColumns.forEach((column, index) => {
    const nextColumn = nextColumns[nextIndex]
    if (nextColumn && sameMarkdownTableRow(column, nextColumn)) {
      nextIndex += 1
    } else {
      operations.push({ index, cells: column })
    }
  })
  if (nextIndex !== nextColumns.length || operations.length === 0) return null
  return operations
}

function applyRichTextTableColumnOperations(
  markdown: string,
  operations: Array<Extract<LocalRichTextOperation, { type: 'tableColumn' | 'tableColumnDelete' }>>,
): string | null {
  const table = parseMarkdownTableBlock(markdown)
  if (!table) return null
  const columns = markdownTableColumns(table)
  const height = table.rows.length
  const insertsBySlot = new Map<string, string[][]>()
  const deletedIndexes = new Map<number, string[]>()
  operations
    .filter(operation => operation.type === 'tableColumn' && operation.index >= 0 && operation.index <= columns.length && validMarkdownTableColumnOperation(table, operation.cells))
    .forEach(operation => {
      const key = String(operation.index)
      const inserts = insertsBySlot.get(key) ?? []
      if (!inserts.some(column => sameMarkdownTableRow(column, operation.cells))) inserts.push(operation.cells)
      insertsBySlot.set(key, inserts)
    })
  operations
    .filter(operation => operation.type === 'tableColumnDelete' && operation.index >= 0 && operation.index < columns.length && columns.length > 1 && operation.cells.length === height)
    .forEach(operation => {
      const column = columns[operation.index]
      if (column && sameMarkdownTableRow(column, operation.cells)) deletedIndexes.set(operation.index, operation.cells)
    })
  if (insertsBySlot.size === 0 && deletedIndexes.size === 0) return null
  insertsBySlot.forEach(inserts => inserts.sort(compareMarkdownTableRows))
  const nextColumns: string[][] = []
  for (let index = 0; index <= columns.length; index += 1) {
    nextColumns.push(...(insertsBySlot.get(String(index)) ?? []))
    if (index < columns.length && !deletedIndexes.has(index)) nextColumns.push(columns[index])
  }
  if (nextColumns.length === 0 || nextColumns.some(column => column.length !== height)) return null
  const rows = table.rows.map((_, rowIndex) => nextColumns.map(column => column[rowIndex] ?? ''))
  return stringifyMarkdownTableBlock({ ...table, rows })
}

function buildLocalRichTextListItemOperations(
  block: LocalRichTextBlock,
  nextMarkdown: string,
): LocalRichTextOperation[] | null {
  const blockType = richTextBlockType(block.markdown)
  const nextType = richTextBlockType(nextMarkdown)
  if ((blockType !== 'list' && blockType !== 'taskList') || blockType !== nextType) return null
  const baseItems = parseMarkdownListBlock(block.markdown)
  const nextItems = parseMarkdownListBlock(nextMarkdown)
  if (!baseItems || !nextItems || baseItems.length !== nextItems.length) return null
  const operations: LocalRichTextOperation[] = []
  baseItems.forEach((item, index) => {
    const nextItem = nextItems[index]
    if (nextItem !== undefined && item !== nextItem) {
      operations.push({ type: 'listItem', id: block.id, index, markdown: nextItem })
    }
  })
  return operations.length > 0 ? operations : null
}

function applyRichTextListItemOperations(
  markdown: string,
  operations: Extract<LocalRichTextOperation, { type: 'listItem' }>[],
): string | null {
  const items = parseMarkdownListBlock(markdown)
  if (!items) return null
  operations.forEach(operation => {
    if (operation.index < 0 || operation.index >= items.length) return
    if (!isMarkdownListItemLine(operation.markdown)) return
    items[operation.index] = operation.markdown.trim()
  })
  return items.join('\n')
}

function buildLocalRichTextListItemInsertOperations(
  block: LocalRichTextBlock,
  nextMarkdown: string,
): LocalRichTextOperation[] | null {
  const blockType = richTextBlockType(block.markdown)
  const nextType = richTextBlockType(nextMarkdown)
  if ((blockType !== 'list' && blockType !== 'taskList') || blockType !== nextType) return null
  const baseItems = parseMarkdownListBlock(block.markdown)
  const nextItems = parseMarkdownListBlock(nextMarkdown)
  if (!baseItems || !nextItems || nextItems.length <= baseItems.length) return null
  const inserted = insertedMarkdownListItems(baseItems, nextItems)
  if (!inserted) return null
  return inserted.map(item => ({ type: 'listItemInsert', id: block.id, index: item.index, markdown: item.markdown }))
}

function buildLocalRichTextListItemDeleteOperations(
  block: LocalRichTextBlock,
  nextMarkdown: string,
): LocalRichTextOperation[] | null {
  const blockType = richTextBlockType(block.markdown)
  const nextType = richTextBlockType(nextMarkdown)
  if ((blockType !== 'list' && blockType !== 'taskList') || blockType !== nextType) return null
  const baseItems = parseMarkdownListBlock(block.markdown)
  const nextItems = parseMarkdownListBlock(nextMarkdown)
  if (!baseItems || !nextItems || nextItems.length >= baseItems.length) return null
  const deleted = deletedMarkdownListItems(baseItems, nextItems)
  if (!deleted) return null
  return deleted.map(item => ({ type: 'listItemDelete', id: block.id, index: item.index, markdown: item.markdown }))
}

function insertedMarkdownListItems(
  baseItems: string[],
  nextItems: string[],
): Array<{ index: number; markdown: string }> | null {
  const operations: Array<{ index: number; markdown: string }> = []
  let baseIndex = 0
  nextItems.forEach(item => {
    if (baseItems[baseIndex] === item) {
      baseIndex += 1
    } else {
      operations.push({ index: baseIndex, markdown: item })
    }
  })
  if (baseIndex !== baseItems.length || operations.length === 0) return null
  return operations
}

function deletedMarkdownListItems(
  baseItems: string[],
  nextItems: string[],
): Array<{ index: number; markdown: string }> | null {
  const operations: Array<{ index: number; markdown: string }> = []
  let nextIndex = 0
  baseItems.forEach((item, index) => {
    if (nextItems[nextIndex] === item) {
      nextIndex += 1
    } else {
      operations.push({ index, markdown: item })
    }
  })
  if (nextIndex !== nextItems.length || operations.length === 0) return null
  return operations
}

function applyRichTextListStructuralOperations(
  markdown: string,
  operations: Array<Extract<LocalRichTextOperation, { type: 'listItemInsert' | 'listItemDelete' }>>,
): string | null {
  const items = parseMarkdownListBlock(markdown)
  if (!items) return null
  const insertsBySlot = new Map<string, string[]>()
  const deletedIndexes = new Map<number, string>()
  operations
    .filter(operation => operation.type === 'listItemInsert' && operation.index >= 0 && operation.index <= items.length && isMarkdownListItemLine(operation.markdown))
    .forEach(operation => {
      const key = String(operation.index)
      const inserts = insertsBySlot.get(key) ?? []
      const item = operation.markdown.trim()
      if (!inserts.includes(item)) inserts.push(item)
      insertsBySlot.set(key, inserts)
    })
  operations
    .filter(operation => operation.type === 'listItemDelete' && operation.index >= 0 && operation.index < items.length)
    .forEach(operation => {
      if (items[operation.index] === operation.markdown.trim()) deletedIndexes.set(operation.index, operation.markdown.trim())
    })
  if (insertsBySlot.size === 0 && deletedIndexes.size === 0) return null
  insertsBySlot.forEach(inserts => inserts.sort((left, right) => left.localeCompare(right)))
  const nextItems: string[] = []
  for (let index = 0; index <= items.length; index += 1) {
    nextItems.push(...(insertsBySlot.get(String(index)) ?? []))
    if (index < items.length && !deletedIndexes.has(index)) nextItems.push(items[index])
  }
  return nextItems.length > 0 ? nextItems.join('\n') : null
}

function parseMarkdownListBlock(markdown: string): string[] | null {
  const lines = markdown.trim().split('\n').map(line => line.trim())
  if (lines.length === 0 || !lines.every(isMarkdownListItemLine)) return null
  return lines
}

function isMarkdownListItemLine(line: string): boolean {
  return /^(-|\*|\+)\s+(\[[ xX]\]\s+)?\S/.test(line.trim()) || /^\d+\.\s+\S/.test(line.trim())
}

function buildLocalRichTextLineOperations(
  block: LocalRichTextBlock,
  nextMarkdown: string,
): LocalRichTextOperation[] | null {
  const blockType = richTextBlockType(block.markdown)
  if (blockType !== 'quote' && blockType !== 'code') return null
  if (blockType !== richTextBlockType(nextMarkdown)) return null
  const baseLines = block.markdown.split('\n')
  const nextLines = nextMarkdown.split('\n')
  if (baseLines.length !== nextLines.length || baseLines.length < 2) return null
  if (blockType === 'code') {
    const last = baseLines.length - 1
    if (baseLines[0] !== nextLines[0] || baseLines[last] !== nextLines[last]) return null
  }
  const operations: LocalRichTextOperation[] = []
  baseLines.forEach((line, index) => {
    const nextLine = nextLines[index]
    if (nextLine !== undefined && line !== nextLine) {
      operations.push({ type: 'line', id: block.id, index, markdown: nextLine })
    }
  })
  return operations.length > 0 ? operations : null
}

function buildLocalRichTextLineInsertOperations(
  block: LocalRichTextBlock,
  nextMarkdown: string,
): LocalRichTextOperation[] | null {
  const blockType = richTextBlockType(block.markdown)
  if (blockType !== 'quote' && blockType !== 'code') return null
  if (blockType !== richTextBlockType(nextMarkdown)) return null
  const baseLines = block.markdown.split('\n')
  const nextLines = nextMarkdown.split('\n')
  if (!sameRichTextLineBoundary(blockType, baseLines, nextLines) || nextLines.length <= baseLines.length) return null
  const inserted = insertedRichTextLines(baseLines, nextLines, editableRichTextLineRange(blockType, baseLines))
  if (!inserted) return null
  return inserted.map(line => ({ type: 'lineInsert', id: block.id, index: line.index, markdown: line.markdown }))
}

function buildLocalRichTextLineDeleteOperations(
  block: LocalRichTextBlock,
  nextMarkdown: string,
): LocalRichTextOperation[] | null {
  const blockType = richTextBlockType(block.markdown)
  if (blockType !== 'quote' && blockType !== 'code') return null
  if (blockType !== richTextBlockType(nextMarkdown)) return null
  const baseLines = block.markdown.split('\n')
  const nextLines = nextMarkdown.split('\n')
  if (!sameRichTextLineBoundary(blockType, baseLines, nextLines) || nextLines.length >= baseLines.length) return null
  const deleted = deletedRichTextLines(baseLines, nextLines, editableRichTextLineRange(blockType, baseLines))
  if (!deleted) return null
  return deleted.map(line => ({ type: 'lineDelete', id: block.id, index: line.index, markdown: line.markdown }))
}

function applyRichTextLineOperations(
  markdown: string,
  operations: Extract<LocalRichTextOperation, { type: 'line' }>[],
): string | null {
  const lines = markdown.split('\n')
  operations.forEach(operation => {
    if (operation.index < 0 || operation.index >= lines.length) return
    lines[operation.index] = operation.markdown
  })
  return lines.join('\n')
}

function applyRichTextLineStructuralOperations(
  markdown: string,
  operations: Array<Extract<LocalRichTextOperation, { type: 'lineInsert' | 'lineDelete' }>>,
): string | null {
  const blockType = richTextBlockType(markdown)
  if (blockType !== 'quote' && blockType !== 'code') return null
  const lines = markdown.split('\n')
  const range = editableRichTextLineRange(blockType, lines)
  const insertsBySlot = new Map<string, string[]>()
  const deletedIndexes = new Map<number, string>()
  operations
    .filter(operation => operation.type === 'lineInsert' && operation.index >= range.start && operation.index <= range.end)
    .forEach(operation => {
      if (!isValidStructuredLine(blockType, operation.markdown)) return
      const key = String(operation.index)
      const inserts = insertsBySlot.get(key) ?? []
      if (!inserts.includes(operation.markdown)) inserts.push(operation.markdown)
      insertsBySlot.set(key, inserts)
    })
  operations
    .filter(operation => operation.type === 'lineDelete' && operation.index >= range.start && operation.index < range.end)
    .forEach(operation => {
      if (lines[operation.index] === operation.markdown) deletedIndexes.set(operation.index, operation.markdown)
    })
  if (insertsBySlot.size === 0 && deletedIndexes.size === 0) return null
  insertsBySlot.forEach(inserts => inserts.sort((left, right) => left.localeCompare(right)))
  const nextLines: string[] = []
  for (let index = 0; index <= lines.length; index += 1) {
    nextLines.push(...(insertsBySlot.get(String(index)) ?? []))
    if (index < lines.length && !deletedIndexes.has(index)) nextLines.push(lines[index])
  }
  const next = nextLines.join('\n')
  return richTextBlockType(next) === blockType ? next : null
}

function insertedRichTextLines(
  baseLines: string[],
  nextLines: string[],
  range: { start: number; end: number },
): Array<{ index: number; markdown: string }> | null {
  const operations: Array<{ index: number; markdown: string }> = []
  let baseIndex = range.start
  for (let nextIndex = range.start; nextIndex < nextLines.length - (baseLines.length - range.end); nextIndex += 1) {
    if (baseLines[baseIndex] === nextLines[nextIndex]) {
      baseIndex += 1
    } else {
      operations.push({ index: baseIndex, markdown: nextLines[nextIndex] })
    }
  }
  if (baseIndex !== range.end || operations.length === 0) return null
  return operations
}

function deletedRichTextLines(
  baseLines: string[],
  nextLines: string[],
  range: { start: number; end: number },
): Array<{ index: number; markdown: string }> | null {
  const operations: Array<{ index: number; markdown: string }> = []
  let nextIndex = range.start
  for (let baseIndex = range.start; baseIndex < range.end; baseIndex += 1) {
    if (baseLines[baseIndex] === nextLines[nextIndex]) {
      nextIndex += 1
    } else {
      operations.push({ index: baseIndex, markdown: baseLines[baseIndex] })
    }
  }
  const nextEditableEnd = nextLines.length - (baseLines.length - range.end)
  if (nextIndex !== nextEditableEnd || operations.length === 0) return null
  return operations
}

function sameRichTextLineBoundary(blockType: LocalRichTextBlock['type'], baseLines: string[], nextLines: string[]): boolean {
  if (blockType !== 'code') return true
  if (baseLines.length < 2 || nextLines.length < 2) return false
  return baseLines[0] === nextLines[0] && baseLines[baseLines.length - 1] === nextLines[nextLines.length - 1]
}

function editableRichTextLineRange(blockType: LocalRichTextBlock['type'], lines: string[]): { start: number; end: number } {
  return blockType === 'code' ? { start: 1, end: Math.max(1, lines.length - 1) } : { start: 0, end: lines.length }
}

function isValidStructuredLine(blockType: LocalRichTextBlock['type'], line: string): boolean {
  if (!line.trim()) return false
  if (blockType === 'quote') return /^>\s?/.test(line)
  return true
}

function parseMarkdownTableBlock(markdown: string): MarkdownTableBlock | null {
  const lines = markdown.trim().split('\n').map(line => line.trim())
  if (lines.length < 2 || lines.some(line => !line.includes('|'))) return null
  const rows = lines.map(parseMarkdownTableRow)
  if (rows.some(row => row.length === 0)) return null
  const separatorIndex = rows.findIndex(row => row.every(isMarkdownTableSeparatorCell))
  if (separatorIndex < 0) return null
  const width = rows[separatorIndex].length
  if (width === 0 || rows.some(row => row.length !== width)) return null
  return { rows, separatorIndex }
}

function parseMarkdownTableRow(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
  return trimmed.split('|').map(cell => cell.trim())
}

function isMarkdownTableSeparatorCell(cell: string): boolean {
  return /^:?-{3,}:?$/.test(cell.trim())
}

function markdownTableEditableRowIndexes(table: MarkdownTableBlock): number[] {
  return table.rows.map((_, index) => index).filter(index => index !== table.separatorIndex)
}

function sameMarkdownTableShape(left: MarkdownTableBlock, right: MarkdownTableBlock): boolean {
  if (left.separatorIndex !== right.separatorIndex) return false
  if (left.rows.length !== right.rows.length) return false
  return left.rows.every((row, index) => {
    const nextRow = right.rows[index]
    if (!nextRow || row.length !== nextRow.length) return false
    if (index !== left.separatorIndex) return true
    return row.every((cell, column) => cell === nextRow[column])
  })
}

function sameMarkdownTableHeader(left: MarkdownTableBlock, right: MarkdownTableBlock): boolean {
  if (left.separatorIndex !== right.separatorIndex) return false
  return left.rows
    .slice(0, left.separatorIndex + 1)
    .every((row, index) => sameMarkdownTableRow(row, right.rows[index] ?? []))
}

function sameMarkdownTableColumnShape(left: MarkdownTableBlock, right: MarkdownTableBlock): boolean {
  if (left.separatorIndex !== right.separatorIndex) return false
  if (left.rows.length !== right.rows.length) return false
  return left.rows[left.separatorIndex]?.every(isMarkdownTableSeparatorCell) === true &&
    right.rows[right.separatorIndex]?.every(isMarkdownTableSeparatorCell) === true
}

function sameMarkdownTableRow(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((cell, index) => cell === right[index])
}

function markdownTableColumns(table: MarkdownTableBlock): string[][] {
  const width = table.rows[table.separatorIndex]?.length ?? 0
  return Array.from({ length: width }, (_, columnIndex) => table.rows.map(row => row[columnIndex] ?? ''))
}

function validMarkdownTableColumnOperation(table: MarkdownTableBlock, cells: string[]): boolean {
  return cells.length === table.rows.length && isMarkdownTableSeparatorCell(cells[table.separatorIndex] ?? '')
}

function compareMarkdownTableRows(left: string[], right: string[]): number {
  return left.join('\u001f').localeCompare(right.join('\u001f'))
}

function stringifyMarkdownTableBlock(table: MarkdownTableBlock): string {
  return table.rows.map(row => `| ${row.join(' | ')} |`).join('\n')
}

function splitMarkdownBlocks(content: string): string[] {
  return content
    .trim()
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
}

function richTextBlockType(markdown: string): LocalRichTextBlock['type'] {
  const firstLine = markdown.trimStart().split('\n')[0] ?? ''
  if (/^#{1,6}\s+/.test(firstLine)) return 'heading'
  if (/^```/.test(firstLine)) return 'code'
  if (/^>\s?/.test(firstLine)) return 'quote'
  if (/^\|.+\|$/.test(firstLine)) return 'table'
  if (/^(-|\*|\+)\s+\[[ xX]\]\s+/.test(firstLine)) return 'taskList'
  if (/^(-|\*|\+|\d+\.)\s+/.test(firstLine)) return 'list'
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(firstLine.trim())) return 'horizontalRule'
  return 'paragraph'
}

function changedBlockRange(baseBlocks: string[], nextBlocks: string[]): LineChangeRange | null {
  return changedLineRange(baseBlocks, nextBlocks)
}

function textOperationsConflict(left: LocalTextOperation, right: LocalTextOperation): boolean {
  const leftInsert = left.baseStart === left.baseEnd
  const rightInsert = right.baseStart === right.baseEnd
  if (leftInsert && rightInsert && left.baseStart === right.baseStart) return false
  if (left.baseStart < right.baseEnd && right.baseStart < left.baseEnd) return true
  if (leftInsert && right.baseStart < left.baseStart && left.baseStart < right.baseEnd) return true
  if (rightInsert && left.baseStart < right.baseStart && right.baseStart < left.baseEnd) return true
  return false
}

function splitLines(content: string): string[] {
  return content.split('\n')
}

function joinLines(lines: string[]): string {
  return lines.join('\n')
}

function compareLocalCollabDrafts(left: LocalCollabDraft, right: LocalCollabDraft): number {
  return (
    (left.sequence ?? left.updatedAt) - (right.sequence ?? right.updatedAt) ||
    (left.clientId ?? left.peer.id).localeCompare(right.clientId ?? right.peer.id) ||
    left.updatedAt - right.updatedAt ||
    left.id.localeCompare(right.id)
  )
}

export function pruneStalePeers(peers: LocalCollabPeer[], now = Date.now(), ttlMs = PEER_TTL_MS): LocalCollabPeer[] {
  return peers.filter(peer => now - peer.seenAt <= ttlMs)
}

export function useLocalNoteCollaboration(
  documentId: string | null,
  peerName = 'Local editor',
  transport?: LocalCollabTransport,
) {
  const peerId = useMemo(() => localPeerId(), [])
  const peerRef = useRef<LocalCollabPeer>({ id: peerId, name: peerName, seenAt: Date.now() })
  const channelRef = useRef<BroadcastChannel | null>(null)
  const remoteSeenRef = useRef(Date.now() - PEER_TTL_MS)
  const seenEventIdsRef = useRef(new Set<string>())
  const sequenceRef = useRef(0)
  const crdtDocumentRef = useRef<LocalCrdtCharacter[] | null>(null)
  const syncNowRef = useRef<() => Promise<void>>(async () => undefined)
  const [peers, setPeers] = useState<LocalCollabPeer[]>([])
  const [drafts, setDrafts] = useState<LocalCollabDraft[]>([])
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)

  useEffect(() => {
    peerRef.current = { ...peerRef.current, name: peerName, seenAt: Date.now() }
  }, [peerName])

  useEffect(() => {
    if (!documentId) {
      setPeers([])
      setDrafts([])
      setSyncing(false)
      setLastSyncError(null)
      seenEventIdsRef.current.clear()
      crdtDocumentRef.current = null
      syncNowRef.current = async () => undefined
      return
    }
    seenEventIdsRef.current.clear()
    sequenceRef.current = 0
    crdtDocumentRef.current = null
    let active = true

    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(localCollabChannelName(documentId))
    channelRef.current = channel

    const persistCrdtDocument = (characters: LocalCrdtCharacter[], clientId: string, sequence: number) => {
      if (!transport?.saveCrdtState) return
      const content = readLocalCrdtText(characters)
      void transport
        .saveCrdtState({
          documentId,
          characters,
          checksum: collaborationChecksum(content),
          clientId,
          sequence,
          updatedAt: Date.now(),
        })
        .catch(error => {
          console.warn('[notes] local collaboration CRDT state save failed:', error)
        })
    }

    if (transport?.getCrdtState) {
      void transport
        .getCrdtState(documentId)
        .then(state => {
          if (!active || !state) return
          crdtDocumentRef.current = state.characters
          sequenceRef.current = Math.max(sequenceRef.current, state.sequence)
        })
        .catch(error => {
          console.warn('[notes] local collaboration CRDT state load failed:', error)
        })
    }

    const ingestMessage = (message: unknown) => {
      if (!isLocalCollabMessage(message, documentId)) return
      if (seenEventIdsRef.current.has(message.eventId)) return
      seenEventIdsRef.current.add(message.eventId)
      sequenceRef.current = Math.max(sequenceRef.current, message.sequence)
      remoteSeenRef.current = Math.max(remoteSeenRef.current, message.updatedAt)
      if (message.peer.id === peerId) return
      setPeers(current => {
        if (message.type === 'leave') return current.filter(peer => peer.id !== message.peer.id)
        const peer = message.cursor ? { ...message.peer, cursor: message.cursor } : message.peer
        const next = current.filter(peer => peer.id !== message.peer.id)
        return pruneStalePeers([...next, peer])
      })
      if (message.type === 'operation' && message.crdtOperations?.length && crdtDocumentRef.current) {
        const nextDocument = applyLocalCrdtOperations(crdtDocumentRef.current, message.crdtOperations)
        crdtDocumentRef.current = nextDocument
        persistCrdtDocument(nextDocument, message.clientId, message.sequence)
      }
      if (message.type === 'draft' || message.type === 'operation') {
        const source = message.type
        const content = message.content
        const baseChecksum = message.baseChecksum
        const contentChecksum = message.contentChecksum
        if (content === undefined || baseChecksum === undefined || contentChecksum === undefined) return
        setDrafts(current => {
          const nextDraft = {
            id: message.eventId,
            clientId: message.clientId,
            sequence: message.sequence,
            peer: message.peer,
            content,
            baseChecksum,
            contentChecksum,
            operations: message.operations,
            crdtOperations: message.crdtOperations,
            richOperations: message.richOperations,
            source,
            updatedAt: message.updatedAt,
          }
          const queued = current.filter(draft => {
            if (draft.id === nextDraft.id) return false
            return !(source === 'draft' && draft.source === 'draft' && draft.peer.id === message.peer.id)
          })
          return [...queued, nextDraft]
            .sort(compareLocalCollabDrafts)
            .slice(-25)
        })
      }
    }

    const buildSequencedMessage = (
      type: LocalCollabMessageType,
      content?: string,
      baseContent = '',
      cursor?: LocalCollabCursor,
    ) => {
      const sequence = sequenceRef.current + 1
      sequenceRef.current = sequence
      return {
        ...buildLocalCollabMessage(type, documentId, peerRef.current, content, baseContent, cursor),
        clientId: peerId,
        sequence,
      }
    }

    const publishMessage = (message: LocalCollabMessage) => {
      channel?.postMessage(message)
      if (transport) {
        void transport.publish(message).catch(error => {
          console.warn('[notes] local collaboration transport publish failed:', error)
        })
      }
    }

    const sendPresence = () => {
      publishMessage(buildSequencedMessage('presence'))
    }
    const onMessage = (event: MessageEvent) => {
      ingestMessage(event.data)
    }
    const pollTransport = async (manual = false) => {
      if (!transport) return
      if (manual) setSyncing(true)
      try {
        if (transport.getCrdtState) {
          const state = await transport.getCrdtState(documentId)
          if (state && active) {
            crdtDocumentRef.current = state.characters
            sequenceRef.current = Math.max(sequenceRef.current, state.sequence)
          }
        }
        const events = await transport.list(documentId, remoteSeenRef.current)
        orderLocalCollabMessages(events).forEach(ingestMessage)
        if (active) {
          setLastSyncedAt(Date.now())
          setLastSyncError(null)
        }
      } catch (error) {
        if (active) setLastSyncError(collabErrorMessage(error))
        console.warn('[notes] local collaboration transport poll failed:', error)
      } finally {
        if (manual && active) setSyncing(false)
      }
    }
    syncNowRef.current = () => pollTransport(true)

    channel?.addEventListener('message', onMessage)
    sendPresence()
    void pollTransport()
    const presenceTimer = window.setInterval(sendPresence, PRESENCE_INTERVAL_MS)
    const transportTimer = window.setInterval(() => {
      void pollTransport()
    }, TRANSPORT_POLL_MS)
    const pruneTimer = window.setInterval(() => {
      setPeers(current => pruneStalePeers(current))
    }, PRESENCE_INTERVAL_MS)

    return () => {
      active = false
      publishMessage(buildSequencedMessage('leave'))
      window.clearInterval(presenceTimer)
      window.clearInterval(transportTimer)
      window.clearInterval(pruneTimer)
      channel?.removeEventListener('message', onMessage)
      channel?.close()
      channelRef.current = null
      crdtDocumentRef.current = null
      syncNowRef.current = async () => undefined
      setSyncing(false)
      setPeers([])
      setDrafts([])
    }
  }, [documentId, peerId, transport])

  const broadcastDraft = useCallback(
    (content: string, baseContent = '') => {
      if (!documentId) return
      sequenceRef.current += 1
      const message = {
        ...buildLocalCollabMessage('draft', documentId, peerRef.current, content, baseContent),
        clientId: peerId,
        sequence: sequenceRef.current,
      }
      channelRef.current?.postMessage(message)
      if (transport) {
        void transport.publish(message).catch(error => {
          console.warn('[notes] local collaboration transport publish failed:', error)
        })
      }
    },
    [documentId, peerId, transport],
  )

  const broadcastOperation = useCallback(
    (content: string, baseContent = '') => {
      if (!documentId) return
      const operations = buildLocalTextOperations(baseContent, content)
      if (operations.length === 0) return
      sequenceRef.current += 1
      const baseDocument =
        crdtDocumentRef.current && readLocalCrdtText(crdtDocumentRef.current) === baseContent
          ? crdtDocumentRef.current
          : localCrdtDocumentFromText(baseContent)
      const crdtOperations = buildLocalCrdtOperationsFromDocument(
        baseDocument,
        baseContent,
        content,
        peerId,
        sequenceRef.current,
      )
      const richOperations = buildLocalRichTextOperations(baseContent, content, peerId, sequenceRef.current)
      const message = {
        ...buildLocalCollabMessage('operation', documentId, peerRef.current, content, baseContent),
        clientId: peerId,
        sequence: sequenceRef.current,
        operations,
        crdtOperations,
        richOperations,
      }
      const nextDocument = applyLocalCrdtOperations(baseDocument, crdtOperations)
      crdtDocumentRef.current = nextDocument
      if (transport?.saveCrdtState) {
        void transport
          .saveCrdtState({
            documentId,
            characters: nextDocument,
            checksum: collaborationChecksum(readLocalCrdtText(nextDocument)),
            clientId: peerId,
            sequence: sequenceRef.current,
            updatedAt: Date.now(),
          })
          .catch(error => {
            console.warn('[notes] local collaboration CRDT state save failed:', error)
          })
      }
      channelRef.current?.postMessage(message)
      if (transport) {
        void transport.publish(message).catch(error => {
          console.warn('[notes] local collaboration transport publish failed:', error)
        })
      }
    },
    [documentId, peerId, transport],
  )

  const broadcastCursor = useCallback(
    (anchor: number, head = anchor) => {
      if (!documentId) return
      const cursor = normalizeLocalCollabCursor(anchor, head)
      sequenceRef.current += 1
      const message = {
        ...buildLocalCollabMessage('cursor', documentId, peerRef.current, undefined, '', cursor),
        clientId: peerId,
        sequence: sequenceRef.current,
      }
      channelRef.current?.postMessage(message)
      if (transport) {
        void transport.publish(message).catch(error => {
          console.warn('[notes] local collaboration transport publish failed:', error)
        })
      }
    },
    [documentId, peerId, transport],
  )

  const dismissDraft = useCallback((draftId: string) => {
    setDrafts(current => current.filter(draft => draft.id !== draftId))
  }, [])

  const syncNow = useCallback(() => syncNowRef.current(), [])

  return {
    supported: typeof BroadcastChannel !== 'undefined' || !!transport,
    peers,
    drafts,
    syncing,
    lastSyncedAt,
    lastSyncError,
    syncNow,
    broadcastDraft,
    broadcastOperation,
    broadcastCursor,
    dismissDraft,
  }
}

export function normalizeLocalCollabCursor(anchor: number, head = anchor, now = Date.now()): LocalCollabCursor {
  const safeAnchor = Math.max(0, Math.floor(Number(anchor) || 0))
  const safeHead = Math.max(0, Math.floor(Number(head) || 0))
  return { anchor: safeAnchor, head: safeHead, updatedAt: now }
}

function isLocalCollabCursor(value: unknown): value is LocalCollabCursor {
  if (!value || typeof value !== 'object') return false
  const cursor = value as Partial<LocalCollabCursor>
  return (
    typeof cursor.anchor === 'number' &&
    Number.isInteger(cursor.anchor) &&
    cursor.anchor >= 0 &&
    typeof cursor.head === 'number' &&
    Number.isInteger(cursor.head) &&
    cursor.head >= 0 &&
    typeof cursor.updatedAt === 'number'
  )
}

function localPeerId(): string {
  const key = 'mc-notes-local-collab-peer-id'
  try {
    const existing = window.localStorage.getItem(key)
    if (existing) return existing
    const next = crypto.randomUUID()
    window.localStorage.setItem(key, next)
    return next
  } catch {
    return `peer-${Math.random().toString(36).slice(2)}`
  }
}

function localCollabEventId(): string {
  try {
    return `evt-${crypto.randomUUID()}`
  } catch {
    return `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function collabErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error')
}

function collabProviderHasActivity(status: LocalCollabTransportStatus): boolean {
  return Boolean(status.lastCrdtStateAt ?? status.lastListedAt ?? status.lastPublishedAt)
}

function collabProviderIsLocal(status: LocalCollabTransportStatus | undefined): boolean {
  return status?.id === 'local-sqlite'
}

function collabProviderIssueLabel(status: LocalCollabTransportStatus): string {
  return status.lastError ? `${status.id} (${status.lastError})` : status.id
}
