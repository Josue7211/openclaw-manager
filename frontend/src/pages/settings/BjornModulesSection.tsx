import { useState, memo } from 'react'
import { CaretDown, CaretRight, ClockCounterClockwise, Cube, Robot, Trash } from '@phosphor-icons/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { toggleBjornModule, deleteBjornModule, rollbackBjornModule, getBjornVersions } from '@/lib/bjorn-store'
import type { BjornModule, BjornModuleVersion } from '@/lib/bjorn-types'
import Toggle from './Toggle'
import { btnSecondary, sectionLabel } from './shared'

const BjornModuleCard = memo(function BjornModuleCard({ module }: { module: BjornModule }) {
  const queryClient = useQueryClient()
  const [showHistory, setShowHistory] = useState(false)
  const [versions, setVersions] = useState<BjornModuleVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleBjornModule(id, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bjornModules }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBjornModule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bjornModules }),
  })

  const rollbackMut = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => rollbackBjornModule(id, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bjornModules })
      getBjornVersions(module.id).then(setVersions)
    },
  })

  const handleToggleHistory = async () => {
    if (!showHistory && versions.length === 0) {
      setLoadingVersions(true)
      try {
        const v = await getBjornVersions(module.id)
        setVersions(v)
      } catch {
        // Failed to load versions
      }
      setLoadingVersions(false)
    }
    setShowHistory(!showHistory)
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    deleteMut.mutate(module.id)
  }

  const IconComponent = Cube

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '8px',
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '8px',
          background: 'var(--accent-a08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <IconComponent size={18} weight="duotone" style={{ color: 'var(--accent)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{module.name}</span>
            <span style={{
              fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
              background: 'var(--purple-a08)', color: 'var(--purple)',
              fontWeight: 600, fontFamily: 'monospace',
            }}>v{module.version}</span>
          </div>
          {module.description && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {module.description}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            aria-label="Version history"
            onClick={handleToggleHistory}
            style={{
              ...btnSecondary, padding: '4px 8px', fontSize: '10px',
              display: 'flex', alignItems: 'center', gap: '3px',
            }}
          >
            <ClockCounterClockwise size={12} />
            History
            {showHistory ? <CaretDown size={10} /> : <CaretRight size={10} />}
          </button>
          <button
            aria-label={confirmDelete ? 'Confirm delete' : 'Delete module'}
            onClick={handleDelete}
            style={{
              ...btnSecondary, padding: '4px 8px', fontSize: '10px',
              color: confirmDelete ? 'var(--text-on-color)' : 'var(--red)',
              borderColor: 'var(--red-a30)',
              background: confirmDelete ? 'var(--red)' : 'transparent',
              display: 'flex', alignItems: 'center', gap: '3px',
            }}
          >
            <Trash size={12} />
            {confirmDelete ? 'Confirm' : 'Delete'}
          </button>
          <Toggle
            on={module.enabled}
            onToggle={(v) => toggleMut.mutate({ id: module.id, enabled: v })}
            label={`Toggle ${module.name}`}
          />
        </div>
      </div>

      {showHistory && (
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
          {loadingVersions ? (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 0' }}>Loading versions...</div>
          ) : versions.length === 0 ? (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 0' }}>No previous versions</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {versions.map(v => (
                <div key={v.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 8px', borderRadius: '4px', background: 'var(--bg-elevated)',
                  fontSize: '11px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-secondary)' }}>v{v.version}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{new Date(v.createdAt).toLocaleDateString()}</span>
                  </div>
                  {v.version !== module.version && (
                    <button
                      aria-label={`Rollback to version ${v.version}`}
                      onClick={() => rollbackMut.mutate({ id: module.id, version: v.version })}
                      disabled={rollbackMut.isPending}
                      style={{
                        ...btnSecondary, padding: '2px 8px', fontSize: '10px',
                        opacity: rollbackMut.isPending ? 0.5 : 1,
                      }}
                    >
                      Rollback
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export function BjornModulesSection() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.bjornModules,
    queryFn: () => api.get<{ modules: BjornModule[] }>('/api/bjorn/modules'),
  })

  const modules = (data?.modules || []).filter(m => !m.deletedAt)

  if (!isLoading && modules.length === 0) return null

  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Robot size={14} weight="duotone" />
        Bjorn Modules
        {modules.length > 0 && (
          <span style={{
            fontSize: '10px', padding: '1px 6px', borderRadius: '8px',
            background: 'var(--accent-a08)', color: 'var(--accent)',
            fontWeight: 600, fontFamily: 'monospace', textTransform: 'none',
            letterSpacing: 'normal',
          }}>{modules.length}</span>
        )}
      </div>

      {isLoading ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px 0' }}>Loading modules...</div>
      ) : (
        <div>
          {modules.map(mod => (
            <BjornModuleCard key={mod.id} module={mod} />
          ))}
        </div>
      )}
    </div>
  )
}
