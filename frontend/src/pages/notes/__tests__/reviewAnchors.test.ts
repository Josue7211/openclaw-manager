import { describe, expect, it } from 'vitest'
import { normalizeSelectionAnchor, resolveTextReviewRanges } from '../reviewAnchors'

describe('reviewAnchors', () => {
  it('uses exact selection offsets when the stored quote still matches', () => {
    const text = 'Alpha beta gamma'
    expect(resolveTextReviewRanges(text, [{
      id: 'c1',
      kind: 'comment',
      anchor: { scope: 'selection', mode: 'markdown', start: 6, end: 10, quote: 'beta' },
    }], 'c1', 'markdown')).toEqual([{
      id: 'c1',
      kind: 'comment',
      from: 6,
      to: 10,
      active: true,
    }])
  })

  it('falls back to quoted text when offsets are stale or from another editor mode', () => {
    const text = 'Intro\nMoved beta text'
    expect(resolveTextReviewRanges(text, [{
      id: 's1',
      kind: 'suggestion',
      anchor: { scope: 'selection', mode: 'document', start: 100, end: 104, quote: 'beta' },
    }], null, 'markdown')).toEqual([{
      id: 's1',
      kind: 'suggestion',
      from: 12,
      to: 16,
      active: false,
    }])
  })

  it('keeps repeated quotes matched in order', () => {
    const text = 'beta then beta'
    const ranges = resolveTextReviewRanges(text, [
      { id: 'first', kind: 'comment', anchor: { scope: 'selection', quote: 'beta' } },
      { id: 'second', kind: 'comment', anchor: { scope: 'selection', quote: 'beta' } },
    ], 'second')

    expect(ranges.map((range) => [range.id, range.from, range.to, range.active])).toEqual([
      ['first', 0, 4, false],
      ['second', 10, 14, true],
    ])
  })

  it('normalizes only known selection anchor fields', () => {
    expect(normalizeSelectionAnchor({
      scope: 'selection',
      mode: 'markdown',
      start: 1,
      end: 5,
      quote: 'body',
      ignored: true,
    })).toEqual({
      scope: 'selection',
      mode: 'markdown',
      start: 1,
      end: 5,
      from_line: undefined,
      to_line: undefined,
      quote: 'body',
    })
  })
})
