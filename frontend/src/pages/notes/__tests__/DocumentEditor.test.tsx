import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DocumentEditor from '../DocumentEditor'
import type { NoteReviewMarker, VaultNote } from '../types'

function note(overrides: Partial<VaultNote> = {}): VaultNote {
  return {
    _id: 'Projects/target-note.md',
    type: 'note',
    title: 'Target Note',
    content: '# Target Note\n\nRich doc preview body.\n\n## Section\n\nScoped section body.\n\nHidden body.\n\nBlock scoped line ^block-a',
    folder: 'Projects',
    tags: ['reference'],
    links: [],
    aliases: [],
    created_at: 1,
    updated_at: 2,
    ...overrides,
  }
}

describe('DocumentEditor find and replace', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts typing in the document body', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    const { container } = render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/empty.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    const editor = await screen.findByLabelText('Document editor')
    const emptyParagraph = container.querySelector('.tiptap-note-doc p.is-editor-empty')
    expect(emptyParagraph).toHaveAttribute('data-placeholder', 'Start writing...')

    fireEvent.click(container.querySelector('.tiptap-note-scroller') as HTMLElement)
    await waitFor(() => expect(editor).toHaveFocus())

    await user.type(editor, 'Hello from doc mode')

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('Hello from doc mode'))
    })
  }, 30000)

  it('shows wikilink previews in rich document mode', async () => {
    const onWikilinkOpen = vi.fn()

    render(
      <DocumentEditor
        markdown="See [[Target Note]]."
        noteId="Inbox/source.md"
        allNotes={[note()]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={onWikilinkOpen}
      />,
    )

    const link = await screen.findByRole('link', { name: 'Target Note' })
    fireEvent.mouseMove(link, { clientX: 80, clientY: 60 })

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Rich doc preview body.')
    expect(screen.getByRole('tooltip')).toHaveTextContent('#reference')

    fireEvent.click(screen.getByRole('link', { name: 'Target Note' }))
    expect(onWikilinkOpen).toHaveBeenCalledWith('Target Note')
  })

  it('renders Obsidian callouts as document callout blocks', async () => {
    const { container } = render(
      <DocumentEditor
        markdown={'> [!warning]- Watch this\n> Keep the source safe.'}
        noteId="Inbox/callout.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await screen.findByLabelText('Document editor')
    const callout = container.querySelector('blockquote[data-callout-type="warning"]')

    expect(callout).toBeInTheDocument()
    expect(callout).toHaveAttribute('data-callout-title', 'Watch this')
    expect(callout).toHaveAttribute('data-callout-fold', 'collapsed')
    expect(callout).toHaveClass('tiptap-note-callout')
    expect(callout).toHaveTextContent('Keep the source safe.')
  })

  it('shows a compact review rail for anchored comments and suggestions', async () => {
    const onReviewMarkerSelect = vi.fn()
    const markers: NoteReviewMarker[] = [
      {
        id: 'comment-1',
        kind: 'comment',
        anchor: { scope: 'selection', quote: 'Alpha' },
      },
      {
        id: 'suggestion-1',
        kind: 'suggestion',
        anchor: { scope: 'selection', quote: 'beta' },
      },
    ]

    render(
      <DocumentEditor
        markdown={'# Draft\n\nAlpha beta'}
        noteId="Inbox/source.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={vi.fn()}
        reviewMarkers={markers}
        activeReviewId="suggestion-1"
        onReviewMarkerSelect={onReviewMarkerSelect}
      />,
    )

    const rail = await screen.findByRole('navigation', { name: 'Document review markers' })
    expect(rail).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comment on Alpha' })).toHaveAttribute('data-kind', 'comment')
    expect(screen.getByRole('button', { name: 'Suggestion on beta' })).toHaveAttribute('data-active', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Comment on Alpha' }))
    expect(onReviewMarkerSelect).toHaveBeenCalledWith('comment-1')
  })

  it('renders tracked suggestion insertions and deletions inline in the document', async () => {
    const markers: NoteReviewMarker[] = [
      {
        id: 'suggestion-1',
        kind: 'suggestion',
        anchor: { scope: 'selection', quote: 'beta' },
        trackedChange: { type: 'replace', before: 'beta', after: 'gamma' },
      },
    ]

    const { container } = render(
      <DocumentEditor
        markdown={'# Draft\n\nAlpha beta'}
        noteId="Inbox/source.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={vi.fn()}
        reviewMarkers={markers}
        activeReviewId="suggestion-1"
      />,
    )

    expect(await screen.findByRole('button', { name: 'Suggestion replacing beta with gamma' })).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelector('.tiptap-review-tracked-delete')).toHaveTextContent('beta')
      expect(container.querySelector('.tiptap-review-tracked-insert')).toHaveTextContent('+ gamma')
    })
  })

  it('renders tracked cursor insertions inline in the rich document', async () => {
    const markers: NoteReviewMarker[] = [
      {
        id: 'suggestion-1',
        kind: 'suggestion',
        anchor: { scope: 'cursor', mode: 'document', start: 1 },
        trackedChange: { type: 'insert', after: 'Opening note' },
      },
    ]

    const { container } = render(
      <DocumentEditor
        markdown={'# Draft\n\nAlpha beta'}
        noteId="Inbox/source.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={vi.fn()}
        reviewMarkers={markers}
        activeReviewId="suggestion-1"
      />,
    )

    expect(await screen.findByRole('button', { name: 'Suggestion inserting Opening note' })).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelector('.tiptap-review-tracked-insert')).toHaveTextContent('+ Opening note')
    })
  })

  it('renders whole-document replacement suggestions as a rich document preview', async () => {
    const markers: NoteReviewMarker[] = [
      {
        id: 'suggestion-1',
        kind: 'suggestion',
        anchor: { scope: 'document', mode: 'document' },
        trackedChange: { type: 'replace_document', after: '# Replacement\n\nNew body' },
      },
    ]

    const { container } = render(
      <DocumentEditor
        markdown={'# Draft\n\nAlpha beta'}
        noteId="Inbox/source.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={vi.fn()}
        reviewMarkers={markers}
        activeReviewId="suggestion-1"
      />,
    )

    expect(await screen.findByRole('button', { name: 'Suggestion replacing the document' })).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelector('.tiptap-review-tracked-document')).toHaveTextContent('Replace document # Replacement New body')
    })
  })

  it('expands rich document @ meeting notes building blocks', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.type(await screen.findByLabelText('Document editor'), '@meeting-notes{enter}')

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('## Meeting notes'))
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('### Action items'))
    })
    const lastMarkdown = onMarkdownChange.mock.calls[onMarkdownChange.mock.calls.length - 1]?.[0] ?? ''
    expect(lastMarkdown).not.toContain('@meeting-notes')
  }, 30000)

  it('expands rich document @ decision log building blocks', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.type(await screen.findByLabelText('Document editor'), '@decision-log{tab}')

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('## Decision log'))
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('| Date | Decision | Owner | Status |'))
    })
    const lastMarkdown = onMarkdownChange.mock.calls[onMarkdownChange.mock.calls.length - 1]?.[0] ?? ''
    expect(lastMarkdown).not.toContain('@decision-log')
  }, 30000)

  it('shows a rich document @ building-block suggestion menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.type(await screen.findByLabelText('Document editor'), '@m')

    const menu = await screen.findByRole('listbox', { name: 'Smart insert suggestions' })
    expect(within(menu).getByRole('option', { name: /Meeting notes/i })).toHaveAttribute('aria-selected', 'true')

    await user.click(within(menu).getByRole('option', { name: /Meeting notes/i }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('## Meeting notes'))
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('### Action items'))
    })
    const lastMarkdown = onMarkdownChange.mock.calls[onMarkdownChange.mock.calls.length - 1]?.[0] ?? ''
    expect(lastMarkdown).not.toContain('@m')
  }, 30000)

  it('accepts rich document @ building-block suggestions from the keyboard', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    const editor = await screen.findByLabelText('Document editor')
    await user.type(editor, '@')
    expect(await screen.findByRole('listbox', { name: 'Smart insert suggestions' })).toBeInTheDocument()

    fireEvent.keyDown(editor, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Decision log/i })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(editor, { key: 'Enter' })

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('## Decision log'))
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('| Date | Decision | Owner | Status |'))
    })
  }, 30000)

  it('inserts rich document date smart inserts from the @ menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.type(await screen.findByLabelText('Document editor'), '@to')

    const menu = await screen.findByRole('listbox', { name: 'Smart insert suggestions' })
    expect(within(menu).getByRole('option', { name: /Today/i })).toBeInTheDocument()
    expect(within(menu).getByRole('option', { name: /Tomorrow/i })).toBeInTheDocument()

    await user.click(within(menu).getByRole('option', { name: /Today/i }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringMatching(/\w+ \d{1,2}, \d{4}/))
    })
    const lastMarkdown = onMarkdownChange.mock.calls[onMarkdownChange.mock.calls.length - 1]?.[0] ?? ''
    expect(lastMarkdown).not.toContain('@to')
    expect(lastMarkdown).not.toContain('##')
  }, 30000)

  it('inserts rich document placeholder smart chips from the @ menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.type(await screen.findByLabelText('Document editor'), '@pla')

    const menu = await screen.findByRole('listbox', { name: 'Smart insert suggestions' })
    const placeholderOption = within(menu).getByRole('option', { name: /Placeholder/i })
    expect(placeholderOption).toHaveTextContent('Insert template placeholder')

    await user.click(placeholderOption)

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('{{placeholder}}'))
    })
    expect(document.querySelector('[data-type="smart-chip"][data-kind="placeholder"]')).toHaveTextContent('{{placeholder}}')
    const lastMarkdown = onMarkdownChange.mock.calls[onMarkdownChange.mock.calls.length - 1]?.[0] ?? ''
    expect(lastMarkdown).not.toContain('@pla')
  }, 30000)

  it('inserts rich document local note smart links from the @ menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[note()]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.type(await screen.findByLabelText('Document editor'), '@target')

    const menu = await screen.findByRole('listbox', { name: 'Smart insert suggestions' })
    expect(within(menu).getByRole('option', { name: /Target Note/i })).toBeInTheDocument()

    await user.click(within(menu).getByRole('option', { name: /Target Note/i }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('[[Target Note]]'))
    })
    expect(await screen.findByRole('link', { name: 'Target Note' })).toBeInTheDocument()
  }, 30000)

  it('inserts rich document local note alias smart links from the @ menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[note({ title: 'Project Alpha', aliases: ['Alpha'] })]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.type(await screen.findByLabelText('Document editor'), '@alp')

    const menu = await screen.findByRole('listbox', { name: 'Smart insert suggestions' })
    const aliasOption = within(menu).getAllByRole('option')[0]
    expect(aliasOption).toHaveTextContent('Alpha')
    expect(aliasOption).toHaveTextContent('Alias for Project Alpha')

    await user.click(aliasOption)

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('[[Project Alpha|Alpha]]'))
    })
    expect(await screen.findByRole('link', { name: 'Alpha' })).toBeInTheDocument()
  }, 30000)

  it('inserts rich document local tag smart inserts from the @ menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[note({ tags: ['reference'] })]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.type(await screen.findByLabelText('Document editor'), '@ref')

    const menu = await screen.findByRole('listbox', { name: 'Smart insert suggestions' })
    const tagOption = within(menu).getByRole('option', { name: /reference/i })
    expect(tagOption).toHaveTextContent('Tag #reference')

    await user.click(tagOption)

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('#reference'))
    })
    expect(document.querySelector('[data-type="smart-chip"][data-kind="tag"]')).toHaveTextContent('#reference')
    const lastMarkdown = onMarkdownChange.mock.calls[onMarkdownChange.mock.calls.length - 1]?.[0] ?? ''
    expect(lastMarkdown).not.toContain('@ref')
  }, 30000)

  it('inserts rich document local people smart inserts from the @ menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[note({ properties: { author: 'Ada Lovelace' } })]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.type(await screen.findByLabelText('Document editor'), '@ada')

    const menu = await screen.findByRole('listbox', { name: 'Smart insert suggestions' })
    const personOption = within(menu).getByRole('option', { name: /Ada Lovelace/i })
    expect(personOption).toHaveTextContent('Person from author')

    await user.click(personOption)

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('@Ada Lovelace'))
    })
    expect(document.querySelector('[data-type="smart-chip"][data-kind="person"]')).toHaveTextContent('@Ada Lovelace')
    const lastMarkdown = onMarkdownChange.mock.calls[onMarkdownChange.mock.calls.length - 1]?.[0] ?? ''
    expect(lastMarkdown).not.toContain('@ada')
  }, 30000)

  it('inserts rich document local place smart inserts from the @ menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[note({ properties: { location: 'Central Library' } })]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.type(await screen.findByLabelText('Document editor'), '@cent')

    const menu = await screen.findByRole('listbox', { name: 'Smart insert suggestions' })
    const placeOption = within(menu).getByRole('option', { name: /Central Library/i })
    expect(placeOption).toHaveTextContent('Place from location')

    await user.click(placeOption)

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('Central Library'))
    })
    expect(document.querySelector('[data-type="smart-chip"][data-kind="place"]')).toHaveTextContent('Central Library')
    const lastMarkdown = onMarkdownChange.mock.calls[onMarkdownChange.mock.calls.length - 1]?.[0] ?? ''
    expect(lastMarkdown).not.toContain('@cent')
    expect(lastMarkdown).not.toContain('[[Central Library]]')
  }, 30000)

  it('inserts rich document local event smart inserts from the @ menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[note({ properties: { event: 'Design Review' } })]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.type(await screen.findByLabelText('Document editor'), '@des')

    const menu = await screen.findByRole('listbox', { name: 'Smart insert suggestions' })
    const eventOption = within(menu).getByRole('option', { name: /Design Review/i })
    expect(eventOption).toHaveTextContent('Event from event')

    await user.click(eventOption)

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('Design Review'))
    })
    expect(document.querySelector('[data-type="smart-chip"][data-kind="event"]')).toHaveTextContent('Design Review')
    const lastMarkdown = onMarkdownChange.mock.calls[onMarkdownChange.mock.calls.length - 1]?.[0] ?? ''
    expect(lastMarkdown).not.toContain('@des')
    expect(lastMarkdown).not.toContain('[[Design Review]]')
  }, 30000)

  it('inserts rich document local image attachment smart inserts from the @ menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[
          note({
            _id: 'Assets/diagram.png',
            type: 'attachment',
            title: 'diagram.png',
            folder: 'Assets',
            content: '',
            tags: [],
          }),
        ]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.type(await screen.findByLabelText('Document editor'), '@dia')

    const menu = await screen.findByRole('listbox', { name: 'Smart insert suggestions' })
    const fileOption = within(menu).getByRole('option', { name: /diagram\.png/i })
    expect(fileOption).toHaveTextContent('File in Assets')

    await user.click(fileOption)

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('![[Assets/diagram.png|diagram.png]]'))
    })
    expect(await screen.findByRole('img', { name: 'diagram.png' })).toBeInTheDocument()
  }, 30000)

  it('inserts rich document building blocks from the existing Insert dropdown', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/source.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Insert' }))
    expect(screen.getByText('Building blocks')).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Meeting notes' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('## Meeting notes'))
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('### Action items'))
    })

    await user.click(screen.getByRole('button', { name: 'Insert' }))
    await user.click(screen.getByRole('menuitem', { name: 'Decision log' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('## Decision log'))
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('| Date | Decision | Owner | Status |'))
    })
  })

  it('renders scoped note transclusions in rich document mode', async () => {
    const onWikilinkOpen = vi.fn()

    render(
      <DocumentEditor
        markdown="![[Target Note#Section]]"
        noteId="Inbox/source.md"
        allNotes={[note()]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={onWikilinkOpen}
      />,
    )

    expect(await screen.findByText('Target Note / Section')).toBeInTheDocument()
    expect(screen.getByText(/Scoped section body\./)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Target Note / Section'))
    expect(onWikilinkOpen).toHaveBeenCalledWith('Target Note#Section')
  })

  it('renders block transclusions without replacing the source embed on edit', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown={'![[Target Note#^block-a]]\n\nEditable paragraph'}
        noteId="Inbox/source.md"
        allNotes={[note()]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    expect(await screen.findByText('Target Note / ^block-a')).toBeInTheDocument()
    expect(screen.getByText(/Block scoped line/)).toBeInTheDocument()
    expect(onMarkdownChange).not.toHaveBeenCalled()

    await user.click(screen.getByText('Editable paragraph'))
    await user.type(screen.getByLabelText('Document editor'), ' updated')

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('![[Target Note#^block-a]]'))
      expect(onMarkdownChange).not.toHaveBeenCalledWith(expect.stringContaining('Block scoped line'))
    })
  }, 30000)

  it('finds and replaces matches in document mode', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown={'# Draft\n\nAlpha beta alpha'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'Find and replace' }))
    await user.type(screen.getByLabelText('Find text'), 'alpha')

    expect(await screen.findByText('1 / 2')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Replace text'), 'gamma')
    await user.click(screen.getByRole('button', { name: 'All' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('gamma beta gamma'))
    })
  }, 30000)

  it('opens and navigates find with keyboard shortcuts in document mode', async () => {
    const user = userEvent.setup()

    render(
      <DocumentEditor
        markdown={'# Draft\n\nAlpha beta alpha'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={vi.fn()}
      />,
    )

    fireEvent.keyDown(await screen.findByLabelText('Document editor'), { key: 'f', ctrlKey: true })

    expect(screen.getByRole('search', { name: 'Find and replace' })).toBeInTheDocument()
    expect(screen.getByLabelText('Find text')).toHaveFocus()

    await user.type(screen.getByLabelText('Find text'), 'alpha')
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByLabelText('Find text'), { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('2 / 2')).toBeInTheDocument())

    fireEvent.keyDown(screen.getByLabelText('Find text'), { key: 'Enter', shiftKey: true })
    await waitFor(() => expect(screen.getByText('1 / 2')).toBeInTheDocument())

    fireEvent.keyDown(screen.getByLabelText('Find text'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('search', { name: 'Find and replace' })).not.toBeInTheDocument())
  }, 30000)

  it('supports the macOS find shortcut in document mode', async () => {
    render(
      <DocumentEditor
        markdown={'# Draft\n\nBody'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={vi.fn()}
      />,
    )

    fireEvent.keyDown(await screen.findByLabelText('Document editor'), { key: 'f', metaKey: true })

    expect(screen.getByRole('search', { name: 'Find and replace' })).toBeInTheDocument()
    expect(screen.getByLabelText('Find text')).toHaveFocus()
  })

  it('applies rich text formatting from editor keyboard shortcuts', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    const editor = await screen.findByLabelText('Document editor')
    await user.click(editor)
    fireEvent.keyDown(editor, { key: 'b', ctrlKey: true })
    await user.type(editor, 'Bold')

    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('**Bold**')))

    fireEvent.keyDown(editor, { key: 'b', ctrlKey: true })
    fireEvent.keyDown(editor, { key: 'i', ctrlKey: true })
    await user.type(editor, 'Italic')

    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('*Italic*')))

    fireEvent.keyDown(editor, { key: 'i', ctrlKey: true })
    fireEvent.keyDown(editor, { key: 'x', ctrlKey: true, shiftKey: true })
    await user.type(editor, 'Strike')

    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('~~Strike~~')))
  }, 30000)

  it('applies rich document block formatting from keyboard shortcuts', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown="Heading"
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    const editor = await screen.findByLabelText('Document editor')
    await user.click(editor)
    fireEvent.keyDown(editor, { key: '1', ctrlKey: true, altKey: true })

    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('# Heading')))
  }, 30000)

  it('applies rich document list shortcuts', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown="Bullet"
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    const editor = await screen.findByLabelText('Document editor')
    await user.click(editor)
    fireEvent.keyDown(editor, { key: '8', ctrlKey: true, shiftKey: true })

    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('- Bullet')))
  }, 30000)

  it('applies and persists rich document alignment shortcuts', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown="Aligned"
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    const editor = await screen.findByLabelText('Document editor')
    await user.click(editor)
    fireEvent.keyDown(editor, { key: 'e', ctrlKey: true, shiftKey: true })

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith('<p style="text-align: center">Aligned</p>')
    })
  }, 30000)

  it('applies rich document line spacing from the compact more menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown="Spaced"
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(await screen.findByLabelText('Document editor'))
    await user.click(screen.getByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'Line spacing 1.5' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith('<p style="line-height: 1.5">Spaced</p>')
    })
  }, 30000)

  it('applies rich document font size from the compact text menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Text formatting' }))
    await user.click(screen.getByRole('menuitem', { name: 'Font size 18px' }))
    await user.type(await screen.findByLabelText('Document editor'), 'Large')

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith('<span style="font-size: 18px">Large</span>')
    })
  }, 30000)

  it('applies rich document font family from the compact text menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Text formatting' }))
    await user.click(screen.getByRole('menuitem', { name: 'Font family Georgia' }))
    await user.type(await screen.findByLabelText('Document editor'), 'Serif')

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith('<span style="font-family: Georgia">Serif</span>')
    })
  }, 30000)

  it('clears rich document text formatting from the keyboard shortcut', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    const editor = await screen.findByLabelText('Document editor')
    await user.click(screen.getByRole('button', { name: 'Text formatting' }))
    await user.click(screen.getByRole('menuitem', { name: 'Font size 18px' }))
    await user.type(editor, 'Styled')

    fireEvent.keyDown(editor, { key: '\\', ctrlKey: true })
    await user.type(editor, 'Plain')

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith('<span style="font-size: 18px">Styled</span>Plain')
    })
  }, 30000)

  it('applies rich document superscript and subscript shortcuts', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    const editor = await screen.findByLabelText('Document editor')
    await user.click(editor)
    await user.type(editor, 'x')
    fireEvent.keyDown(editor, { key: '.', ctrlKey: true })
    await user.type(editor, '2')

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith('x<sup>2</sup>')
    })

    fireEvent.keyDown(editor, { key: '.', ctrlKey: true })
    await user.type(editor, 'H')
    fireEvent.keyDown(editor, { key: ',', ctrlKey: true })
    await user.type(editor, '2')

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith('x<sup>2</sup>H<sub>2</sub>')
    })
  }, 30000)

  it('opens the in-app link dialog from the rich document keyboard shortcut', async () => {
    render(
      <DocumentEditor
        markdown={'# Draft\n\nBody'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={vi.fn()}
      />,
    )

    const editor = await screen.findByLabelText('Document editor')
    fireEvent.keyDown(editor, { key: 'k', metaKey: true })

    expect(screen.getByRole('form', { name: 'Edit link' })).toBeInTheDocument()
    expect(screen.getByLabelText('Link target')).toHaveFocus()
  })

  it('writes page setup to note frontmatter', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown={'# Draft\n\nBody'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'A4 page size' }))

    await user.click(screen.getByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'Roomy margins' }))

    await user.click(screen.getByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'Landscape orientation' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('page_size: a4'))
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('page_margins: roomy'))
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('page_orientation: landscape'))
    })
  })

  it('switches between pages and pageless document modes from the compact more menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    const { container } = render(
      <DocumentEditor
        markdown={'---\ndocument_header: Claw Notes\ndocument_page_numbers: footer-center\n---\n\n# Draft\n\nBody'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    expect(container.querySelector('.tiptap-note-editor')).toHaveAttribute('data-page-mode', 'pages')
    expect(container.querySelector('.tiptap-note-page-header-preview')).toHaveTextContent('Claw Notes')
    expect(container.querySelector('.tiptap-note-page-number-preview')).toHaveTextContent('Page 1')

    await user.click(await screen.findByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'Pageless mode' }))

    expect(container.querySelector('.tiptap-note-editor')).toHaveAttribute('data-page-mode', 'pageless')
    expect(container.querySelector('.tiptap-note-page-header-preview')).not.toBeInTheDocument()
    expect(container.querySelector('.tiptap-note-page-number-preview')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('document_page_mode: pageless'))
    })

    await user.click(screen.getByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'Pages mode' }))

    expect(container.querySelector('.tiptap-note-editor')).toHaveAttribute('data-page-mode', 'pages')
    expect(container.querySelector('.tiptap-note-page-header-preview')).toHaveTextContent('Claw Notes')
  }, 30000)

  it('edits and previews header and footer in an in-app dialog', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()
    const promptSpy = vi.spyOn(window, 'prompt')

    const { container } = render(
      <DocumentEditor
        markdown={'# Draft\n\nBody'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'Add header' }))
    await user.type(screen.getByLabelText('Header text'), 'Claw Notes')
    await user.click(screen.getByRole('button', { name: 'Save header' }))

    await user.click(screen.getByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'Add footer' }))
    await user.type(screen.getByLabelText('Footer text'), 'Private draft')
    await user.click(screen.getByRole('button', { name: 'Save footer' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('document_header: Claw Notes'))
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('document_footer: Private draft'))
    })
    expect(container.querySelector('.tiptap-note-page-header-preview')).toHaveTextContent('Claw Notes')
    expect(container.querySelector('.tiptap-note-page-footer-preview')).toHaveTextContent('Private draft')
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('edits and renders a document watermark from the Page menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()
    const promptSpy = vi.spyOn(window, 'prompt')

    const { container } = render(
      <DocumentEditor
        markdown={'# Draft\n\nBody'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'Add watermark' }))
    await user.type(screen.getByLabelText('Watermark text'), 'Confidential')
    await user.click(screen.getByRole('button', { name: 'Save watermark' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('document_watermark: Confidential'))
    })
    expect(container.querySelector('.tiptap-note-watermark')).toHaveTextContent('Confidential')
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('sets and previews document page numbers from the Page menu', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    const { container } = render(
      <DocumentEditor
        markdown={'# Draft\n\nBody'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'Page numbers centered' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('document_page_numbers: footer-center'))
    })
    expect(container.querySelector('.tiptap-note-page-number-preview')).toHaveTextContent('Page 1')
    expect(container.querySelector('.tiptap-note-page-number-preview')).toHaveAttribute('data-position', 'footer-center')

    await user.click(screen.getByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'Hide page numbers' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.not.stringContaining('document_page_numbers'))
    })
    expect(container.querySelector('.tiptap-note-page-number-preview')).not.toBeInTheDocument()
  })

  it('sets document columns from the Page menu without adding toolbar buttons', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    const { container } = render(
      <DocumentEditor
        markdown={'# Draft\n\nBody'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'Two columns' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('document_columns: 2'))
    })
    expect(container.querySelector('.tiptap-note-editor')).toHaveAttribute('data-page-columns', '2')
    expect(screen.getByRole('button', { name: 'More document tools' })).toHaveTextContent('More')

    await user.click(screen.getByRole('button', { name: 'More document tools' }))
    await user.click(screen.getByRole('menuitem', { name: 'One column' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.not.stringContaining('document_columns'))
    })
    expect(container.querySelector('.tiptap-note-editor')).toHaveAttribute('data-page-columns', '1')
  })

  it('opens rich link editing in an in-app dialog', async () => {
    const user = userEvent.setup()
    const promptSpy = vi.spyOn(window, 'prompt')

    render(
      <DocumentEditor
        markdown={'# Draft\n\nLink target'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Insert' }))
    await user.click(screen.getByRole('menuitem', { name: 'Link' }))

    expect(screen.getByRole('form', { name: 'Edit link' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Link target'), '[[Target Note]]')
    await user.click(screen.getByRole('button', { name: 'Apply link' }))

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit link' })).not.toBeInTheDocument())
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('inserts image URLs from an in-app dialog without browser prompts', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()
    const promptSpy = vi.spyOn(window, 'prompt')

    render(
      <DocumentEditor
        markdown={'# Draft\n\nBody'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Insert' }))
    await user.click(screen.getByRole('menuitem', { name: 'Image' }))

    const dialog = screen.getByRole('form', { name: 'Insert image' })
    await user.type(within(dialog).getByLabelText('Image URL'), 'https://example.com/diagram.png')
    await user.type(within(dialog).getByLabelText('Alt text'), 'Architecture diagram')
    await user.type(within(dialog).getByLabelText('Image title'), 'System map')
    await user.click(within(dialog).getByRole('button', { name: 'Insert image' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(
        expect.stringContaining('![Architecture diagram](https://example.com/diagram.png "System map")'),
      )
    })
    expect(screen.queryByRole('form', { name: 'Insert image' })).not.toBeInTheDocument()
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('uses compact toolbar menus instead of page setup select boxes', async () => {
    const user = userEvent.setup()

    render(
      <DocumentEditor
        markdown={'# Draft\n\nBody'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={vi.fn()}
      />,
    )

    expect(screen.getByRole('toolbar', { name: 'Document formatting' })).toHaveStyle({ height: '34px' })
    expect(screen.getByRole('toolbar', { name: 'Document formatting' })).toHaveStyle({ flexWrap: 'nowrap' })
    expect(screen.getByRole('button', { name: 'Paragraph style' })).toHaveTextContent('Style')
    expect(screen.queryByRole('button', { name: 'Page setup' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View tools' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Text formatting' })).toHaveTextContent('Text')
    expect(screen.getByRole('button', { name: 'Blocks and lists' })).toHaveTextContent('Blocks')
    expect(screen.getByRole('button', { name: 'Insert' })).toHaveTextContent('Insert')
    expect(screen.queryByRole('button', { name: 'Text alignment' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More document tools' })).toHaveTextContent('More')
    expect(screen.queryByLabelText('Page size')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Text color' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Outline' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Find and replace' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bullet list' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Table' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Voice typing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Align center' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Image options' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Paragraph style' }))
    expect(screen.getByRole('menu', { name: 'Paragraph style' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Paragraph' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Blocks and lists' }))
    expect(screen.getByRole('menu', { name: 'Blocks and lists' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Bullet list' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Code block' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Text formatting' }))
    expect(screen.getByRole('menu', { name: 'Text formatting' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Bold' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Inline code' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Superscript' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Subscript' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Clear formatting' })).toBeInTheDocument()
    expect(screen.getByText('Font family: default')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Font family Georgia' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Default font family' })).toBeInTheDocument()
    expect(screen.getByText('Font size: default')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Font size 18px' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Default font size' })).toBeInTheDocument()
    expect(screen.getByLabelText('Text color')).toBeInTheDocument()
    expect(screen.getByLabelText('Highlight')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'More document tools' }))
    expect(screen.getByRole('menu', { name: 'More document tools' })).toBeInTheDocument()
    expect(screen.getByText('Page setup')).toBeInTheDocument()
    expect(screen.getByText('View')).toBeInTheDocument()
    expect(screen.getByText('Alignment: Left')).toBeInTheDocument()
    expect(screen.getByText('Line spacing: default')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Line spacing 1.5' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Pages mode' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Pageless mode' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Narrow view' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Show outline' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Find and replace' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Insert' }))
    expect(screen.getByRole('menu', { name: 'Insert' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Table' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Voice typing' })).toBeInTheDocument()
    expect(screen.getByText('Building blocks')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Meeting notes' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Decision log' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Page break' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'More document tools' }))
    expect(screen.getByRole('menu', { name: 'More document tools' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Align center' })).toBeInTheDocument()
  })

  it('collapses rich document tools into one dropdown at medium widths', async () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 700 })

    try {
      render(
        <DocumentEditor
          markdown={'# Draft\n\nBody'}
          noteId="Inbox/draft.md"
          allNotes={[]}
          mode="doc"
          onMarkdownChange={vi.fn()}
          onWikilinkOpen={vi.fn()}
        />,
      )

      expect(screen.getByRole('button', { name: 'Document tools' })).toHaveTextContent('')
      expect(screen.queryByRole('button', { name: 'Paragraph style' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Text formatting' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Blocks and lists' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Insert' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'More document tools' })).not.toBeInTheDocument()
      expect(screen.getByRole('toolbar', { name: 'Document formatting' })).toHaveStyle({ height: '34px' })
      expect(screen.getByRole('toolbar', { name: 'Document formatting' })).toHaveStyle({ flexWrap: 'nowrap' })
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('collapses rich document tools into one dropdown on narrow screens', async () => {
    const user = userEvent.setup()
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 520 })

    try {
      render(
        <DocumentEditor
          markdown={'# Draft\n\nBody'}
          noteId="Inbox/draft.md"
          allNotes={[]}
          mode="doc"
          onMarkdownChange={vi.fn()}
          onWikilinkOpen={vi.fn()}
        />,
      )

      expect(screen.getByRole('button', { name: 'Document tools' })).toHaveTextContent('')
      expect(screen.queryByRole('button', { name: 'Paragraph style' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Text formatting' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Blocks and lists' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Insert' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'More document tools' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Document tools' }))
      expect(screen.getByRole('menu', { name: 'Document tools' })).toBeInTheDocument()
      expect(screen.getByText('Style')).toBeInTheDocument()
      expect(screen.getByText('Text')).toBeInTheDocument()
      expect(screen.getByText('Blocks')).toBeInTheDocument()
      expect(screen.getByText('Insert')).toBeInTheDocument()
      expect(screen.getByText('Page setup')).toBeInTheDocument()
      expect(screen.getByText('View')).toBeInTheDocument()
      expect(screen.getByText('Alignment: Left')).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Heading 1' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Bold' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Checklist' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Table' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Meeting notes' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Decision log' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Find and replace' })).toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('collapses rich document tools when the toolbar area is cramped', async () => {
    const originalInnerWidth = window.innerWidth
    const OriginalResizeObserver = globalThis.ResizeObserver
    const observers: Array<{ callback: ResizeObserverCallback; targets: Element[] }> = []
    class TestResizeObserver {
      targets: Element[] = []

      constructor(callback: ResizeObserverCallback) {
        observers.push({ callback, targets: this.targets })
      }

      observe(target: Element) {
        this.targets.push(target)
      }
      unobserve() {}
      disconnect() {}
    }

    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1000 })
    vi.stubGlobal('ResizeObserver', TestResizeObserver)

    try {
      render(
        <DocumentEditor
          markdown={'# Draft\n\nBody'}
          noteId="Inbox/draft.md"
          allNotes={[]}
          mode="doc"
          onMarkdownChange={vi.fn()}
          onWikilinkOpen={vi.fn()}
        />,
      )

      expect(screen.queryByRole('button', { name: 'Document tools' })).not.toBeInTheDocument()
      await waitFor(() => expect(observers.length).toBeGreaterThan(0))

      await act(async () => {
        const toolbar = screen.getByRole('toolbar', { name: 'Document formatting' })
        for (const observer of observers) {
          observer.callback([
            {
              target: toolbar,
              contentRect: DOMRect.fromRect({ width: 400, height: 36 }),
            } as ResizeObserverEntry,
          ], {} as ResizeObserver)
        }
      })

      await waitFor(() => expect(screen.getByRole('button', { name: 'Document tools' })).toHaveTextContent(''))
      expect(screen.queryByRole('button', { name: 'Paragraph style' })).not.toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
      vi.stubGlobal('ResizeObserver', OriginalResizeObserver)
      window.dispatchEvent(new Event('resize'))
    }
  })

  it('exposes undo and redo controls in rich document mode', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()

    render(
      <DocumentEditor
        markdown=""
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    const undo = screen.getByRole('button', { name: 'Undo' })
    const redo = screen.getByRole('button', { name: 'Redo' })
    expect(undo).toBeDisabled()
    expect(redo).toBeDisabled()

    await user.click(await screen.findByLabelText('Document editor'))
    await user.type(screen.getByLabelText('Document editor'), 'Undoable')

    await waitFor(() => expect(undo).not.toBeDisabled())
    await user.click(undo)
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalledWith(''))
  })

  it('supports keyboard navigation and focus return for compact toolbar menus', async () => {
    render(
      <DocumentEditor
        markdown={'# Draft\n\nBody'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={vi.fn()}
      />,
    )

    const styleTrigger = screen.getByRole('button', { name: 'Paragraph style' })
    fireEvent.keyDown(styleTrigger, { key: 'ArrowDown' })
    expect(screen.getByRole('menu', { name: 'Paragraph style' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Heading 1' })).toHaveFocus()
    const anchoredStyleMenu = screen.getByRole('menu', { name: 'Paragraph style' })
    await waitFor(() => expect(anchoredStyleMenu).toHaveStyle({ position: 'fixed', left: '8px' }))
    expect(screen.getByRole('toolbar', { name: 'Document formatting' })).not.toContainElement(anchoredStyleMenu)

    const styleMenu = screen.getByRole('menu', { name: 'Paragraph style' })
    fireEvent.keyDown(styleMenu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Heading 2' })).toHaveFocus()
    fireEvent.keyDown(styleMenu, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: 'Heading 3' })).toHaveFocus()
    fireEvent.keyDown(styleMenu, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Paragraph style' })).not.toBeInTheDocument())
    await waitFor(() => expect(styleTrigger).toHaveFocus())

    const insertTrigger = screen.getByRole('button', { name: 'Insert' })
    fireEvent.keyDown(insertTrigger, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: 'Page break' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu', { name: 'Insert' }), { key: 'v' })
    expect(screen.getByRole('menuitem', { name: 'Voice typing' })).toHaveFocus()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Divider' }))
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Insert' })).not.toBeInTheDocument())
    await waitFor(() => expect(insertTrigger).toHaveFocus())
  })

  it('keeps contextual table controls in a compact menu', async () => {
    const user = userEvent.setup()

    render(
      <DocumentEditor
        markdown={'# Draft\n\nBody'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={vi.fn()}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Insert' }))
    await user.click(screen.getByRole('menuitem', { name: 'Table' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'More document tools' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Table options' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Row +' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Col +' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Table -' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'More document tools' }))
    expect(screen.getByRole('menu', { name: 'More document tools' })).toBeInTheDocument()
    expect(screen.getByText('Table options')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Add row below' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete table' })).toBeInTheDocument()
  })

  it('edits active image metadata in an in-app dialog', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()
    const promptSpy = vi.spyOn(window, 'prompt')

    render(
      <DocumentEditor
        markdown={'![[Media/diagram.png|Old diagram|300]]'}
        noteId="Inbox/draft.md"
        allNotes={[]}
        mode="doc"
        onMarkdownChange={onMarkdownChange}
        onWikilinkOpen={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('img', { name: 'Old diagram' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'More document tools' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Image options' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More document tools' }))
    expect(screen.getByText('Image options')).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Image settings' }))

    expect(screen.getByRole('form', { name: 'Image settings' })).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Alt text'))
    await user.type(screen.getByLabelText('Alt text'), 'Architecture diagram')
    await user.clear(screen.getByLabelText('Width'))
    await user.type(screen.getByLabelText('Width'), '420px')
    await user.click(screen.getByRole('button', { name: 'Apply image settings' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('![[Media/diagram.png|Architecture diagram|420]]'))
    })
    expect(screen.queryByRole('form', { name: 'Image settings' })).not.toBeInTheDocument()
    expect(promptSpy).not.toHaveBeenCalled()
  }, 30000)

  it('shows a compact unavailable status when voice typing is not supported', async () => {
    const user = userEvent.setup()
    const originalSpeechRecognition = (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition
    const originalWebkitSpeechRecognition = (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition

    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined })
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined })

    try {
      render(
        <DocumentEditor
          markdown={'# Draft\n\nBody'}
          noteId="Inbox/draft.md"
          allNotes={[]}
          mode="doc"
          onMarkdownChange={vi.fn()}
          onWikilinkOpen={vi.fn()}
        />,
      )

      await user.click(await screen.findByRole('button', { name: 'Insert' }))
      await user.click(screen.getByRole('menuitem', { name: 'Voice typing' }))

      expect(screen.getByRole('status')).toHaveTextContent('Voice typing is not available in this browser.')
    } finally {
      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: originalSpeechRecognition })
      Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: originalWebkitSpeechRecognition })
    }
  })

  it('starts voice typing and inserts the recognized transcript at the cursor', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()
    const originalSpeechRecognition = (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition
    const originalWebkitSpeechRecognition = (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    const start = vi.fn()
    const stop = vi.fn()
    const instances: Array<{
      lang: string
      continuous: boolean
      interimResults: boolean
      onresult: ((event: {
        resultIndex: number
        results: { length: number; [index: number]: { length: number; [index: number]: { transcript: string } } }
      }) => void) | null
      onerror: ((event: { error?: string; message?: string }) => void) | null
      onend: (() => void) | null
      start: () => void
      stop: () => void
    }> = []

    class MockSpeechRecognition {
      lang = ''
      continuous = false
      interimResults = false
      onresult = null
      onerror = null
      onend = null
      start = start
      stop = stop

      constructor() {
        instances.push(this)
      }
    }

    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: MockSpeechRecognition })
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined })

    try {
      render(
        <DocumentEditor
          markdown=""
          noteId="Inbox/draft.md"
          allNotes={[]}
          mode="doc"
          onMarkdownChange={onMarkdownChange}
          onWikilinkOpen={vi.fn()}
        />,
      )

      await user.click(await screen.findByLabelText('Document editor'))
      await user.click(screen.getByRole('button', { name: 'Insert' }))
      await user.click(screen.getByRole('menuitem', { name: 'Voice typing' }))

      expect(start).toHaveBeenCalledTimes(1)
      expect(instances[0]).toMatchObject({ continuous: false, interimResults: false })
      expect(screen.getByRole('status')).toHaveTextContent('Listening for voice input...')

      await act(async () => {
        instances[0].onresult?.({
          resultIndex: 0,
          results: {
            length: 1,
            0: {
              length: 1,
              0: { transcript: 'dictated sentence' },
            },
          },
        })
      })

      await waitFor(() => {
        expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('dictated sentence'))
      })
      expect(screen.getByRole('status')).toHaveTextContent('Voice transcript inserted.')
    } finally {
      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: originalSpeechRecognition })
      Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: originalWebkitSpeechRecognition })
    }
  }, 30000)

  it('normalizes voice typing punctuation and line break commands before insertion', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()
    const originalSpeechRecognition = (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition
    const originalWebkitSpeechRecognition = (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    const instances: Array<{
      lang: string
      continuous: boolean
      interimResults: boolean
      onresult: ((event: {
        resultIndex: number
        results: { length: number; [index: number]: { length: number; [index: number]: { transcript: string } } }
      }) => void) | null
      onerror: ((event: { error?: string; message?: string }) => void) | null
      onend: (() => void) | null
      start: () => void
      stop: () => void
    }> = []

    class MockSpeechRecognition {
      lang = ''
      continuous = false
      interimResults = false
      onresult = null
      onerror = null
      onend = null
      start = vi.fn()
      stop = vi.fn()

      constructor() {
        instances.push(this)
      }
    }

    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: MockSpeechRecognition })
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined })

    try {
      render(
        <DocumentEditor
          markdown=""
          noteId="Inbox/draft.md"
          allNotes={[]}
          mode="doc"
          onMarkdownChange={onMarkdownChange}
          onWikilinkOpen={vi.fn()}
        />,
      )

      await user.click(await screen.findByLabelText('Document editor'))
      await user.click(screen.getByRole('button', { name: 'Insert' }))
      await user.click(screen.getByRole('menuitem', { name: 'Voice typing' }))

      await act(async () => {
        instances[0].onresult?.({
          resultIndex: 0,
          results: {
            length: 1,
            0: {
              length: 1,
              0: { transcript: 'Hello comma new line world exclamation point new paragraph Next question mark' },
            },
          },
        })
      })

      await waitFor(() => {
        expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('Hello,'))
        expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('world!'))
        expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('Next?'))
      })
    } finally {
      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: originalSpeechRecognition })
      Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: originalWebkitSpeechRecognition })
    }
  }, 30000)

  it('applies voice editing commands without inserting the command text', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()
    const originalSpeechRecognition = (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition
    const originalWebkitSpeechRecognition = (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    const instances: Array<{
      lang: string
      continuous: boolean
      interimResults: boolean
      onresult: ((event: {
        resultIndex: number
        results: { length: number; [index: number]: { length: number; [index: number]: { transcript: string } } }
      }) => void) | null
      onerror: ((event: { error?: string; message?: string }) => void) | null
      onend: (() => void) | null
      start: () => void
      stop: () => void
    }> = []

    class MockSpeechRecognition {
      lang = ''
      continuous = false
      interimResults = false
      onresult = null
      onerror = null
      onend = null
      start = vi.fn()
      stop = vi.fn()

      constructor() {
        instances.push(this)
      }
    }

    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: MockSpeechRecognition })
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined })

    try {
      render(
        <DocumentEditor
          markdown=""
          noteId="Inbox/draft.md"
          allNotes={[]}
          mode="doc"
          onMarkdownChange={onMarkdownChange}
          onWikilinkOpen={vi.fn()}
        />,
      )

      const editor = await screen.findByLabelText('Document editor')
      await user.click(editor)
      await user.type(editor, 'Hello world')
      await waitFor(() => expect(editor).toHaveTextContent('Hello world'))

      await user.click(screen.getByRole('button', { name: 'Insert' }))
      await user.click(screen.getByRole('menuitem', { name: 'Voice typing' }))

      await act(async () => {
        instances[0].onresult?.({
          resultIndex: 0,
          results: {
            length: 1,
            0: {
              length: 1,
              0: { transcript: 'delete last word' },
            },
          },
        })
      })

      await waitFor(() => {
        expect(editor).toHaveTextContent('Hello')
        expect(editor).not.toHaveTextContent('world')
        expect(editor).not.toHaveTextContent('delete last word')
      })
      expect(screen.getByRole('status')).toHaveTextContent('Voice command applied.')
    } finally {
      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: originalSpeechRecognition })
      Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: originalWebkitSpeechRecognition })
    }
  }, 30000)
})
