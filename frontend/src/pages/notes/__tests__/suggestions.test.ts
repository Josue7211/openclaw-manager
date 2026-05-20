import { describe, expect, it } from 'vitest'
import { applySuggestionPatch, replaceAnchoredContent } from '../suggestions'

describe('suggestion patches', () => {
  it('replaces selected text by direct range when the quote still matches', () => {
    expect(replaceAnchoredContent('hello local vault', {
      scope: 'selection',
      start: 6,
      end: 11,
      quote: 'local',
    }, 'private')).toBe('hello private vault')
  })

  it('falls back to quote search when the stored range drifted', () => {
    expect(replaceAnchoredContent('intro hello local vault', {
      scope: 'selection',
      start: 0,
      end: 5,
      quote: 'local',
    }, 'private')).toBe('intro hello private vault')
  })

  it('applies document, selection, and cursor insert suggestions', () => {
    expect(applySuggestionPatch('draft', { type: 'replace_document', content: 'final' }, { scope: 'document' }))
      .toEqual({ content: 'final', error: null })
    expect(applySuggestionPatch('hello local vault', { type: 'replace_selection', content: 'private' }, {
      scope: 'selection',
      start: 6,
      end: 11,
      quote: 'local',
    })).toEqual({ content: 'hello private vault', error: null })
    expect(applySuggestionPatch('hello vault', { type: 'insert_at_cursor', content: ' private' }, {
      scope: 'cursor',
      start: 5,
      end: 5,
    })).toEqual({ content: 'hello private vault', error: null })
  })

  it('reports unsupported suggestions and stale anchors without mutating content', () => {
    expect(applySuggestionPatch('hello vault', { type: 'replace_selection', content: 'private' }, {
      scope: 'selection',
      start: 0,
      end: 5,
      quote: 'missing',
    })).toEqual({ content: null, error: 'anchor_mismatch' })
    expect(applySuggestionPatch('hello vault', { type: 'unknown', content: 'private' }, { scope: 'document' }))
      .toEqual({ content: null, error: 'unsupported' })
  })
})
