import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { applySlashCommand, buildingBlockCompletions, slashCommandCompletions } from '../slashCommands'

describe('slash command completions', () => {
  it('offers Obsidian-oriented source commands', () => {
    const state = EditorState.create({ doc: '/b' })
    const result = slashCommandCompletions(new CompletionContext(state, 2, true))

    expect(result?.options.map((option) => option.label)).toEqual(['/bullet', '/block-id'])
  })

  it('offers Obsidian wikilink and folded callout slash commands', () => {
    const wikilinkState = EditorState.create({ doc: '/wiki' })
    const wikilinkResult = slashCommandCompletions(new CompletionContext(wikilinkState, 5, true))
    expect(wikilinkResult?.options.map((option) => option.label)).toEqual(['/wikilink'])
    expect(wikilinkResult?.options[0]?.detail).toBe('Insert Obsidian wikilink')

    const commentState = EditorState.create({ doc: '/comment' })
    const commentResult = slashCommandCompletions(new CompletionContext(commentState, 8, true))
    expect(commentResult?.options.map((option) => option.label)).toEqual(['/comment'])
    expect(commentResult?.options[0]?.detail).toBe('Insert Obsidian comment')

    const footnoteState = EditorState.create({ doc: '/foot' })
    const footnoteResult = slashCommandCompletions(new CompletionContext(footnoteState, 5, true))
    expect(footnoteResult?.options.map((option) => option.label)).toEqual(['/footnote'])
    expect(footnoteResult?.options[0]?.detail).toBe('Insert Obsidian footnote')

    const foldedState = EditorState.create({ doc: '/folded' })
    const foldedResult = slashCommandCompletions(new CompletionContext(foldedState, 7, true))
    expect(foldedResult?.options.map((option) => option.label)).toEqual(['/folded-callout'])
    expect(foldedResult?.options[0]?.detail).toBe('Insert folded Obsidian callout')
  })

  it('offers Docs-style building block source commands', () => {
    const state = EditorState.create({ doc: '/meeting' })
    const result = slashCommandCompletions(new CompletionContext(state, 8, true))

    expect(result?.options.map((option) => option.label)).toEqual(['/meeting-notes'])
    expect(result?.options[0]?.detail).toBe('Insert Google Docs-style meeting notes')
  })

  it('offers Google Docs-style @ building block commands', () => {
    const state = EditorState.create({ doc: '@decision' })
    const result = buildingBlockCompletions(new CompletionContext(state, 9, true))

    expect(result?.options.map((option) => option.label)).toEqual(['@decision-log'])
    expect(result?.options[0]?.detail).toBe('Insert decision log building block')
  })

  it('offers Google Docs-style @ date smart insert commands', () => {
    const state = EditorState.create({ doc: '@to' })
    const result = buildingBlockCompletions(new CompletionContext(state, 3, true))

    expect(result?.options.map((option) => option.label)).toEqual(['@today', '@tomorrow'])
    expect(result?.options[0]?.detail).toBe('Insert today as a date smart insert')
  })

  it('offers Google Docs-style @ placeholder smart insert commands', () => {
    const state = EditorState.create({ doc: '@pla' })
    const result = buildingBlockCompletions(new CompletionContext(state, 4, true))

    expect(result?.options.map((option) => option.label)).toEqual(['@placeholder'])
    expect(result?.options[0]?.detail).toBe('Insert template placeholder')
  })

  it('offers local note @ smart insert commands', () => {
    const source = buildingBlockCompletions([
      { title: 'Project Alpha', folder: 'Projects', type: 'note' },
      { title: 'diagram.png', folder: 'Assets', type: 'attachment' },
    ])
    const state = EditorState.create({ doc: '@proj' })
    const result = source(new CompletionContext(state, 5, true))

    expect(result?.options.map((option) => option.label)).toEqual(['@Project Alpha'])
    expect(result?.options[0]?.detail).toBe('Link note in Projects')
  })

  it('offers local attachment @ smart insert commands', () => {
    const source = buildingBlockCompletions([
      { _id: 'Assets/diagram.png', title: 'diagram.png', folder: 'Assets', type: 'attachment' },
    ])
    const state = EditorState.create({ doc: '@dia' })
    const result = source(new CompletionContext(state, 4, true))

    expect(result?.options.map((option) => option.label)).toEqual(['@diagram.png'])
    expect(result?.options[0]?.detail).toBe('Embed file from Assets')
  })

  it('offers local note alias @ smart insert commands', () => {
    const source = buildingBlockCompletions([
      { title: 'Project Alpha', folder: 'Projects', type: 'note', aliases: ['Alpha'] },
    ])
    const state = EditorState.create({ doc: '@alp' })
    const result = source(new CompletionContext(state, 4, true))

    expect(result?.options.map((option) => option.label)).toEqual(['@Alpha'])
    expect(result?.options[0]?.detail).toBe('Alias for Project Alpha')
  })

  it('offers local tag @ smart insert commands', () => {
    const source = buildingBlockCompletions([
      { title: 'Project Alpha', folder: 'Projects', type: 'note', tags: ['reference', 'project/alpha'] },
    ])
    const state = EditorState.create({ doc: '@ref' })
    const result = source(new CompletionContext(state, 4, true))

    expect(result?.options.map((option) => option.label)).toEqual(['@reference'])
    expect(result?.options[0]?.detail).toBe('Insert #reference tag')
  })

  it('offers local people @ smart insert commands from note properties', () => {
    const source = buildingBlockCompletions([
      {
        title: 'Project Alpha',
        folder: 'Projects',
        type: 'note',
        properties: { author: 'Ada Lovelace', reviewers: ['Grace Hopper'] },
      },
    ])
    const state = EditorState.create({ doc: '@ada' })
    const result = source(new CompletionContext(state, 4, true))

    expect(result?.options.map((option) => option.label)).toEqual(['@Ada Lovelace'])
    expect(result?.options[0]?.detail).toBe('Mention person from author')
  })

  it('offers local place @ smart insert commands from note properties', () => {
    const source = buildingBlockCompletions([
      {
        title: 'Project Alpha',
        folder: 'Projects',
        type: 'note',
        properties: { location: 'Central Library', venues: ['North Studio'] },
      },
    ])
    const state = EditorState.create({ doc: '@cent' })
    const result = source(new CompletionContext(state, 5, true))

    expect(result?.options.map((option) => option.label)).toEqual(['@Central Library'])
    expect(result?.options[0]?.detail).toBe('Insert place from location')
  })

  it('offers local event @ smart insert commands from note properties', () => {
    const source = buildingBlockCompletions([
      {
        title: 'Project Alpha',
        folder: 'Projects',
        type: 'note',
        properties: { event: 'Design Review', meetings: ['Weekly Planning'] },
      },
    ])
    const state = EditorState.create({ doc: '@des' })
    const result = source(new CompletionContext(state, 4, true))

    expect(result?.options.map((option) => option.label)).toEqual(['@Design Review'])
    expect(result?.options[0]?.detail).toBe('Insert event from event')
  })

  it('applies local tag @ smart inserts as markdown tags', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView
    const source = buildingBlockCompletions([{ title: 'Project Alpha', folder: 'Projects', type: 'note', tags: ['reference'] }])
    const state = EditorState.create({ doc: '@ref' })
    const result = source(new CompletionContext(state, 4, true))

    const option = result?.options[0]
    expect(typeof option?.apply).toBe('function')
    if (typeof option?.apply !== 'function') throw new Error('Expected command apply function')
    option.apply(view, option, 0, 4)

    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 4, insert: '#reference' },
      selection: { anchor: 10, head: 10 },
    })
  })

  it('applies local people @ smart inserts as plain person mentions', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView
    const source = buildingBlockCompletions([{ title: 'Project Alpha', folder: 'Projects', type: 'note', properties: { owner: 'Ada Lovelace' } }])
    const state = EditorState.create({ doc: '@ada' })
    const result = source(new CompletionContext(state, 4, true))

    const option = result?.options[0]
    expect(typeof option?.apply).toBe('function')
    if (typeof option?.apply !== 'function') throw new Error('Expected command apply function')
    option.apply(view, option, 0, 4)

    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 4, insert: '@Ada Lovelace' },
      selection: { anchor: 13, head: 13 },
    })
  })

  it('applies local place @ smart inserts as plain place text', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView
    const source = buildingBlockCompletions([{ title: 'Project Alpha', folder: 'Projects', type: 'note', properties: { venue: 'Central Library' } }])
    const state = EditorState.create({ doc: '@cent' })
    const result = source(new CompletionContext(state, 5, true))

    const option = result?.options[0]
    expect(typeof option?.apply).toBe('function')
    if (typeof option?.apply !== 'function') throw new Error('Expected command apply function')
    option.apply(view, option, 0, 5)

    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 5, insert: 'Central Library' },
      selection: { anchor: 15, head: 15 },
    })
  })

  it('applies local event @ smart inserts as plain event text', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView
    const source = buildingBlockCompletions([{ title: 'Project Alpha', folder: 'Projects', type: 'note', properties: { meeting: 'Design Review' } }])
    const state = EditorState.create({ doc: '@des' })
    const result = source(new CompletionContext(state, 4, true))

    const option = result?.options[0]
    expect(typeof option?.apply).toBe('function')
    if (typeof option?.apply !== 'function') throw new Error('Expected command apply function')
    option.apply(view, option, 0, 4)

    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 4, insert: 'Design Review' },
      selection: { anchor: 13, head: 13 },
    })
  })

  it('applies @ building blocks through Markdown fallbacks', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView
    const state = EditorState.create({ doc: '@meeting' })
    const result = buildingBlockCompletions(new CompletionContext(state, 8, true))

    const option = result?.options[0]
    expect(typeof option?.apply).toBe('function')
    if (typeof option?.apply !== 'function') throw new Error('Expected command apply function')
    option.apply(view, option, 0, 8)

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({
        insert: expect.stringContaining('## Meeting notes'),
      }),
      selection: { anchor: 3, head: 16 },
    }))
  })

  it('applies @ date smart inserts through Markdown fallbacks', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView
    const state = EditorState.create({ doc: '@today' })
    const result = buildingBlockCompletions(new CompletionContext(state, 6, true))

    const option = result?.options[0]
    expect(typeof option?.apply).toBe('function')
    if (typeof option?.apply !== 'function') throw new Error('Expected command apply function')
    option.apply(view, option, 0, 6)

    expect(dispatch).toHaveBeenCalledWith({
      changes: {
        from: 0,
        to: 6,
        insert: expect.stringMatching(/\w+ \d{1,2}, \d{4}/),
      },
      selection: expect.objectContaining({
        anchor: expect.any(Number),
        head: expect.any(Number),
      }),
    })
  })

  it('applies @ placeholder smart inserts as template placeholders', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView
    const state = EditorState.create({ doc: '@pla' })
    const result = buildingBlockCompletions(new CompletionContext(state, 4, true))

    const option = result?.options[0]
    expect(typeof option?.apply).toBe('function')
    if (typeof option?.apply !== 'function') throw new Error('Expected command apply function')
    option.apply(view, option, 0, 4)

    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 4, insert: '{{placeholder}}' },
      selection: { anchor: 2, head: 13 },
    })
  })

  it('applies local note @ smart inserts as wikilinks', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView
    const source = buildingBlockCompletions([{ title: 'Project Alpha', folder: 'Projects', type: 'note' }])
    const state = EditorState.create({ doc: '@proj' })
    const result = source(new CompletionContext(state, 5, true))

    const option = result?.options[0]
    expect(typeof option?.apply).toBe('function')
    if (typeof option?.apply !== 'function') throw new Error('Expected command apply function')
    option.apply(view, option, 0, 5)

    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 5, insert: '[[Project Alpha]]' },
      selection: { anchor: 17, head: 17 },
    })
  })

  it('applies local attachment @ smart inserts as Obsidian embeds', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView
    const source = buildingBlockCompletions([{ _id: 'Assets/diagram.png', title: 'diagram.png', folder: 'Assets', type: 'attachment' }])
    const state = EditorState.create({ doc: '@dia' })
    const result = source(new CompletionContext(state, 4, true))

    const option = result?.options[0]
    expect(typeof option?.apply).toBe('function')
    if (typeof option?.apply !== 'function') throw new Error('Expected command apply function')
    option.apply(view, option, 0, 4)

    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 4, insert: '![[Assets/diagram.png]]' },
      selection: { anchor: 23, head: 23 },
    })
  })

  it('applies local note alias @ smart inserts as aliased wikilinks', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView
    const source = buildingBlockCompletions([{ title: 'Project Alpha', folder: 'Projects', type: 'note', aliases: ['Alpha'] }])
    const state = EditorState.create({ doc: '@alp' })
    const result = source(new CompletionContext(state, 4, true))

    const option = result?.options[0]
    expect(typeof option?.apply).toBe('function')
    if (typeof option?.apply !== 'function') throw new Error('Expected command apply function')
    option.apply(view, option, 0, 4)

    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 4, insert: '[[Project Alpha|Alpha]]' },
      selection: { anchor: 23, head: 23 },
    })
  })


  it('inserts Obsidian note embeds with the target selected', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView

    expect(applySlashCommand('/embed', view, 0, 6)).toBe(true)

    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 6, insert: '![[Note]]' },
      selection: { anchor: 3, head: 7 },
    })
  })

  it('inserts Obsidian wikilinks with the target selected', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView

    expect(applySlashCommand('/wikilink', view, 0, 9)).toBe(true)

    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 9, insert: '[[Note]]' },
      selection: { anchor: 2, head: 6 },
    })
  })

  it('inserts Obsidian callouts and block IDs', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView

    expect(applySlashCommand('/callout', view, 0, 8)).toBe(true)
    expect(applySlashCommand('/comment', view, 10, 18)).toBe(true)
    expect(applySlashCommand('/footnote', view, 20, 29)).toBe(true)
    expect(applySlashCommand('/folded-callout', view, 30, 45)).toBe(true)
    expect(applySlashCommand('/block-id', view, 50, 59)).toBe(true)

    expect(dispatch).toHaveBeenNthCalledWith(1, {
      changes: { from: 0, to: 8, insert: '> [!note] Title\n> ' },
      selection: { anchor: 10, head: 15 },
    })
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      changes: { from: 10, to: 18, insert: '%% Comment %%' },
      selection: { anchor: 13, head: 20 },
    })
    expect(dispatch).toHaveBeenNthCalledWith(3, {
      changes: { from: 20, to: 29, insert: '[^1]\n\n[^1]: Footnote text' },
      selection: { anchor: 32, head: 45 },
    })
    expect(dispatch).toHaveBeenNthCalledWith(4, {
      changes: { from: 30, to: 45, insert: '> [!tip]- Title\n> ' },
      selection: { anchor: 40, head: 45 },
    })
    expect(dispatch).toHaveBeenNthCalledWith(5, {
      changes: { from: 50, to: 59, insert: '^block-id' },
      selection: { anchor: 51, head: 59 },
    })
  })

  it('inserts Docs-style meeting notes with the title selected', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView

    expect(applySlashCommand('/meeting-notes', view, 2, 16)).toBe(true)

    expect(dispatch).toHaveBeenCalledWith({
      changes: {
        from: 2,
        to: 16,
        insert: expect.stringContaining('## Meeting notes'),
      },
      selection: { anchor: 5, head: 18 },
    })
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({
        insert: expect.stringContaining('### Action items'),
      }),
    }))
  })

  it('inserts Docs-style decision logs with the title selected', () => {
    const dispatch = vi.fn()
    const view = { dispatch } as unknown as EditorView

    expect(applySlashCommand('/decision-log', view, 0, 13)).toBe(true)

    expect(dispatch).toHaveBeenCalledWith({
      changes: {
        from: 0,
        to: 13,
        insert: expect.stringContaining('| Date | Decision | Owner | Status |'),
      },
      selection: { anchor: 3, head: 15 },
    })
  })
})
