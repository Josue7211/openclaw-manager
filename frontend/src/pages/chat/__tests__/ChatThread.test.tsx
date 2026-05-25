import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ChatThread, { assistantDisplayText, buildChatTranscript, extractToolCards } from '../ChatThread'
import type { ChatMessage } from '../types'
import { optimisticAttachmentCacheKey } from '../optimisticAttachmentCache'

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
      optimisticContextFileCacheRef={{ current: new Map() }}
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

  it('strips raw tool markup from assistant display text', () => {
    expect(assistantDisplayText([
      'I will inspect the files.',
      '```tool_call',
      '{"name":"read_file","arguments":{"path":"src/main.ts"}}',
      '```',
      '<tool_result name="read_file">{"result":"ok"}</tool_result>',
      'Done.',
    ].join('\n'))).toBe('I will inspect the files.\n\nDone.')
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
    expect(screen.getByRole('button', { name: 'Copy tool result rg' })).toBeInTheDocument()
    const bubble = await screen.findByTestId('markdown-bubble')
    expect(bubble).toHaveTextContent('Checking files.')
    expect(bubble).not.toHaveTextContent('tool_result')
  })

  it('renders a supplied project-aware empty state slot before the first message', () => {
    renderThread({
      messages: [],
      emptyStateSlot: <section aria-label="Chat start context">Unscoped chat</section>,
    })

    expect(screen.getByRole('region', { name: 'Chat start context' })).toHaveTextContent('Unscoped chat')
    expect(screen.queryByText('No messages yet')).not.toBeInTheDocument()
  })

  it('copies assistant tool-card details from hidden tool markup', async () => {
    renderThread({
      messages: [
        {
          id: 'assistant-tool-copy',
          role: 'assistant',
          text: 'Checking files.\n```tool_result\n{"name":"rg","arguments":{"query":"ProjectSidebar"},"result":"3 matches"}\n```',
          timestamp: new Date().toISOString(),
        },
      ],
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Copy tool result rg' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith(expect.stringContaining('3 matches')))
    expect(clipboardWriteText.mock.calls[0]?.[0]).toContain('"query": "ProjectSidebar"')
    expect(await screen.findByRole('button', { name: 'Copied tool result rg' })).toBeInTheDocument()
  })

  it('discloses assistant tool-card details on demand', async () => {
    renderThread({
      messages: [
        {
          id: 'assistant-tool-details',
          role: 'assistant',
          text: 'Checking files.\n```tool_result\n{"name":"rg","arguments":{"query":"ProjectSidebar"},"result":"3 matches"}\n```',
          timestamp: new Date().toISOString(),
        },
      ],
    })

    expect(await screen.findByText('3 matches')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tool result details rg' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show details for tool result rg' }))

    expect(screen.getByRole('button', { name: 'Hide details for tool result rg' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'Tool result details rg' })).toHaveTextContent('{ "query": "ProjectSidebar" }')

    fireEvent.click(screen.getByRole('button', { name: 'Hide details for tool result rg' }))

    expect(screen.queryByRole('region', { name: 'Tool result details rg' })).not.toBeInTheDocument()
  })

  it('does not render an empty assistant bubble for tool-only assistant output', async () => {
    renderThread({
      messages: [
        {
          id: 'assistant-tool-only',
          role: 'assistant',
          text: '```tool_call\n{"name":"rg","arguments":{"query":"ProjectSidebar"}}\n```',
          timestamp: new Date().toISOString(),
        },
      ],
    })

    expect(await screen.findByLabelText('Tool activity')).toBeInTheDocument()
    expect(screen.queryByTestId('markdown-bubble')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy assistant message' })).not.toBeInTheDocument()
  })

  it('copies assistant-visible text instead of hidden tool markup', async () => {
    renderThread({
      messages: [
        {
          id: 'assistant-with-tool',
          role: 'assistant',
          text: 'Checked it.\n```tool_result\n{"name":"rg","result":"3 matches"}\n```',
          timestamp: new Date().toISOString(),
        },
      ],
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Copy assistant message' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('Checked it.'))
  })

  it('exports embedded assistant tool activity as structured transcript blocks', () => {
    const transcript = buildChatTranscript({
      systemMsg: null,
      messages: [
        {
          id: 'assistant-with-tool',
          role: 'assistant',
          text: [
            'Checking files.',
            '```tool_result',
            '{"name":"rg","result":"3 matches"}',
            '```',
            'Done.',
          ].join('\n'),
          timestamp: '2026-05-21T12:00:00.000Z',
        },
      ],
      optimistic: [],
    })

    expect(transcript).toBe([
      '### Assistant (2026-05-21T12:00:00.000Z)',
      '',
      'Checking files.',
      '',
      'Done.',
      '',
      '---',
      '',
      '### Tool: rg (2026-05-21T12:00:00.000Z | status: done)',
      '',
      '3 matches',
    ].join('\n'))
    expect(transcript).not.toContain('tool_result')
  })

  it('exports tool-only assistant output without an empty assistant transcript block', () => {
    const transcript = buildChatTranscript({
      systemMsg: null,
      messages: [
        {
          id: 'assistant-tool-only',
          role: 'assistant',
          text: '```tool_call\n{"name":"read_file","arguments":{"path":"src/main.ts"}}\n```',
          timestamp: '2026-05-21T12:00:00.000Z',
        },
      ],
      optimistic: [],
    })

    expect(transcript).toBe([
      '### Tool: read_file (2026-05-21T12:00:00.000Z | status: running)',
      '',
      '{ "path": "src/main.ts" }',
    ].join('\n'))
    expect(transcript).not.toContain('### Assistant')
  })

  it('formats a complete transcript with tool rows, files, images, and optimistic status', () => {
    const transcript = buildChatTranscript({
      systemMsg: 'Connected to Hermes Agent',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          text: 'Review this',
          timestamp: '2026-05-21T12:00:00.000Z',
          images: ['data:image/png;base64,a'],
          contextFiles: [{
            id: 'ctx-1',
            name: 'Chat.tsx',
            path: 'frontend/src/pages/Chat.tsx',
            content: 'export default function Chat() {}',
            truncated: true,
          }],
        },
        {
          id: 'heartbeat',
          role: 'assistant',
          text: 'HEARTBEAT_OK',
          timestamp: '2026-05-21T12:00:01.000Z',
        },
        {
          id: 'tool-1',
          role: 'tool',
          text: '3 matches',
          timestamp: '2026-05-21T12:00:02.000Z',
          toolName: 'rg',
        },
      ],
      optimistic: [{
        id: 'opt-1',
        text: 'follow up',
        status: 'sending',
      }],
    })

    expect(transcript).toBe([
      '### System',
      '',
      'Connected to Hermes Agent',
      '',
      '---',
      '',
      '### User (2026-05-21T12:00:00.000Z)',
      '',
      'Review this',
      '',
      'Attached context files:',
      '- frontend/src/pages/Chat.tsx (trimmed)',
      '',
      'Attached context file contents:',
      '',
      'File: frontend/src/pages/Chat.tsx (trimmed)',
      '```tsx',
      'export default function Chat() {}',
      '```',
      '',
      'Attached images: 1',
      '',
      '---',
      '',
      '### Tool: rg (2026-05-21T12:00:02.000Z)',
      '',
      '3 matches',
      '',
      '---',
      '',
      '### User (status: sending)',
      '',
      'follow up',
    ].join('\n'))
    expect(transcript).not.toContain('HEARTBEAT_OK')
  })

  it('exports active project metadata before transcript messages', () => {
    const transcript = buildChatTranscript({
      systemMsg: null,
      context: {
        projectName: 'clawctrl',
        projectPath: '/Volumes/T7/projects/clawctrl',
        environmentId: 'local',
        runtime: 'Work locally',
        branch: 'main',
      },
      messages: [{
        id: 'user-1',
        role: 'user',
        text: 'Explain this module',
        timestamp: '2026-05-21T12:00:00.000Z',
      }],
      optimistic: [],
    })

    expect(transcript).toBe([
      '### Context',
      '',
      'Project: clawctrl',
      'Path: /Volumes/T7/projects/clawctrl',
      'Environment: local',
      'Runtime: Work locally',
      'Branch: main',
      '',
      '---',
      '',
      '### User (2026-05-21T12:00:00.000Z)',
      '',
      'Explain this module',
    ].join('\n'))
  })

  it('renders context file chips on transcript and optimistic user messages', async () => {
    renderThread({
      messages: [{
        id: 'user-with-file',
        role: 'user',
        text: 'review this',
        timestamp: new Date().toISOString(),
        contextFiles: [{
          id: 'ctx-1',
          name: 'Chat.tsx',
          path: 'frontend/src/pages/Chat.tsx',
          content: 'export default function Chat() {}',
          truncated: true,
        }],
      }],
      optimistic: [{
        id: 'opt-with-file',
        text: 'and this too',
        status: 'sending',
        contextFiles: [{
          id: 'ctx-2',
          name: 'useChatState.ts',
          path: 'frontend/src/pages/chat/useChatState.ts',
          content: 'export function useChatState() {}',
        }],
      }],
    })

    expect(screen.getAllByLabelText('Attached context files')).toHaveLength(2)
    expect(screen.getByText('frontend/src/pages/Chat.tsx (trimmed)')).toBeInTheDocument()
    expect(screen.getByText('frontend/src/pages/chat/useChatState.ts')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy attached file Chat.tsx' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      'File: frontend/src/pages/Chat.tsx (trimmed)',
      '',
      'export default function Chat() {}',
    ].join('\n')))
    expect(await screen.findByRole('button', { name: 'Copied attached file Chat.tsx' })).toBeInTheDocument()
  })

  it('copies attached file content from the transcript preview panel', async () => {
    renderThread({
      messages: [{
        id: 'user-with-preview-file',
        role: 'user',
        text: 'review this',
        timestamp: new Date().toISOString(),
        contextFiles: [{
          id: 'ctx-preview',
          name: 'Preview.ts',
          path: 'frontend/src/pages/Preview.ts',
          content: 'export const preview = true',
        }],
      }],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Preview attached file Preview.ts' }))
    expect(screen.getByRole('region', { name: 'Attached file preview Preview.ts' })).toHaveTextContent('export const preview = true')

    fireEvent.click(screen.getByRole('button', { name: 'Copy preview file Preview.ts' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      'File: frontend/src/pages/Preview.ts',
      '',
      'export const preview = true',
    ].join('\n')))
    expect(await screen.findByRole('button', { name: 'Copied preview file Preview.ts' })).toBeInTheDocument()
  })

  it('uses cached optimistic context files when history arrives without attachment metadata', async () => {
    const cachedFiles = [{
      id: 'ctx-cached',
      name: 'Chat.tsx',
      path: 'frontend/src/pages/Chat.tsx',
      content: 'export default function Chat() {}',
    }]
    renderThread({
      messages: [{
        id: 'user-history-without-files',
        role: 'user',
        text: 'review this cached file',
        timestamp: new Date().toISOString(),
      }],
      optimisticContextFileCacheRef: {
        current: new Map([
          ['review this cached file', cachedFiles],
        ]),
      },
    })

    expect(screen.getByLabelText('Attached context files')).toHaveTextContent('frontend/src/pages/Chat.tsx')

    fireEvent.click(screen.getByRole('button', { name: 'Copy user message' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      'review this cached file',
      '',
      'Attached context files:',
      '- frontend/src/pages/Chat.tsx',
      '',
      'Attached context file contents:',
      '',
      'File: frontend/src/pages/Chat.tsx',
      '```tsx',
      'export default function Chat() {}',
      '```',
    ].join('\n')))
  })

  it('includes cached optimistic attachments when copying the whole thread transcript', async () => {
    const cachedFiles = [{
      id: 'ctx-cached',
      name: 'Chat.tsx',
      path: 'frontend/src/pages/Chat.tsx',
      content: 'export default function Chat() {}',
    }]
    renderThread({
      messages: [{
        id: 'user-history-without-attachments',
        role: 'user',
        text: 'review cached attachments',
        timestamp: '2026-05-21T12:00:00.000Z',
      }],
      optimisticImageCacheRef: {
        current: new Map([
          ['review cached attachments', ['data:image/png;base64,cached']],
        ]),
      },
      optimisticContextFileCacheRef: {
        current: new Map([
          ['review cached attachments', cachedFiles],
        ]),
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy thread transcript' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      '### User (2026-05-21T12:00:00.000Z)',
      '',
      'review cached attachments',
      '',
      'Attached context files:',
      '- frontend/src/pages/Chat.tsx',
      '',
      'Attached context file contents:',
      '',
      'File: frontend/src/pages/Chat.tsx',
      '```tsx',
      'export default function Chat() {}',
      '```',
      '',
      'Attached images: 1',
    ].join('\n')))
  })

  it('includes active project metadata when copying the whole thread transcript', async () => {
    renderThread({
      transcriptContext: {
        projectName: 'clawctrl',
        projectPath: '/Volumes/T7/projects/clawctrl',
        runtime: 'Work locally',
        branch: 'main',
      },
      messages: [{
        id: 'user-with-context',
        role: 'user',
        text: 'review project context',
        timestamp: '2026-05-21T12:00:00.000Z',
      }],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy thread transcript' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      '### Context',
      '',
      'Project: clawctrl',
      'Path: /Volumes/T7/projects/clawctrl',
      'Runtime: Work locally',
      'Branch: main',
      '',
      '---',
      '',
      '### User (2026-05-21T12:00:00.000Z)',
      '',
      'review project context',
    ].join('\n')))
  })

  it('previews attached context file content from message chips', async () => {
    renderThread({
      messages: [{
        id: 'user-with-file-preview',
        role: 'user',
        text: 'review this file',
        timestamp: new Date().toISOString(),
        contextFiles: [{
          id: 'ctx-preview',
          name: 'ChatThread.tsx',
          path: 'frontend/src/pages/chat/ChatThread.tsx',
          content: 'export function ChatThreadPreview() { return null }',
        }],
      }],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Preview attached file ChatThread.tsx' }))

    const preview = await screen.findByRole('region', { name: 'Attached file preview ChatThread.tsx' })
    expect(preview).toHaveTextContent('frontend/src/pages/chat/ChatThread.tsx')
    expect(preview).toHaveTextContent('export function ChatThreadPreview')

    fireEvent.click(screen.getByRole('button', { name: 'Close attached file preview ChatThread.tsx' }))

    expect(screen.queryByRole('region', { name: 'Attached file preview ChatThread.tsx' })).not.toBeInTheDocument()
  })

  it('closes attached context file previews with Escape', async () => {
    renderThread({
      messages: [{
        id: 'user-with-file-preview',
        role: 'user',
        text: 'review this file',
        timestamp: new Date().toISOString(),
        contextFiles: [{
          id: 'ctx-preview',
          name: 'ChatThread.tsx',
          path: 'frontend/src/pages/chat/ChatThread.tsx',
          content: 'export function ChatThreadPreview() { return null }',
        }],
      }],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Preview attached file ChatThread.tsx' }))
    expect(await screen.findByRole('region', { name: 'Attached file preview ChatThread.tsx' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('region', { name: 'Attached file preview ChatThread.tsx' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview attached file ChatThread.tsx' })).toBeInTheDocument()
  })

  it('labels transcript and optimistic image attachments by state and order', () => {
    renderThread({
      messages: [
        {
          id: 'user-with-image',
          role: 'user',
          text: 'inspect this screenshot',
          timestamp: new Date().toISOString(),
          images: ['data:image/png;base64,user'],
        },
        {
          id: 'assistant-with-image',
          role: 'assistant',
          text: 'annotated result',
          timestamp: new Date().toISOString(),
          images: ['data:image/png;base64,assistant'],
        },
      ],
      optimistic: [{
        id: 'optimistic-with-image',
        text: 'sending screenshot',
        status: 'sending',
        images: ['data:image/png;base64,sending'],
      }],
    })

    expect(screen.getByAltText('User attached image 1')).toBeInTheDocument()
    expect(screen.getByAltText('Assistant attached image 1')).toBeInTheDocument()
    expect(screen.getByAltText('Sending attached image 1')).toBeInTheDocument()
  })

  it('offers copy actions for pending optimistic user messages', async () => {
    renderThread({
      optimistic: [
        {
          id: 'opt-sending',
          text: 'run the suite',
          status: 'sending',
          images: ['data:image/png;base64,sending'],
          contextFiles: [{
            id: 'sending-file',
            name: 'package.json',
            path: 'package.json',
            content: '{"scripts":{"test":"vitest"}}',
          }],
        },
        {
          id: 'opt-sent',
          text: 'summarize the result',
          status: 'sent',
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy sending message' }))
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      'run the suite',
      '',
      'Attached context files:',
      '- package.json',
      '',
      'Attached context file contents:',
      '',
      'File: package.json',
      '```json',
      '{"scripts":{"test":"vitest"}}',
      '```',
      '',
      'Attached images: 1',
    ].join('\n')))

    fireEvent.click(screen.getByRole('button', { name: 'Copy sent message' }))
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('summarize the result'))
    expect(screen.getByRole('button', { name: 'Copied sent message' })).toBeInTheDocument()
  })

  it('shows stopped optimistic messages as retryable instead of sent', async () => {
    const retry = vi.fn()
    const onUseMessageAsPrompt = vi.fn()
    renderThread({
      optimistic: [{
        id: 'opt-cancelled',
        text: 'stop this task',
        status: 'cancelled',
        images: ['data:image/png;base64,stopped'],
        contextFiles: [{
          id: 'stopped-file',
          name: 'stopped.ts',
          path: 'src/stopped.ts',
          content: 'export const stopped = true',
        }],
      }],
      retry,
      onUseMessageAsPrompt,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy stopped message' }))
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      'stop this task',
      '',
      'Attached context files:',
      '- src/stopped.ts',
      '',
      'Attached context file contents:',
      '',
      'File: src/stopped.ts',
      '```typescript',
      'export const stopped = true',
      '```',
      '',
      'Attached images: 1',
    ].join('\n')))

    fireEvent.click(screen.getByRole('button', { name: 'Stopped · Retry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit stopped message' }))

    expect(retry).toHaveBeenCalledWith(expect.objectContaining({
      id: 'opt-cancelled',
      status: 'cancelled',
    }))
    expect(onUseMessageAsPrompt).toHaveBeenCalledWith(expect.objectContaining({
      id: 'opt-cancelled',
      role: 'user',
      text: 'stop this task',
      images: ['data:image/png;base64,stopped'],
      contextFiles: [expect.objectContaining({ name: 'stopped.ts' })],
      localOnly: true,
    }))
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })

  it('exposes failed optimistic messages through a keyboard-accessible retry button', async () => {
    const retry = vi.fn()
    const onUseMessageAsPrompt = vi.fn()
    renderThread({
      optimistic: [{
        id: 'opt-error',
        text: 'try this task',
        status: 'error',
        error: 'codex-cli: provider cwd is required',
        contextFiles: [{
          id: 'failed-file',
          name: 'failed.ts',
          path: 'src/failed.ts',
          content: 'export const failed = true',
        }],
      }],
      retry,
      onUseMessageAsPrompt,
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Hermes Agent needs a project folder. Select or add a project before sending.')
    fireEvent.click(screen.getByRole('button', { name: 'Copy failed message' }))
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      'try this task',
      '',
      'Attached context files:',
      '- src/failed.ts',
      '',
      'Attached context file contents:',
      '',
      'File: src/failed.ts',
      '```typescript',
      'export const failed = true',
      '```',
    ].join('\n')))

    fireEvent.click(screen.getByRole('button', { name: 'Retry failed message' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit failed message' }))

    expect(retry).toHaveBeenCalledWith(expect.objectContaining({
      id: 'opt-error',
      status: 'error',
      error: 'codex-cli: provider cwd is required',
    }))
    expect(onUseMessageAsPrompt).toHaveBeenCalledWith(expect.objectContaining({
      id: 'opt-error',
      role: 'user',
      text: 'try this task',
      contextFiles: [expect.objectContaining({ name: 'failed.ts' })],
      localOnly: true,
    }))
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
    expect(screen.getByRole('button', { name: 'Copy tool event' })).toBeInTheDocument()
  })

  it('offers copy actions for completed user and assistant transcript messages', async () => {
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

    const assistantCopyButtons = screen.getAllByRole('button', { name: 'Copy assistant message' })
    expect(assistantCopyButtons).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Copy user message' })).toBeInTheDocument()

    fireEvent.click(assistantCopyButtons[1])

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('Final answer'))
    expect(await screen.findByRole('button', { name: 'Copied assistant message' })).toBeInTheDocument()
    expect(await screen.findByRole('status', { name: 'Copy status' })).toHaveTextContent('Copied assistant message.')
  })

  it('includes image attachment counts when copying a transcript message', async () => {
    renderThread({
      messages: [{
        id: 'user-with-image',
        role: 'user',
        text: 'review this screenshot',
        timestamp: new Date().toISOString(),
        images: ['data:image/png;base64,user'],
      }],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy user message' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      'review this screenshot',
      '',
      'Attached images: 1',
    ].join('\n')))
  })

  it('shows a visible copy error when the clipboard write fails', async () => {
    clipboardWriteText.mockRejectedValueOnce(new Error('permission denied'))
    renderThread({
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Final answer',
          timestamp: new Date().toISOString(),
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy assistant message' }))

    expect(await screen.findByRole('status', { name: 'Copy status' })).toHaveTextContent(
      'Could not copy assistant message: permission denied',
    )
    expect(await screen.findByRole('button', { name: 'Retry copy assistant message' })).toBeInTheDocument()
  })

  it('offers completed user messages as reusable composer prompts', () => {
    const onUseMessageAsPrompt = vi.fn()
    const message: ChatMessage = {
      id: 'user-1',
      role: 'user',
      text: 'rerun this with more context',
      timestamp: new Date().toISOString(),
      contextFiles: [{
        id: 'ctx-1',
        name: 'Chat.tsx',
        path: 'frontend/src/pages/Chat.tsx',
        content: 'export default function Chat() {}',
      }],
    }

    renderThread({
      messages: [message],
      onUseMessageAsPrompt,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Edit user message: rerun this with more context' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use user message as prompt: rerun this with more context' }))

    expect(onUseMessageAsPrompt).toHaveBeenNthCalledWith(1, message)
    expect(onUseMessageAsPrompt).toHaveBeenNthCalledWith(2, message)
  })

  it('offers completed user messages as fork points for new chats', () => {
    const onForkMessage = vi.fn()
    const message: ChatMessage = {
      id: 'user-fork',
      role: 'user',
      text: 'fork this with the same context',
      timestamp: new Date().toISOString(),
      images: ['data:image/png;base64,fork'],
      contextFiles: [{
        id: 'ctx-fork',
        name: 'Fork.tsx',
        path: 'frontend/src/pages/Fork.tsx',
        content: 'export default function Fork() {}',
      }],
    }

    renderThread({
      messages: [message],
      onForkMessage,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Fork chat from user message: fork this with the same context' }))

    expect(onForkMessage).toHaveBeenCalledWith(message)
  })

  it('hydrates cached optimistic attachments before reusing a history message as a prompt', () => {
    const onUseMessageAsPrompt = vi.fn()
    const cachedFiles = [{
      id: 'ctx-cached',
      name: 'Chat.tsx',
      path: 'frontend/src/pages/Chat.tsx',
      content: 'export default function Chat() {}',
    }]
    renderThread({
      messages: [{
        id: 'user-history-without-attachments',
        role: 'user',
        text: 'rerun cached attachments',
        timestamp: new Date().toISOString(),
      }],
      optimisticImageCacheRef: {
        current: new Map([
          ['rerun cached attachments', ['data:image/png;base64,cached']],
        ]),
      },
      optimisticContextFileCacheRef: {
        current: new Map([
          ['rerun cached attachments', cachedFiles],
        ]),
      },
      onUseMessageAsPrompt,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Use user message as prompt: rerun cached attachments' }))

    expect(onUseMessageAsPrompt).toHaveBeenCalledWith(expect.objectContaining({
      text: 'rerun cached attachments',
      images: ['data:image/png;base64,cached'],
      contextFiles: cachedFiles,
    }))
  })

  it('hydrates repeated same-text history messages from sequenced optimistic image cache', () => {
    const onUseMessageAsPrompt = vi.fn()
    renderThread({
      messages: [
        {
          id: 'older-history-screenshot',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:00:00.000Z',
        },
        {
          id: 'newer-history-screenshot',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:01:00.000Z',
        },
      ],
      optimisticImageCacheRef: {
        current: new Map([
          [optimisticAttachmentCacheKey('compare screenshot', 1), ['data:image/png;base64,one']],
          [optimisticAttachmentCacheKey('compare screenshot', 2), ['data:image/png;base64,two']],
          ['compare screenshot', ['data:image/png;base64,two']],
        ]),
      },
      onUseMessageAsPrompt,
    })

    const promptButtons = screen.getAllByRole('button', { name: 'Use user message as prompt: compare screenshot' })
    fireEvent.click(promptButtons[0])
    fireEvent.click(promptButtons[1])

    expect(onUseMessageAsPrompt).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 'older-history-screenshot',
      images: ['data:image/png;base64,one'],
    }))
    expect(onUseMessageAsPrompt).toHaveBeenNthCalledWith(2, expect.objectContaining({
      id: 'newer-history-screenshot',
      images: ['data:image/png;base64,two'],
    }))
  })

  it('does not hydrate an unattached repeated prompt from the latest same-text attachment', () => {
    const onUseMessageAsPrompt = vi.fn()
    renderThread({
      messages: [
        {
          id: 'plain-history-screenshot',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:00:00.000Z',
        },
        {
          id: 'attached-history-screenshot',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:01:00.000Z',
        },
      ],
      optimisticImageCacheRef: {
        current: new Map([
          [optimisticAttachmentCacheKey('compare screenshot', 2), ['data:image/png;base64,two']],
          ['compare screenshot', ['data:image/png;base64,two']],
        ]),
      },
      onUseMessageAsPrompt,
    })

    const promptButtons = screen.getAllByRole('button', { name: 'Use user message as prompt: compare screenshot' })
    fireEvent.click(promptButtons[0])
    fireEvent.click(promptButtons[1])

    expect(onUseMessageAsPrompt.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      id: 'plain-history-screenshot',
    }))
    expect(onUseMessageAsPrompt.mock.calls[0]?.[0]).not.toHaveProperty('images')
    expect(onUseMessageAsPrompt).toHaveBeenNthCalledWith(2, expect.objectContaining({
      id: 'attached-history-screenshot',
      images: ['data:image/png;base64,two'],
    }))
  })

  it('aligns cached repeated attachments to the latest matching history messages', () => {
    const onUseMessageAsPrompt = vi.fn()
    renderThread({
      messages: [
        {
          id: 'old-history-screenshot',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-20T12:00:00.000Z',
        },
        {
          id: 'recent-history-screenshot-one',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:00:00.000Z',
        },
        {
          id: 'recent-history-screenshot-two',
          role: 'user',
          text: 'compare screenshot',
          timestamp: '2026-05-21T12:01:00.000Z',
        },
      ],
      optimisticImageCacheRef: {
        current: new Map([
          [optimisticAttachmentCacheKey('compare screenshot', 1), ['data:image/png;base64,one']],
          [optimisticAttachmentCacheKey('compare screenshot', 2), ['data:image/png;base64,two']],
          ['compare screenshot', ['data:image/png;base64,two']],
        ]),
      },
      onUseMessageAsPrompt,
    })

    const promptButtons = screen.getAllByRole('button', { name: 'Use user message as prompt: compare screenshot' })
    fireEvent.click(promptButtons[0])
    fireEvent.click(promptButtons[1])
    fireEvent.click(promptButtons[2])

    expect(onUseMessageAsPrompt.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      id: 'old-history-screenshot',
    }))
    expect(onUseMessageAsPrompt.mock.calls[0]?.[0]).not.toHaveProperty('images')
    expect(onUseMessageAsPrompt).toHaveBeenNthCalledWith(2, expect.objectContaining({
      id: 'recent-history-screenshot-one',
      images: ['data:image/png;base64,one'],
    }))
    expect(onUseMessageAsPrompt).toHaveBeenNthCalledWith(3, expect.objectContaining({
      id: 'recent-history-screenshot-two',
      images: ['data:image/png;base64,two'],
    }))
  })

  it('offers assistant regenerate and continue actions after completed responses', () => {
    const onRegenerateAssistant = vi.fn()
    const onContinueAssistant = vi.fn()
    const onForkMessage = vi.fn()
    const userMessage: ChatMessage = {
      id: 'user-1',
      role: 'user',
      text: 'write the implementation plan',
      timestamp: new Date().toISOString(),
    }
    const assistantMessage: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      text: 'Here is the plan.',
      timestamp: new Date().toISOString(),
    }

    renderThread({
      messages: [userMessage, assistantMessage],
      onRegenerateAssistant,
      onContinueAssistant,
      onForkMessage,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate assistant response: Here is the plan.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fork chat from assistant response: Here is the plan.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue assistant response: Here is the plan.' }))

    expect(onRegenerateAssistant).toHaveBeenCalledWith(assistantMessage, userMessage)
    expect(onForkMessage).toHaveBeenCalledWith(userMessage)
    expect(onContinueAssistant).toHaveBeenCalledWith(assistantMessage)
  })

  it('uses response-specific accessible labels for repeated assistant actions', () => {
    const userMessage: ChatMessage = {
      id: 'user-1',
      role: 'user',
      text: 'compare options',
      timestamp: new Date().toISOString(),
    }
    renderThread({
      messages: [
        userMessage,
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'First option is cheaper.',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'assistant-2',
          role: 'assistant',
          text: 'Second option is faster.',
          timestamp: new Date().toISOString(),
        },
      ],
      onRegenerateAssistant: vi.fn(),
      onContinueAssistant: vi.fn(),
    })

    expect(screen.getByRole('button', { name: 'Regenerate assistant response: First option is cheaper.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerate assistant response: Second option is faster.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue assistant response: First option is cheaper.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue assistant response: Second option is faster.' })).toBeInTheDocument()
  })

  it('hydrates cached optimistic attachments before regenerating an assistant response', () => {
    const onRegenerateAssistant = vi.fn()
    const cachedFiles = [{
      id: 'ctx-cached',
      name: 'Chat.tsx',
      path: 'frontend/src/pages/Chat.tsx',
      content: 'export default function Chat() {}',
    }]
    const assistantMessage: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      text: 'Here is the plan.',
      timestamp: new Date().toISOString(),
    }
    renderThread({
      messages: [{
        id: 'user-history-without-attachments',
        role: 'user',
        text: 'regenerate cached attachments',
        timestamp: new Date().toISOString(),
      }, assistantMessage],
      optimisticImageCacheRef: {
        current: new Map([
          ['regenerate cached attachments', ['data:image/png;base64,cached']],
        ]),
      },
      optimisticContextFileCacheRef: {
        current: new Map([
          ['regenerate cached attachments', cachedFiles],
        ]),
      },
      onRegenerateAssistant,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate assistant response: Here is the plan.' }))

    expect(onRegenerateAssistant).toHaveBeenCalledWith(
      assistantMessage,
      expect.objectContaining({
        text: 'regenerate cached attachments',
        images: ['data:image/png;base64,cached'],
        contextFiles: cachedFiles,
      }),
    )
  })

  it('does not offer assistant response actions while the latest response is streaming', () => {
    renderThread({
      isTyping: true,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          text: 'write the implementation plan',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Here is the partial plan.',
          timestamp: new Date().toISOString(),
        },
      ],
      onRegenerateAssistant: vi.fn(),
      onContinueAssistant: vi.fn(),
    })

    expect(screen.queryByRole('button', { name: 'Regenerate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
  })

  it('copies the whole thread transcript from the thread action', async () => {
    renderThread({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          text: 'Run the audit',
          timestamp: '2026-05-21T12:00:00.000Z',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Audit complete',
          timestamp: '2026-05-21T12:00:05.000Z',
        },
      ],
      optimistic: [{
        id: 'opt-1',
        text: 'queued follow-up',
        status: 'sending',
      }],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy thread transcript' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      '### User (2026-05-21T12:00:00.000Z)',
      '',
      'Run the audit',
      '',
      '---',
      '',
      '### Assistant (2026-05-21T12:00:05.000Z)',
      '',
      'Audit complete',
      '',
      '---',
      '',
      '### User (status: sending)',
      '',
      'queued follow-up',
    ].join('\n')))
    expect(await screen.findByRole('button', { name: 'Copied thread transcript' })).toBeInTheDocument()
  })

  it('includes attached file contents when copying a transcript message', async () => {
    renderThread({
      messages: [
        {
          id: 'user-with-context',
          role: 'user',
          text: 'Review this change',
          timestamp: new Date().toISOString(),
          contextFiles: [{
            id: 'ctx-1',
            name: 'Chat.tsx',
            path: 'frontend/src/pages/Chat.tsx',
            content: 'export default function Chat() {}',
            truncated: true,
          }],
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy user message' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      'Review this change',
      '',
      'Attached context files:',
      '- frontend/src/pages/Chat.tsx (trimmed)',
      '',
      'Attached context file contents:',
      '',
      'File: frontend/src/pages/Chat.tsx (trimmed)',
      '```tsx',
      'export default function Chat() {}',
      '```',
    ].join('\n')))
  })

  it('uses a longer markdown fence when copied context file content contains backticks', async () => {
    renderThread({
      messages: [
        {
          id: 'user-with-fenced-context',
          role: 'user',
          text: 'Review this markdown fixture',
          timestamp: new Date().toISOString(),
          contextFiles: [{
            id: 'ctx-fenced',
            name: 'fixture.md',
            path: 'docs/fixture.md',
            content: [
              'Before',
              '````',
              '```ts',
              'export const fenced = true',
              '```',
              '````',
              'After',
            ].join('\n'),
          }],
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy user message' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith([
      'Review this markdown fixture',
      '',
      'Attached context files:',
      '- docs/fixture.md',
      '',
      'Attached context file contents:',
      '',
      'File: docs/fixture.md',
      '`````markdown',
      'Before',
      '````',
      '```ts',
      'export const fenced = true',
      '```',
      '````',
      'After',
      '`````',
    ].join('\n')))
  })

  it('hides latest assistant copy while a response is still streaming', () => {
    renderThread({
      isTyping: true,
      messages: [
        {
          id: 'assistant-0',
          role: 'assistant',
          text: 'Earlier answer',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Partial answer',
          timestamp: new Date().toISOString(),
        },
      ],
    })

    expect(screen.getAllByRole('button', { name: 'Copy assistant message' })).toHaveLength(1)
  })

  it('copies explicit tool events from the transcript', async () => {
    renderThread({
      messages: [
        {
          id: 'tool-1',
          role: 'tool',
          text: '3 matches',
          timestamp: new Date().toISOString(),
          toolName: 'rg',
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy tool event' }))

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('3 matches'))
    expect(await screen.findByRole('button', { name: 'Copied tool event' })).toBeInTheDocument()
  })
})
