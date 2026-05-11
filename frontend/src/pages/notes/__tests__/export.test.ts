import { describe, expect, it } from 'vitest'
import { markdownToSafeHtml, replaceMarkdownBody, setFrontmatterProperty, splitFrontmatter } from '../export'

describe('notes export markdown compatibility', () => {
  it('keeps frontmatter separate from the rich document body', () => {
    const markdown = [
      '---',
      'aliases: [Roadmap Alpha]',
      'tags:',
      '  - planning',
      '---',
      '',
      '## Plan',
      '',
    ].join('\n')

    expect(splitFrontmatter(markdown)).toEqual({
      frontmatter: [
        '---',
        'aliases: [Roadmap Alpha]',
        'tags:',
        '  - planning',
        '---',
        '',
        '',
      ].join('\n'),
      body: '## Plan\n',
    })
    expect(replaceMarkdownBody(markdown, '# Next\n')).toContain('aliases: [Roadmap Alpha]')
    expect(replaceMarkdownBody(markdown, '# Next\n')).toMatch(/---\n\n# Next\n$/)
  })

  it('renders Obsidian links, tags, and task checkboxes as document UI', () => {
    const html = markdownToSafeHtml('See [[Project Alpha|Alpha]] #planning\n\n- [x] Done\n- [ ] Next')

    expect(html).toContain('class="note-wikilink"')
    expect(html).toContain('href="#note:Project%20Alpha"')
    expect(html).toContain('>Alpha</a>')
    expect(html).toContain('class="note-tag"')
    expect(html).toContain('#planning')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked')
  })

  it('updates frontmatter properties without touching the document body', () => {
    const markdown = '---\nstatus: draft\n---\n\n# Body\n'

    expect(setFrontmatterProperty(markdown, 'status', 'ready')).toBe('---\nstatus: ready\n---\n\n# Body\n')
    expect(setFrontmatterProperty('# Body\n', 'tags', 'docs, writing')).toBe('---\ntags:\n  - docs\n  - writing\n---\n\n# Body\n')
  })

  it('renders Obsidian callouts as document blocks', () => {
    const html = markdownToSafeHtml('> [!warning] Watch this\n> Keep the source safe.')

    expect(html).toContain('note-callout note-callout-warning')
    expect(html).toContain('note-callout-title')
    expect(html).toContain('Watch this')
    expect(html).toContain('Keep the source safe.')
  })

  it('renders Obsidian image embeds through the vault media endpoint', () => {
    const html = markdownToSafeHtml('![[Media/diagram.png|Architecture diagram]]')

    expect(html).toContain('<img')
    expect(html).toContain('/api/vault/media?id=Media%2Fdiagram.png')
    expect(html).toContain('alt="Architecture diagram"')
  })

  it('keeps safe inline document styles for docs-grade formatting', () => {
    const html = markdownToSafeHtml('<span style="color: #ff0000; background-color: #ffff00; background-image: url(bad)">Styled</span>')

    expect(html).toContain('color: #ff0000')
    expect(html).toContain('background-color: #ffff00')
    expect(html).not.toContain('url(')
  })

  it('does not leak YAML frontmatter into exported document HTML', () => {
    const html = markdownToSafeHtml('---\nstatus: private\n---\n\n# Visible')

    expect(html).toContain('<h1>Visible</h1>')
    expect(html).not.toContain('status: private')
  })
})
