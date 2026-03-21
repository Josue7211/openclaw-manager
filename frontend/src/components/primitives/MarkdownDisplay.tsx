/**
 * MarkdownDisplay primitive -- renders sanitized markdown content
 * using marked + DOMPurify (via sanitizeHtml).
 *
 * Config keys: content (string), maxHeight (number, 0 = unlimited)
 *
 * SECURITY: Content is always sanitized through DOMPurify via the
 * sanitizeHtml() utility which uses a strict tag/attribute allowlist
 * (see lib/sanitize.ts). This is the same security pattern used by
 * the existing MarkdownBubble.tsx component.
 */

import React, { useMemo } from 'react'
import { marked } from 'marked'
import { Notepad } from '@phosphor-icons/react'
import type { WidgetProps, WidgetConfigSchema } from '@/lib/widget-registry'
import { sanitizeHtml } from '@/lib/sanitize'
import { EmptyState } from '@/components/ui/EmptyState'
import { configString, configNumber } from './shared'

// Configure marked at module level (once)
marked.use({ gfm: true, breaks: true })

// ---------------------------------------------------------------------------
// Config schema (co-exported for widget registration)
// ---------------------------------------------------------------------------

export const configSchema: WidgetConfigSchema = {
  fields: [
    { key: 'content', label: 'Content', type: 'text', default: '' },
    { key: 'maxHeight', label: 'Max Height (px)', type: 'number', default: 0, min: 0, max: 2000 },
  ],
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MarkdownDisplay = React.memo(function MarkdownDisplay({ config }: WidgetProps) {
  const content = configString(config, 'content', '')
  const maxHeight = configNumber(config, 'maxHeight', 0)

  // sanitizeHtml uses DOMPurify with strict allowlist (see lib/sanitize.ts)
  const html = useMemo(
    () => (content ? sanitizeHtml(marked.parse(content) as string) : ''),
    [content],
  )

  if (!content) {
    return (
      <div style={{ padding: '8px 16px' }}>
        <EmptyState icon={Notepad} title="No content" description="Add markdown content in widget settings" />
      </div>
    )
  }

  return (
    <div
      className="md-display-content"
      style={{
        color: 'var(--text-primary)',
        fontSize: 'var(--text-sm, 14px)',
        lineHeight: 1.6,
        padding: '12px 16px',
        ...(maxHeight > 0
          ? { maxHeight: `${maxHeight}px`, overflowY: 'auto' as const }
          : {}),
      }}
      // Content is sanitized via DOMPurify strict allowlist in sanitizeHtml()
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})

export default MarkdownDisplay
