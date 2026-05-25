import { describe, expect, it } from 'vitest'
import {
  matchesNoteSearch,
  matchesNoteSearchFilters,
  noteSearchMatchSummary,
  noteSearchRank,
  noteSearchText,
  parseNoteSearchQuery,
  searchHighlightTerms,
} from '../searchFilters'
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
    expect(noteSearchText('launch -private tag:strategy')).toBe('launch')
    expect(parseNoteSearchQuery('type:attachment trash:true')).toEqual({
      text: '',
      filters: [
        { key: 'type', value: 'attachment' },
        { key: 'trash', value: 'true' },
      ],
    })
  })

  it('parses quoted operators and negated terms', () => {
    expect(parseNoteSearchQuery('file:"Launch Plan" -tag:personal -private')).toEqual({
      text: '',
      filters: [
        { key: 'title', value: 'Launch Plan' },
        { key: 'tag', value: 'personal', negated: true },
        { key: 'text', value: 'private', negated: true },
      ],
    })
  })

  it('treats explicit AND as a separator and NOT as negation', () => {
    expect(noteSearchText('launch AND tag:strategy')).toBe('launch')
    expect(parseNoteSearchQuery('tag:strategy AND NOT private')).toEqual({
      text: '',
      filters: [
        { key: 'tag', value: 'strategy' },
        { key: 'text', value: 'private', negated: true },
      ],
    })
    expect(parseNoteSearchQuery('NOT tag:personal')).toEqual({
      text: '',
      filters: [{ key: 'tag', value: 'personal', negated: true }],
    })
    expect(matchesNoteSearch(baseNote, 'launch AND tag:strategy AND NOT archived')).toBe(true)
    expect(matchesNoteSearch(baseNote, 'launch AND tag:strategy AND NOT private')).toBe(false)
  })

  it('keeps quoted AND/NOT and non-boundary operator words as ordinary text', () => {
    expect(parseNoteSearchQuery('"AND" notebook')).toEqual({
      text: 'AND notebook',
      filters: [],
    })
    expect(matchesNoteSearch({ ...baseNote, content: 'NOT private' }, 'content:"NOT private"')).toBe(true)
    expect(matchesNoteSearch(baseNote, 'notebook')).toBe(false)
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

  it('matches Obsidian-style operators for tasks, headings, blocks, and has checks', () => {
    const note = {
      ...baseNote,
      content: ['# Launch Plan', '', '- [ ] Draft rollout', '- [x] Review risks', '', 'Decision block ^abc123'].join('\n'),
      properties: { status: 'active' },
      links: ['Inbox.md'],
    }

    expect(matchesNoteSearch(note, 'section:launch task:todo has:links block:abc123')).toBe(true)
    expect(matchesNoteSearch(note, 'task:done has:property')).toBe(true)
    expect(matchesNoteSearch(note, 'task:blocked')).toBe(false)
    expect(matchesNoteSearch(note, 'has:tags -tag:personal -private')).toBe(true)
    expect(matchesNoteSearch(note, '-tag:strategy')).toBe(false)
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

  it('matches top-level OR query alternatives locally', () => {
    expect(noteSearchText('title:Roadmap OR tag:personal')).toBe('')
    expect(matchesNoteSearch(baseNote, 'tag:personal OR title:Roadmap')).toBe(true)
    expect(matchesNoteSearch(baseNote, 'tag:personal OR title:Inbox')).toBe(false)
    expect(matchesNoteSearch(baseNote, '(tag:personal folder:Inbox) OR (tag:strategy folder:Projects)')).toBe(true)
  })

  it('matches nested Boolean groups with implicit AND', () => {
    expect(noteSearchText('(tag:personal OR tag:strategy) folder:Projects')).toBe('')
    expect(matchesNoteSearch(baseNote, '(tag:personal OR tag:strategy) folder:Projects')).toBe(true)
    expect(matchesNoteSearch(baseNote, '(tag:personal OR folder:Inbox) title:Roadmap')).toBe(false)
    expect(matchesNoteSearch(baseNote, 'tag:strategy AND NOT (tag:personal OR folder:Archive)')).toBe(true)
    expect(matchesNoteSearch(baseNote, 'tag:strategy AND NOT (content:private OR folder:Archive)')).toBe(false)
  })

  it('extracts positive highlight terms and ranks stronger note hits first', () => {
    expect(searchHighlightTerms('tag:strategy AND NOT (tag:personal OR folder:Archive) roadmap')).toEqual([
      'strategy',
      'roadmap',
    ])

    const titleMatch = { ...baseNote, title: 'Launch Plan', content: 'private milestones' }
    const bodyMatch = { ...baseNote, title: 'Weekly', aliases: [], tags: [], content: 'Launch plan' }

    expect(noteSearchRank(titleMatch, 'launch')).toBeGreaterThan(noteSearchRank(bodyMatch, 'launch'))
    expect(noteSearchMatchSummary(bodyMatch, 'launch')).toBe('Launch plan')
    expect(noteSearchMatchSummary({ ...baseNote, title: 'Weekly' }, 'tag:strategy')).toBe('#strategy')
  })

  it('keeps OR words inside quoted text and non-boundary terms as ordinary search text', () => {
    expect(matchesNoteSearch({ ...baseNote, content: 'Launch plan OR private milestones' }, 'content:"Launch plan OR private milestones"')).toBe(true)
    expect(matchesNoteSearch(baseNote, 'origin')).toBe(false)
  })
})
