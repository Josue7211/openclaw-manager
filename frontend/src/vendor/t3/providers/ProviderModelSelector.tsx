/*
 * Copied/adapted from T3 Code apps/web/src/components/chat/ProviderModelPicker.tsx,
 * ModelPickerSidebar.tsx, and ModelListRow.tsx (MIT License).
 *
 * ClawControl supplies a compact provider-instance snapshot, so this adapter
 * preserves T3's single trigger + provider rail + model/direct rows while
 * avoiding T3's full popover/combobox dependency stack.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { ChatProviderOption, ModelOption } from '@/features/chat/types'
import { ProviderInstanceIcon } from './ProviderInstanceIcon'
import {
  getDisplayModelName,
  getTriggerDisplayModelLabel,
  type ModelEsque,
} from './providerIconUtils'

interface ProviderModelSelectorProps {
  provider: string
  providers: ChatProviderOption[]
  onProviderChange: (provider: string) => void
  model: string
  models: ModelOption[]
  onModelChange: (model: string) => void
}

type PickerModel = ModelEsque & {
  providerName: string
}

function toPickerModels(models: ModelOption[], providerName: string): PickerModel[] {
  return models.map(model => ({
    slug: model.id,
    name: model.name,
    subProvider: model.provider,
    providerName,
  }))
}

export default function ProviderModelSelector({
  provider,
  providers,
  onProviderChange,
  model,
  models,
  onModelChange,
}: ProviderModelSelectorProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [selectedInstanceId, setSelectedInstanceId] = useState(provider)
  const activeProvider = providers.find(candidate => candidate.id === provider) ?? providers[0]
  const selectedProvider = providers.find(candidate => candidate.id === selectedInstanceId)
    ?? activeProvider
    ?? providers[0]
  const activeModel = models.find(candidate => candidate.id === model)
  const pickerModels = useMemo(
    () => toPickerModels(models, selectedProvider?.name ?? 'Hermes'),
    [models, selectedProvider?.name],
  )
  const triggerModel = activeModel
    ? getTriggerDisplayModelLabel({
        slug: activeModel.id,
        name: activeModel.name,
        subProvider: activeModel.provider,
      })
    : model
  const triggerLabel = activeProvider?.modelBacked
    ? `${activeProvider.name}${triggerModel ? ` · ${triggerModel}` : ''}`
    : activeProvider?.name ?? 'Select provider'

  useEffect(() => {
    if (open) setSelectedInstanceId(provider)
  }, [open, provider])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const chooseProvider = (nextProvider: ChatProviderOption) => {
    setSelectedInstanceId(nextProvider.id)
    if (!nextProvider.modelBacked || models.length === 0) {
      onProviderChange(nextProvider.id)
      setOpen(false)
    }
  }

  const chooseModel = (nextModel: PickerModel) => {
    if (selectedProvider && selectedProvider.id !== provider) {
      onProviderChange(selectedProvider.id)
    }
    onModelChange(nextModel.slug)
    setOpen(false)
  }

  return (
    <div ref={rootRef} style={rootStyle}>
      <button
        type="button"
        data-chat-provider-model-picker="true"
        aria-label="Select provider and model"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        title={activeProvider?.description || 'Select provider and model'}
        style={triggerStyle}
      >
        {activeProvider && (
          <ProviderInstanceIcon
            driverKind={activeProvider.id}
            displayName={activeProvider.name}
            size={18}
          />
        )}
        <span style={triggerTextStyle}>{triggerLabel}</span>
        <span aria-hidden="true" style={{ color: 'var(--text-muted)', fontSize: 10 }}>v</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Provider and model picker"
          data-model-picker-content="true"
          style={popoverStyle}
        >
          <div data-model-picker-sidebar="true" aria-label="Providers" style={sidebarStyle}>
            {providers.map(entry => {
              const selected = selectedProvider?.id === entry.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  data-model-picker-provider={entry.id}
                  aria-label={entry.name}
                  aria-pressed={selected}
                  onClick={() => chooseProvider(entry)}
                  style={{
                    ...providerButtonStyle,
                    background: selected ? 'var(--bg-card)' : 'transparent',
                    color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: selected ? 'inset -2px 0 0 var(--accent)' : 'none',
                  }}
                >
                  <ProviderInstanceIcon
                    driverKind={entry.id}
                    displayName={entry.name}
                    size={24}
                  />
                </button>
              )
            })}
          </div>

          <div style={listStyle}>
            <div style={listHeaderStyle}>
              <ProviderInstanceIcon
                driverKind={selectedProvider?.id ?? 'hermes'}
                displayName={selectedProvider?.name ?? 'Provider'}
                size={20}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 800 }}>
                  {selectedProvider?.name ?? 'Provider'}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  {selectedProvider?.modelBacked ? 'Select model' : 'Direct local provider'}
                </div>
              </div>
            </div>

            {selectedProvider?.modelBacked ? (
              pickerModels.length > 0 ? (
                <div role="listbox" aria-label={`${selectedProvider.name} models`} style={rowsStyle}>
                  {pickerModels.map((item, index) => (
                    <button
                      key={item.slug}
                      type="button"
                      role="option"
                      aria-selected={item.slug === model}
                      data-model-picker-model={item.slug}
                      onClick={() => chooseModel(item)}
                      style={{
                        ...rowStyle,
                        background: item.slug === model ? 'var(--hover-bg)' : 'transparent',
                      }}
                    >
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                        {getDisplayModelName(item)}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {item.subProvider ? `${item.providerName} · ${item.subProvider}` : item.providerName}
                      </span>
                      {index < 9 && (
                        <span style={kbdStyle}>{index + 1}</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={emptyStyle}>No models reported</div>
              )
            ) : (
              <button
                type="button"
                data-model-picker-direct-provider={selectedProvider?.id}
                onClick={() => selectedProvider && chooseProvider(selectedProvider)}
                style={rowStyle}
              >
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                  Use {selectedProvider?.name ?? 'provider'}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  Sends directly to the installed local CLI
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const rootStyle: CSSProperties = {
  position: 'relative',
  minWidth: 0,
}

const triggerStyle: CSSProperties = {
  background: 'var(--hover-bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-secondary)',
  height: 30,
  fontSize: 11,
  fontFamily: 'monospace',
  padding: '0 8px',
  cursor: 'pointer',
  outline: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  maxWidth: 260,
  minWidth: 0,
}

const triggerTextStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const popoverStyle: CSSProperties = {
  position: 'absolute',
  right: 0,
  top: 36,
  zIndex: 50,
  width: 360,
  maxWidth: 'calc(100vw - 48px)',
  minHeight: 220,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-base)',
  boxShadow: 'var(--shadow-lg, 0 18px 60px rgba(0, 0, 0, 0.35))',
  display: 'grid',
  gridTemplateColumns: '48px minmax(0, 1fr)',
  overflow: 'hidden',
}

const sidebarStyle: CSSProperties = {
  borderRight: '1px solid var(--border)',
  background: 'var(--hover-bg)',
  display: 'grid',
  alignContent: 'start',
  gap: 4,
  padding: 4,
}

const providerButtonStyle: CSSProperties = {
  width: 40,
  height: 40,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
}

const listStyle: CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
}

const listHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: 12,
  borderBottom: '1px solid var(--border)',
}

const rowsStyle: CSSProperties = {
  display: 'grid',
  gap: 2,
  padding: 6,
  maxHeight: 300,
  overflowY: 'auto',
}

const rowStyle: CSSProperties = {
  position: 'relative',
  border: 'none',
  borderRadius: 6,
  padding: '8px 36px 8px 10px',
  display: 'grid',
  gap: 2,
  textAlign: 'left',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const emptyStyle: CSSProperties = {
  margin: 10,
  padding: 12,
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-muted)',
  fontSize: 12,
}

const kbdStyle: CSSProperties = {
  position: 'absolute',
  right: 10,
  top: 10,
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-muted)',
  fontSize: 10,
  lineHeight: 1,
  padding: '2px 5px',
}
