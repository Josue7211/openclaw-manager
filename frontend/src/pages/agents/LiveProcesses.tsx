import { useState, useRef, useEffect } from 'react'
import { AGENT_STATUS } from '@/lib/constants'
import { api } from '@/lib/api'
import type { Agent, Process } from './types'


export function LiveProcesses({ agents }: { agents: Agent[] }) {
  const [processes, setProcesses] = useState<Process[]>([])
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [deployLog, setDeployLog] = useState<string | null>(null)
  const [deployOk, setDeployOk] = useState(false)
  const lastPidHashRef = useRef('')

  const hasAwaitingDeploy = agents.some(a => a.status === AGENT_STATUS.AWAITING_DEPLOY)

  async function handleDeploy() {
    setDeploying(true)
    setDeployLog(null)
    try {
      const data = await api.post<{ ok?: boolean; error?: string }>('/api/deploy')
      if (data.ok) {
        setDeployOk(true)
        setDeployLog('Deploy successful')
      } else {
        setDeployOk(false)
        setDeployLog(data.error || 'Deploy failed')
      }
    } catch (e) {
      setDeployOk(false)
      setDeployLog(e instanceof Error ? e.message : 'Deploy failed')
    } finally {
      setDeploying(false)
    }
  }

  async function fetchProcesses() {
    try {
      const data = await api.get<{ processes?: Process[] }>('/api/processes')
      const incoming: Process[] = data.processes ?? []
      // Only update state if process data actually changed (avoid no-op re-renders)
      const pidHash = incoming.map(p => `${p.pid}:${p.cpu}:${p.mem}`).join('|')
      if (pidHash !== lastPidHashRef.current) {
        lastPidHashRef.current = pidHash
        setProcesses(incoming)
        setLastFetch(new Date())
      }
    } catch {
      setProcesses([])
    } finally {
      setInitialized(true)
    }
  }

  useEffect(() => {
    fetchProcesses()
    const interval = setInterval(fetchProcesses, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{
      background: 'var(--bg-card)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Live Processes
          </div>
          {processes.length > 0 && (
            <span style={{
              fontSize: '10px', fontWeight: 700,
              background: 'rgba(74,222,128,0.15)', color: 'var(--green-400)',
              border: '1px solid rgba(74,222,128,0.3)',
              borderRadius: '10px', padding: '1px 7px',
            }}>
              {processes.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {hasAwaitingDeploy && (
            <button
              onClick={handleDeploy}
              disabled={deploying}
              style={{
                fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '10px',
                border: '1px solid rgba(250,204,21,0.5)',
                background: deploying ? 'rgba(250,204,21,0.1)' : 'rgba(250,204,21,0.15)',
                color: 'var(--yellow-bright)', cursor: deploying ? 'not-allowed' : 'pointer',
                opacity: deploying ? 0.7 : 1,
              }}
            >
              {deploying ? 'Deploying...' : 'Deploy'}
            </button>
          )}
          <div aria-live="polite" style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
            {lastFetch ? `updated ${lastFetch.toLocaleTimeString()}` : 'loading...'}
          </div>
        </div>
      </div>
      {deployLog && (
        <div style={{
          fontSize: '11px', fontFamily: 'monospace', padding: '6px 10px',
          borderRadius: '10px', marginBottom: '10px',
          background: deployOk ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
          color: deployOk ? 'var(--green-400)' : 'var(--red)',
          border: `1px solid ${deployOk ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
        }}>
          {deployOk ? '' : ''} {deployLog}
        </div>
      )}

      {!initialized ? (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Loading...</p>
      ) : processes.length === 0 ? (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No active processes</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {processes.map((p, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', gap: '4px',
              padding: '10px 12px', borderRadius: '10px',
              background: 'var(--hover-bg)',
              border: '1px solid rgba(74,222,128,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                  background: 'var(--green-400)', animation: 'pulse-dot 1.5s ease-in-out infinite', flexShrink: 0,
                }} />
                {p.agentEmoji && (
                  <span style={{ fontSize: '14px' }}>{p.agentEmoji}</span>
                )}
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.agentName ?? 'claude'}
                </span>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                  pid {p.pid}
                </span>
              </div>
              {p.mission_title && (
                <div style={{
                  fontSize: '11px', color: 'var(--text-secondary)',
                  paddingLeft: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {p.mission_title.length > 40 ? p.mission_title.slice(0, 40) + '...' : p.mission_title}
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px', fontFamily: 'monospace', fontSize: '10px', paddingLeft: '16px' }}>
                <span style={{ color: 'var(--green-400)' }}>cpu {p.cpu}%</span>
                <span style={{ color: 'var(--text-secondary)' }}>mem {p.mem}%</span>
                {p.elapsed && <span style={{ color: 'var(--text-muted)' }}>{p.elapsed}</span>}
              </div>
              {p.lastLogLine && (
                <div style={{
                  fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)',
                  paddingLeft: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {p.lastLogLine}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
