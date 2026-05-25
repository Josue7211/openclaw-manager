import type { VaultNote } from './types'

export function noteRelationshipTargets(note: Pick<VaultNote, 'links' | 'properties'>): string[] {
  return uniqueTargets([
    ...(note.links ?? []),
    ...propertyLinkTargets(note.properties ?? {}),
  ])
}

export function propertyLinkTargets(properties: Record<string, string | string[]>): string[] {
  const targets: string[] = []
  for (const rawValue of Object.values(properties)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue]
    for (const value of values) {
      targets.push(...extractPropertyLinkTargets(value))
    }
  }
  return uniqueTargets(targets)
}

function extractPropertyLinkTargets(value: string): string[] {
  const clean = value.trim()
  if (!clean) return []

  const wikilinks = [...clean.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
    .map(match => normalizePropertyLinkTarget(match[1]))
    .filter(Boolean)
  if (wikilinks.length > 0) return wikilinks

  const bracketList = clean.match(/^\[(.*)\]$/)
  if (bracketList) {
    return bracketList[1]
      .split(',')
      .map(item => normalizePropertyLinkTarget(item))
      .filter(isPathLikeTarget)
  }

  const target = normalizePropertyLinkTarget(clean)
  return isPathLikeTarget(target) ? [target] : []
}

function normalizePropertyLinkTarget(value: string): string {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .split('|')[0]
    .trim()
}

function isPathLikeTarget(value: string): boolean {
  return value.endsWith('.md') || value.includes('/')
}

function uniqueTargets(values: string[]): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of values) {
    const clean = value.trim()
    const key = clean.toLowerCase()
    if (!clean || seen.has(key)) continue
    seen.add(key)
    next.push(clean)
  }
  return next
}
