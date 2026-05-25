import type { VaultNote } from './types'
import { noteRelationshipTargets } from './notePropertyLinks'

export interface BacklinkReference {
  note: VaultNote
  snippet: string
  matchedText?: string
}

export interface BacklinkReferenceGroups {
  linked: BacklinkReference[]
  unlinked: BacklinkReference[]
}

export function buildBacklinkReferences(currentNoteTitle: string, allNotes: VaultNote[]): BacklinkReferenceGroups {
  const current = findCurrentNote(currentNoteTitle, allNotes)
  const terms = referenceTerms(currentNoteTitle, current)
  if (terms.length === 0) return { linked: [], unlinked: [] }

  const linked: BacklinkReference[] = []
  const unlinked: BacklinkReference[] = []
  for (const note of allNotes) {
    if (note.type !== 'note') continue
    if (current && note._id === current._id) continue
    const linkedByWikilink = noteRelationshipTargets(note).some((link) => terms.some((term) => normalizedLinkTarget(link) === normalizeTerm(term)))
    if (linkedByWikilink) {
      linked.push({ note, snippet: referenceSnippet(note.content, terms) || propertyReferenceSnippet(note, terms) })
      continue
    }

    const mention = firstPlainMention(note.content, terms)
    if (mention) {
      unlinked.push({
        note,
        matchedText: mention.text,
        snippet: referenceSnippet(note.content, [mention.text, ...terms]),
      })
    }
  }

  return { linked, unlinked }
}

function findCurrentNote(currentNoteTitle: string, allNotes: VaultNote[]): VaultNote | null {
  const title = normalizeTerm(currentNoteTitle)
  if (!title) return null
  return allNotes.find((note) => note.type === 'note' && normalizeTerm(note.title) === title) ?? null
}

function referenceTerms(currentNoteTitle: string, current: VaultNote | null): string[] {
  const rawTerms = [
    current?.title ?? currentNoteTitle,
    ...(current?.aliases ?? []),
    current?._id ?? '',
    current?._id.replace(/\.md$/, '') ?? '',
    current?._id.replace(/\.md$/, '').split('/').pop() ?? '',
  ]
  const seen = new Set<string>()
  const terms: string[] = []
  for (const term of rawTerms) {
    const clean = term.trim()
    const normalized = normalizeTerm(clean)
    if (!clean || !normalized || seen.has(normalized)) continue
    seen.add(normalized)
    terms.push(clean)
  }
  return terms.sort((a, b) => b.length - a.length)
}

function firstPlainMention(content: string, terms: string[]): { text: string; index: number } | null {
  const linkedRanges = wikilinkRanges(content)
  let best: { text: string; index: number } | null = null
  for (const term of terms) {
    const re = new RegExp(`(^|[^A-Za-z0-9_\\[])(` + escapeRegExp(term) + `)(?![A-Za-z0-9_])`, 'gi')
    let match: RegExpExecArray | null
    while ((match = re.exec(content)) !== null) {
      const index = match.index + match[1].length
      if (linkedRanges.some((range) => index >= range.from && index < range.to)) continue
      if (!best || index < best.index) best = { text: match[2], index }
      break
    }
  }
  return best
}

function wikilinkRanges(content: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
  const re = /!?\[\[[^\]]+\]\]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length })
  }
  return ranges
}

function referenceSnippet(content: string, terms: string[]): string {
  const clean = content.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const firstMatch = terms
    .map((term) => clean.toLowerCase().indexOf(term.toLowerCase()))
    .filter((position) => position >= 0)
    .sort((a, b) => a - b)[0]
  if (firstMatch === undefined) return ''
  const index = firstMatch
  const from = Math.max(0, index - 35)
  const to = Math.min(clean.length, index + 90)
  const prefix = from > 0 ? '...' : ''
  const suffix = to < clean.length ? '...' : ''
  return `${prefix}${clean.slice(from, to).trim()}${suffix}`
}

function propertyReferenceSnippet(note: VaultNote, terms: string[]): string {
  for (const [key, rawValue] of Object.entries(note.properties ?? {})) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue]
    for (const value of values) {
      if (terms.some((term) => value.toLowerCase().includes(term.toLowerCase()))) {
        return `${key}: ${value}`
      }
    }
  }
  return ''
}

function normalizedLinkTarget(link: string): string {
  return normalizeTerm(link.split('#')[0].split('|')[0])
}

function normalizeTerm(term: string): string {
  return term.trim().toLowerCase()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
