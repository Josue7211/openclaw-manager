import { describe, expect, it } from 'vitest'
import { docToMarkdown, markdownToDoc, normalizeMarkdownFixture, splitFrontmatter, upsertMarkdownTableOfContents, type ProseMirrorDoc } from '../markdownBridge'
import type { VaultNote } from '../types'

function roundTrip(markdown: string): string {
  const { frontmatter } = splitFrontmatter(markdown)
  return normalizeMarkdownFixture(docToMarkdown(markdownToDoc(markdown), frontmatter))
}

function note(overrides: Partial<VaultNote> = {}): VaultNote {
  return {
    _id: 'Projects/target-note.md',
    type: 'note',
    title: 'Target Note',
    content: '# Target Note\n\n## Section\n\nScoped body.',
    folder: 'Projects',
    tags: [],
    links: [],
    aliases: [],
    created_at: 1,
    updated_at: 2,
    ...overrides,
  }
}

describe('notes markdown bridge', () => {
  it('preserves frontmatter outside the editable document body', () => {
    const markdown = [
      '---',
      'status: draft',
      'tags:',
      '  - school',
      '---',
      '',
      '# Essay',
    ].join('\n')

    expect(roundTrip(markdown)).toBe(normalizeMarkdownFixture(markdown))
  })

  it('round-trips core document blocks', () => {
    const markdown = [
      '# Heading',
      '',
      'Paragraph with **bold**, *italic*, `code`, and [[Project Alpha|Alpha]].',
      '',
      '- Bullet',
      '- Next',
      '',
      '1. First',
      '2. Second',
      '',
      '- [x] Done',
      '- [ ] Next',
      '',
      '> Quote',
      '',
      '---',
    ].join('\n')

    expect(roundTrip(markdown)).toBe(normalizeMarkdownFixture(markdown))
  })

  it('round-trips document style marks that Markdown does not natively cover', () => {
    const markdown = [
      'Paragraph with <u>underline</u>, <sup>2</sup>, <sub>n</sub>, ==highlight==, <mark data-color="#ffee58" style="background-color: #ffee58">yellow</mark>, and <span style="color: #7c3aed">purple</span>.',
    ].join('\n')

    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('round-trips rich document font sizes', () => {
    const markdown = 'Paragraph with <span style="font-size: 18px">large text</span> and <span style="color: #7c3aed; font-size: 24px">large purple text</span>.'

    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('round-trips rich document font families', () => {
    const markdown = 'Paragraph with <span style="font-family: Georgia">serif text</span> and <span style="color: #7c3aed; font-size: 24px; font-family: Courier New">large purple mono text</span>.'

    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('serializes rich smart chip marks as plain markdown text', () => {
    const doc: ProseMirrorDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '@Ada Lovelace', marks: [{ type: 'smartChip', attrs: { kind: 'person', label: '@Ada Lovelace' } }] },
            { type: 'text', text: ' at ' },
            { type: 'text', text: 'Design Review', marks: [{ type: 'smartChip', attrs: { kind: 'event', label: 'Design Review' } }] },
            { type: 'text', text: ' for ' },
            { type: 'text', text: '{{placeholder}}', marks: [{ type: 'smartChip', attrs: { kind: 'placeholder', label: '{{placeholder}}' } }] },
          ],
        },
      ],
    }

    expect(docToMarkdown(doc)).toBe('@Ada Lovelace at Design Review for {{placeholder}}')
  })

  it('round-trips rich document block alignment', () => {
    const markdown = [
      '<p style="text-align: center">Centered paragraph</p>',
      '',
      '<h2 style="text-align: right">Right heading</h2>',
      '',
      '<p style="text-align: justify; line-height: 1.5">Justified paragraph</p>',
    ].join('\n')

    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('round-trips rich document line spacing', () => {
    const markdown = [
      '<p style="line-height: 1.5">Spaced paragraph</p>',
      '',
      '<h3 style="line-height: 2">Spaced heading</h3>',
    ].join('\n')

    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('round-trips markdown tables', () => {
    const markdown = [
      '| Name | Status |',
      '| --- | --- |',
      '| Draft | Ready |',
    ].join('\n')

    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('round-trips Obsidian image embeds through vault media nodes', () => {
    const markdown = '![[Media/diagram.png|Architecture diagram]]'

    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('round-trips Obsidian callouts through rich document mode', () => {
    const markdown = [
      '> [!warning]- Watch this',
      '> Keep the source safe.',
      '>',
      '> Review before publishing.',
    ].join('\n')
    const doc = markdownToDoc(markdown)
    const blockquote = doc.content?.[0]

    expect(blockquote).toMatchObject({
      type: 'blockquote',
      attrs: {
        calloutType: 'warning',
        calloutTitle: 'Watch this',
        calloutFold: 'collapsed',
      },
    })
    expect(roundTrip(markdown)).toBe(normalizeMarkdownFixture(markdown))
  })

  it('preserves expanded Obsidian callout markers', () => {
    const markdown = '> [!tip]+ Open by default\n> Share the next step.'
    const doc = markdownToDoc(markdown)

    expect(doc.content?.[0]).toMatchObject({
      type: 'blockquote',
      attrs: {
        calloutType: 'tip',
        calloutTitle: 'Open by default',
        calloutFold: 'expanded',
      },
    })
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('round-trips Obsidian image embeds with caption and width', () => {
    const markdown = '![[Media/diagram.png|Architecture diagram|420]]'

    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('renders Obsidian note embeds as rich nodes without changing saved markdown', () => {
    const markdown = '![[Target Note#Section]]'
    const doc = markdownToDoc(markdown, {
      noteEmbeds: {
        notes: [note()],
        currentId: 'Inbox/source.md',
      },
    })

    expect(doc.content?.[0]).toMatchObject({
      type: 'noteEmbed',
      attrs: {
        target: 'Target Note#Section',
        title: 'Target Note / Section',
        body: expect.stringContaining('Scoped body.'),
      },
    })
    expect(docToMarkdown(doc)).toBe(markdown)
  })

  it('round-trips document page breaks as local Markdown markers', () => {
    const markdown = [
      '# Page one',
      '',
      '<!-- pagebreak -->',
      '',
      '# Page two',
    ].join('\n')

    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('inserts an owned table of contents after the title heading', () => {
    const markdown = [
      '---',
      'status: draft',
      '---',
      '',
      '# Product spec',
      '',
      '## Problem',
      '',
      '### User impact',
      '',
      '## Problem',
    ].join('\n')

    expect(upsertMarkdownTableOfContents(markdown)).toBe([
      '---',
      'status: draft',
      '---',
      '',
      '# Product spec',
      '',
      '## Table of Contents',
      '',
      '<!-- toc:start -->',
      '- [Problem](#problem)',
      '  - [User impact](#user-impact)',
      '- [Problem](#problem-1)',
      '<!-- toc:end -->',
      '',
      '## Problem',
      '',
      '### User impact',
      '',
      '## Problem',
    ].join('\n'))
  })

  it('refreshes an existing table of contents block', () => {
    const markdown = [
      '# Notes',
      '',
      '## Table of Contents',
      '',
      '<!-- toc:start -->',
      '- old',
      '<!-- toc:end -->',
      '',
      '## Alpha',
      '## Beta',
    ].join('\n')

    expect(upsertMarkdownTableOfContents(markdown)).toBe([
      '# Notes',
      '',
      '## Table of Contents',
      '',
      '<!-- toc:start -->',
      '- [Alpha](#alpha)',
      '- [Beta](#beta)',
      '<!-- toc:end -->',
      '',
      '## Alpha',
      '## Beta',
    ].join('\n'))
  })
})
