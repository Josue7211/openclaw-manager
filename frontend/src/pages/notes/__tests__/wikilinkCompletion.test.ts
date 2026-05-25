import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { buildWikilinkCompletionCandidates, wikilinkCompletions } from '../wikilinkCompletion'

describe('wikilink completions', () => {
  const notes = [
    {
      title: 'Project Alpha',
      aliases: ['Alpha Alias'],
      content: [
        '# Project Alpha',
        '',
        '## Launch Plan',
        '',
        'Ship the launch checklist. ^launch-block',
      ].join('\n'),
    },
  ]

  it('builds note, alias, heading, and block reference candidates', () => {
    expect(buildWikilinkCompletionCandidates(notes)).toEqual([
      expect.objectContaining({ label: 'Project Alpha', apply: 'Project Alpha', detail: 'Note' }),
      expect.objectContaining({ label: 'Alpha Alias', apply: 'Alpha Alias', detail: 'Alias for Project Alpha' }),
      expect.objectContaining({ label: 'Project Alpha#Project Alpha', apply: 'Project Alpha#Project Alpha', detail: 'Heading' }),
      expect.objectContaining({ label: 'Project Alpha#Launch Plan', apply: 'Project Alpha#Launch Plan', detail: 'Heading' }),
      expect.objectContaining({ label: 'Project Alpha#^launch-block', apply: 'Project Alpha#^launch-block', detail: 'Block' }),
    ])
  })

  it('completes Obsidian note embeds and subpath links', () => {
    const source = wikilinkCompletions(notes)
    const state = EditorState.create({ doc: '![[launch' })
    const result = source(new CompletionContext(state, 9, true))

    expect(result?.from).toBe(3)
    expect(result?.options).toEqual([
      expect.objectContaining({
        label: 'Project Alpha#Launch Plan',
        apply: 'Project Alpha#Launch Plan]]',
        detail: 'Heading',
      }),
      expect.objectContaining({
        label: 'Project Alpha#^launch-block',
        apply: 'Project Alpha#^launch-block]]',
        detail: 'Block',
      }),
    ])
  })
})
