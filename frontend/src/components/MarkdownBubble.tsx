import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useMemo } from 'react'

interface MarkdownBubbleProps {
  children: string
}

marked.use({ gfm: true, breaks: true })

export default function MarkdownBubble({ children }: MarkdownBubbleProps) {
  // DOMPurify sanitizes the marked output before it reaches the DOM —
  // this is the standard safe pattern for HTML rendering in React.
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(children) as string),
    [children],
  )

  return <div className="md-bubble" dangerouslySetInnerHTML={{ __html: html }} />
}
