import { describe, expect, it } from 'vitest'
import {
  applyWritingAssistControls,
  buildCommentReplyDraft,
  buildWritingAssistDraft,
  writingAssistPatchForDraft,
  writingAssistPrivacySummary,
  writingAssistProviderLabel,
} from '../assistiveWriting'
import type { VaultNote } from '../types'

function note(content: string): VaultNote {
  return {
    _id: 'Projects/brief.md',
    type: 'note',
    title: 'Brief',
    content,
    folder: 'Projects',
    tags: [],
    links: [],
    created_at: 1,
    updated_at: 2,
  }
}

describe('assistive writing', () => {
  it('builds local replacement suggestions for selected text', () => {
    const draft = buildWritingAssistDraft(
      note('This is really very useful in order to ship.'),
      {
        scope: 'selection',
        mode: 'markdown',
        start: 0,
        end: 46,
        quote: 'this is really very useful in order to ship.',
      },
      'This is really very useful in order to ship.',
    )

    expect(draft.cursorInsert).toBe(false)
    expect(draft.sourceText).toBe('this is really very useful in order to ship.')
    expect(draft.options.map(option => option.id)).toEqual(['polish', 'concise'])
    expect(draft.options[0].content).toBe('This is really very useful in order to ship.')
    expect(draft.options[1].content).toBe('This is useful to ship.')
    expect(writingAssistPatchForDraft(draft, draft.options[1])).toEqual({
      type: 'replace_selection',
      content: 'This is useful to ship.',
    })
  })

  it('builds cursor continuations without replacing the whole document', () => {
    const content = '# Brief\n\nLaunch context'
    const draft = buildWritingAssistDraft(
      note(content),
      {
        scope: 'cursor',
        mode: 'markdown',
        start: content.length,
        end: content.length,
      },
      content,
    )

    expect(draft.options).toHaveLength(1)
    expect(draft.options[0].label).toBe('Continue from cursor')
    expect(draft.options[0].content).toContain('- [ ] Capture the decision')
    expect(writingAssistPatchForDraft(draft, draft.options[0])).toEqual({
      type: 'insert_at_cursor',
      content: draft.options[0].content,
    })
  })

  it('drafts local comment replies from review context', () => {
    expect(buildCommentReplyDraft({
      body: 'Can you clarify this?',
      anchor: { quote: 'Launch scope' },
      replies: [],
    }, 'Brief')).toBe('Thanks. I clarified Launch scope and tightened the surrounding context.')

    expect(buildCommentReplyDraft({
      body: 'Please make this concise.',
      anchor: { quote: 'Long paragraph' },
      replies: [{ body: 'Fixed.' }],
    }, 'Brief')).toBe('Thanks. I will leave this open until you confirm the latest change covers it.')
  })

  it('applies local tone and length controls to drafts', () => {
    const draft = buildWritingAssistDraft(
      note('# Brief\n\nThis is really very useful in order to ship. It has extra words.\n\n- First\n- Second\n- Third\n- Fourth'),
      null,
      '# Brief\n\nThis is really very useful in order to ship. It has extra words.\n\n- First\n- Second\n- Third\n- Fourth',
    )
    const adjusted = applyWritingAssistControls(draft.options[0], { provider: 'local', tone: 'direct', length: 'short' })

    expect(adjusted.content).toBe('# Brief\nThis is really very useful in order to ship.\n- First\n- Second\n- Third')
    expect(adjusted.note).toContain('direct tone, short length applied locally')
  })

  it('describes the local-only provider and privacy mode', () => {
    expect(writingAssistProviderLabel('local')).toBe('Local only')
    expect(writingAssistPrivacySummary()).toBe(
      'Local-only assistant. Note text stays on this device and is not sent to a remote provider.',
    )
  })
})
