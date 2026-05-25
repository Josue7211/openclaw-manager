import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NoteEditor from '../NoteEditor'
import type { NoteReviewMarker, VaultNote } from '../types'
import { DEFAULT_NOTES_EDITOR_PREFERENCES } from '../notesPreferences'

function note(overrides: Partial<VaultNote> = {}): VaultNote {
  return {
    _id: 'Inbox/source.md',
    type: 'note',
    title: 'Source',
    content: 'See [[Target Note]].',
    folder: 'Inbox',
    tags: [],
    links: ['Target Note'],
    aliases: [],
    created_at: 1,
    updated_at: 2,
    ...overrides,
  }
}

describe('NoteEditor link preview', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('shows a visible typing target for blank document-mode notes', async () => {
    const { container } = render(
      <NoteEditor
        note={note({
          content: '',
          links: [],
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'doc' }}
      />,
    )

    const editor = await screen.findByLabelText('Document editor')
    const emptyParagraph = container.querySelector('.tiptap-note-doc p.is-editor-empty')
    expect(emptyParagraph).toHaveAttribute('data-placeholder', 'Start writing...')

    fireEvent.click(container.querySelector('.tiptap-note-scroller') as HTMLElement)
    await waitFor(() => expect(editor).toHaveFocus())
  })

  it('enables Obsidian-style fold controls in source mode', () => {
    const { container } = render(
      <NoteEditor
        note={note({
          content: '# Source\n\n## Foldable heading\n\n- nested\n  - item',
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
      />,
    )

    expect(container.querySelector('.cm-foldGutter')).toBeInTheDocument()
  })

  it('renders Obsidian callouts in read preview mode', () => {
    const { container } = render(
      <NoteEditor
        note={note({
          content: '> [!tip] Draft note\n> Keep this close to the task.',
          links: [],
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'read' }}
      />,
    )

    const callout = container.querySelector('.md-display-content .note-callout-tip')
    expect(callout).toBeInTheDocument()
    expect(callout).toHaveTextContent('Draft note')
    expect(callout).toHaveTextContent('Keep this close to the task.')
  })

  it('renders folded Obsidian callouts as collapsed read-preview blocks', () => {
    const { container } = render(
      <NoteEditor
        note={note({
          content: '> [!tip]- Later\n> Hidden until opened.',
          links: [],
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'read' }}
      />,
    )

    const callout = container.querySelector('.md-display-content .note-callout-tip')
    expect(callout).toHaveClass('note-callout-fold-collapsed')
    expect(callout?.querySelector('.note-callout-title')).toHaveTextContent('Later')
    expect(callout?.querySelector('.note-callout-title')).toHaveAttribute('aria-expanded', 'false')
    expect(callout?.querySelector('.note-callout-body')).toHaveTextContent('Hidden until opened.')
  })

  it('toggles folded Obsidian callouts in read preview without editing markdown', () => {
    const onChange = vi.fn()
    const { container } = render(
      <NoteEditor
        note={note({
          content: '> [!tip]- Later\n> Hidden until opened.',
          links: [],
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={onChange}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'read' }}
      />,
    )

    const callout = container.querySelector('.md-display-content .note-callout-tip') as HTMLElement
    const title = callout.querySelector('.note-callout-title') as HTMLElement

    fireEvent.click(title)
    expect(callout).toHaveClass('note-callout-fold-expanded')
    expect(callout).not.toHaveClass('note-callout-fold-collapsed')
    expect(title).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(title)
    expect(callout).toHaveClass('note-callout-fold-collapsed')
    expect(title).toHaveAttribute('aria-expanded', 'false')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('uses compact grouped toolbar menus in source mode', () => {
    render(
      <NoteEditor
        note={note({
          content: '# Source\n\nBody',
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
      />,
    )

    expect(screen.getByRole('toolbar', { name: 'Formatting toolbar' })).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Formatting toolbar' })).toHaveStyle({ height: '34px' })
    expect(screen.getByRole('toolbar', { name: 'Formatting toolbar' })).toHaveStyle({ flexWrap: 'nowrap' })
    expect(screen.getByRole('button', { name: 'Markdown style' })).toHaveTextContent('Style')
    expect(screen.getByRole('button', { name: 'Markdown inline formatting' })).toHaveTextContent('Inline')
    expect(screen.getByRole('button', { name: 'Markdown blocks' })).toHaveTextContent('Blocks')
    expect(screen.getByRole('button', { name: 'Markdown insert' })).toHaveTextContent('Insert')
    expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Heading 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bullet list' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Table' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Markdown style' }))
    expect(screen.getByRole('menu', { name: 'Markdown style' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Heading 1' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Markdown inline formatting' }))
    expect(screen.getByRole('menu', { name: 'Markdown inline formatting' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Bold' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Inline code' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Markdown blocks' }))
    expect(screen.getByRole('menu', { name: 'Markdown blocks' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Checklist' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Markdown insert' }))
    expect(screen.getByRole('menu', { name: 'Markdown insert' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Wikilink' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Embed note' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Comment' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Block ID' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Footnote' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Table' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Warning callout' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Folded tip callout' })).toBeInTheDocument()
  })

  it('renders tracked suggestion insertions and deletions inline in source mode', async () => {
    const markers: NoteReviewMarker[] = [
      {
        id: 'suggestion-1',
        kind: 'suggestion',
        anchor: { scope: 'selection', mode: 'markdown', quote: 'Body' },
        trackedChange: { type: 'replace', before: 'Body', after: 'Better body' },
      },
      {
        id: 'suggestion-2',
        kind: 'suggestion',
        anchor: { scope: 'cursor', mode: 'markdown', start: '# Source\n\nBody'.length },
        trackedChange: { type: 'insert', after: '\n\nReviewed' },
      },
    ]

    const { container } = render(
      <NoteEditor
        note={note({
          content: '# Source\n\nBody',
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
        reviewMarkers={markers}
        activeReviewId="suggestion-1"
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.cm-review-tracked-delete')).toHaveTextContent('Body')
      const inserts = Array.from(container.querySelectorAll('.cm-review-tracked-insert'))
      expect(inserts.some(item => item.textContent === '+ Better body')).toBe(true)
      expect(inserts.some(item => item.textContent === '+ Reviewed')).toBe(true)
    })
  })

  it('renders whole-document replacement suggestions as a source preview', async () => {
    const markers: NoteReviewMarker[] = [
      {
        id: 'suggestion-1',
        kind: 'suggestion',
        anchor: { scope: 'document', mode: 'markdown' },
        trackedChange: { type: 'replace_document', after: '# Replacement\n\nNew body' },
      },
    ]

    const { container } = render(
      <NoteEditor
        note={note({
          content: '# Source\n\nBody',
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
        reviewMarkers={markers}
        activeReviewId="suggestion-1"
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.cm-review-tracked-document')).toHaveTextContent('Replace document # Replacement New body')
    })
  })

  it('inserts Obsidian wikilinks and embeds from the compact source toolbar menu', async () => {
    const onChange = vi.fn()
    const { unmount } = render(
      <NoteEditor
        note={note({
          content: '',
          links: [],
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={onChange}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Markdown insert' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Wikilink' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('[[Note title]]'))

    unmount()
    onChange.mockClear()
    render(
      <NoteEditor
        note={note({
          content: '',
          links: [],
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={onChange}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Markdown insert' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Embed note' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('![[Note title]]'))
  })

  it('inserts Obsidian comments from the compact source toolbar menu', async () => {
    const onChange = vi.fn()
    render(
      <NoteEditor
        note={note({
          content: '',
          links: [],
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={onChange}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Markdown insert' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Comment' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('%% Comment %%'))
  })

  it('inserts Obsidian block IDs from the compact source toolbar menu', async () => {
    const onChange = vi.fn()
    render(
      <NoteEditor
        note={note({
          content: '',
          links: [],
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={onChange}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Markdown insert' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Block ID' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('^block-id'))
  })

  it('inserts Obsidian footnotes from the compact source toolbar menu', async () => {
    const onChange = vi.fn()
    render(
      <NoteEditor
        note={note({
          content: '',
          links: [],
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={onChange}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Markdown insert' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Footnote' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('[^1]\n\n[^1]: Footnote text'))
  })

  it('inserts Obsidian callouts from the compact source toolbar menu', async () => {
    const onChange = vi.fn()
    render(
      <NoteEditor
        note={note({
          content: '',
          links: [],
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={onChange}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Markdown insert' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Warning callout' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.stringContaining('> [!warning] Warning')))
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('> Content'))
    expect(screen.queryByRole('menu', { name: 'Markdown insert' })).not.toBeInTheDocument()
  })

  it('collapses source formatting into one menu at medium widths', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 700 })

    try {
      render(
        <NoteEditor
          note={note({
            content: '# Source\n\nBody',
          })}
          allNotes={[]}
          allNoteTitles={[]}
          onChange={vi.fn()}
          onWikilinkClick={vi.fn()}
          preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
        />,
      )

      expect(screen.getByRole('button', { name: 'Markdown formatting' })).toHaveTextContent('')
      expect(screen.queryByRole('button', { name: 'Markdown style' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Markdown inline formatting' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Markdown blocks' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Markdown insert' })).not.toBeInTheDocument()
      expect(screen.getByRole('toolbar', { name: 'Formatting toolbar' })).toHaveStyle({ height: '34px' })
      expect(screen.getByRole('toolbar', { name: 'Formatting toolbar' })).toHaveStyle({ flexWrap: 'nowrap' })
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('collapses source formatting into one menu on narrow screens', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 480 })

    try {
      render(
        <NoteEditor
          note={note({
            content: '# Source\n\nBody',
          })}
          allNotes={[]}
          allNoteTitles={[]}
          onChange={vi.fn()}
          onWikilinkClick={vi.fn()}
          preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
        />,
      )

      expect(screen.getByRole('toolbar', { name: 'Formatting toolbar' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Markdown formatting' })).toHaveTextContent('')
      expect(screen.queryByRole('button', { name: 'Markdown style' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Markdown inline formatting' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Markdown blocks' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Markdown insert' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Markdown formatting' }))
      expect(screen.getByRole('menu', { name: 'Markdown formatting' })).toBeInTheDocument()
      expect(screen.getByText('Style')).toBeInTheDocument()
      expect(screen.getByText('Inline')).toBeInTheDocument()
      expect(screen.getByText('Blocks')).toBeInTheDocument()
      expect(screen.getByText('Insert')).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Heading 1' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Bold' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Checklist' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Table' })).toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('collapses source formatting when the toolbar area is cramped', async () => {
    const originalInnerWidth = window.innerWidth
    const OriginalResizeObserver = globalThis.ResizeObserver
    const resizeCallbacks: ResizeObserverCallback[] = []
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1000 })
    vi.stubGlobal('ResizeObserver', TestResizeObserver)

    try {
      render(
        <NoteEditor
          note={note({
            content: '# Source\n\nBody',
          })}
          allNotes={[]}
          allNoteTitles={[]}
          onChange={vi.fn()}
          onWikilinkClick={vi.fn()}
          preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
        />,
      )

      expect(screen.queryByRole('button', { name: 'Markdown formatting' })).not.toBeInTheDocument()
      await waitFor(() => expect(resizeCallbacks.length).toBeGreaterThan(0))

      await act(async () => {
        for (const callback of resizeCallbacks) {
          callback([
            {
              target: screen.getByRole('toolbar', { name: 'Formatting toolbar' }),
              contentRect: DOMRect.fromRect({ width: 300, height: 36 }),
            } as ResizeObserverEntry,
          ], {} as ResizeObserver)
        }
      })

      await waitFor(() => expect(screen.getByRole('button', { name: 'Markdown formatting' })).toHaveTextContent(''))
      expect(screen.queryByRole('button', { name: 'Markdown style' })).not.toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      vi.stubGlobal('ResizeObserver', OriginalResizeObserver)
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('supports keyboard navigation and focus return in source toolbar menus', async () => {
    render(
      <NoteEditor
        note={note({
          content: '# Source\n\nBody',
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
      />,
    )

    const styleTrigger = screen.getByRole('button', { name: 'Markdown style' })
    fireEvent.keyDown(styleTrigger, { key: 'ArrowDown' })
    expect(screen.getByRole('menu', { name: 'Markdown style' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Heading 1' })).toHaveFocus())
    const anchoredStyleMenu = screen.getByRole('menu', { name: 'Markdown style' })
    await waitFor(() => expect(anchoredStyleMenu).toHaveStyle({ position: 'fixed', left: '8px' }))
    expect(screen.getByRole('toolbar', { name: 'Formatting toolbar' })).not.toContainElement(anchoredStyleMenu)

    const styleMenu = screen.getByRole('menu', { name: 'Markdown style' })
    fireEvent.keyDown(styleMenu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Heading 2' })).toHaveFocus()
    fireEvent.keyDown(styleMenu, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: 'Heading 3' })).toHaveFocus()
    fireEvent.keyDown(styleMenu, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Markdown style' })).not.toBeInTheDocument())
    await waitFor(() => expect(styleTrigger).toHaveFocus())

    const insertTrigger = screen.getByRole('button', { name: 'Markdown insert' })
    fireEvent.keyDown(insertTrigger, { key: 'ArrowUp' })
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Horizontal rule' })).toHaveFocus())
    fireEvent.keyDown(screen.getByRole('menu', { name: 'Markdown insert' }), { key: 'w' })
    expect(screen.getByRole('menuitem', { name: 'Wikilink' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu', { name: 'Markdown insert' }), { key: 'a' })
    expect(screen.getByRole('menuitem', { name: 'Warning callout' })).toHaveFocus()
  })

  it('opens CodeMirror search with the source-mode keyboard shortcut', async () => {
    const { container } = render(
      <NoteEditor
        note={note({
          content: '# Source\n\nAlpha beta alpha',
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
      />,
    )

    const editorContent = container.querySelector('.cm-content')
    expect(editorContent).toBeInTheDocument()
    fireEvent.keyDown(editorContent!, { key: 'f', ctrlKey: true })

    await waitFor(() => expect(container.querySelector('.cm-search')).toBeInTheDocument())
  })

  it('opens searchable source mode from read mode with the keyboard shortcut', async () => {
    const { container } = render(
      <NoteEditor
        note={note({
          content: 'Alpha beta alpha',
          links: [],
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'read' }}
      />,
    )

    const renderedParagraph = container.querySelector('.md-display-content p')
    expect(renderedParagraph).toBeInTheDocument()
    fireEvent.keyDown(renderedParagraph!, { key: 'f', metaKey: true })

    await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Formatting toolbar' })).toBeInTheDocument())
    await waitFor(() => expect(container.querySelector('.cm-search')).toBeInTheDocument())
  })

  it('persists the Markdown inspector outline pane', () => {
    localStorage.setItem('mc-notes-markdown-inspector-open', 'true')

    render(
      <NoteEditor
        note={note({
          content: '# Source\n\n## Plan\n\nBody',
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'source' }}
      />,
    )

    expect(screen.getByText('Outline')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plan' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Toggle document inspector' }))

    expect(localStorage.getItem('mc-notes-markdown-inspector-open')).toBe('false')
  })

  it('shows a hover preview and opens wikilinks from read mode', async () => {
    const onWikilinkClick = vi.fn()
    const target = note({
      _id: 'Projects/target-note.md',
      title: 'Target Note',
      content: '# Target Note\n\nPreview body with useful context.',
      folder: 'Projects',
      tags: ['reference'],
      links: [],
    })

    render(
      <NoteEditor
        note={note()}
        allNotes={[target]}
        allNoteTitles={['Target Note']}
        onChange={vi.fn()}
        onWikilinkClick={onWikilinkClick}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'read' }}
      />,
    )

    const link = await screen.findByRole('link', { name: 'Target Note' })
    fireEvent.mouseMove(link, { clientX: 120, clientY: 80 })

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Preview body with useful context.')
    expect(screen.getByRole('tooltip')).toHaveTextContent('#reference')

    fireEvent.click(screen.getByRole('link', { name: 'Target Note' }))
    expect(onWikilinkClick).toHaveBeenCalledWith('Target Note')
  })

  it('shows a hover preview for rendered Obsidian image embeds', async () => {
    render(
      <NoteEditor
        note={note({
          content: '![[Media/diagram.png|Architecture diagram|420]]',
          links: [],
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'read' }}
      />,
    )

    const image = await screen.findByRole('img', { name: 'Architecture diagram' })
    fireEvent.mouseMove(image, { clientX: 120, clientY: 80 })

    expect(await screen.findByRole('tooltip')).toHaveTextContent('diagram.png')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Media/diagram.png')
  })

  it('shows a hover preview for rendered external links', async () => {
    render(
      <NoteEditor
        note={note({
          content: '[Release notes](https://docs.example.com/releases)',
          links: [],
        })}
        allNotes={[]}
        allNoteTitles={[]}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'read' }}
      />,
    )

    const link = await screen.findByRole('link', { name: 'Release notes' })
    fireEvent.mouseMove(link, { clientX: 120, clientY: 80 })

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Release notes')
    expect(screen.getByRole('tooltip')).toHaveTextContent('docs.example.com')
    expect(screen.getByRole('tooltip')).toHaveTextContent('https://docs.example.com/releases')
  })

  it('renders Obsidian heading transclusions from note embeds', async () => {
    const target = note({
      _id: 'Projects/target-note.md',
      title: 'Target Note',
      content: [
        '# Target Note',
        '',
        'Intro should not render for the scoped embed.',
        '',
        '## Launch Plan',
        '',
        'Milestone details render here.',
        '',
        '## Later',
        '',
        'Later section should not render.',
      ].join('\n'),
      folder: 'Projects',
      links: [],
    })

    render(
      <NoteEditor
        note={note({
          content: '![[Target Note#Launch Plan]]',
          links: ['Target Note'],
        })}
        allNotes={[target]}
        allNoteTitles={['Target Note']}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'read' }}
      />,
    )

    expect(await screen.findByText('Launch Plan')).toBeInTheDocument()
    expect(screen.getByText('Milestone details render here.')).toBeInTheDocument()
    expect(screen.queryByText('Intro should not render for the scoped embed.')).not.toBeInTheDocument()
    expect(screen.queryByText('Later section should not render.')).not.toBeInTheDocument()
  })

  it('renders Obsidian block transclusions from note embeds', async () => {
    const target = note({
      _id: 'Projects/target-note.md',
      title: 'Target Note',
      content: ['# Target Note', '', 'Exact block renders here. ^important-block', '', 'Other block should not render.'].join('\n'),
      folder: 'Projects',
      links: [],
    })

    render(
      <NoteEditor
        note={note({
          content: '![[Target Note#^important-block]]',
          links: ['Target Note'],
        })}
        allNotes={[target]}
        allNoteTitles={['Target Note']}
        onChange={vi.fn()}
        onWikilinkClick={vi.fn()}
        preferences={{ ...DEFAULT_NOTES_EDITOR_PREFERENCES, defaultMode: 'read' }}
      />,
    )

    expect(await screen.findByText('Exact block renders here.')).toBeInTheDocument()
    expect(screen.queryByText('Other block should not render.')).not.toBeInTheDocument()
  })
})
