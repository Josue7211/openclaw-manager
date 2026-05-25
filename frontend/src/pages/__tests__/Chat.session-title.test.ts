import { describe, expect, it } from 'vitest'
import { deriveSessionTitle, isRepairableSessionLabel } from '@/chat/t3-adapters/sessionTitles'

describe('chat session title derivation', () => {
  it('skips protocol-test prompts and names from the real request', () => {
    expect(deriveSessionTitle([
      { role: 'user', text: 'helo' },
      { role: 'user', text: 'Reply with exactly COMPAT OK and nothing else' },
      { role: 'assistant', text: 'COMPAT OK' },
      { role: 'assistant', text: 'Weather dashboard widget with 72F current temperature' },
      { role: 'user', text: 'thats just a dashboard widget i meant a whole page' },
    ])).toBe('Weather dashboard page')
  })

  it('falls back to assistant content when user messages are only directives', () => {
    expect(deriveSessionTitle([
      { role: 'user', text: 'Reply with exactly SESSION OK and nothing else' },
      { role: 'assistant', text: 'Weather dashboard widget with 72F current temperature' },
    ])).toBe('Weather dashboard widget')
  })

  it('treats previous directive-derived titles as repairable', () => {
    expect(isRepairableSessionLabel('Reply with exactly COMPAT OK and nothing else')).toBe(true)
    expect(isRepairableSessionLabel('Untitled')).toBe(true)
    expect(isRepairableSessionLabel('helo')).toBe(true)
    expect(isRepairableSessionLabel('Weather dashboard widget')).toBe(false)
  })

  it('strips attached context file annotations from title sources', () => {
    expect(deriveSessionTitle([
      {
        role: 'user',
        text: [
          'review this change',
          '',
          'Attached context files:',
          '',
          'File: frontend/src/pages/Chat.tsx',
          '```text',
          'export default function Chat() {}',
          '```',
        ].join('\n'),
      },
    ])).toBe('review this change')
  })

  it('derives a useful title from structured context files when the prompt is file-only', () => {
    expect(deriveSessionTitle([
      {
        role: 'user',
        text: 'Attached context files',
        contextFiles: [
          {
            name: 'Chat.tsx',
            path: 'frontend/src/pages/Chat.tsx',
          },
          {
            name: 'useChatState.ts',
            path: 'frontend/src/pages/chat/useChatState.ts',
          },
        ],
      },
    ])).toBe('Context: frontend/src/pages/Chat.tsx + 1 file')
  })

  it('ignores raw assistant tool markup when deriving titles', () => {
    expect(deriveSessionTitle([
      { role: 'user', text: 'helo' },
      {
        role: 'assistant',
        text: [
          '```tool_call',
          '{"name":"read_file","arguments":{"path":"src/main.ts"}}',
          '```',
          '<tool_result name="read_file">{"result":"ok"}</tool_result>',
        ].join('\n'),
      },
      { role: 'assistant', text: 'Weather dashboard widget with forecast data' },
    ])).toBe('Weather dashboard widget')
  })
})
