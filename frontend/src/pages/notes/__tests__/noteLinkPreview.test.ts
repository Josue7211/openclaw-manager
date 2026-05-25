import { describe, expect, it } from 'vitest'
import {
  externalLinkTargetAtTextPosition,
  externalPreviewForHref,
  imageEmbedTargetAtTextPosition,
  imagePreviewForTarget,
  noteEmbedTargetAtTextPosition,
  notePreviewExcerpt,
  notePreviewForTarget,
  noteTargetFromHref,
  wikilinkTargetAtTextPosition,
} from '../noteLinkPreview'
import type { VaultNote } from '../types'

function note(overrides: Partial<VaultNote> = {}): VaultNote {
  return {
    _id: 'Projects/alpha.md',
    type: 'note',
    title: 'Alpha',
    content: '# Alpha\n\nThis links to [[Beta]] and tracks **important** work.',
    folder: 'Projects',
    tags: ['strategy', 'docs'],
    links: ['Beta'],
    aliases: [],
    created_at: 1,
    updated_at: 2,
    ...overrides,
  }
}

describe('note link previews', () => {
  it('parses note href targets', () => {
    expect(noteTargetFromHref('#note:Project%20Alpha')).toBe('Project Alpha')
    expect(noteTargetFromHref('https://example.com')).toBeNull()
  })

  it('builds an Obsidian-style preview for existing and missing notes', () => {
    expect(notePreviewForTarget('Alpha', [note()])).toEqual(expect.objectContaining({
      exists: true,
      title: 'Alpha',
      folder: 'Projects',
      tags: ['strategy', 'docs'],
      excerpt: expect.stringContaining('This links to Beta'),
    }))

    expect(notePreviewForTarget('Missing', [note()])).toEqual(expect.objectContaining({
      exists: false,
      title: 'Missing',
      excerpt: 'Click to create this note.',
    }))
  })

  it('scopes previews to Obsidian heading targets', () => {
    const alpha = note({
      content: [
        '# Alpha',
        '',
        'Intro that should not dominate the heading preview.',
        '',
        '## Launch Plan',
        '',
        'Milestone details and [[Beta|related note]] context.',
        '',
        '## Later',
        '',
        'Ignore this section.',
      ].join('\n'),
    })

    expect(notePreviewForTarget('Alpha#Launch Plan', [alpha])).toEqual(expect.objectContaining({
      exists: true,
      title: 'Alpha',
      anchor: 'Launch Plan',
      excerpt: expect.stringContaining('Launch Plan Milestone details and related note context.'),
    }))
    expect(notePreviewForTarget('Alpha#Missing', [alpha]).excerpt).toBe('Anchor "Missing" was not found in this note.')
  })

  it('scopes previews to Obsidian block id targets', () => {
    const alpha = note({
      content: ['# Alpha', '', 'This exact paragraph should preview. ^critical-block', '', 'Other paragraph.'].join('\n'),
    })

    expect(notePreviewForTarget('Alpha#^critical-block', [alpha])).toEqual(expect.objectContaining({
      exists: true,
      anchor: '^critical-block',
      excerpt: 'This exact paragraph should preview.',
    }))
  })

  it('strips frontmatter and markdown markup from preview excerpts', () => {
    expect(notePreviewExcerpt('---\nstatus: draft\n---\n\n## Heading\n\n- [x] Ship [[Alpha|the thing]]')).toBe(
      'Heading Ship the thing',
    )
  })

  it('detects source-mode wikilinks at the hovered text column', () => {
    const text = 'Before [[Target Note|Target]] after [[Other]] and ![[Media/diagram.png|Diagram]].'

    expect(wikilinkTargetAtTextPosition(text, text.indexOf('Target'))).toBe('Target Note')
    expect(wikilinkTargetAtTextPosition(text, text.indexOf('Other'))).toBe('Other')
    expect(wikilinkTargetAtTextPosition(text, text.indexOf(' after'))).toBeNull()
    expect(wikilinkTargetAtTextPosition(text, text.indexOf('diagram.png'))).toBeNull()
    expect(wikilinkTargetAtTextPosition(text, 2)).toBeNull()
  })

  it('detects image embeds separately for Obsidian image previews', () => {
    const text = 'Sketch ![[Media/diagram.png|Architecture diagram|420]] today.'
    const embed = imageEmbedTargetAtTextPosition(text, text.indexOf('diagram.png'))

    expect(embed).toEqual({
      target: 'Media/diagram.png',
      alt: 'Architecture diagram',
      width: 420,
    })
    expect(imagePreviewForTarget(embed!)).toEqual(expect.objectContaining({
      kind: 'image',
      title: 'diagram.png',
      src: '/api/vault/local/media?id=Media%2Fdiagram.png',
    }))
    expect(imageEmbedTargetAtTextPosition(text, 2)).toBeNull()
  })

  it('detects source-mode note embeds separately from image embeds', () => {
    const text = 'Embed ![[Target Note#Launch Plan|Launch]] and image ![[Media/diagram.png|Diagram]].'

    expect(noteEmbedTargetAtTextPosition(text, text.indexOf('Target Note'))).toBe('Target Note#Launch Plan')
    expect(noteEmbedTargetAtTextPosition(text, text.indexOf('Launch]]'))).toBe('Target Note#Launch Plan')
    expect(noteEmbedTargetAtTextPosition(text, text.indexOf('diagram.png'))).toBeNull()
    expect(noteEmbedTargetAtTextPosition(text, 2)).toBeNull()
  })

  it('detects source-mode external Markdown links at the hovered text column', () => {
    const text = 'Read [the docs](https://docs.example.com/guide) but not ![image](https://example.com/image.png).'
    const link = externalLinkTargetAtTextPosition(text, text.indexOf('docs.example'))

    expect(link).toEqual({
      label: 'the docs',
      href: 'https://docs.example.com/guide',
    })
    expect(externalPreviewForHref(link!.href, link!.label)).toEqual({
      kind: 'external',
      href: 'https://docs.example.com/guide',
      title: 'the docs',
      domain: 'docs.example.com',
    })
    expect(externalLinkTargetAtTextPosition(text, text.indexOf('image.png'))).toBeNull()
    expect(externalLinkTargetAtTextPosition(text, 2)).toBeNull()
  })
})
