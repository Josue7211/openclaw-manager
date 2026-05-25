import { describe, expect, it } from 'vitest'
import { affectedNotesForTagRename, applyTagToContent, buildTagIndex, buildTagRows, removeTagFromContent, renameTagInContent } from '../tags'

describe('notes tags', () => {
  it('builds nested tag rows with inherited counts', () => {
    const rows = buildTagRows([
      { type: 'note', tags: ['project/alpha', 'project/beta', 'area'] },
      { type: 'note', tags: ['#project/alpha'] },
      { type: 'attachment', tags: ['project/ignored'] },
    ])

    expect(rows).toEqual([
      { tag: 'area', label: 'area', depth: 0, count: 1, directCount: 1 },
      { tag: 'project', label: 'project', depth: 0, count: 3, directCount: 0 },
      { tag: 'project/alpha', label: 'alpha', depth: 1, count: 2, directCount: 2 },
      { tag: 'project/beta', label: 'beta', depth: 1, count: 1, directCount: 1 },
    ])
  })

  it('limits rows after sorting', () => {
    expect(buildTagRows([{ type: 'note', tags: ['b', 'a', 'c'] }], 2).map(row => row.tag)).toEqual(['a', 'b'])
  })

  it('builds a searchable all-tags index with direct and inherited note counts', () => {
    const notes = [
      { _id: 'a.md', type: 'note', title: 'Alpha', folder: 'Projects', tags: ['project/alpha'] },
      { _id: 'b.md', type: 'note', title: 'Beta', folder: 'Projects', tags: ['project/beta'] },
      { _id: 'c.md', type: 'attachment', title: 'Ignored', folder: 'Files', tags: ['project/alpha'] },
    ] as never

    const rows = buildTagIndex(notes)

    expect(rows.map(row => `${row.tag}:${row.directCount}:${row.count}`)).toEqual([
      'project:0:2',
      'project/alpha:1:1',
      'project/beta:1:1',
    ])
    expect(rows[0].notes.map(note => note.title)).toEqual(['Alpha', 'Beta'])
    expect(buildTagIndex(notes, 'alpha').map(row => row.tag)).toEqual(['project', 'project/alpha'])
  })

  it('renames inline and frontmatter tags without touching partial matches', () => {
    expect(renameTagInContent([
      '---',
      'tags:',
      '  - project/alpha',
      '  - #area',
      'tag: [project/alpha, other]',
      '---',
      '',
      'Body #project/alpha and #project/alpha-extra',
    ].join('\n'), 'project/alpha', 'project/gamma')).toBe([
      '---',
      'tags:',
      '  - project/gamma',
      '  - #area',
      'tag: [project/gamma, other]',
      '---',
      '',
      'Body #project/gamma and #project/alpha-extra',
    ].join('\n'))
  })

  it('removes inline and frontmatter tags without touching partial matches', () => {
    expect(removeTagFromContent([
      '---',
      'tags:',
      '  - project/alpha',
      '  - area',
      'tag: [project/alpha, other]',
      '---',
      '',
      'Body #project/alpha and #project/alpha-extra',
    ].join('\n'), 'project/alpha')).toBe([
      '---',
      'tags:',
      '  - area',
      'tag: [other]',
      '---',
      '',
      'Body  and #project/alpha-extra',
    ].join('\n'))
  })

  it('applies tags to frontmatter without duplicating existing tags', () => {
    expect(applyTagToContent('# Note', 'project/alpha')).toBe([
      '---',
      'tags:',
      '  - project/alpha',
      '---',
      '',
      '# Note',
    ].join('\n'))

    expect(applyTagToContent([
      '---',
      'owner: Ada',
      'tags:',
      '  - area',
      '---',
      '# Note',
    ].join('\n'), '#project/alpha')).toBe([
      '---',
      'owner: Ada',
      'tags:',
      '  - area',
      '  - project/alpha',
      '---',
      '# Note',
    ].join('\n'))

    expect(applyTagToContent('Body #project/alpha', 'project/alpha')).toBe('Body #project/alpha')
  })

  it('finds notes directly affected by a tag rename', () => {
    const notes = [
      { _id: 'a', type: 'note', tags: ['project/alpha'] },
      { _id: 'b', type: 'note', tags: ['project/beta'] },
      { _id: 'c', type: 'attachment', tags: ['project/alpha'] },
    ] as never

    expect(affectedNotesForTagRename(notes, '#project/alpha').map(note => note._id)).toEqual(['a'])
  })
})
