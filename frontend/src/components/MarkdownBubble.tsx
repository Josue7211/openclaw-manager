import { useRef, useEffect, useMemo } from 'react'
import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import rust from 'highlight.js/lib/languages/rust'
import go from 'highlight.js/lib/languages/go'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import sql from 'highlight.js/lib/languages/sql'

// Register languages ONCE at module scope
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('go', go)
hljs.registerLanguage('css', css)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('sql', sql)

// Configure marked with GFM + custom code renderer at module scope
marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const validLang = lang && hljs.getLanguage(lang) ? lang : null
      const highlighted = validLang
        ? hljs.highlight(text, { language: validLang }).value
        : hljs.highlightAuto(text).value
      const langLabel = validLang || ''
      return (
        '<div class="md-code-block"><div class="md-code-header">'
        + '<span class="md-code-lang">' + langLabel + '</span>'
        + '<button class="md-copy-btn" aria-label="Copy code">Copy</button>'
        + '</div><pre><code class="hljs">' + highlighted + '</code></pre></div>'
      )
    },
  },
})

/**
 * Renders markdown content with syntax-highlighted code blocks and copy buttons.
 *
 * Security: ALL content passes through DOMPurify via sanitizeHtml() which uses
 * a strict tag/attribute allowlist (see lib/sanitize.ts). The dangerouslySetInnerHTML
 * is safe because the input is sanitized before rendering.
 */
export default function MarkdownBubble({ children }: { children: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const html = useMemo(
    () => sanitizeHtml(marked.parse(children) as string),
    [children],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as Element).closest('.md-copy-btn') as HTMLButtonElement | null
      if (!btn) return
      const code = btn.closest('.md-code-block')?.querySelector('code')
      if (!code) return
      navigator.clipboard.writeText(code.textContent ?? '').then(() => {
        btn.textContent = 'Copied!'
        setTimeout(() => { btn.textContent = 'Copy' }, 2000)
      }).catch(() => { /* clipboard API may be blocked */ })
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [])

  // Content is sanitized via DOMPurify (sanitizeHtml) before rendering
  return <div className="md-bubble" ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />
}
