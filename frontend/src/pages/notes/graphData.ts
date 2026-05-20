import type { GraphData, VaultNote } from './types'
import { matchesNoteSearch } from './searchFilters'

function graphCluster(note: VaultNote): string {
  return note.tags[0] || note.folder || (note.type === 'attachment' ? 'attachments' : 'vault')
}

export function buildGraphData(notes: VaultNote[]): GraphData {
  const noteMap = new Map(notes.map((n) => [n._id, n]))
  const titleToId = new Map<string, string>()

  for (const n of notes) {
    titleToId.set(n.title.toLowerCase(), n._id)
    const stem = n._id.replace(/\.md$/, '').split('/').pop()
    if (stem) titleToId.set(stem.toLowerCase(), n._id)
    for (const alias of n.aliases ?? []) {
      titleToId.set(alias.toLowerCase(), n._id)
    }
  }

  const inboundCounts = new Map<string, number>()
  const links: GraphData['links'] = []
  const seen = new Set<string>()

  for (const n of notes) {
    for (const linkText of n.links) {
      const targetId = titleToId.get(linkText.toLowerCase())
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
    const connectionCount = n.links.filter((linkText) => titleToId.has(linkText.toLowerCase())).length + (inboundCounts.get(n._id) ?? 0)
    return {
      id: n._id,
      title: n.title || 'Untitled',
      links: connectionCount,
      val: Math.max(2, Math.min(connectionCount * 2 + 2, 20)),
      cluster: graphCluster(n),
    }
  })

  return { nodes, links }
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
