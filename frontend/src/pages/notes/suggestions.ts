import type { NoteSelectionAnchor } from './types'

export interface SuggestionPatchResult {
  content: string | null
  error: 'unsupported' | 'missing_content' | 'anchor_mismatch' | null
}

export function applySuggestionPatch(
  documentContent: string,
  patch: Record<string, unknown> | undefined,
  anchor: NoteSelectionAnchor | undefined,
): SuggestionPatchResult {
  const type = patch?.type
  const content = patch?.content
  if (typeof content !== 'string') {
    return { content: null, error: 'missing_content' }
  }

  if (type === 'replace_document') {
    return { content, error: null }
  }

  if (type === 'replace_selection') {
    const next = replaceAnchoredContent(documentContent, anchor, content)
    return next === null
      ? { content: null, error: 'anchor_mismatch' }
      : { content: next, error: null }
  }

  if (type === 'insert_at_cursor') {
    const next = insertAtCursor(documentContent, anchor, content)
    return next === null
      ? { content: null, error: 'anchor_mismatch' }
      : { content: next, error: null }
  }

  return { content: null, error: 'unsupported' }
}

export function replaceAnchoredContent(
  content: string,
  anchor: NoteSelectionAnchor | undefined,
  replacement: string,
): string | null {
  if (!anchor || anchor.scope !== 'selection') return null
  if (typeof anchor.start === 'number' && typeof anchor.end === 'number' && anchor.start >= 0 && anchor.end >= anchor.start) {
    const current = content.slice(anchor.start, anchor.end)
    if (!anchor.quote || current === anchor.quote) {
      return `${content.slice(0, anchor.start)}${replacement}${content.slice(anchor.end)}`
    }
  }
  if (anchor.quote) {
    const index = content.indexOf(anchor.quote)
    if (index >= 0) {
      return `${content.slice(0, index)}${replacement}${content.slice(index + anchor.quote.length)}`
    }
  }
  return null
}

function insertAtCursor(
  content: string,
  anchor: NoteSelectionAnchor | undefined,
  insertion: string,
): string | null {
  if (!anchor || anchor.scope !== 'cursor' || typeof anchor.start !== 'number') return null
  const index = Math.max(0, Math.min(anchor.start, content.length))
  return `${content.slice(0, index)}${insertion}${content.slice(index)}`
}
