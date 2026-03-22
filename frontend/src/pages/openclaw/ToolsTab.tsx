import { useOpenClawTools } from '@/hooks/useOpenClawTools'

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
          <div key={tool.name + i} style={{
            background: 'var(--bg-white-03)',
            border: '1px solid var(--hover-bg-bright)',
            borderRadius: '10px',
            padding: '12px 16px',
          }}>
            {/* Name + enabled badge row */}
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
              </div>
            </div>

            {/* Description */}
            {tool.description && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {tool.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
