import { describe, expect, it } from 'vitest'
import {
  NOTES_SAVED_SEARCH_SYNC_NOTE_ID,
  parseNotesSavedSearchDocument,
  serializeNotesSavedSearchDocument,
} from '../savedSearchSync'
import type { NotesSavedSearch } from '../savedSearches'

const savedSearch: NotesSavedSearch = {
  id: 'search:tag:active',
  label: 'Active notes',
  query: 'tag:active',
  createdAt: 10,
  updatedAt: 20,
}

describe('saved search synced vault document', () => {
  it('uses an internal vault note path for synced saved searches', () => {
    expect(NOTES_SAVED_SEARCH_SYNC_NOTE_ID).toBe('.clawcontrol/saved-searches.md')
  })

  it('round-trips normalized saved searches through the sync document content', () => {
    const content = serializeNotesSavedSearchDocument([savedSearch])

    expect(content).toContain('clawcontrol:saved-searches:v1')
    expect(parseNotesSavedSearchDocument(content)).toEqual([savedSearch])
  })

  it('ignores malformed synced saved search content', () => {
    expect(parseNotesSavedSearchDocument('')).toEqual([])
    expect(parseNotesSavedSearchDocument('<!-- clawcontrol:saved-searches:v1 -->\nnot json\n<!-- /clawcontrol:saved-searches:v1 -->')).toEqual([])
  })
})
