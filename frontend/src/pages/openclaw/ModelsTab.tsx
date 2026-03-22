import { useOpenClawModels } from '@/hooks/useOpenClawModels'

export default function ModelsTab({ healthy }: { healthy: boolean }) {
  if (!healthy) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          OpenClaw is not configured.
        </p>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Set OPENCLAW_API_URL in Settings &gt; Connections to view available models.
        </p>
      </div>
    )
  }

  return <ModelsContent />
}

function ModelsContent() {
  const { models, loading } = useOpenClawModels()

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</span>
      </div>
    )
  }

  const modelList = models?.models ?? models?.data ?? []

  if (modelList.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No models available</span>
      </div>
    )
  }

  return (
    <div style={{ overflow: 'auto', height: '100%', padding: '20px' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '12px',
      }}>
        {modelList.map((model) => (
          <div key={model.id} style={{
            background: 'var(--bg-white-03)',
            border: '1px solid var(--hover-bg-bright)',
            borderRadius: '10px',
            padding: '16px 20px',
          }}>
            {/* Model name */}
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {model.name ?? model.id}
            </div>

            {/* Model ID (if different from name) */}
            {model.name && model.name !== model.id && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                {model.id}
              </div>
            )}

            {/* Provider badge + max tokens row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '999px',
                background: 'var(--purple-a15)',
                color: 'var(--accent-bright)',
                fontWeight: 600,
              }}>
                {model.provider ?? 'Unknown'}
              </span>
              {model.max_tokens != null && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {model.max_tokens.toLocaleString()} max tokens
                </span>
              )}
            </div>

            {/* Cost info */}
            {(model.input_cost_per_token != null || model.output_cost_per_token != null) && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                {model.input_cost_per_token != null && (
                  <span>Input: ${model.input_cost_per_token.toFixed(8)}/token</span>
                )}
                {model.input_cost_per_token != null && model.output_cost_per_token != null && (
                  <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>|</span>
                )}
                {model.output_cost_per_token != null && (
                  <span>Output: ${model.output_cost_per_token.toFixed(8)}/token</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
