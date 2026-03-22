import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { X, MagnifyingGlass, Package, Pulse, CheckSquare, BookOpen, Television, Layout } from '@phosphor-icons/react'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useEscapeKey } from '@/lib/hooks/useEscapeKey'
import {
  getWidgetsByCategory,
  getWidgetBundles,
  getWidgetPresets,
  getWidget,
} from '@/lib/widget-registry'
import type { WidgetDefinition, WidgetPreset } from '@/lib/widget-registry'
import { addWidgetToPage } from '@/lib/dashboard-store'
import { WidgetPickerCard } from './WidgetPickerCard'

// ---------------------------------------------------------------------------
// Category display config
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  monitoring: 'Monitoring',
  productivity: 'Productivity',
  ai: 'AI',
  media: 'Media',
  custom: 'Custom',
  primitives: 'Primitives',
}

const CATEGORY_ORDER = ['monitoring', 'productivity', 'ai', 'media', 'custom', 'primitives']

const CATEGORY_TABS: Array<{ key: string | null; label: string }> = [
  { key: null, label: 'All' },
  { key: 'monitoring', label: 'Monitoring' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'ai', label: 'AI' },
  { key: 'media', label: 'Media' },
  { key: 'custom', label: 'Custom' },
  { key: 'primitives', label: 'Primitives' },
]

const PRESET_ICON_MAP: Record<string, React.ElementType> = {
  Pulse,
  CheckSquare,
  BookOpen,
  Television,
}

// ---------------------------------------------------------------------------
// WidgetPicker
// ---------------------------------------------------------------------------

interface WidgetPickerProps {
  open: boolean
  onClose: () => void
  pageId: string
  placedWidgetIds: string[]
  /** Override: custom add widget handler instead of dashboard-store addWidgetToPage */
  onAddWidget?: (pageId: string, pluginId: string, layout: import('@/lib/dashboard-store').LayoutItem) => void
}

export const WidgetPicker = React.memo(function WidgetPicker({
  open,
  onClose,
  pageId,
  placedWidgetIds,
  onAddWidget,
}: WidgetPickerProps) {
  const widgetAdder = onAddWidget ?? addWidgetToPage
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const trapRef = useFocusTrap(open)

  useEscapeKey(onClose, open)

  // Reset search and category when panel opens
  useEffect(() => {
    if (open) {
      setSearch('')
      setSelectedCategory(null)
    }
  }, [open])

  const categorized = useMemo(() => getWidgetsByCategory(), [])
  const bundles = useMemo(() => getWidgetBundles(), [])
  const presets = useMemo(() => getWidgetPresets(), [])

  const placedSet = useMemo(
    () => new Set(placedWidgetIds),
    [placedWidgetIds],
  )

  // Filter by search and selected category
  const filteredCategories = useMemo(() => {
    const term = search.toLowerCase().trim()

    // Start with all categories or just the selected one
    let source = categorized
    if (selectedCategory) {
      source = {}
      if (categorized[selectedCategory]) {
        source[selectedCategory] = categorized[selectedCategory]
      }
    }

    if (!term) return source

    const result: Record<string, WidgetDefinition[]> = {}
    for (const [cat, widgets] of Object.entries(source)) {
      const filtered = widgets.filter(
        (w) =>
          w.name.toLowerCase().includes(term) ||
          w.description.toLowerCase().includes(term),
      )
      if (filtered.length > 0) result[cat] = filtered
    }
    return result
  }, [categorized, search, selectedCategory])

  const hasResults = Object.keys(filteredCategories).length > 0

  const handleAddWidget = useCallback(
    (widgetDef: WidgetDefinition, size: { w: number; h: number }) => {
      const instanceId = `${widgetDef.id}-${crypto.randomUUID().slice(0, 8)}`
      widgetAdder(pageId, widgetDef.id, {
        i: instanceId,
        x: 0,
        y: Infinity,
        w: size.w,
        h: size.h,
        minW: widgetDef.minSize?.w,
        minH: widgetDef.minSize?.h,
      })
    },
    [pageId, widgetAdder],
  )

  const handleAddBundle = useCallback(
    (bundleWidgetIds: string[]) => {
      for (const wid of bundleWidgetIds) {
        const def = getWidget(wid)
        if (def) {
          handleAddWidget(def, def.defaultSize)
        }
      }
    },
    [handleAddWidget],
  )

  const handleApplyPreset = useCallback(
    (preset: WidgetPreset) => {
      for (const entry of preset.widgets) {
        const def = getWidget(entry.pluginId)
        if (!def) continue
        const instanceId = `${entry.pluginId}-${crypto.randomUUID().slice(0, 8)}`
        widgetAdder(pageId, entry.pluginId, {
          i: instanceId,
          x: entry.layout.x,
          y: entry.layout.y,
          w: entry.layout.w,
          h: entry.layout.h,
          minW: def.minSize?.w,
          minH: def.minSize?.h,
        })
      }
    },
    [pageId, widgetAdder],
  )

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="widget-picker-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          zIndex: 'var(--z-modal-backdrop)',
        }}
      />

      {/* Panel */}
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add Widget"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(480px, 90vw)',
          zIndex: 'var(--z-modal)',
          background: 'var(--bg-card-solid)',
          borderLeft: '1px solid var(--border)',
          borderRadius: '16px 0 0 16px',
          display: 'flex',
          flexDirection: 'column',
          transform: 'translateX(0)',
          animation: 'widgetPickerSlideIn 250ms var(--ease-spring) both',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 0',
          }}
        >
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Add Widget
          </h2>
          <button
            onClick={onClose}
            aria-label="Close widget picker"
            className="hover-bg"
            style={{
              width: 32,
              height: 32,
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '16px 24px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-base)',
              border: '1px solid var(--border)',
            }}
          >
            <MagnifyingGlass
              size={16}
              style={{ color: 'var(--text-muted)', flexShrink: 0 }}
            />
            <input
              type="text"
              placeholder="Search widgets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '15px',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {/* Category filter tabs */}
        <div
          role="tablist"
          aria-label="Widget categories"
          style={{
            display: 'flex',
            gap: 0,
            borderBottom: '1px solid var(--border)',
            padding: '0 24px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {CATEGORY_TABS.map((tab) => {
            const isActive = selectedCategory === tab.key
            return (
              <button
                key={tab.label}
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedCategory(tab.key)}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                  whiteSpace: 'nowrap',
                  fontFamily: 'inherit',
                  transition: 'color 150ms ease, border-color 150ms ease',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px 24px 24px',
          }}
        >
          {!hasResults ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 24px',
                textAlign: 'center',
              }}
            >
              <MagnifyingGlass
                size={48}
                weight="regular"
                style={{ color: 'var(--text-muted)', marginBottom: '16px' }}
              />
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '4px',
                }}
              >
                No matching widgets
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                }}
              >
                Try a different search term.
              </div>
            </div>
          ) : (
            <>
              {/* Presets — show when All tab and no search */}
              {!search.trim() && selectedCategory === null && presets.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginBottom: '8px',
                    }}
                  >
                    Presets
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {presets.map((preset) => {
                      const PresetIcon = PRESET_ICON_MAP[preset.icon] || Layout
                      return (
                        <div
                          key={preset.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                            }}
                          >
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '8px',
                                background: 'var(--accent-a12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <PresetIcon
                                size={18}
                                weight="duotone"
                                style={{ color: 'var(--accent)' }}
                              />
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: '15px',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {preset.name}
                              </div>
                              <div
                                style={{
                                  fontSize: '12px',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {preset.description}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleApplyPreset(preset)}
                            aria-label={`Apply preset: ${preset.name}`}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '999px',
                              border: 'none',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              background: 'var(--accent)',
                              color: 'var(--text-on-color)',
                            }}
                          >
                            Apply
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Categories */}
              {CATEGORY_ORDER.filter(
                (cat) => filteredCategories[cat]?.length,
              ).map((cat) => (
                <div key={cat} style={{ marginBottom: '24px' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginBottom: '8px',
                    }}
                  >
                    {CATEGORY_LABELS[cat] || cat}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '12px',
                    }}
                  >
                    {filteredCategories[cat]!.map((widget) => (
                      <WidgetPickerCard
                        key={widget.id}
                        widget={widget}
                        onAdd={(size) => handleAddWidget(widget, size)}
                        isAlreadyPlaced={placedSet.has(widget.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Bundles */}
              {!search.trim() && bundles.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginBottom: '8px',
                    }}
                  >
                    Bundles
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {bundles.map((bundle) => (
                      <div
                        key={bundle.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: '12px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                          }}
                        >
                          <Package
                            size={20}
                            weight="duotone"
                            style={{ color: 'var(--accent)' }}
                          />
                          <div>
                            <div
                              style={{
                                fontSize: '15px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                              }}
                            >
                              {bundle.name}
                            </div>
                            <div
                              style={{
                                fontSize: '12px',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {bundle.description}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddBundle(bundle.widgetIds)}
                          aria-label={`Add bundle: ${bundle.name}`}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '999px',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            background: 'var(--accent)',
                            color: 'var(--text-on-color)',
                          }}
                        >
                          Add Bundle
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
})
