import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import MarkdownBubble from '../MarkdownBubble'

// Mock clipboard API
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
})

describe('MarkdownBubble', () => {
  it('renders plain markdown text', () => {
    const { container } = render(<MarkdownBubble>{'Hello **world**'}</MarkdownBubble>)
    const bubble = container.querySelector('.md-bubble')
    expect(bubble).not.toBeNull()
    const strong = container.querySelector('strong')
    expect(strong?.textContent).toBe('world')
  })

  it('wraps code blocks in .md-code-block with .hljs class', () => {
    const code = '```javascript\nconst x = 1;\n```'
    const { container } = render(<MarkdownBubble>{code}</MarkdownBubble>)
    expect(container.querySelector('.md-code-block')).not.toBeNull()
    expect(container.querySelector('code.hljs')).not.toBeNull()
  })

  it('renders copy button inside code blocks', () => {
    const code = '```python\nprint("hello")\n```'
    const { container } = render(<MarkdownBubble>{code}</MarkdownBubble>)
    const btn = container.querySelector('.md-copy-btn')
    expect(btn).not.toBeNull()
    expect(btn?.textContent).toBe('Copy')
    expect(btn?.getAttribute('aria-label')).toBe('Copy code')
  })

  it('renders language label in code header', () => {
    const code = '```rust\nfn main() {}\n```'
    const { container } = render(<MarkdownBubble>{code}</MarkdownBubble>)
    const lang = container.querySelector('.md-code-lang')
    expect(lang).not.toBeNull()
    expect(lang?.textContent).toBe('rust')
  })

  it('applies hljs syntax tokens to code', () => {
    const code = '```javascript\nconst x = 42;\n```'
    const { container } = render(<MarkdownBubble>{code}</MarkdownBubble>)
    const codeEl = container.querySelector('code.hljs')
    expect(codeEl).not.toBeNull()
    // Should have hljs-prefixed span elements for syntax tokens
    const spans = codeEl?.querySelectorAll('span[class^="hljs-"]')
    expect(spans?.length).toBeGreaterThan(0)
  })

  it('renders inline code without .md-code-block wrapper', () => {
    const { container } = render(<MarkdownBubble>{'Use `const` for variables'}</MarkdownBubble>)
    expect(container.querySelector('.md-code-block')).toBeNull()
    expect(container.querySelector('code')).not.toBeNull()
  })
})
