/*
 * Copied/adapted from T3 Code apps/web/src/components/chat/ProviderModelPicker.tsx,
 * ModelPickerSidebar.tsx, and ModelListRow.tsx (MIT License).
 *
 * clawctrl supplies a compact provider-instance snapshot, so this adapter
 * preserves T3's single trigger + provider rail + model/direct rows while
 * avoiding T3's full popover/combobox dependency stack.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { ChatProviderOption, ModelOption } from '@/features/chat/types'
import { resolveModelId } from '@/lib/model-resolver'
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const floatingPickerRef = useRef<HTMLDivElement>(null)
  const modelButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [open, setOpen] = useState(false)
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0, width: 360 })
  const [selectedInstanceId, setSelectedInstanceId] = useState(provider)
  const [activeModelIndex, setActiveModelIndex] = useState(0)
  const activeProvider = providers.find(candidate => candidate.id === provider) ?? providers[0]
  const selectedProvider = providers.find(candidate => candidate.id === selectedInstanceId)
    ?? activeProvider
    ?? providers[0]
  const resolvedModel = resolveModelId(model, models)
  const activeModel = models.find(candidate => candidate.id === resolvedModel)
  const pickerModels = useMemo(
    () => toPickerModels(models, selectedProvider?.name ?? 'Hermes Agent'),
    [models, selectedProvider?.name],
  )
  const availableProviders = useMemo(
    () => providers.filter(candidate => candidate.available !== false),
    [providers],
  )
  const selectedProviderIndex = availableProviders.findIndex(candidate => candidate.id === selectedProvider?.id)
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
    if (!open) return
    const focusPicker = () => floatingPickerRef.current?.focus()
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusPicker)
    else focusPicker()
  }, [open])

  useEffect(() => {
    if (!open || !selectedProvider?.modelBacked) return
    const selectedModelIndex = pickerModels.findIndex(candidate => candidate.slug === resolvedModel)
    setActiveModelIndex(selectedModelIndex >= 0 ? selectedModelIndex : 0)
  }, [model, open, pickerModels, resolvedModel, selectedProvider?.id, selectedProvider?.modelBacked])

  useEffect(() => {
    if (!open || !selectedProvider?.modelBacked) return
    const activeButton = modelButtonRefs.current[activeModelIndex]
    if (typeof activeButton?.scrollIntoView === 'function') {
      activeButton.scrollIntoView({ block: 'nearest' })
    }
  }, [activeModelIndex, open, selectedProvider?.modelBacked])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (floatingPickerRef.current?.contains(target)) return
      setOpen(false)
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

  const updatePickerPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger || typeof window === 'undefined') return
    const rect = trigger.getBoundingClientRect()
    const gutter = 8
    const availableWidth = Math.max(180, window.innerWidth - gutter * 2)
    const width = Math.min(360, availableWidth)
    const renderedHeight = floatingPickerRef.current?.offsetHeight || 300
    const maxLeft = Math.max(gutter, window.innerWidth - width - gutter)
    const left = Math.min(Math.max(gutter, rect.right - width), maxLeft)
    const hasRoomBelow = rect.bottom + 6 + renderedHeight <= window.innerHeight - gutter
    const unclampedTop = hasRoomBelow ? rect.bottom + 6 : rect.top - renderedHeight - 6
    const maxTop = Math.max(gutter, window.innerHeight - renderedHeight - gutter)
    const top = Math.min(Math.max(gutter, unclampedTop), maxTop)
    setPickerPosition({ top, left, width })
  }, [])

  useLayoutEffect(() => {
    if (open) updatePickerPosition()
  }, [open, updatePickerPosition])

  useEffect(() => {
    if (!open) return
    updatePickerPosition()
    window.addEventListener('resize', updatePickerPosition)
    window.addEventListener('scroll', updatePickerPosition, true)
    return () => {
      window.removeEventListener('resize', updatePickerPosition)
      window.removeEventListener('scroll', updatePickerPosition, true)
    }
  }, [open, updatePickerPosition])

  const chooseProvider = (nextProvider: ChatProviderOption) => {
    if (nextProvider.available === false) return
    setSelectedInstanceId(nextProvider.id)
    if (!nextProvider.modelBacked || models.length === 0) {
      onProviderChange(nextProvider.id)
      setOpen(false)
      triggerRef.current?.focus()
    }
  }

  const chooseModel = (nextModel: PickerModel) => {
    if (selectedProvider && selectedProvider.id !== provider) {
      onProviderChange(selectedProvider.id)
    }
    onModelChange(nextModel.slug)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const chooseModelByShortcut = (key: string) => {
    if (!selectedProvider?.modelBacked) return
    const index = Number(key) - 1
    if (!Number.isInteger(index) || index < 0 || index >= Math.min(9, pickerModels.length)) return
    chooseModel(pickerModels[index])
  }

  const moveProvider = (delta: number) => {
    if (availableProviders.length === 0) return
    const currentIndex = selectedProviderIndex >= 0 ? selectedProviderIndex : 0
    const nextIndex = (currentIndex + delta + availableProviders.length) % availableProviders.length
    setSelectedInstanceId(availableProviders[nextIndex].id)
  }

  const moveModel = (delta: number) => {
    if (!selectedProvider?.modelBacked || pickerModels.length === 0) return
    setActiveModelIndex(current => (current + delta + pickerModels.length) % pickerModels.length)
  }

  const selectActiveOption = () => {
    if (!selectedProvider || selectedProvider.available === false) return
    if (!selectedProvider.modelBacked) {
      chooseProvider(selectedProvider)
      return
    }
    const nextModel = pickerModels[activeModelIndex]
    if (nextModel) chooseModel(nextModel)
  }

  return (
    <div ref={rootRef} style={rootStyle}>
      <button
        ref={triggerRef}
        type="button"
        data-chat-provider-model-picker="true"
        aria-label="Select provider and model"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        }}
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

      {open && createPortal(
        <div
          ref={floatingPickerRef}
          role="dialog"
          aria-label="Provider and model picker"
          data-model-picker-content="true"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              triggerRef.current?.focus()
              return
            }
            if (/^[1-9]$/.test(event.key)) {
              event.preventDefault()
              chooseModelByShortcut(event.key)
              return
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              moveModel(1)
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              moveModel(-1)
              return
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              moveProvider(1)
              return
            }
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              moveProvider(-1)
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              selectActiveOption()
            }
          }}
          style={{
            ...popoverStyle,
            left: pickerPosition.left,
            top: pickerPosition.top,
            width: pickerPosition.width,
          }}
        >
          <div data-model-picker-sidebar="true" aria-label="Providers" style={sidebarStyle}>
            {providers.map(entry => {
              const selected = selectedProvider?.id === entry.id
              const available = entry.available !== false
              return (
                <button
                  key={entry.id}
                  type="button"
                  data-model-picker-provider={entry.id}
                  aria-label={entry.name}
                  aria-pressed={selected}
                  disabled={!available}
                  title={available ? entry.description : entry.unavailableReason || entry.description}
                  onClick={() => chooseProvider(entry)}
                  style={{
                    ...providerButtonStyle,
                    background: selected ? 'var(--bg-card)' : 'transparent',
                    color: !available ? 'var(--text-muted)' : selected ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: selected ? 'inset -2px 0 0 var(--accent)' : 'none',
                    cursor: available ? 'pointer' : 'not-allowed',
                    opacity: available ? 1 : 0.45,
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
                  {selectedProvider?.available === false
                    ? selectedProvider.unavailableReason || 'Agent unavailable'
                    : selectedProvider?.modelBacked ? 'Select model' : 'No model selection'}
                </div>
              </div>
            </div>

            {selectedProvider?.available === false ? (
              <div style={emptyStyle}>
                {selectedProvider.unavailableReason || `${selectedProvider.name} is not available.`}
              </div>
            ) : selectedProvider?.modelBacked ? (
              pickerModels.length > 0 ? (
                <div
                  role="listbox"
                  aria-label={`${selectedProvider.name} models`}
                  aria-activedescendant={pickerModels[activeModelIndex] ? `chat-model-picker-option-${pickerModels[activeModelIndex].slug}` : undefined}
                  style={rowsStyle}
                >
                  {pickerModels.map((item, index) => {
                    const selected = item.slug === resolvedModel
                    const active = index === activeModelIndex
                    return (
                      <button
                        key={item.slug}
                        id={`chat-model-picker-option-${item.slug}`}
                        ref={(node) => {
                          modelButtonRefs.current[index] = node
                        }}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        data-model-picker-model={item.slug}
                        onMouseEnter={() => setActiveModelIndex(index)}
                        onClick={() => chooseModel(item)}
                        style={{
                          ...rowStyle,
                          background: selected || active ? 'var(--hover-bg)' : 'transparent',
                          outline: active ? '1px solid var(--accent)' : 'none',
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
                    )
                  })}
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
                  Use {selectedProvider?.name ?? 'Hermes Agent'}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  Routes through the active Hermes Agent connection
                </span>
              </button>
            )}
          </div>
        </div>,
        document.body,
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
  position: 'fixed',
  zIndex: 1100,
  width: 360,
  maxWidth: 'calc(100vw - 16px)',
  minHeight: 220,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'linear-gradient(var(--bg-card-solid, #18181f), var(--bg-card-solid, #18181f)), var(--bg-base, #0a0a0c)',
  backgroundClip: 'padding-box',
  opacity: 1,
  isolation: 'isolate',
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
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
