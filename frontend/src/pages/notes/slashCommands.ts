import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'

interface SlashCommand {
  label: string
  detail: string
  apply: (view: EditorView, from: number, to: number) => void
}

function todayFormatted(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    label: '/table',
    detail: 'Insert a 3x3 table',
    apply: (view, from, to) => {
      const table = [
        '| Header | Header | Header |',
        '| ------ | ------ | ------ |',
        '|        |        |        |',
        '|        |        |        |',
        '|        |        |        |',
      ].join('\n')
      view.dispatch({
        changes: { from, to, insert: table },
        selection: { anchor: from + 2, head: from + 8 },
      })
    },
  },
  {
    label: '/heading',
    detail: 'Insert heading',
    apply: (view, from, to) => {
      view.dispatch({
        changes: { from, to, insert: '## ' },
        selection: { anchor: from + 3 },
      })
    },
  },
  {
    label: '/todo',
    detail: 'Insert checkbox',
    apply: (view, from, to) => {
      view.dispatch({
        changes: { from, to, insert: '- [ ] ' },
        selection: { anchor: from + 6 },
      })
    },
  },
  {
    label: '/divider',
    detail: 'Insert horizontal rule',
    apply: (view, from, to) => {
      view.dispatch({
        changes: { from, to, insert: '---\n' },
        selection: { anchor: from + 4 },
      })
    },
  },
  {
    label: '/date',
    detail: 'Insert current date',
    apply: (view, from, to) => {
      const date = todayFormatted()
      view.dispatch({
        changes: { from, to, insert: date },
        selection: { anchor: from + date.length },
      })
    },
  },
  {
    label: '/code',
    detail: 'Insert code block',
    apply: (view, from, to) => {
      const insert = '```\n\n```'
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + 4 },
      })
    },
  },
  {
    label: '/quote',
    detail: 'Insert blockquote',
    apply: (view, from, to) => {
      view.dispatch({
        changes: { from, to, insert: '> ' },
        selection: { anchor: from + 2 },
      })
    },
  },
  {
    label: '/bullet',
    detail: 'Insert bullet list',
    apply: (view, from, to) => {
      view.dispatch({
        changes: { from, to, insert: '- ' },
        selection: { anchor: from + 2 },
      })
    },
  },
]

/**
 * CodeMirror CompletionSource that triggers on `/` at the start of a line.
 * Provides slash commands for quick markdown insertion.
 */
export function slashCommandCompletions(
  context: CompletionContext,
): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos)
  const textBefore = line.text.slice(0, context.pos - line.from)

  // Only trigger if `/` is at the start of the line (possibly with whitespace)
  const match = textBefore.match(/^(\s*)(\/\S*)$/)
  if (!match) return null

  const slashStart = line.from + (match[1]?.length ?? 0)
  const query = match[2].toLowerCase()

  const options: Completion[] = SLASH_COMMANDS
    .filter((cmd) => cmd.label.toLowerCase().startsWith(query))
    .map((cmd) => ({
      label: cmd.label,
      detail: cmd.detail,
      type: 'keyword' as const,
      apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
        cmd.apply(view, from, to)
      },
    }))

  if (options.length === 0) return null

  return {
    from: slashStart,
    to: context.pos,
    options,
    filter: false,
  }
}
