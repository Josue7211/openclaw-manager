export type DocumentPropertyValueKind = 'text' | 'list' | 'number' | 'checkbox' | 'date'

export function inferDocumentPropertyValueKind(value: string | string[]): DocumentPropertyValueKind {
  if (Array.isArray(value)) return 'list'
  const trimmed = value.trim()
  if (/^(true|false)$/i.test(trimmed)) return 'checkbox'
  if (/^-?(?:\d+|\d*\.\d+)$/.test(trimmed)) return 'number'
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return 'date'
  if (trimmed.includes(',')) return 'list'
  return 'text'
}

export function formatDocumentPropertyInputValue(kind: DocumentPropertyValueKind, value: string): string {
  const trimmed = value.trim()
  if (kind === 'checkbox') {
    return /^(true|yes|checked|done|1)$/i.test(trimmed) ? 'true' : 'false'
  }
  if (kind === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
    if (!match) return trimmed
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return trimmed
    return trimmed
  }
  if (kind === 'number') {
    return /^-?(?:\d+|\d*\.\d+)$/.test(trimmed) ? trimmed : value
  }
  if (kind === 'list') {
    return value
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(Boolean)
      .join(', ')
  }
  return trimmed
}
