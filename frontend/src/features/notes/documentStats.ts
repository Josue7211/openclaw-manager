import { splitFrontmatter } from './export'

export interface DocumentStats {
  words: number
  chars: number
  charsNoSpaces: number
  lines: number
  paragraphs: number
  links: number
  tags: number
  estimatedPages: number
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

export function documentStats(markdown: string): DocumentStats {
  const { body } = splitFrontmatter(markdown)
  const text = markdownToPlainText(body)
  const words = Array.from(text.matchAll(WORD_RE)).length
  const paragraphs = body
    .split(/\n{2,}/)
    .map((part) => markdownToPlainText(part).trim())
    .filter(Boolean).length

  return {
    words,
    chars: text.length,
    charsNoSpaces: text.replace(/\s/g, '').length,
    lines: body ? body.split('\n').length : 0,
    paragraphs,
    links: new Set([...body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((match) => match[1].trim())).size,
    tags: new Set([...body.matchAll(/(?:^|\s)#([a-zA-Z][\w/-]*)/g)].map((match) => match[1])).size,
    estimatedPages: Math.max(1, Math.ceil(words / 500)),
  }
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^---[\s\S]*?\n---\s*/m, '')
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-zA-Z0-9_-]*\n?|\n?```/g, ' '))
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2 $1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<!--\s*pagebreak\s*-->/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
