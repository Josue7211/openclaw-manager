import type { GraphData, VaultNote } from './types'
import { matchesNoteSearch } from './searchFilters'
import { noteRelationshipTargets } from './notePropertyLinks'

export type GraphGroupMode = 'tag' | 'folder' | 'type' | 'none'

function graphCluster(note: VaultNote, groupMode: GraphGroupMode): string {
  if (groupMode === 'none') return 'vault'
  if (groupMode === 'type') return note.type
  if (groupMode === 'folder') return note.folder || 'Vault root'
  return note.tags[0] || 'untagged'
}

export function buildGraphData(notes: VaultNote[], options: { groupMode?: GraphGroupMode } = {}): GraphData {
  const groupMode = options.groupMode ?? 'tag'
  const noteMap = new Map(notes.map((n) => [n._id, n]))
  const titleToId = buildGraphTitleIndex(notes)

  const inboundCounts = new Map<string, number>()
  const links: GraphData['links'] = []
  const seen = new Set<string>()

  for (const n of notes) {
    for (const linkText of noteRelationshipTargets(n)) {
      const targetId = titleToId.get(normalizeGraphLinkTarget(linkText))
      if (targetId && noteMap.has(targetId)) {
        inboundCounts.set(targetId, (inboundCounts.get(targetId) ?? 0) + 1)
        const key = [n._id, targetId].sort().join('::')
        if (!seen.has(key)) {
          seen.add(key)
          links.push({ source: n._id, target: targetId })
        }
      }
    }
  }

  const nodes = notes.map((n) => {
    const connectionCount = noteRelationshipTargets(n).filter((linkText) => titleToId.has(normalizeGraphLinkTarget(linkText))).length + (inboundCounts.get(n._id) ?? 0)
    return {
      id: n._id,
      title: n.title || 'Untitled',
      links: connectionCount,
      val: Math.max(2, Math.min(connectionCount * 2 + 2, 20)),
      cluster: graphCluster(n, groupMode),
    }
  })

  return { nodes, links }
}

export function filterLocalGraphNotes(notes: VaultNote[], rootId: string | null): VaultNote[] {
  if (!rootId || !notes.some((note) => note._id === rootId)) return notes
  const titleToId = buildGraphTitleIndex(notes)
  const localIds = new Set<string>([rootId])

  for (const note of notes) {
    for (const linkText of noteRelationshipTargets(note)) {
      const targetId = titleToId.get(normalizeGraphLinkTarget(linkText))
      if (!targetId) continue
      if (note._id === rootId) localIds.add(targetId)
      if (targetId === rootId) localIds.add(note._id)
    }
  }

  return notes.filter((note) => localIds.has(note._id))
}

function buildGraphTitleIndex(notes: VaultNote[]): Map<string, string> {
  const titleToId = new Map<string, string>()
  for (const n of notes) {
    titleToId.set(n.title.toLowerCase(), n._id)
    titleToId.set(n._id.toLowerCase(), n._id)
    titleToId.set(n._id.replace(/\.md$/, '').toLowerCase(), n._id)
    const stem = n._id.replace(/\.md$/, '').split('/').pop()
    if (stem) titleToId.set(stem.toLowerCase(), n._id)
    for (const alias of n.aliases ?? []) {
      titleToId.set(alias.toLowerCase(), n._id)
    }
  }
  return titleToId
}

function normalizeGraphLinkTarget(linkText: string): string {
  return linkText
    .split('|')[0]
    .split('#')[0]
    .trim()
    .toLowerCase()
}

export function filterGraphNotes(
  notes: VaultNote[],
  query: string,
  options: { focusMatches?: boolean; hideOrphans?: boolean } = {},
): VaultNote[] {
  const cleanQuery = query.trim()
  const matchedIds = new Set(cleanQuery ? notes.filter((note) => matchesNoteSearch(note, cleanQuery)).map((note) => note._id) : [])
  const graph = buildGraphData(notes)
  const connectedIds = new Set<string>()
  for (const link of graph.links) {
    connectedIds.add(String(link.source))
    connectedIds.add(String(link.target))
  }

  return notes.filter((note) => {
    if (options.focusMatches && cleanQuery && !matchedIds.has(note._id)) return false
    if (options.hideOrphans && !connectedIds.has(note._id)) return false
    return true
  })
}

export function graphMatchedIds(notes: VaultNote[], query: string): Set<string> {
  const cleanQuery = query.trim()
  if (!cleanQuery) return new Set()
  return new Set(notes.filter((note) => matchesNoteSearch(note, cleanQuery)).map((note) => note._id))
}
