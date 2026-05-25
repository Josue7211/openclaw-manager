import { describe, expect, it } from 'vitest'
import {
  NOTES_PINNED_NOTES_SYNC_NOTE_ID,
  mergePinnedNotesState,
  normalizePinnedNoteIds,
  parsePinnedNotesDocument,
  serializePinnedNotesDocument,
} from '../pinnedNotesSync'

describe('pinned notes synced vault document', () => {
  it('uses an internal vault note path for synced pinned notes', () => {
    expect(NOTES_PINNED_NOTES_SYNC_NOTE_ID).toBe('.clawcontrol/pinned-notes.md')
  })

  it('round-trips normalized pinned notes through the sync document content', () => {
    const state = {
      pinnedNoteIds: ['Projects/roadmap.md', 'Inbox/today.md'],
      updatedAt: 20,
    }
    const content = serializePinnedNotesDocument(state)

    expect(content).toContain('clawcontrol:pinned-notes:v1')
    expect(parsePinnedNotesDocument(content)).toEqual(state)
  })

  it('normalizes pinned ids and removes duplicates', () => {
    expect(normalizePinnedNoteIds([' Projects/roadmap.md ', '', 'Projects/roadmap.md', 'Inbox/today.md'])).toEqual([
      'Projects/roadmap.md',
      'Inbox/today.md',
    ])
  })

  it('merges by newest state timestamp and unions equal timestamp states', () => {
    expect(mergePinnedNotesState(
      { pinnedNoteIds: ['old.md'], updatedAt: 10 },
      { pinnedNoteIds: ['new.md'], updatedAt: 20 },
    )).toEqual({ pinnedNoteIds: ['new.md'], updatedAt: 20 })

    expect(mergePinnedNotesState(
      { pinnedNoteIds: ['synced.md'], updatedAt: 20 },
      { pinnedNoteIds: ['local.md'], updatedAt: 20 },
    )).toEqual({ pinnedNoteIds: ['local.md', 'synced.md'], updatedAt: 20 })
  })

  it('ignores malformed synced pinned-note content', () => {
    expect(parsePinnedNotesDocument('')).toEqual({ pinnedNoteIds: [], updatedAt: 0 })
    expect(parsePinnedNotesDocument('<!-- clawcontrol:pinned-notes:v1 -->\nnot json\n<!-- /clawcontrol:pinned-notes:v1 -->')).toEqual({
      pinnedNoteIds: [],
      updatedAt: 0,
    })
  })
})
