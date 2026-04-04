import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useOpenClawTools } from '@/hooks/useOpenClawTools'
import { api } from '@/lib/api'
import type { ToolInfo, ToolInvokeRequest } from './types'

export default function ToolsTab({ healthy }: { healthy: boolean }) {
  if (!healthy) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          OpenClaw is not configured.
        </p>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Set OPENCLAW_API_URL in Settings &gt; Connections to view the tool registry.
        </p>
      </div>
    )
  }

  return <ToolsContent />
}

function ToolsContent() {
  const { tools, loading } = useOpenClawTools()

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</span>
      </div>
    )
  }

  const toolList = tools?.tools ?? []

  if (toolList.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No tools registered</span>
      </div>
    )
  }

  return (
    <div style={{ overflow: 'auto', height: '100%', padding: '20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toolList.map((tool, i) => (
          <ToolCard key={tool.name + i} tool={tool} />
        ))}
      </div>
    </div>
  )
}

function ToolCard({ tool }: { tool: ToolInfo }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      background: 'var(--bg-white-03)',
      border: '1px solid var(--hover-bg-bright)',
      borderRadius: '10px',
      padding: '12px 16px',
    }}>
      {/* Name + enabled badge + run button row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {tool.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {tool.category && (
            <span style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'var(--purple-a15)',
              color: 'var(--accent-bright)',
              fontWeight: 600,
            }}>
              {tool.category}
            </span>
          )}
          {tool.enabled != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: tool.enabled ? 'var(--green-500)' : 'var(--red-500)',
                display: 'inline-block',
              }} />
              {tool.enabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? `Close ${tool.name} invocation form` : `Run ${tool.name}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: expanded ? 'var(--hover-bg-bright)' : 'var(--accent)',
              border: 'none',
              borderRadius: '6px',
              color: expanded ? 'var(--text-secondary)' : 'var(--text-on-color)',
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              transition: 'all 0.15s var(--ease-spring)',
            }}
          >
            {expanded ? 'Close' : 'Run'}
          </button>
        </div>
      </div>

      {/* Description */}
      {tool.description && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {tool.description}
        </div>
      )}

      {/* Invocation form */}
      {expanded && <InvokeForm toolName={tool.name} />}
    </div>
  )
}

function InvokeForm({ toolName }: { toolName: string }) {
  const [argsText, setArgsText] = useState('{}')
  const [dryRun, setDryRun] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const invokeMutation = useMutation({
    mutationFn: (payload: ToolInvokeRequest) =>
      api.post<Record<string, unknown>>('/api/openclaw/tools/invoke', payload),
  })

  const handleSubmit = useCallback(() => {
    setParseError(null)
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(argsText)
    } catch {
      setParseError('Invalid JSON')
      return
    }
    invokeMutation.mutate({ tool: toolName, args: parsed, dryRun })
  }, [argsText, dryRun, toolName, invokeMutation])

  return (
    <div style={{
      marginTop: '10px',
      paddingTop: '10px',
      borderTop: '1px solid var(--hover-bg)',
    }}>
      {/* Args input */}
      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
        Arguments (JSON)
      </label>
      <textarea
        value={argsText}
        onChange={(e) => setArgsText(e.target.value)}
        aria-label={`Arguments for ${toolName}`}
        rows={3}
        style={{
          width: '100%',
          fontFamily: 'monospace',
          fontSize: '12px',
          background: 'var(--bg-white-03)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '8px',
          color: 'var(--text-primary)',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      {parseError && (
        <div style={{ fontSize: '11px', color: 'var(--red-500)', marginTop: '2px' }}>
          {parseError}
        </div>
      )}

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          Dry run
        </label>
        <button
          onClick={handleSubmit}
          disabled={invokeMutation.isPending}
          aria-label={`Invoke ${toolName}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '6px',
            color: 'var(--text-on-color)',
            padding: '5px 14px',
            cursor: invokeMutation.isPending ? 'wait' : 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            opacity: invokeMutation.isPending ? 0.6 : 1,
            transition: 'opacity 0.15s var(--ease-spring)',
          }}
        >
          {invokeMutation.isPending ? 'Running...' : 'Execute'}
        </button>
      </div>

      {/* Result display */}
      {invokeMutation.isSuccess && (
        <div style={{
          marginTop: '10px',
          background: 'var(--bg-white-03)',
          border: '1px solid var(--green-500)',
          borderRadius: '6px',
          padding: '10px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--green-500)', marginBottom: '4px' }}>
            Result
          </div>
          <pre style={{
            margin: 0,
            fontSize: '11px',
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'monospace',
            maxHeight: '200px',
            overflow: 'auto',
          }}>
            {JSON.stringify(invokeMutation.data, null, 2)}
          </pre>
        </div>
      )}

      {/* Error display */}
      {invokeMutation.isError && (
        <div style={{
          marginTop: '10px',
          background: 'var(--bg-white-03)',
          border: '1px solid var(--red-500)',
          borderRadius: '6px',
          padding: '10px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--red-500)', marginBottom: '4px' }}>
            Error
          </div>
          <pre style={{
            margin: 0,
            fontSize: '11px',
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'monospace',
          }}>
            {invokeMutation.error instanceof Error
              ? invokeMutation.error.message
              : 'Unknown error'}
          </pre>
        </div>
      )}
    </div>
  )
}
