import { useCallback, useRef, useEffect, useMemo } from 'react'
import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
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
hljs.registerLanguage('jsx', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('tsx', typescript)
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function tokenizeCodeFenceInfo(info: string): string[] {
  return info.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
}

function parseCodeFenceInfo(info?: string): {
  displayLanguage: string
  highlightLanguage: string | null
  filename: string
  copyLabel: string
} {
  const tokens = tokenizeCodeFenceInfo(info?.trim() ?? '')
  const language = stripQuotes(tokens[0] ?? '').replace(/^\./, '').toLowerCase()
  const displayLanguage = language
  const highlightLanguage = language && hljs.getLanguage(language) ? language : null
  let filename = ''

  for (const token of tokens.slice(1)) {
    const separator = token.indexOf('=')
    if (separator > 0) {
      const key = token.slice(0, separator).trim().toLowerCase()
      const value = stripQuotes(token.slice(separator + 1))
      if (!filename && ['file', 'filename', 'path', 'title', 'source'].includes(key)) {
        filename = value
      }
      continue
    }
    const value = stripQuotes(token)
    if (!filename && /[/.\\]/.test(value)) {
      filename = value
    }
  }

  const copyLabel = filename
    ? `Copy code from ${filename}`
    : displayLanguage
      ? `Copy ${displayLanguage} code`
      : 'Copy code'

  return { displayLanguage, highlightLanguage, filename, copyLabel }
}

// Configure marked with GFM + custom code renderer at module scope
marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const fence = parseCodeFenceInfo(lang)
      const highlighted = fence.highlightLanguage
        ? hljs.highlight(text, { language: fence.highlightLanguage }).value
        : hljs.highlightAuto(text).value
      const langLabel = fence.displayLanguage
        ? '<span class="md-code-lang">' + escapeHtml(fence.displayLanguage) + '</span>'
        : ''
      const filenameLabel = fence.filename
        ? '<span class="md-code-file" title="' + escapeHtml(fence.filename) + '">' + escapeHtml(fence.filename) + '</span>'
        : ''
      return (
        '<div class="md-code-block"><div class="md-code-header">'
        + '<span class="md-code-meta">' + langLabel + filenameLabel + '</span>'
        + '<button class="md-copy-btn" aria-label="' + escapeHtml(fence.copyLabel) + '" title="' + escapeHtml(fence.copyLabel) + '">Copy</button>'
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
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const html = useMemo(
    () => sanitizeHtml(marked.parse(children) as string),
    [children],
  )
  const resetCopyButton = useCallback((button: HTMLButtonElement, label = 'Copy code') => {
    button.textContent = 'Copy'
    button.setAttribute('aria-label', label)
    button.title = label
  }, [])
  const setCopyButtonFeedback = useCallback((button: HTMLButtonElement, label: string, resetLabel: string) => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
    button.textContent = label
    button.setAttribute('aria-label', label)
    button.title = label
    resetTimerRef.current = setTimeout(() => {
      resetCopyButton(button, resetLabel)
      resetTimerRef.current = null
    }, 1600)
  }, [resetCopyButton])
  const { copyToClipboard } = useCopyToClipboard<{ button: HTMLButtonElement; resetLabel: string }>({
    trackState: false,
    onCopy: ({ button, resetLabel }) => setCopyButtonFeedback(button, 'Copied code', resetLabel),
    onError: (_error, { button, resetLabel }) => setCopyButtonFeedback(button, 'Copy failed', resetLabel),
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as Element).closest('.md-copy-btn') as HTMLButtonElement | null
      if (!btn) return
      const code = btn.closest('.md-code-block')?.querySelector('code')
      if (!code) return
      void copyToClipboard(code.textContent ?? '', {
        button: btn,
        resetLabel: btn.getAttribute('aria-label') || 'Copy code',
      })
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [copyToClipboard])

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
  }, [])

  // Content is sanitized via DOMPurify (sanitizeHtml) before rendering
  return <div className="md-bubble" ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />
}
