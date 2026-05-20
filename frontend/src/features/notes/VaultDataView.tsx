import { useMemo, useState, type ReactNode } from 'react'
import {
  buildVaultDataRows,
  buildVaultTaskRows,
  type VaultDataRow,
  type VaultTaskRow,
} from './dataMode'
import type { VaultNote } from './types'

export function VaultDataView({
  notes,
  query,
  onSelect,
  onToggleTask,
}: {
  notes: VaultNote[]
  query: string
  onSelect: (id: string) => void
  onToggleTask: (row: VaultTaskRow, done: boolean) => void
}) {
  const [mode, setMode] = useState<'metadata' | 'tasks'>('metadata')
  const rows = useMemo(() => buildVaultDataRows(notes, query), [notes, query])
  const taskRows = useMemo(() => buildVaultTaskRows(notes, query), [notes, query])
  const counts = useMemo(
    () => ({
      notes: rows.filter(row => row.type === 'note').length,
      attachments: rows.filter(row => row.type === 'attachment').length,
      trashed: rows.filter(row => row.trashed).length,
      tasks: rows.reduce((sum, row) => sum + row.tasksTotal, 0),
    }),
    [rows],
  )

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
          padding: '14px 16px 10px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <DataBadge label="Rows" value={rows.length} />
        <DataBadge label="Notes" value={counts.notes} />
        <DataBadge label="Attachments" value={counts.attachments} />
        <DataBadge label="Trash" value={counts.trashed} />
        <DataBadge label="Tasks" value={counts.tasks} />
        <div
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
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
      </div>
      {mode === 'metadata' ? (
        <MetadataRowsTable rows={rows} onSelect={onSelect} />
      ) : (
        <TaskRowsTable rows={taskRows} onSelect={onSelect} onToggleTask={onToggleTask} />
      )}
    </div>
  )
}

function MetadataRowsTable({ rows, onSelect }: { rows: VaultDataRow[]; onSelect: (id: string) => void }) {
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
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
                No local metadata rows match this view.
              </td>
            </tr>
          ) : (
            rows.map(row => (
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
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function TaskRowsTable({
  rows,
  onSelect,
  onToggleTask,
}: {
  rows: VaultTaskRow[]
  onSelect: (id: string) => void
  onToggleTask: (row: VaultTaskRow, done: boolean) => void
}) {
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
            rows.map(row => (
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
          )}
        </tbody>
      </table>
    </div>
  )
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

function DataBadge({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '6px 8px',
        minWidth: 72,
        background: 'var(--bg-white-02)',
      }}
    >
      <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{label}</div>
      <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 650 }}>{value}</div>
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

