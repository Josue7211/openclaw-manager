import { useHarnessSkills } from '@/hooks/useHarnessSkills'
import type { HarnessHealthStatus } from '../Harness'

function OfflineState({ status, noun }: { status: HarnessHealthStatus; noun: string }) {
  const title = status === 'not_configured' ? 'Harness not configured' : 'Harness offline'
  const detail = status === 'not_configured'
    ? `Set HARNESS_API_URL in Settings > Connections to view ${noun}.`
    : `clawctrl cannot reach the harness right now. Check the upstream service and try again.`

  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
        {title}
      </p>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
        {detail}
      </p>
    </div>
  )
}

export default function SkillsTab({ healthy, status = 'unknown' }: { healthy: boolean; status?: HarnessHealthStatus }) {
  if (!healthy) {
    return <OfflineState status={status} noun="installed skills" />
  }

  return <SkillsContent />
}

function SkillsContent() {
  const { skills, loading } = useHarnessSkills()

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</span>
      </div>
    )
  }

  const skillList = skills?.skills ?? []

  if (skillList.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No skills installed</span>
      </div>
    )
  }

  return (
    <div style={{ overflow: 'auto', height: '100%', padding: '20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {skillList.map((skill, i) => (
          <div key={skill.name + i} style={{
            background: 'var(--bg-white-03)',
            border: '1px solid var(--hover-bg-bright)',
            borderRadius: '10px',
            padding: '12px 16px',
          }}>
            {/* Name + version + enabled row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {skill.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {skill.version && (
                  <span style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: 'var(--purple-a15)',
                    color: 'var(--accent-bright)',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                  }}>
                    v{skill.version}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: skill.enabled ? 'var(--green-500)' : 'var(--red-500)',
                    display: 'inline-block',
                  }} />
                  {skill.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            {/* Description */}
            {skill.description && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {skill.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
