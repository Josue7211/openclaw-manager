import { describe, expect, it } from 'vitest'
import { groupedNotesShortcuts, NOTES_SHORTCUTS } from '../notesShortcuts'

describe('notesShortcuts', () => {
  it('documents the core local notes shortcuts by scope', () => {
    const grouped = groupedNotesShortcuts()

    expect(grouped.Vault.map((item) => item.keys)).toContain('Ctrl/Cmd+S')
    expect(grouped.Editor.map((item) => item.keys)).toContain('Ctrl/Cmd+F')
    expect(grouped.Review.map((item) => item.keys)).toContain('Escape')
    expect(NOTES_SHORTCUTS.length).toBeGreaterThan(10)
  })
})
