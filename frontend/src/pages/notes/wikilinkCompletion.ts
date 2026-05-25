import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'

/**
 * CodeMirror CompletionSource that triggers on `[[` or `![[` and suggests
 * note titles, aliases, heading links, and block references.
 */
export interface WikilinkCompletionNote {
  title: string
  aliases?: string[]
  content?: string
}

export function wikilinkCompletions(
  notesOrTitles: Array<string | WikilinkCompletionNote>,
): (context: CompletionContext) => CompletionResult | null {
  const candidates = buildWikilinkCompletionCandidates(notesOrTitles)

  return (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos)
    const textBefore = line.text.slice(0, context.pos - line.from)

    // Find the last [[ that isn't closed
    const openBracket = textBefore.lastIndexOf('[[')
    if (openBracket === -1) return null

    // Check if there's a ]] between [[ and cursor — if so, the link is closed
    const afterBracket = textBefore.slice(openBracket + 2)
    if (afterBracket.includes(']]')) return null

    const query = afterBracket.toLowerCase()
    const from = line.from + openBracket + 2

    const options = candidates
      .filter((candidate) => candidate.matchText.includes(query))
      .slice(0, 20)
      .map((candidate) => ({
        label: candidate.label,
        detail: candidate.detail,
        apply: `${candidate.apply}]]`,
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

interface WikilinkCompletionCandidate {
  label: string
  apply: string
  detail?: string
  matchText: string
}

export function buildWikilinkCompletionCandidates(
  notesOrTitles: Array<string | WikilinkCompletionNote>,
): WikilinkCompletionCandidate[] {
  const candidates: WikilinkCompletionCandidate[] = []
  const seen = new Set<string>()
  for (const entry of notesOrTitles) {
    if (typeof entry === 'string') {
      addCandidate(candidates, seen, {
        label: entry,
        apply: entry,
        matchText: normalizeMatchText(entry),
      })
      continue
    }

    const title = entry.title.trim()
    if (!title) continue
    addCandidate(candidates, seen, {
      label: title,
      apply: title,
      detail: 'Note',
      matchText: normalizeMatchText(title),
    })

    for (const alias of entry.aliases ?? []) {
      const cleanAlias = alias.trim()
      if (!cleanAlias) continue
      addCandidate(candidates, seen, {
        label: cleanAlias,
        apply: cleanAlias,
        detail: `Alias for ${title}`,
        matchText: normalizeMatchText(`${cleanAlias} ${title}`),
      })
    }

    for (const heading of collectHeadingTargets(entry.content ?? '')) {
      const target = `${title}#${heading}`
      addCandidate(candidates, seen, {
        label: target,
        apply: target,
        detail: 'Heading',
        matchText: normalizeMatchText(`${target} ${heading}`),
      })
    }

    for (const blockId of collectBlockTargets(entry.content ?? '')) {
      const target = `${title}#^${blockId}`
      addCandidate(candidates, seen, {
        label: target,
        apply: target,
        detail: 'Block',
        matchText: normalizeMatchText(`${target} ${blockId}`),
      })
    }
  }
  return candidates
}

function addCandidate(
  candidates: WikilinkCompletionCandidate[],
  seen: Set<string>,
  candidate: WikilinkCompletionCandidate,
) {
  const key = candidate.apply.toLowerCase()
  if (seen.has(key)) return
  seen.add(key)
  candidates.push(candidate)
}

function collectHeadingTargets(markdown: string): string[] {
  const headings: string[] = []
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!match) continue
    const text = stripMarkdownLabel(match[2])
    if (text) headings.push(text)
  }
  return headings
}

function collectBlockTargets(markdown: string): string[] {
  const blocks: string[] = []
  const re = /(?:^|\s)\^([A-Za-z0-9_-]+)(?=\s|$)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(markdown)) !== null) {
    blocks.push(match[1])
  }
  return blocks
}

function stripMarkdownLabel(value: string): string {
  return value
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
}

function normalizeMatchText(value: string): string {
  return value.toLowerCase()
}
