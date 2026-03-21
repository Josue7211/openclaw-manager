/**
 * Sandboxed iframe preview for Bjorn-generated modules.
 *
 * Security layers:
 * 1. Static analysis gate (analyzeCode) — blocks dangerous APIs before render
 * 2. iframe sandbox="allow-scripts" — NO allow-same-origin
 * 3. CSP in srcdoc — blocks all external resources
 * 4. postMessage source validation — event.source === iframe.contentWindow
 *
 * Data bridge: iframe requests data via postMessage → parent proxies to
 * /api/bjorn/bridge → response sent back via postMessage.
 */

import { useRef, useMemo, useEffect } from 'react'
import { Robot, Warning, SpinnerGap, Eye } from '@phosphor-icons/react'
import { analyzeCode } from '@/lib/bjorn-static-analysis'
import { buildSandboxHTML, getThemeVarsCSS } from '@/lib/bjorn-sandbox'
import { api } from '@/lib/api'
import type { BjornGenerationState } from '@/lib/bjorn-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BjornPreviewProps {
  source: string
  generationState: BjornGenerationState
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BjornPreview({ source, generationState }: BjornPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Run static analysis whenever source changes
  const analysis = useMemo(() => analyzeCode(source), [source])

  // Build srcdoc only when code passes analysis
  const sandboxHtml = useMemo(() => {
    if (!source || !analysis.safe) return ''
    return buildSandboxHTML(source, getThemeVarsCSS())
  }, [source, analysis.safe])

  // postMessage bridge — proxy data-request messages to backend
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Validate source matches our iframe
      if (event.source !== iframeRef.current?.contentWindow) return

      const data = event.data
      if (!data || data.type !== 'data-request') return

      const { requestId, source: reqSource, command } = data

      api.post('/api/bjorn/bridge', { source: reqSource, command })
        .then((result) => {
          iframeRef.current?.contentWindow?.postMessage(
            { type: 'data-response', requestId, data: result },
            '*',
          )
        })
        .catch((err: Error) => {
          iframeRef.current?.contentWindow?.postMessage(
            { type: 'data-error', requestId, error: err.message },
            '*',
          )
        })
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // ── Render states ─────────────────────────────────────────────────

  // Loading state
  if (generationState === 'generating') {
    return (
      <div style={containerStyle}>
        <PreviewHeader />
        <div style={centerStyle}>
          <SpinnerGap
            size={32}
            style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }}
          />
          <span style={mutedTextStyle}>Generating module...</span>
        </div>
      </div>
    )
  }

  // Empty state
  if (!source) {
    return (
      <div style={containerStyle}>
        <PreviewHeader />
        <div style={centerStyle}>
          <Robot size={32} style={{ color: 'var(--text-muted)' }} />
          <span style={mutedTextStyle}>Describe a module to see a preview</span>
        </div>
      </div>
    )
  }

  // Violation state
  if (!analysis.safe) {
    return (
      <div style={containerStyle}>
        <PreviewHeader />
        <div style={violationContainerStyle}>
          <div style={violationBannerStyle}>
            <Warning size={16} style={{ color: 'var(--red-500, #ef4444)', flexShrink: 0 }} />
            <span>
              Static analysis found {analysis.violations.length} issue
              {analysis.violations.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={violationListStyle}>
            {analysis.violations.map((v, i) => (
              <div key={i} style={violationItemStyle}>
                <span style={violationLineStyle}>Line {v.line}</span>
                <code style={violationSnippetStyle}>{v.snippet}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Preview state — safe code rendered in sandboxed iframe
  return (
    <div style={containerStyle}>
      <PreviewHeader />
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        srcDoc={sandboxHtml}
        title="Module Preview"
        style={iframeStyle}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PreviewHeader() {
  return (
    <div style={headerStyle}>
      <Eye size={14} style={{ color: 'var(--text-muted)' }} />
      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
        Preview
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-panel)',
  borderRadius: '12px',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 12px',
  borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
}

const centerStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  padding: '24px',
}

const mutedTextStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-muted)',
}

const iframeStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  borderRadius: '8px',
  background: 'var(--bg-card)',
  flex: 1,
}

const violationContainerStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'auto',
  padding: '12px',
  gap: '8px',
}

const violationBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  borderRadius: '8px',
  background: 'var(--red-a8, rgba(239,68,68,0.08))',
  color: 'var(--red-500, #ef4444)',
  fontSize: '13px',
  fontWeight: 600,
}

const violationListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const violationItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  padding: '6px 8px',
  borderRadius: '6px',
  background: 'var(--bg-card)',
  fontSize: '12px',
}

const violationLineStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  minWidth: '56px',
}

const violationSnippetStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: '11px',
  color: 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
