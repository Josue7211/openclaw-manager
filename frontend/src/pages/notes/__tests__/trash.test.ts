import { describe, expect, it } from 'vitest'
import { isNoteInTrash, isNotesTrashPath, noteFolderPath, normalizeNotesFolderPath } from '../trash'
import type { VaultNote } from '../types'

function note(overrides: Partial<VaultNote> = {}): VaultNote {
  return {
    _id: 'Projects/brief.md',
    type: 'note',
    title: 'Brief',
    content: '',
    folder: 'Projects',
    tags: [],
    links: [],
    created_at: 1,
    updated_at: 2,
    ...overrides,
  }
}

describe('notes trash path helpers', () => {
  it('normalizes folder paths before classifying trash', () => {
    expect(normalizeNotesFolderPath(' / Trash / Projects / ')).toBe('Trash/Projects')
    expect(normalizeNotesFolderPath(' Home\u200Bwork /\uFEFF Commands ')).toBe('Homework/Commands')
    expect(isNotesTrashPath('trash')).toBe(true)
    expect(isNotesTrashPath(' Trash / Projects ')).toBe(true)
    expect(isNotesTrashPath('Projects/Trash')).toBe(false)
  })

  it('keeps recoverable trashed notes visible in Trash even when folder metadata is stale', () => {
    const stale = note({ folder: 'Projects', trash_origin_path: 'Projects', trashed_at: 10 })

    expect(noteFolderPath(stale)).toBe('Trash/Projects')
    expect(isNoteInTrash(stale)).toBe(true)
  })
})
