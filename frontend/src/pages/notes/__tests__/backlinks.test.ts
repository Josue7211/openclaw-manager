import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { buildBacklinkReferences } from '../backlinks'
import BacklinksPanel from '../BacklinksPanel'
import type { VaultNote } from '../types'

function note(overrides: Partial<VaultNote>): VaultNote {
  return {
    _id: 'note.md',
    type: 'note',
    title: 'Note',
    content: '',
    folder: '',
    tags: [],
    links: [],
    aliases: [],
    created_at: 1,
    updated_at: 1,
    ...overrides,
  }
}

describe('backlink references', () => {
  it('groups linked mentions, alias mentions, and unlinked plain mentions', () => {
    const notes = [
      note({
        _id: 'Projects/target.md',
        title: 'Project Alpha',
        aliases: ['Alpha'],
      }),
      note({
        _id: 'Links/linked.md',
        title: 'Linked',
        links: ['Project Alpha#Launch Plan'],
        content: 'Already linked to [[Project Alpha#Launch Plan]].',
      }),
      note({
        _id: 'Links/unlinked.md',
        title: 'Unlinked',
        content: 'This paragraph names Alpha without a wikilink.',
      }),
    ]

    const references = buildBacklinkReferences('Project Alpha', notes)

    expect(references.linked.map((reference) => reference.note._id)).toEqual(['Links/linked.md'])
    expect(references.unlinked).toEqual([
      expect.objectContaining({
        note: expect.objectContaining({ _id: 'Links/unlinked.md' }),
        matchedText: 'Alpha',
        snippet: expect.stringContaining('Alpha without a wikilink'),
      }),
    ])
  })

  it('counts frontmatter property wikilinks as linked mentions', () => {
    const notes = [
      note({
        _id: 'Projects/target.md',
        title: 'Project Alpha',
        aliases: ['Alpha'],
      }),
      note({
        _id: 'Links/property-linked.md',
        title: 'Property linked',
        content: '# Property linked',
        properties: { related: '[[Project Alpha]]' },
      }),
    ]

    const references = buildBacklinkReferences('Project Alpha', notes)

    expect(references.linked).toEqual([
      expect.objectContaining({
        note: expect.objectContaining({ _id: 'Links/property-linked.md' }),
        snippet: 'related: [[Project Alpha]]',
      }),
    ])
    expect(references.unlinked).toEqual([])
  })

  it('counts frontmatter property path links as linked mentions', () => {
    const notes = [
      note({
        _id: 'Projects/target.md',
        title: 'Project Alpha',
      }),
      note({
        _id: 'Links/property-path.md',
        title: 'Property path',
        properties: { related: 'Projects/target.md' },
      }),
    ]

    expect(buildBacklinkReferences('Project Alpha', notes).linked.map((reference) => reference.note._id))
      .toEqual(['Links/property-path.md'])
  })

  it('does not treat partial words or existing wikilinks as unlinked mentions', () => {
    const notes = [
      note({
        _id: 'Projects/target.md',
        title: 'Roadmap',
      }),
      note({
        _id: 'Links/false-positive.md',
        title: 'False positive',
        content: 'Roadmapping is not a mention. [[Roadmap]] is already linked.',
        links: [],
      }),
    ]

    expect(buildBacklinkReferences('Roadmap', notes).unlinked).toEqual([])
  })

  it('passes the matched alias text when linking an unlinked mention', () => {
    localStorage.setItem('mc-backlinks-collapsed', 'false')
    const onLinkMention = vi.fn()
    const notes = [
      note({
        _id: 'Projects/target.md',
        title: 'Project Alpha',
        aliases: ['Alpha'],
      }),
      note({
        _id: 'Links/unlinked.md',
        title: 'Unlinked',
        content: 'This paragraph names Alpha without a wikilink.',
      }),
    ]

    render(createElement(BacklinksPanel, {
      currentNoteTitle: 'Project Alpha',
      allNotes: notes,
      onNavigate: vi.fn(),
      onLinkMention,
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Link mention in Unlinked' }))

    expect(onLinkMention).toHaveBeenCalledWith('Links/unlinked.md', 'Alpha')
  })

  it('passes all unlinked references when linking every mention', () => {
    localStorage.setItem('mc-backlinks-collapsed', 'false')
    const onLinkAllMentions = vi.fn()
    const notes = [
      note({
        _id: 'Projects/target.md',
        title: 'Project Alpha',
        aliases: ['Alpha'],
      }),
      note({
        _id: 'Links/first.md',
        title: 'First',
        content: 'Alpha appears here.',
      }),
      note({
        _id: 'Links/second.md',
        title: 'Second',
        content: 'Project Alpha appears here too.',
      }),
    ]

    render(createElement(BacklinksPanel, {
      currentNoteTitle: 'Project Alpha',
      allNotes: notes,
      onNavigate: vi.fn(),
      onLinkAllMentions,
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Link all' }))

    expect(onLinkAllMentions).toHaveBeenCalledWith([
      expect.objectContaining({
        note: expect.objectContaining({ _id: 'Links/first.md' }),
        matchedText: 'Alpha',
      }),
      expect.objectContaining({
        note: expect.objectContaining({ _id: 'Links/second.md' }),
        matchedText: 'Project Alpha',
      }),
    ])
  })
})
