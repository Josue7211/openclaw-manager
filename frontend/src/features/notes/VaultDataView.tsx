import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  buildVaultDataRows,
  formatVaultDataFormulaValue,
  buildVaultTaskRows,
  groupVaultDataRows,
  groupVaultTaskRows,
  mergeVaultDataViewPresets,
  normalizeVaultDataViewPresets,
  sortVaultDataRows,
  sortVaultTaskRows,
  VAULT_DATA_FORMULA_FIELDS,
  VAULT_DATA_FORMULA_HELPERS,
  VAULT_DATA_FORMULAS,
  validateVaultDataCustomFormula,
  vaultDataFormulaLabel,
  vaultDataPropertyKeys,
  normalizeVaultDataWorkspaceContext,
  type VaultDataGroup,
  type VaultDataGroupKey,
  type VaultDataFormulaKey,
  type VaultDataViewLayout,
  type VaultDataViewMode,
  type VaultDataViewPreset,
  type VaultDataWorkspaceContext,
  type VaultDataRow,
  type VaultDataSortKey,
  type VaultSortDirection,
  type VaultTaskSortKey,
  type VaultTaskRow,
} from './dataMode'
import { loadSyncedVaultDataViewPresets, saveSyncedVaultDataViewPresets } from './dataViewSync'
import type { VaultNote } from './types'

const DATA_VIEW_PRESETS_STORAGE_KEY = 'mc-notes-data-view-presets'

export function VaultDataView({
  notes,
  query,
  syncPresets = false,
  workspaceContext,
  onWorkspaceContextChange,
  onSelect,
  onToggleTask,
}: {
  notes: VaultNote[]
  query: string
  syncPresets?: boolean
  workspaceContext?: VaultDataWorkspaceContext
  onWorkspaceContextChange?: (context: VaultDataWorkspaceContext) => void
  onSelect: (id: string) => void
  onToggleTask: (row: VaultTaskRow, done: boolean) => void
}) {
  const [mode, setMode] = useState<VaultDataViewMode>('metadata')
  const [viewQuery, setViewQuery] = useState('')
  const [dataSortKey, setDataSortKey] = useState<VaultDataSortKey>('updated')
  const [taskSortKey, setTaskSortKey] = useState<VaultTaskSortKey>('done')
  const [sortDirection, setSortDirection] = useState<VaultSortDirection>('desc')
  const [groupKey, setGroupKey] = useState<VaultDataGroupKey>('none')
  const [layout, setLayout] = useState<VaultDataViewLayout>('table')
  const [formulaKey, setFormulaKey] = useState<VaultDataFormulaKey>('none')
  const [customFormula, setCustomFormula] = useState('')
  const [presetName, setPresetName] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [presetSyncStatus, setPresetSyncStatus] = useState<'local' | 'loading' | 'saving' | 'synced' | 'error'>(
    syncPresets ? 'loading' : 'local',
  )
  const lastEmittedWorkspaceContextRef = useRef('')
  const localWorkspaceContextKeyRef = useRef('')
  const [presets, setPresets] = useState<VaultDataViewPreset[]>(() => {
    if (typeof localStorage === 'undefined') return []
    try {
      return normalizeVaultDataViewPresets(JSON.parse(localStorage.getItem(DATA_VIEW_PRESETS_STORAGE_KEY) || '[]'))
    } catch {
      return []
    }
  })
  const presetsRef = useRef(presets)
  const effectiveQuery = useMemo(() => [query, viewQuery].map(item => item.trim()).filter(Boolean).join(' '), [query, viewQuery])
  const formulaContext = useMemo(() => ({ customFormula }), [customFormula])
  const rawRows = useMemo(() => buildVaultDataRows(notes, effectiveQuery), [notes, effectiveQuery])
  const rows = useMemo(() => sortVaultDataRows(rawRows, dataSortKey, sortDirection, formulaContext), [rawRows, dataSortKey, sortDirection, formulaContext])
  const propertyKeys = useMemo(() => vaultDataPropertyKeys(rawRows), [rawRows])
  const formulaValidation = useMemo(
    () => validateVaultDataCustomFormula(customFormula, propertyKeys),
    [customFormula, propertyKeys],
  )
  const rawTaskRows = useMemo(() => buildVaultTaskRows(notes, effectiveQuery), [notes, effectiveQuery])
  const taskRows = useMemo(() => sortVaultTaskRows(rawTaskRows, taskSortKey, sortDirection), [rawTaskRows, taskSortKey, sortDirection])
  const dataGroups = useMemo(() => groupVaultDataRows(rows, groupKey, formulaContext), [formulaContext, groupKey, rows])
  const taskGroups = useMemo(() => groupVaultTaskRows(taskRows, groupKey), [groupKey, taskRows])
  const counts = useMemo(
    () => ({
      notes: rows.filter(row => row.type === 'note').length,
      attachments: rows.filter(row => row.type === 'attachment').length,
      trashed: rows.filter(row => row.trashed).length,
      tasks: rows.reduce((sum, row) => sum + row.tasksTotal, 0),
    }),
    [rows],
  )
  const localWorkspaceContext = useMemo<VaultDataWorkspaceContext>(() => ({
    mode,
    query: viewQuery,
    dataSortKey,
    taskSortKey,
    sortDirection,
    groupKey,
    layout,
    formulaKey,
    customFormula,
  }), [customFormula, dataSortKey, formulaKey, groupKey, layout, mode, sortDirection, taskSortKey, viewQuery])
  const localWorkspaceContextKey = useMemo(
    () => JSON.stringify(normalizeVaultDataWorkspaceContext(localWorkspaceContext)),
    [localWorkspaceContext],
  )
  const incomingWorkspaceContext = useMemo(
    () => workspaceContext ? normalizeVaultDataWorkspaceContext(workspaceContext) : null,
    [workspaceContext],
  )
  const incomingWorkspaceContextKey = useMemo(
    () => incomingWorkspaceContext ? JSON.stringify(incomingWorkspaceContext) : '',
    [incomingWorkspaceContext],
  )

  useEffect(() => {
    localWorkspaceContextKeyRef.current = localWorkspaceContextKey
  }, [localWorkspaceContextKey])

  useEffect(() => {
    if (!incomingWorkspaceContext) return
    if (incomingWorkspaceContextKey === localWorkspaceContextKeyRef.current) return
    if (incomingWorkspaceContextKey === lastEmittedWorkspaceContextRef.current) return
    setMode(incomingWorkspaceContext.mode)
    setViewQuery(incomingWorkspaceContext.query)
    setDataSortKey(incomingWorkspaceContext.dataSortKey)
    setTaskSortKey(incomingWorkspaceContext.taskSortKey)
    setSortDirection(incomingWorkspaceContext.sortDirection)
    setGroupKey(incomingWorkspaceContext.groupKey)
    setLayout(incomingWorkspaceContext.layout)
    setFormulaKey(incomingWorkspaceContext.formulaKey)
    setCustomFormula(incomingWorkspaceContext.customFormula)
  }, [incomingWorkspaceContext, incomingWorkspaceContextKey])

  useEffect(() => {
    if (!onWorkspaceContextChange) return
    lastEmittedWorkspaceContextRef.current = localWorkspaceContextKey
    onWorkspaceContextChange(normalizeVaultDataWorkspaceContext(localWorkspaceContext))
  }, [localWorkspaceContext, localWorkspaceContextKey, onWorkspaceContextChange])

  useEffect(() => {
    presetsRef.current = presets
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(DATA_VIEW_PRESETS_STORAGE_KEY, JSON.stringify(presets))
  }, [presets])

  const syncPresetList = (nextPresets: VaultDataViewPreset[]) => {
    if (!syncPresets) return
    setPresetSyncStatus('saving')
    void saveSyncedVaultDataViewPresets(nextPresets)
      .then(() => setPresetSyncStatus('synced'))
      .catch(() => setPresetSyncStatus('error'))
  }

  const retryPresetSync = () => {
    syncPresetList(presetsRef.current)
  }

  useEffect(() => {
    if (!syncPresets) return
    let cancelled = false
    setPresetSyncStatus('loading')
    loadSyncedVaultDataViewPresets()
      .then((syncedPresets) => {
        if (cancelled) return
        const mergedPresets = mergeVaultDataViewPresets(syncedPresets, presetsRef.current)
        if (mergedPresets.length > 0) {
          setPresets(mergedPresets)
          if (!samePresetList(mergedPresets, syncedPresets)) {
            syncPresetList(mergedPresets)
            return
          }
          setPresetSyncStatus('synced')
        } else {
          setPresetSyncStatus('local')
        }
      })
      .catch(() => {
        if (!cancelled) setPresetSyncStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [syncPresets])

  useEffect(() => {
    const activeFormulaSortKey = formulaKey === 'none' ? 'updated' : `formula:${formulaKey}` as VaultDataSortKey
    const activeFormulaGroupKey = formulaKey === 'none' ? 'none' : `formula:${formulaKey}` as VaultDataGroupKey
    if (dataSortKey.startsWith('formula:') && dataSortKey !== activeFormulaSortKey) setDataSortKey(activeFormulaSortKey)
    if (groupKey.startsWith('formula:') && groupKey !== activeFormulaGroupKey) setGroupKey(activeFormulaGroupKey)
  }, [dataSortKey, formulaKey, groupKey])

  const applyPreset = (id: string) => {
    setSelectedPresetId(id)
    const preset = presets.find(item => item.id === id)
    if (!preset) return
    setMode(preset.mode)
    setViewQuery(preset.query)
    setDataSortKey(preset.dataSortKey)
    setTaskSortKey(preset.taskSortKey)
    setSortDirection(preset.sortDirection)
    setGroupKey(preset.groupKey)
    setLayout(preset.layout)
    setFormulaKey(preset.formulaKey)
    setCustomFormula(preset.customFormula)
    setPresetName(preset.name)
  }

  const savePreset = () => {
    const name = (presetName.trim() || `${mode === 'metadata' ? 'Metadata' : 'Tasks'} view`).slice(0, 80)
    const id = selectedPresetId || `data-view-${Date.now().toString(36)}`
    const preset: VaultDataViewPreset = {
      id,
      name,
      mode,
      query: viewQuery,
      dataSortKey,
      taskSortKey,
      sortDirection,
      groupKey,
      layout,
      formulaKey,
      customFormula,
      updatedAt: Date.now(),
    }
    setSelectedPresetId(id)
    setPresetName(name)
    setPresets(prev => {
      const next = normalizeVaultDataViewPresets([preset, ...prev.filter(item => item.id !== id)])
      syncPresetList(next)
      return next
    })
  }

  const deletePreset = () => {
    const id = selectedPresetId
    if (!id) return
    setPresets(prev => {
      const next = prev.filter(item => item.id !== id)
      syncPresetList(next)
      return next
    })
    setSelectedPresetId('')
    setPresetName('')
  }

  const insertFormulaSnippet = (snippet: string) => {
    if (!snippet) return
    setCustomFormula(prev => {
      const clean = prev.trim()
      return clean ? `${clean} + ${snippet}` : snippet
    })
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-base)',
      }}
    >
      <div
        style={{
          padding: '9px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          overflowX: 'auto',
          overflowY: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        <DataMetric counts={counts} rows={rows.length} />
        <DataViewSyncStatus enabled={syncPresets} status={presetSyncStatus} onRetry={retryPresetSync} />
        <div
          style={{
            display: 'inline-flex',
            flex: '0 0 auto',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: 2,
            background: 'var(--bg-white-02)',
          }}
        >
          <DataModeButton active={mode === 'metadata'} onClick={() => setMode('metadata')}>
            Metadata
          </DataModeButton>
          <DataModeButton active={mode === 'tasks'} onClick={() => setMode('tasks')}>
            Tasks
          </DataModeButton>
        </div>
        <input
          aria-label="Data view filter"
          value={viewQuery}
          onChange={event => setViewQuery(event.target.value)}
          placeholder="Filter: tag:project property:status=active"
          style={{ ...dataControlStyle, flex: '1 0 260px' }}
        />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
          {mode === 'metadata' ? (
            <select
              aria-label="Data view sort"
              value={dataSortKey}
              onChange={event => setDataSortKey(event.target.value as VaultDataSortKey)}
              style={dataControlStyle}
            >
              <option value="updated">Updated</option>
              <option value="title">Title</option>
              <option value="folder">Folder</option>
              <option value="type">Type</option>
              <option value="tags">Tags</option>
              <option value="tasks">Task progress</option>
              {propertyKeys.map(key => (
                <option key={key} value={`property:${key}`}>Property: {key}</option>
              ))}
              {formulaKey !== 'none' && (
                <option value={`formula:${formulaKey}`}>Formula: {vaultDataFormulaLabel(formulaKey)}</option>
              )}
            </select>
          ) : (
            <select
              aria-label="Data view sort"
              value={taskSortKey}
              onChange={event => setTaskSortKey(event.target.value as VaultTaskSortKey)}
              style={dataControlStyle}
            >
              <option value="done">Done</option>
              <option value="updated">Updated</option>
              <option value="title">Note title</option>
              <option value="folder">Folder</option>
              <option value="line">Line</option>
            </select>
          )}
          <select
            aria-label="Data view sort direction"
            value={sortDirection}
            onChange={event => setSortDirection(event.target.value as VaultSortDirection)}
            style={dataControlStyle}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        <select
          aria-label="Data view group"
          value={groupKey}
          onChange={event => setGroupKey(event.target.value as VaultDataGroupKey)}
          style={{ ...dataControlStyle, flex: '0 0 150px' }}
        >
          <option value="none">No grouping</option>
          <option value="folder">Group: Folder</option>
          <option value="tags">Group: Tags</option>
          {mode === 'metadata' ? (
            <>
              <option value="type">Group: Type</option>
              <option value="done">Group: Tasks</option>
              {propertyKeys.map(key => (
                <option key={key} value={`property:${key}`}>Group: {key}</option>
              ))}
              {formulaKey !== 'none' && (
                <option value={`formula:${formulaKey}`}>Group: {vaultDataFormulaLabel(formulaKey)}</option>
              )}
            </>
          ) : (
            <>
              <option value="note">Group: Note</option>
              <option value="done">Group: Done</option>
            </>
          )}
        </select>
        <select
          aria-label="Saved data view"
          value={selectedPresetId}
          onChange={event => applyPreset(event.target.value)}
          style={{ ...dataControlStyle, flex: '0 0 180px' }}
        >
          <option value="">Saved views</option>
          {presets.map(preset => (
            <option key={preset.id} value={preset.id}>{preset.name}</option>
          ))}
        </select>
        <select
          aria-label="Data view layout"
          value={layout}
          onChange={event => setLayout(event.target.value as VaultDataViewLayout)}
          style={{ ...dataControlStyle, flex: '0 0 112px' }}
        >
          <option value="table">Table</option>
          <option value="cards">Cards</option>
        </select>
        <select
          aria-label="Data view formula"
          value={formulaKey}
          onChange={event => setFormulaKey(event.target.value as VaultDataFormulaKey)}
          style={{ ...dataControlStyle, flex: '0 0 132px' }}
        >
          <option value="none">No formula</option>
          {VAULT_DATA_FORMULAS.map(formula => (
            <option key={formula.key} value={formula.key}>{formula.label}</option>
          ))}
          <option value="custom">Custom formula</option>
        </select>
        {formulaKey === 'custom' && (
          <>
            <input
              aria-label="Data view custom formula"
              value={customFormula}
              onChange={event => setCustomFormula(event.target.value)}
              placeholder="tasksDone / tasksTotal * 100"
              style={{ ...dataControlStyle, flex: '0 0 210px' }}
            />
            <span
              aria-label="Data view formula validation"
              title="Supported helpers include prop, if, round, min, max, clamp, daysUntil, count, and listContains."
              style={{
                color: formulaValidation.ok ? 'var(--text-muted)' : 'var(--warning)',
                fontSize: 11,
                flex: '0 0 auto',
              }}
            >
              {formulaValidation.message}
            </span>
            <select
              aria-label="Data view formula builder"
              value=""
              onChange={event => {
                insertFormulaSnippet(event.target.value)
                event.currentTarget.value = ''
              }}
              style={{ ...dataControlStyle, flex: '0 0 124px' }}
            >
              <option value="">Insert...</option>
              <optgroup label="Fields">
                {VAULT_DATA_FORMULA_FIELDS.map(item => (
                  <option key={item.snippet} value={item.snippet}>{item.label}</option>
                ))}
              </optgroup>
              {propertyKeys.length > 0 && (
                <optgroup label="Properties">
                  {propertyKeys.map(key => {
                    const snippet = `prop("${escapeFormulaString(key)}")`
                    return <option key={key} value={snippet}>{key}</option>
                  })}
                </optgroup>
              )}
              <optgroup label="Helpers">
                {VAULT_DATA_FORMULA_HELPERS.map(item => (
                  <option key={item.snippet} value={item.snippet}>{item.label}</option>
                ))}
              </optgroup>
            </select>
          </>
        )}
        <input
          aria-label="Data view name"
          value={presetName}
          onChange={event => setPresetName(event.target.value)}
          placeholder="Name view"
          style={{ ...dataControlStyle, flex: '0 0 170px' }}
        />
        <button type="button" onClick={savePreset} style={dataActionButtonStyle}>
          Save view
        </button>
        <button
          type="button"
          onClick={deletePreset}
          disabled={!selectedPresetId}
          style={{ ...dataActionButtonStyle, opacity: selectedPresetId ? 1 : 0.48, cursor: selectedPresetId ? 'pointer' : 'default' }}
        >
          Delete
        </button>
      </div>
      {mode === 'metadata' ? (
        layout === 'cards' ? (
          <MetadataCards customFormula={customFormula} formulaKey={formulaKey} groups={groupKey === 'none' ? null : dataGroups} rows={rows} onSelect={onSelect} />
        ) : (
          <MetadataRowsTable customFormula={customFormula} formulaKey={formulaKey} groups={groupKey === 'none' ? null : dataGroups} rows={rows} onSelect={onSelect} />
        )
      ) : (
        layout === 'cards' ? (
          <TaskCards groups={groupKey === 'none' ? null : taskGroups} rows={taskRows} onSelect={onSelect} onToggleTask={onToggleTask} />
        ) : (
          <TaskRowsTable groups={groupKey === 'none' ? null : taskGroups} rows={taskRows} onSelect={onSelect} onToggleTask={onToggleTask} />
        )
      )}
    </div>
  )
}

function DataViewSyncStatus({
  enabled,
  onRetry,
  status,
}: {
  enabled: boolean
  onRetry: () => void
  status: 'local' | 'loading' | 'saving' | 'synced' | 'error'
}) {
  if (!enabled) return null
  const label =
    status === 'loading'
      ? 'Views loading'
      : status === 'saving'
        ? 'Views syncing'
        : status === 'synced'
          ? 'Views synced'
          : status === 'error'
            ? 'Views unsynced'
            : 'Views local'
  return (
    <>
      <span
        aria-live="polite"
        title={status === 'error' ? 'Saved locally; vault sync is currently unavailable.' : label}
        style={{
          color: status === 'error' ? 'var(--warning)' : 'var(--text-muted)',
          fontSize: 11,
          flex: '0 0 auto',
        }}
      >
        {label}
      </span>
      {status === 'error' && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            ...dataActionButtonStyle,
            height: 24,
            padding: '4px 7px',
            color: 'var(--warning)',
          }}
        >
          Retry
        </button>
      )}
    </>
  )
}

function samePresetList(left: VaultDataViewPreset[], right: VaultDataViewPreset[]): boolean {
  return JSON.stringify(normalizeVaultDataViewPresets(left)) === JSON.stringify(normalizeVaultDataViewPresets(right))
}

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

const dataControlStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  padding: '7px 8px',
  font: 'inherit',
  fontSize: 12,
  minWidth: 0,
  height: 30,
}

const dataActionButtonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-white-03)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '7px 9px',
  font: 'inherit',
  fontSize: 12,
  whiteSpace: 'nowrap',
  height: 30,
  flex: '0 0 auto',
}

function MetadataRowsTable({
  customFormula,
  formulaKey,
  groups,
  rows,
  onSelect,
}: {
  customFormula: string
  formulaKey: VaultDataFormulaKey
  groups: Array<VaultDataGroup<VaultDataRow>> | null
  rows: VaultDataRow[]
  onSelect: (id: string) => void
}) {
  const activeFormulaKey = formulaKey === 'none' ? null : formulaKey
  const colSpan = activeFormulaKey ? 8 : 7
  const renderRows = (visibleRows: VaultDataRow[]) => visibleRows.map(row => (
    <tr
      key={row.id}
      onDoubleClick={() => onSelect(row.id)}
      style={{ borderBottom: '1px solid var(--border)', cursor: 'default' }}
    >
      <DataCell>
        <button
          type="button"
          onClick={() => onSelect(row.id)}
          style={{
            width: '100%',
            border: 'none',
            background: 'transparent',
            color: row.trashed ? 'var(--text-muted)' : 'var(--text-primary)',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.title}
        </button>
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: 10,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginTop: 2,
          }}
        >
          {row.id}
        </div>
      </DataCell>
      <DataCell>{row.type}</DataCell>
      <DataCell>{row.folder || 'Vault root'}</DataCell>
      <DataCell>{row.tags.length ? row.tags.map(tag => `#${tag}`).join(', ') : '-'}</DataCell>
      <DataCell>{formatProperties(row)}</DataCell>
      <DataCell>{row.tasksTotal ? `${row.tasksDone}/${row.tasksTotal}` : '-'}</DataCell>
      <DataCell>
        {new Date(row.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
      </DataCell>
      {activeFormulaKey && <DataCell>{formatVaultDataFormulaValue(row, activeFormulaKey, Date.now(), customFormula)}</DataCell>}
    </tr>
  ))

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 12 }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 1 }}>
            <DataHeader width="24%">Title</DataHeader>
            <DataHeader width="8%">Type</DataHeader>
            <DataHeader width="18%">Folder</DataHeader>
            <DataHeader width="18%">Tags</DataHeader>
            <DataHeader width="16%">Properties</DataHeader>
            <DataHeader width="8%">Tasks</DataHeader>
            <DataHeader width="8%">Updated</DataHeader>
            {activeFormulaKey && <DataHeader width="8%">{vaultDataFormulaLabel(activeFormulaKey)}</DataHeader>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
                No local metadata rows match this view.
              </td>
            </tr>
          ) : (
            groups ? groups.flatMap(group => [
              <DataGroupRow key={`${group.id}:group`} colSpan={colSpan} label={group.label} count={group.rows.length} />,
              ...renderRows(group.rows),
            ]) : renderRows(rows)
          )}
        </tbody>
      </table>
    </div>
  )
}

function TaskRowsTable({
  groups,
  rows,
  onSelect,
  onToggleTask,
}: {
  groups: Array<VaultDataGroup<VaultTaskRow>> | null
  rows: VaultTaskRow[]
  onSelect: (id: string) => void
  onToggleTask: (row: VaultTaskRow, done: boolean) => void
}) {
  const renderRows = (visibleRows: VaultTaskRow[]) => visibleRows.map(row => (
    <tr
      key={row.id}
      onDoubleClick={() => onSelect(row.noteId)}
      style={{ borderBottom: '1px solid var(--border)', cursor: 'default', opacity: row.trashed ? 0.62 : 1 }}
    >
      <DataCell>
        <input
          type="checkbox"
          checked={row.done}
          disabled={row.trashed}
          onChange={event => onToggleTask(row, event.target.checked)}
          aria-label={`Toggle task ${row.text}`}
          style={{ cursor: row.trashed ? 'default' : 'pointer' }}
        />
      </DataCell>
      <DataCell>{row.text}</DataCell>
      <DataCell>
        <button
          type="button"
          onClick={() => onSelect(row.noteId)}
          style={{
            width: '100%',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.title}
        </button>
      </DataCell>
      <DataCell>{row.folder || 'Vault root'}</DataCell>
      <DataCell>{row.line}</DataCell>
    </tr>
  ))

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 12 }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 1 }}>
            <DataHeader width="8%">Done</DataHeader>
            <DataHeader width="42%">Task</DataHeader>
            <DataHeader width="24%">Note</DataHeader>
            <DataHeader width="16%">Folder</DataHeader>
            <DataHeader width="10%">Line</DataHeader>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
                No local tasks match this view.
              </td>
            </tr>
          ) : (
            groups ? groups.flatMap(group => [
              <DataGroupRow key={`${group.id}:group`} colSpan={5} label={group.label} count={group.rows.length} />,
              ...renderRows(group.rows),
            ]) : renderRows(rows)
          )}
        </tbody>
      </table>
    </div>
  )
}

function DataGroupRow({ colSpan, label, count }: { colSpan: number; label: string; count: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          position: 'sticky',
          top: 34,
          zIndex: 1,
          padding: '7px 10px',
          background: 'var(--bg-base)',
          borderBottom: '1px solid var(--border)',
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 650,
        }}
      >
        {label} <span style={{ fontWeight: 500 }}>({count})</span>
      </td>
    </tr>
  )
}

function MetadataCards({
  customFormula,
  formulaKey,
  groups,
  rows,
  onSelect,
}: {
  customFormula: string
  formulaKey: VaultDataFormulaKey
  groups: Array<VaultDataGroup<VaultDataRow>> | null
  rows: VaultDataRow[]
  onSelect: (id: string) => void
}) {
  if (rows.length === 0) return <EmptyDataView label="No local metadata rows match this view." />
  return (
    <DataCardScroller>
      {groups ? groups.map(group => (
        <DataCardGroup key={group.id} label={group.label} count={group.rows.length}>
          {group.rows.map(row => <MetadataCard key={row.id} customFormula={customFormula} formulaKey={formulaKey} row={row} onSelect={onSelect} />)}
        </DataCardGroup>
      )) : (
        <div style={dataCardGridStyle}>
          {rows.map(row => <MetadataCard key={row.id} customFormula={customFormula} formulaKey={formulaKey} row={row} onSelect={onSelect} />)}
        </div>
      )}
    </DataCardScroller>
  )
}

function TaskCards({
  groups,
  rows,
  onSelect,
  onToggleTask,
}: {
  groups: Array<VaultDataGroup<VaultTaskRow>> | null
  rows: VaultTaskRow[]
  onSelect: (id: string) => void
  onToggleTask: (row: VaultTaskRow, done: boolean) => void
}) {
  if (rows.length === 0) return <EmptyDataView label="No local tasks match this view." />
  return (
    <DataCardScroller>
      {groups ? groups.map(group => (
        <DataCardGroup key={group.id} label={group.label} count={group.rows.length}>
          {group.rows.map(row => <TaskCard key={row.id} row={row} onSelect={onSelect} onToggleTask={onToggleTask} />)}
        </DataCardGroup>
      )) : (
        <div style={dataCardGridStyle}>
          {rows.map(row => <TaskCard key={row.id} row={row} onSelect={onSelect} onToggleTask={onToggleTask} />)}
        </div>
      )}
    </DataCardScroller>
  )
}

function MetadataCard({
  customFormula,
  formulaKey,
  row,
  onSelect,
}: {
  customFormula: string
  formulaKey: VaultDataFormulaKey
  row: VaultDataRow
  onSelect: (id: string) => void
}) {
  const activeFormulaKey = formulaKey === 'none' ? null : formulaKey
  return (
    <button type="button" onClick={() => onSelect(row.id)} style={dataCardStyle}>
      <span style={{ color: row.trashed ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: 13, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.title}
      </span>
      <span style={{ color: 'var(--text-muted)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.id}</span>
      <span style={dataCardMetaStyle}>
        <span>{row.folder || 'Vault root'}</span>
        <span>{row.type}</span>
      </span>
      <span style={dataCardMetaStyle}>
        <span>{row.tags.length ? row.tags.map(tag => `#${tag}`).join(', ') : 'No tags'}</span>
        <span>{row.tasksTotal ? `${row.tasksDone}/${row.tasksTotal} tasks` : 'No tasks'}</span>
      </span>
      {activeFormulaKey && (
        <span style={dataCardMetaStyle}>
          <span>{vaultDataFormulaLabel(activeFormulaKey)}</span>
          <strong style={{ color: 'var(--text-secondary)', fontWeight: 650 }}>
            {formatVaultDataFormulaValue(row, activeFormulaKey, Date.now(), customFormula)}
          </strong>
        </span>
      )}
      <span style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatProperties(row)}</span>
    </button>
  )
}

function TaskCard({
  row,
  onSelect,
  onToggleTask,
}: {
  row: VaultTaskRow
  onSelect: (id: string) => void
  onToggleTask: (row: VaultTaskRow, done: boolean) => void
}) {
  return (
    <div style={{ ...dataCardStyle, opacity: row.trashed ? 0.62 : 1 }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
        <input
          type="checkbox"
          checked={row.done}
          disabled={row.trashed}
          onChange={event => onToggleTask(row, event.target.checked)}
          aria-label={`Toggle task ${row.text}`}
          style={{ marginTop: 2, cursor: row.trashed ? 'default' : 'pointer' }}
        />
        <span style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.text}</span>
      </label>
      <button type="button" onClick={() => onSelect(row.noteId)} style={dataCardLinkStyle}>
        {row.title}
      </button>
      <span style={dataCardMetaStyle}>
        <span>{row.folder || 'Vault root'}</span>
        <span>Line {row.line}</span>
      </span>
      <span style={dataCardMetaStyle}>
        <span>{row.done ? 'Done' : 'Open'}</span>
        <span>{row.tags.length ? row.tags.map(tag => `#${tag}`).join(', ') : 'No tags'}</span>
      </span>
    </div>
  )
}

function DataCardScroller({ children }: { children: ReactNode }) {
  return <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>{children}</div>
}

function DataCardGroup({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650, marginBottom: 8 }}>
        {label} <span style={{ fontWeight: 500 }}>({count})</span>
      </div>
      <div style={dataCardGridStyle}>{children}</div>
    </section>
  )
}

function EmptyDataView({ label }: { label: string }) {
  return <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{label}</div>
}

const dataCardGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 10,
}

const dataCardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-white-02)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  display: 'grid',
  gap: 6,
  minHeight: 118,
  minWidth: 0,
  padding: 10,
  textAlign: 'left',
  font: 'inherit',
}

const dataCardMetaStyle: CSSProperties = {
  color: 'var(--text-muted)',
  display: 'flex',
  gap: 8,
  justifyContent: 'space-between',
  minWidth: 0,
  fontSize: 11,
}

const dataCardLinkStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 12,
  fontWeight: 650,
  overflow: 'hidden',
  padding: 0,
  textAlign: 'left',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

function DataModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none',
        borderRadius: 'calc(var(--radius-sm) - 2px)',
        background: active ? 'var(--bg-white-04)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 11,
        padding: '4px 8px',
      }}
    >
      {children}
    </button>
  )
}

function DataMetric({ counts, rows }: { counts: { notes: number; attachments: number; trashed: number; tasks: number }; rows: number }) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        color: 'var(--text-muted)',
        fontSize: 11,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <strong style={{ color: 'var(--text-secondary)', fontWeight: 650 }}>{rows}</strong>
      <span>rows</span>
      <span>·</span>
      <span>{counts.notes} notes</span>
      <span>·</span>
      <span>{counts.attachments} files</span>
      <span>·</span>
      <span>{counts.tasks} tasks</span>
      {counts.trashed > 0 && (
        <>
          <span>·</span>
          <span>{counts.trashed} trash</span>
        </>
      )}
    </div>
  )
}

function DataHeader({ width, children }: { width: string; children: ReactNode }) {
  return (
    <th
      style={{
        width,
        padding: '9px 10px',
        color: 'var(--text-muted)',
        fontWeight: 650,
        textAlign: 'left',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {children}
    </th>
  )
}

function DataCell({ children }: { children: ReactNode }) {
  return (
    <td
      style={{
        padding: '9px 10px',
        color: 'var(--text-secondary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  )
}

function formatProperties(row: VaultDataRow): string {
  const entries = Object.entries(row.properties)
  if (row.trashed) entries.unshift(['trash', 'true'])
  if (entries.length === 0) return '-'
  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join(' · ')
}
