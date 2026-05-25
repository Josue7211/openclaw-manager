import { setFrontmatterProperty, splitFrontmatter } from './export'
export { formatDocumentPropertyInputValue, inferDocumentPropertyValueKind, type DocumentPropertyValueKind } from '@/features/notes/documentPropertyValues'

export function normalizeDocumentPropertyKey(key: string): string {
  return key
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '')
    .slice(0, 64)
}

export function upsertDocumentProperty(markdown: string, key: string, value: string): string {
  const cleanKey = normalizeDocumentPropertyKey(key)
  if (!cleanKey) return markdown
  return setFrontmatterProperty(markdown, cleanKey, value)
}

export function removeDocumentProperty(markdown: string, key: string): string {
  const cleanKey = normalizeDocumentPropertyKey(key)
  if (!cleanKey) return markdown
  return setFrontmatterProperty(markdown, cleanKey, '')
}

export function renameDocumentProperty(markdown: string, fromKey: string, toKey: string): string {
  const cleanFromKey = normalizeDocumentPropertyKey(fromKey)
  const cleanToKey = normalizeDocumentPropertyKey(toKey)
  if (!cleanFromKey || !cleanToKey || cleanFromKey === cleanToKey) return markdown

  const value = readDocumentProperty(markdown, cleanFromKey)
  if (value === null) return markdown

  return upsertDocumentProperty(removeDocumentProperty(markdown, cleanFromKey), cleanToKey, value)
}

function readDocumentProperty(markdown: string, key: string): string | null {
  const { frontmatter } = splitFrontmatter(markdown)
  if (!frontmatter) return null

  let value: string | null = null
  const lines = frontmatter
    .replace(/^---\n/, '')
    .replace(/\n---\n*$/, '')
    .split('\n')
  let currentKey: string | null = null
  for (const line of lines) {
    const listMatch = line.match(/^\s*-\s+(.+)$/)
    if (currentKey === key && listMatch) {
      const item = listMatch[1].trim()
      value = value ? `${value}, ${item}` : item
      continue
    }

    const pair = line.match(/^([\w-]+):\s*(.*)$/)
    if (!pair) {
      currentKey = null
      continue
    }
    currentKey = pair[1]
    if (currentKey === key) {
      value = pair[2].trim().replace(/^\[(.*)\]$/, '$1')
    }
  }

  return value
}
