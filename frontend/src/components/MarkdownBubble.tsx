import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize'
import { useMemo } from 'react'

interface MarkdownBubbleProps {
  children: string
}

marked.use({ gfm: true, breaks: true })

export default function MarkdownBubble({ children }: MarkdownBubbleProps) {
  // sanitizeHtml uses a strict tag/attribute allowlist (see lib/sanitize.ts)
  const html = useMemo(
    () => sanitizeHtml(marked.parse(children) as string),
    [children],
  )

  return <div className="md-bubble" dangerouslySetInnerHTML={{ __html: html }} />
}
