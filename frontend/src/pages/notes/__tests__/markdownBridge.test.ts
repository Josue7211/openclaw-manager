import { describe, expect, it } from 'vitest'
import { docToMarkdown, markdownToDoc, normalizeMarkdownFixture, splitFrontmatter, upsertMarkdownTableOfContents } from '../markdownBridge'

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

  it('round-trips document style marks that Markdown does not natively cover', () => {
    const markdown = [
      'Paragraph with <u>underline</u>, ==highlight==, <mark data-color="#ffee58" style="background-color: #ffee58">yellow</mark>, and <span style="color: #7c3aed">purple</span>.',
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

  it('round-trips Obsidian image embeds with caption and width', () => {
    const markdown = '![[Media/diagram.png|Architecture diagram|420]]'

    expect(roundTrip(markdown)).toBe(markdown)
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
