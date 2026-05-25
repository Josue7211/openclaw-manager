import { describe, expect, it } from 'vitest'
import { buildVaultPropertyIndex } from '../documentPropertiesIndex'
import type { VaultNote } from '../types'

function note(overrides: Partial<VaultNote>): VaultNote {
  return {
    _id: 'Inbox/one.md',
    type: 'note',
    title: 'One',
    content: '# One',
    folder: 'Inbox',
    tags: [],
    links: [],
    aliases: [],
    properties: {},
    created_at: 1,
    updated_at: 1,
    ...overrides,
  }
}

describe('document properties index', () => {
  it('builds a vault-wide property index with counts and sample values', () => {
    const entries = buildVaultPropertyIndex([
      note({ _id: 'Inbox/one.md', title: 'One', properties: { status: 'draft', reviewers: ['Ada', 'Ben'] } }),
      note({ _id: 'Projects/two.md', title: 'Two', folder: 'Projects', properties: { status: 'ready', priority: '2' } }),
      note({ _id: 'Media/logo.png', type: 'attachment', title: 'Logo', properties: { status: 'ignored' } }),
    ])

    expect(entries.map(entry => `${entry.key}:${entry.noteCount}:${entry.kind}`)).toEqual([
      'status:2:text',
      'priority:1:number',
      'reviewers:1:list',
    ])
    expect(entries[0]).toEqual(expect.objectContaining({
      key: 'status',
      values: ['draft', 'ready'],
      notes: [
        expect.objectContaining({ title: 'One' }),
        expect.objectContaining({ title: 'Two' }),
      ],
    }))
  })

  it('filters properties by key, value, note title, and folder', () => {
    const notes = [
      note({ title: 'Launch brief', properties: { owner: 'Ada', status: 'draft' } }),
      note({ _id: 'Archive/spec.md', title: 'Spec', folder: 'Archive', properties: { status: 'approved' } }),
    ]

    expect(buildVaultPropertyIndex(notes, 'owner').map(entry => entry.key)).toEqual(['owner'])
    expect(buildVaultPropertyIndex(notes, 'approved').map(entry => entry.key)).toEqual(['status'])
    expect(buildVaultPropertyIndex(notes, 'launch').map(entry => entry.key)).toEqual(['status', 'owner'])
    expect(buildVaultPropertyIndex(notes, 'archive').map(entry => entry.key)).toEqual(['status'])
  })
})
