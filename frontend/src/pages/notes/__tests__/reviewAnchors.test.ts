import { describe, expect, it } from 'vitest'
import type { NoteReviewMarker } from '../types'
import { resolveTextReviewRanges } from '../reviewAnchors'

describe('review anchor resolution', () => {
  it('migrates stale duplicate quote anchors toward their original position', () => {
    const text = 'Alpha\n\ninserted line before the target\n\nAlpha'
    const secondAlpha = text.lastIndexOf('Alpha')
    const markers: NoteReviewMarker[] = [{
      id: 'comment-1',
      kind: 'comment',
      anchor: {
        scope: 'selection',
        mode: 'markdown',
        start: secondAlpha - 12,
        end: secondAlpha - 7,
        quote: 'Alpha',
      },
    }]

    const [range] = resolveTextReviewRanges(text, markers, 'comment-1', 'markdown')

    expect(range).toMatchObject({
      id: 'comment-1',
      from: secondAlpha,
      to: secondAlpha + 'Alpha'.length,
      active: true,
    })
  })
})
