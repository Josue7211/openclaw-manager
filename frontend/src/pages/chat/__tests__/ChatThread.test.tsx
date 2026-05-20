import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ChatThread, { extractToolCards } from '../ChatThread'
import type { ChatMessage } from '../types'

vi.mock('@/components/MarkdownBubble', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown-bubble">{children}</div>,
}))

vi.mock('@/components/Lightbox', () => ({
  default: () => null,
}))

let clipboardWriteText: ReturnType<typeof vi.fn>

beforeEach(() => {
  clipboardWriteText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: clipboardWriteText,
    },
  })
})

function renderThread(overrides: Partial<React.ComponentProps<typeof ChatThread>> = {}) {
  const messages: ChatMessage[] = overrides.messages ?? []
  return render(
    <ChatThread
      messages={messages}
      optimistic={[]}
      isTyping={false}
      mounted
      atBottom
      systemMsg={null}
      lightbox={null}
      setLightbox={vi.fn()}
      setAtBottom={vi.fn()}
      setAtBottomRefOnly={vi.fn()}
      scrollRef={{ current: document.createElement('div') }}
      bottomRef={{ current: document.createElement('div') }}
      optimisticImageCacheRef={{ current: new Map() }}
      onDrop={vi.fn()}
      retry={vi.fn()}
      {...overrides}
    />,
  )
}

describe('ChatThread message polish', () => {
  it('extracts tool cards from fenced tool call payloads', () => {
    const cards = extractToolCards('```tool_call\n{"name":"read_file","arguments":{"path":"src/main.ts"}}\n```')

    expect(cards).toEqual([
      expect.objectContaining({
        name: 'read_file',
        status: 'running',
        summary: '{ "path": "src/main.ts" }',
      }),
    ])
  })

  it('renders assistant tool activity as first-class cards', async () => {
    renderThread({
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Checking files.\n```tool_result\n{"name":"rg","result":"3 matches"}\n```',
          timestamp: new Date().toISOString(),
        },
      ],
    })

    expect(await screen.findByLabelText('Tool activity')).toBeInTheDocument()
    expect(screen.getByText('rg')).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
    expect(screen.getByText('3 matches')).toBeInTheDocument()
  })

  it('renders a named assistant status card while waiting for a response', () => {
    renderThread({ isTyping: true })

    expect(screen.getByRole('status', { name: 'Assistant status' })).toHaveTextContent('Assistant is working')
  })

  it('renders unmatched tool history rows as explicit transcript events', () => {
    renderThread({
      messages: [
        {
          id: 'tool-1',
          role: 'tool',
          text: '3 matches',
          timestamp: new Date().toISOString(),
          toolName: 'rg',
          toolCallId: 'call-123',
        },
      ],
    })

    expect(screen.getByRole('note', { name: 'Tool event rg' })).toBeInTheDocument()
    expect(screen.getByText('rg')).toBeInTheDocument()
    expect(screen.getByText('call-123')).toBeInTheDocument()
    expect(screen.getByText('3 matches')).toBeInTheDocument()
  })

  it('offers copy only on the final completed assistant message', async () => {
    renderThread({
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Earlier answer',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'user-1',
          role: 'user',
          text: 'Can you refine that?',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'assistant-2',
          role: 'assistant',
          text: 'Final answer',
          timestamp: new Date().toISOString(),
        },
      ],
    })

    const copyButtons = screen.getAllByRole('button', { name: 'Copy assistant message' })
    expect(copyButtons).toHaveLength(1)

    fireEvent.click(copyButtons[0])

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('Final answer'))
    expect(await screen.findByRole('button', { name: 'Copied assistant message' })).toBeInTheDocument()
  })

  it('hides final assistant copy while a response is still streaming', () => {
    renderThread({
      isTyping: true,
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Partial answer',
          timestamp: new Date().toISOString(),
        },
      ],
    })

    expect(screen.queryByRole('button', { name: 'Copy assistant message' })).not.toBeInTheDocument()
  })
})
