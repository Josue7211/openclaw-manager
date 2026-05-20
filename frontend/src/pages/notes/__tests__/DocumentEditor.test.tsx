import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DocumentEditor from '../DocumentEditor'

describe('DocumentEditor find and replace', () => {
  beforeEach(() => {
    localStorage.clear()
  })

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

    await user.click(await screen.findByLabelText('Find and replace'))
    await user.type(screen.getByLabelText('Find text'), 'alpha')

    expect(await screen.findByText('1 / 2')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Replace text'), 'gamma')
    await user.click(screen.getByRole('button', { name: 'All' }))

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('gamma beta gamma'))
    })
  }, 30000)

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

    await user.selectOptions(await screen.findByLabelText('Page size'), 'a4')
    await user.selectOptions(screen.getByLabelText('Page margins'), 'roomy')
    await user.selectOptions(screen.getByLabelText('Page orientation'), 'landscape')

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('page_size: a4'))
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('page_margins: roomy'))
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('page_orientation: landscape'))
    })
  })
})
