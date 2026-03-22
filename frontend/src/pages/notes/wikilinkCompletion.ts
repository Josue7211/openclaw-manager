import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'

/**
 * CodeMirror CompletionSource that triggers on `[[` and suggests note titles.
 * Selecting an option inserts `title]]` to complete the wikilink.
 */
export function wikilinkCompletions(
  noteTitles: string[],
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos)
    const textBefore = line.text.slice(0, context.pos - line.from)

    // Find the last [[ that isn't closed
    const openBracket = textBefore.lastIndexOf('[[')
    if (openBracket === -1) return null

    // Check if there's a ]] between [[ and cursor — if so, the link is closed
    const afterBracket = textBefore.slice(openBracket + 2)
    if (afterBracket.includes(']]')) return null

    // Don't trigger inside image embeds ![[
    if (openBracket > 0 && textBefore[openBracket - 1] === '!') return null

    const query = afterBracket.toLowerCase()
    const from = line.from + openBracket + 2

    const options = noteTitles
      .filter((name) => name.toLowerCase().includes(query))
      .slice(0, 20)
      .map((name) => ({
        label: name,
        apply: `${name}]]`,
        type: 'text' as const,
      }))

    if (options.length === 0) return null

    return {
      from,
      to: context.pos,
      options,
      filter: false, // We already filtered
    }
  }
}
