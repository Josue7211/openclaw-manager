import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MarkdownBubble from '../MarkdownBubble'

let clipboardWriteText: ReturnType<typeof vi.fn>

describe('MarkdownBubble', () => {
  beforeEach(() => {
    clipboardWriteText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })
  })

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
    expect(btn?.getAttribute('aria-label')).toBe('Copy python code')
  })

  it('copies code blocks through the shared clipboard flow', async () => {
    const code = '```python\nprint("hello")\n```'
    render(<MarkdownBubble>{code}</MarkdownBubble>)

    fireEvent.click(screen.getByRole('button', { name: 'Copy python code' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('print("hello")'))
    expect(screen.getByRole('button', { name: 'Copied code' })).toBeInTheDocument()
  })

  it('reports blocked code copy without throwing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    const code = '```bash\nnpm test\n```'
    render(<MarkdownBubble>{code}</MarkdownBubble>)

    fireEvent.click(screen.getByRole('button', { name: 'Copy bash code' }))

    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeInTheDocument()
  })

  it('renders language label in code header', () => {
    const code = '```rust\nfn main() {}\n```'
    const { container } = render(<MarkdownBubble>{code}</MarkdownBubble>)
    const lang = container.querySelector('.md-code-lang')
    expect(lang).not.toBeNull()
    expect(lang?.textContent).toBe('rust')
  })

  it('parses code fence info strings into language, filename, and copy label', async () => {
    const code = '```tsx filename="src/pages/chat/ChatThread.tsx"\nexport const value: string = "ok"\n```'
    const { container } = render(<MarkdownBubble>{code}</MarkdownBubble>)

    expect(container.querySelector('.md-code-lang')?.textContent).toBe('tsx')
    expect(container.querySelector('.md-code-file')?.textContent).toBe('src/pages/chat/ChatThread.tsx')

    fireEvent.click(screen.getByRole('button', { name: 'Copy code from src/pages/chat/ChatThread.tsx' }))

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith('export const value: string = "ok"')
    })
  })

  it('keeps unknown code fence languages visible without treating metadata as the language', () => {
    const code = '```mermaid title="flowchart.mmd"\ngraph TD\nA-->B\n```'
    const { container } = render(<MarkdownBubble>{code}</MarkdownBubble>)

    expect(container.querySelector('.md-code-lang')?.textContent).toBe('mermaid')
    expect(container.querySelector('.md-code-file')?.textContent).toBe('flowchart.mmd')
    expect(screen.getByRole('button', { name: 'Copy code from flowchart.mmd' })).toBeInTheDocument()
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
