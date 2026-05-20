import { describe, expect, it } from 'vitest'
import { documentStats, markdownToPlainText } from '../documentStats'

describe('documentStats', () => {
  it('counts document words without frontmatter or Markdown syntax', () => {
    const stats = documentStats([
      '---',
      'status: draft',
      '---',
      '',
      '# Heading',
      '',
      'Alpha **beta** and [[Project Alpha|the project]].',
      '',
      '- [x] Done task',
      '',
      '<!-- pagebreak -->',
    ].join('\n'))

    expect(stats.words).toBe(8)
    expect(stats.paragraphs).toBe(3)
    expect(stats.links).toBe(1)
    expect(stats.estimatedPages).toBe(1)
  })

  it('tracks characters with and without spaces', () => {
    const stats = documentStats('Alpha beta\n\nGamma')

    expect(stats.chars).toBe('Alpha beta Gamma'.length)
    expect(stats.charsNoSpaces).toBe('Alphabetagamma'.length)
    expect(stats.lines).toBe(3)
  })

  it('turns markdown into plain text for selected text counts', () => {
    expect(markdownToPlainText('> **Quote** with [link](https://example.com)')).toBe('Quote with link')
  })
})
