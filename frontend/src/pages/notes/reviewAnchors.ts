import type { NoteReviewMarker, NoteSelectionAnchor } from './types'

export interface ReviewTextRange {
  id: string
  kind: NoteReviewMarker['kind']
  from: number
  to: number
  active: boolean
}

export function normalizeSelectionAnchor(anchor: NoteReviewMarker['anchor']): NoteSelectionAnchor | null {
  if (!anchor || typeof anchor !== 'object') return null
  const raw = anchor as Record<string, unknown>
  const scope = raw.scope
  if (scope !== 'selection' && scope !== 'cursor' && scope !== 'document') return null
  return {
    scope,
    mode: raw.mode === 'markdown' || raw.mode === 'document' ? raw.mode : undefined,
    start: typeof raw.start === 'number' ? raw.start : undefined,
    end: typeof raw.end === 'number' ? raw.end : undefined,
    from_line: typeof raw.from_line === 'number' ? raw.from_line : undefined,
    to_line: typeof raw.to_line === 'number' ? raw.to_line : undefined,
    quote: typeof raw.quote === 'string' ? raw.quote : undefined,
  }
}

export function resolveTextReviewRanges(
  text: string,
  markers: NoteReviewMarker[],
  activeId: string | null | undefined,
  preferredMode?: NoteSelectionAnchor['mode'],
): ReviewTextRange[] {
  const ranges: ReviewTextRange[] = []
  const occupiedQuotes = new Map<string, number>()

  for (const marker of markers) {
    const anchor = normalizeSelectionAnchor(marker.anchor)
    if (!anchor || anchor.scope !== 'selection') continue

    const direct = resolveDirectRange(text, anchor, preferredMode)
    const fallback = direct ?? resolveQuoteRange(text, anchor.quote, occupiedQuotes)
    if (!fallback) continue

    ranges.push({
      id: marker.id,
      kind: marker.kind,
      from: fallback.from,
      to: fallback.to,
      active: marker.id === activeId,
    })
  }

  return ranges
    .filter((range) => range.to > range.from)
    .sort((a, b) => a.from - b.from || a.to - b.to || a.id.localeCompare(b.id))
}

function resolveDirectRange(
  text: string,
  anchor: NoteSelectionAnchor,
  preferredMode?: NoteSelectionAnchor['mode'],
): { from: number; to: number } | null {
  if (preferredMode && anchor.mode && anchor.mode !== preferredMode) return null
  if (typeof anchor.start !== 'number' || typeof anchor.end !== 'number') return null
  const from = Math.max(0, Math.min(anchor.start, text.length))
  const to = Math.max(from, Math.min(anchor.end, text.length))
  if (to <= from) return null
  if (anchor.quote && text.slice(from, to) !== anchor.quote) return null
  return { from, to }
}

function resolveQuoteRange(
  text: string,
  quote: string | undefined,
  occupiedQuotes: Map<string, number>,
): { from: number; to: number } | null {
  const needle = quote?.trim()
  if (!needle) return null
  const fromIndex = occupiedQuotes.get(needle) ?? 0
  const index = text.indexOf(needle, fromIndex)
  if (index < 0) return null
  occupiedQuotes.set(needle, index + needle.length)
  return { from: index, to: index + needle.length }
}
