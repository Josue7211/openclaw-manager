import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock EmptyState to simplify assertions
vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
}))

import MarkdownDisplay from '../MarkdownDisplay'

const baseProps = {
  widgetId: 'test-md',
  isEditMode: false,
  size: { w: 4, h: 3 },
}

describe('MarkdownDisplay', () => {
  it('renders markdown to HTML (strong tags)', () => {
    render(
      <MarkdownDisplay {...baseProps} config={{ content: '**bold text**' }} />,
    )
    const strong = document.querySelector('strong')
    expect(strong).toBeInTheDocument()
    expect(strong?.textContent).toBe('bold text')
  })

  it('renders markdown to HTML (em tags)', () => {
    render(
      <MarkdownDisplay {...baseProps} config={{ content: '*italic text*' }} />,
    )
    expect(document.querySelector('em')).toBeInTheDocument()
  })

  it('renders markdown links', () => {
    render(
      <MarkdownDisplay
        {...baseProps}
        config={{ content: '[click here](https://example.com)' }}
      />,
    )
    const link = document.querySelector('a')
    expect(link).toBeInTheDocument()
    expect(link?.textContent).toBe('click here')
  })

  it('sanitizes dangerous HTML (no script tags)', () => {
    render(
      <MarkdownDisplay
        {...baseProps}
        config={{ content: '<script>alert("xss")</script>' }}
      />,
    )
    expect(document.querySelector('script')).not.toBeInTheDocument()
  })

  it('sanitizes event handler attributes', () => {
    render(
      <MarkdownDisplay
        {...baseProps}
        config={{ content: '<div onclick="alert(1)">text</div>' }}
      />,
    )
    const div = document.querySelector('.md-display-content div')
    if (div) {
      expect(div.getAttribute('onclick')).toBeNull()
    }
  })

  it('shows EmptyState when content is empty string', () => {
    render(<MarkdownDisplay {...baseProps} config={{ content: '' }} />)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('shows EmptyState when content is missing', () => {
    render(<MarkdownDisplay {...baseProps} config={{}} />)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('applies maxHeight style when configured', () => {
    render(
      <MarkdownDisplay
        {...baseProps}
        config={{ content: '# Hello', maxHeight: 200 }}
      />,
    )
    const container = document.querySelector('.md-display-content') as HTMLElement
    expect(container).toBeInTheDocument()
    expect(container.style.maxHeight).toBe('200px')
    expect(container.style.overflowY).toBe('auto')
  })

  it('does not apply maxHeight when 0 (unlimited)', () => {
    render(
      <MarkdownDisplay
        {...baseProps}
        config={{ content: '# Hello', maxHeight: 0 }}
      />,
    )
    const container = document.querySelector('.md-display-content') as HTMLElement
    expect(container.style.maxHeight).toBe('')
  })

  it('exports configSchema with expected fields', async () => {
    const mod = await import('../MarkdownDisplay')
    expect(mod.configSchema).toBeDefined()
    expect(mod.configSchema.fields).toHaveLength(2)
    const keys = mod.configSchema.fields.map((f: any) => f.key)
    expect(keys).toEqual(['content', 'maxHeight'])
  })
})
