import { describe, expect, it } from 'vitest'
import { docToMarkdown, markdownToDoc, normalizeMarkdownFixture, splitFrontmatter } from '../markdownBridge'

function roundTrip(markdown: string): string {
  const { frontmatter } = splitFrontmatter(markdown)
  return normalizeMarkdownFixture(docToMarkdown(markdownToDoc(markdown), frontmatter))
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
})
