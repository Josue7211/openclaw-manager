import { describe, expect, it } from 'vitest'
import { buildClipNote } from '../clipper'

describe('clipper', () => {
  it('builds a local web clip note from HTML clipboard content', () => {
    const note = buildClipNote({
      capturedAt: new Date('2026-05-12T10:30:00.000Z'),
      text: 'https://example.com/story',
      html: '<html><head><title>Ignored title</title></head><body><h1>Useful Story</h1><p>Hello <strong>private</strong> web.</p><ul><li>One</li><li>Two</li></ul></body></html>',
    })

    expect(note.title).toBe('Useful Story')
    expect(note.sourceUrl).toBe('https://example.com/story')
    expect(note.content).toContain('clip_type: web')
    expect(note.content).toContain('source_url: "https://example.com/story"')
    expect(note.content).toContain('# Useful Story')
    expect(note.content).toContain('Hello **private** web.')
    expect(note.content).toContain('- One')
  })

  it('uses plain text when rich HTML is unavailable', () => {
    const note = buildClipNote({
      capturedAt: new Date('2026-05-12T10:30:00.000Z'),
      text: 'Plain clip from https://local.test/page\nSecond line',
    })

    expect(note.title).toBe('Plain clip from https://local.test/page')
    expect(note.sourceUrl).toBe('https://local.test/page')
    expect(note.content).toContain('Plain clip from https://local.test/page')
    expect(note.content).toContain('Second line')
  })

  it('converts tables and code blocks without executing unsafe HTML', () => {
    const note = buildClipNote({
      capturedAt: new Date('2026-05-12T10:30:00.000Z'),
      html: '<body><script>bad()</script><h2>Data</h2><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><pre><code>const x = 1</code></pre></body>',
    })

    expect(note.content).toContain('## Data')
    expect(note.content).toContain('| A | B |')
    expect(note.content).toContain('```')
    expect(note.content).toContain('const x = 1')
    expect(note.content).not.toContain('bad()')
  })
})
