import { describe, expect, it } from 'vitest'
import { matchesNoteSearch, matchesNoteSearchFilters, noteSearchText, parseNoteSearchQuery } from '../searchFilters'
import type { VaultNote } from '../types'

const baseNote: VaultNote = {
  _id: 'Projects/roadmap.md',
  type: 'note',
  title: 'Roadmap',
  content: 'Launch plan with private milestones',
  folder: 'Projects',
  tags: ['strategy', 'planning'],
  links: [],
  aliases: ['Launch Plan'],
  created_at: Date.parse('2026-01-01'),
  updated_at: Date.parse('2026-05-10'),
}

describe('notes search filters', () => {
  it('splits backend full-text terms from local filters', () => {
    expect(noteSearchText('roadmap tag:strategy trash:false')).toBe('roadmap')
    expect(parseNoteSearchQuery('type:attachment trash:true')).toEqual({
      text: '',
      filters: [
        { key: 'type', value: 'attachment' },
        { key: 'trash', value: 'true' },
      ],
    })
  })

  it('matches tags, folders, aliases, dates, and trash state', () => {
    expect(matchesNoteSearch(baseNote, 'launch tag:strategy folder:Projects after:2026-05-01 trash:false')).toBe(true)
    expect(matchesNoteSearch(baseNote, 'tag:personal')).toBe(false)
    expect(matchesNoteSearch(baseNote, 'before:2026-05-01')).toBe(false)
    expect(matchesNoteSearch({ ...baseNote, folder: 'Trash/Projects', trashed_at: Date.now() }, 'trash:true')).toBe(
      true,
    )
  })

  it('matches frontmatter properties by free text and property filters', () => {
    const note = { ...baseNote, properties: { status: 'active', owner: ['Ari', 'Docs'] } }

    expect(matchesNoteSearch(note, 'status')).toBe(true)
    expect(matchesNoteSearch(note, 'property:owner=docs')).toBe(true)
    expect(matchesNoteSearch(note, 'prop:status=done')).toBe(false)
  })

  it('matches attachment type filters', () => {
    const attachment: VaultNote = {
      ...baseNote,
      _id: 'Media/diagram.png',
      type: 'attachment',
      title: 'diagram.png',
      folder: 'Media',
      content: '',
      tags: [],
      aliases: [],
    }

    expect(matchesNoteSearch(attachment, 'type:attachment folder:Media')).toBe(true)
    expect(matchesNoteSearch(attachment, 'type:note')).toBe(false)
  })

  it('can apply only local filters to backend full-text results', () => {
    expect(matchesNoteSearch(baseNote, 'comment-only-term tag:strategy')).toBe(false)
    expect(matchesNoteSearchFilters(baseNote, 'comment-only-term tag:strategy')).toBe(true)
    expect(matchesNoteSearchFilters(baseNote, 'comment-only-term trash:true')).toBe(false)
  })
})
