import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { useOpenClawModels } from '@/hooks/useOpenClawModels'
import type { ModelInfo } from '@/pages/openclaw/types'

interface ModelSelectorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  /** Extra inline styles for the root container */
  style?: React.CSSProperties
}

interface ProviderGroup {
  provider: string
  models: ModelInfo[]
}

/** Provider badge color mapping using CSS variables */
const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'var(--accent)',
  openai: 'var(--green-500)',
  google: 'var(--blue)',
  local: 'var(--amber)',
  ollama: 'var(--orange)',
  groq: 'var(--purple)',
}

function getProviderColor(provider: string): string {
  const lower = provider.toLowerCase()
  for (const [key, color] of Object.entries(PROVIDER_COLORS)) {
    if (lower.includes(key)) return color
  }
  return 'var(--text-muted)'
}

export function ModelSelector({ value, onChange, disabled = false, placeholder, style }: ModelSelectorProps) {
  const { models, loading } = useOpenClawModels()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const modelList = useMemo(() => {
    return models?.models ?? models?.data ?? []
  }, [models])

  // Group models by provider
  const groups = useMemo((): ProviderGroup[] => {
    const map = new Map<string, ModelInfo[]>()
    for (const m of modelList) {
      const provider = m.provider || 'Other'
      if (!map.has(provider)) map.set(provider, [])
      map.get(provider)!.push(m)
    }
    const result: ProviderGroup[] = []
    for (const [provider, items] of map) {
      result.push({ provider, models: items })
    }
    // Sort groups alphabetically, but put "Other" last
    result.sort((a, b) => {
      if (a.provider === 'Other') return 1
      if (b.provider === 'Other') return -1
      return a.provider.localeCompare(b.provider)
    })
    return result
  }, [modelList])

  // Filter models by search text
  const filteredGroups = useMemo((): ProviderGroup[] => {
    if (!filter.trim()) return groups
    const q = filter.toLowerCase()
    return groups
      .map(g => ({
        ...g,
        models: g.models.filter(m =>
          (m.name || m.id).toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          (m.provider || '').toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.models.length > 0)
  }, [groups, filter])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setFilter('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Focus filter input when dropdown opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  const handleSelect = useCallback((modelId: string) => {
    onChange(modelId)
    setOpen(false)
    setFilter('')
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setFilter('')
    }
  }, [])

  // Find selected model info for display
  const selectedModel = modelList.find(m => m.id === value)
  const displayLabel = selectedModel ? (selectedModel.name || selectedModel.id) : value

  // Fallback to plain text input when models aren't loaded
  if (!loading && modelList.length === 0) {
    return (
      <input
        type="text"
        aria-label="Model"
        placeholder={placeholder || 'e.g. opus, sonnet'}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '8px 12px',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontFamily: 'inherit',
          width: '100%',
          boxSizing: 'border-box',
          opacity: disabled ? 0.5 : 1,
          ...style,
        }}
      />
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }} onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(!open) }}
        disabled={disabled}
        aria-label="Select model"
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '8px 12px',
          color: value ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: '13px',
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          boxSizing: 'border-box',
          textAlign: 'left',
          gap: '8px',
        }}
      >
        <span style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {loading ? 'Loading models...' : (value ? displayLabel : (placeholder || 'Select a model...'))}
        </span>
        {selectedModel?.provider && (
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '999px',
            background: 'color-mix(in srgb, ' + getProviderColor(selectedModel.provider) + ' 15%, transparent)',
            color: getProviderColor(selectedModel.provider),
            fontWeight: 600,
            flexShrink: 0,
          }}>
            {selectedModel.provider}
          </span>
        )}
        <CaretDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          aria-label="Available models"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            zIndex: 50,
            maxHeight: '320px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Search filter */}
          <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Filter models..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              aria-label="Filter models"
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: '12px',
                fontFamily: 'inherit',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Model list */}
          <div style={{ overflowY: 'auto', padding: '4px' }}>
            {filteredGroups.length === 0 && (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                No models match filter
              </div>
            )}
            {filteredGroups.map(group => (
              <div key={group.provider}>
                {/* Provider header */}
                <div style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: '8px 10px 4px',
                }}>
                  {group.provider}
                </div>
                {group.models.map(m => {
                  const isSelected = m.id === value
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(m.id)}
                      className={isSelected ? undefined : 'hover-bg'}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '7px 10px',
                        fontSize: '12px',
                        fontFamily: 'inherit',
                        background: isSelected ? 'var(--active-bg)' : 'transparent',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: isSelected ? 'var(--text-on-color)' : 'var(--text-primary)',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name || m.id}
                      </span>
                      <span style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '999px',
                        background: 'color-mix(in srgb, ' + getProviderColor(group.provider) + ' 15%, transparent)',
                        color: isSelected ? 'var(--text-on-color)' : getProviderColor(group.provider),
                        fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        {group.provider}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
