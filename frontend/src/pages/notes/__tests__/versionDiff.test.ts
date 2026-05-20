import { describe, expect, it } from 'vitest'
import { VERSION_RESTORE_SAFETY_NOTE, buildVersionDiff, restoreRevisionConfirmMessage, summarizeVersionDiff } from '../versionDiff'

describe('version diff', () => {
  it('keeps shared context and marks changed middle lines', () => {
    const rows = buildVersionDiff('A\nB\nC\nD', 'A\nBeta\nC\nD')

    expect(rows).toEqual([
      { kind: 'same', text: 'A' },
      { kind: 'removed', text: 'B' },
      { kind: 'added', text: 'Beta' },
      { kind: 'same', text: 'C' },
      { kind: 'same', text: 'D' },
    ])
    expect(summarizeVersionDiff(rows)).toEqual({ added: 1, removed: 1, changed: 2 })
  })

  it('handles inserted and removed document tails', () => {
    expect(buildVersionDiff('A\nB', 'A\nB\nC')).toEqual([
      { kind: 'same', text: 'A' },
      { kind: 'same', text: 'B' },
      { kind: 'added', text: 'C' },
    ])

    expect(buildVersionDiff('A\nB\nC', 'A')).toEqual([
      { kind: 'same', text: 'A' },
      { kind: 'removed', text: 'B' },
      { kind: 'removed', text: 'C' },
    ])
  })

  it('states that restores create a safety version first', () => {
    expect(restoreRevisionConfirmMessage('local:Projects/roadmap.md:2', 'Launch draft')).toBe(
      `Restore revision "Launch draft"? ${VERSION_RESTORE_SAFETY_NOTE}`,
    )
    expect(restoreRevisionConfirmMessage('local:Projects/roadmap.md:2')).toContain(
      'pre-restore safety version before replacing current content',
    )
  })
})
