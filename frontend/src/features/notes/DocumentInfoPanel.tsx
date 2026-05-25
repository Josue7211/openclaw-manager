import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { buildDocumentInfo } from './documentInfo'
import { formatDocumentPropertyInputValue, type DocumentPropertyValueKind } from './documentPropertyValues'
import type { VaultNote } from './types'

export function DocumentInfoPanel({
  note,
  onClose,
  onSetProperty,
  onRenameProperty,
  onRemoveProperty,
  onOpenAllProperties,
}: {
  note: VaultNote
  onClose: () => void
  onSetProperty: (key: string, value: string) => void
  onRenameProperty: (key: string) => void
  onRemoveProperty: (key: string) => void
  onOpenAllProperties: () => void
}) {
  const info = useMemo(() => buildDocumentInfo(note), [note])
  const [propertyKey, setPropertyKey] = useState('')
  const [propertyValue, setPropertyValue] = useState('')
  const [propertyKind, setPropertyKind] = useState<DocumentPropertyValueKind>('text')

  const submitProperty = () => {
    const key = propertyKey.trim()
    if (!key) return
    onSetProperty(key, formatDocumentPropertyInputValue(propertyKind, propertyValue))
    setPropertyKey('')
    setPropertyValue('')
    setPropertyKind('text')
  }

  return (
    <aside
      aria-label="Document info"
      style={{
        width: 300,
        minWidth: 300,
        borderLeft: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 40,
          padding: '0 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: 'var(--text-primary)',
              fontSize: 12,
              fontWeight: 650,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {info.title}
          </div>
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: 10,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {info.type === 'attachment' ? 'Attachment info' : 'Document info'}
          </div>
        </div>
        <button
          type="button"
          className="hover-bg"
          onClick={onClose}
          aria-label="Close document info"
          style={{
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            width: 24,
            height: 24,
          }}
        >
          x
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <InfoSection title="Location">
          <InfoRow label="ID" value={info.id} />
          <InfoRow label="Folder" value={info.folder} />
          <InfoRow label="Path" value={info.fullPath} />
          <InfoRow label="Created" value={formatInfoTime(info.createdAt)} />
          <InfoRow label="Updated" value={formatInfoTime(info.updatedAt)} />
          {info.trashedAt && <InfoRow label="Trashed" value={formatInfoTime(info.trashedAt)} />}
        </InfoSection>

        {info.stats && (
          <InfoSection title="Stats">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <InfoMetric label="Words" value={info.stats.words} />
              <InfoMetric label="Chars" value={info.stats.chars} />
              <InfoMetric label="Lines" value={info.stats.lines} />
              <InfoMetric label="Pages" value={info.stats.estimatedPages} />
              <InfoMetric label="Links" value={info.stats.links} />
              <InfoMetric label="Tags" value={info.stats.tags} />
            </div>
          </InfoSection>
        )}

        <InfoSection title="Tags">
          {info.tags.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {info.tags.map(tag => (
                <InfoPill key={tag}>#{tag}</InfoPill>
              ))}
            </div>
          ) : (
            <InfoEmpty>No tags</InfoEmpty>
          )}
        </InfoSection>

        <InfoSection title="Aliases">
          {info.aliases.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {info.aliases.map(alias => (
                <InfoPill key={alias}>{alias}</InfoPill>
              ))}
            </div>
          ) : (
            <InfoEmpty>No aliases</InfoEmpty>
          )}
        </InfoSection>

        <InfoSection title="Properties">
          <button
            type="button"
            className="hover-bg"
            onClick={onOpenAllProperties}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-02)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px 8px',
              fontSize: 11,
              marginBottom: 8,
              width: '100%',
              textAlign: 'left',
            }}
          >
            Open all properties
          </button>
          {info.properties.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {info.properties.map(property => (
                <div
                  key={property.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 7px',
                    background: 'var(--bg-white-02)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{property.key}</div>
                    <div
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {property.value || '-'}
                    </div>
                  </div>
                  <span
                    title={`Property type: ${property.kind}`}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-muted)',
                      background: 'var(--bg-base)',
                      padding: '2px 5px',
                      fontSize: 10,
                      textTransform: 'capitalize',
                      flexShrink: 0,
                    }}
                  >
                    {property.kind}
                  </span>
                  {note.type === 'note' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                      <button
                        type="button"
                        className="hover-bg"
                        onClick={() => onRenameProperty(property.key)}
                        style={propertyActionButtonStyle}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="hover-bg"
                        onClick={() => onRemoveProperty(property.key)}
                        style={propertyActionButtonStyle}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <InfoEmpty>No properties</InfoEmpty>
          )}
          {note.type === 'note' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, marginTop: 8 }}>
              <input
                value={propertyKey}
                onChange={event => setPropertyKey(event.target.value)}
                placeholder="Property"
                aria-label="Property name"
                style={infoInputStyle}
              />
              <input
                value={propertyValue}
                onChange={event => setPropertyValue(event.target.value)}
                placeholder={propertyKind === 'list' ? 'one, two, three' : propertyKind === 'date' ? '2026-05-21' : propertyKind === 'number' ? '42' : propertyKind === 'checkbox' ? 'true' : 'Value'}
                aria-label="Property value"
                style={infoInputStyle}
              />
              <select
                value={propertyKind}
                onChange={event => setPropertyKind(event.target.value as DocumentPropertyValueKind)}
                aria-label="Property type"
                style={infoInputStyle}
              >
                <option value="text">Text</option>
                <option value="list">List</option>
                <option value="number">Number</option>
                <option value="checkbox">Checkbox</option>
                <option value="date">Date</option>
              </select>
              <button
                type="button"
                onClick={submitProperty}
                disabled={!propertyKey.trim()}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: propertyKey.trim() ? 'var(--bg-white-04)' : 'var(--bg-white-02)',
                  color: propertyKey.trim() ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: propertyKey.trim() ? 'pointer' : 'default',
                  padding: '7px 8px',
                  fontSize: 12,
                }}
              >
                Save property
              </button>
            </div>
          )}
        </InfoSection>
      </div>
    </aside>
  )
}

const infoInputStyle = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  padding: '7px 8px',
  font: 'inherit',
  fontSize: 12,
} satisfies CSSProperties

const propertyActionButtonStyle = {
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: '4px 5px',
  fontSize: 11,
} satisfies CSSProperties

function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0,
          marginBottom: 7,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 8, padding: '3px 0', fontSize: 12 }}
    >
      <div style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div
        style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

function InfoMetric({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-white-02)',
        padding: '7px 8px',
      }}
    >
      <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{label}</div>
      <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>{value.toLocaleString()}</div>
    </div>
  )
}

function InfoPill({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-secondary)',
        background: 'var(--bg-white-02)',
        padding: '4px 6px',
        fontSize: 11,
      }}
    >
      {children}
    </span>
  )
}

function InfoEmpty({ children }: { children: ReactNode }) {
  return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{children}</div>
}

function formatInfoTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '-'
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
