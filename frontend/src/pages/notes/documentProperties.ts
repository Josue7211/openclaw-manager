import { setFrontmatterProperty } from './export'

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
