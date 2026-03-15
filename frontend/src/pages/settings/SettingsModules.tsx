import { useState, useCallback, useSyncExternalStore } from 'react'
import { FileText, Plus, Trash2, Pencil, ArrowUp, ArrowDown, EyeOff, GripVertical } from 'lucide-react'
import { APP_MODULES, getEnabledModules, setEnabledModules, subscribeModules } from '@/lib/modules'
import {
  getSidebarConfig, setSidebarConfig, resetSidebarConfig, subscribeSidebarConfig,
  renameItem, renameCategory, moveItem, createCustomModule, deleteCustomModule,
  softDeleteItem, restoreItem, permanentlyDelete, emptyRecycleBin,
} from '@/lib/sidebar-config'
import { navItemsByHref } from '@/lib/nav-items'
import { getSidebarHeaderVisible, setSidebarHeaderVisible, getSidebarDefaultWidth, setSidebarDefaultWidth, getSidebarTitleLayout, setSidebarTitleLayout, getSidebarTitleText, setSidebarTitleText, getSidebarSearchVisible, setSidebarSearchVisible, getSidebarLogoVisible, setSidebarLogoVisible, getSidebarTitleSize, setSidebarTitleSize, subscribeSidebarSettings } from '@/lib/sidebar-settings'
import { setTitleBarVisible, setTitleBarAutoHide, getTitleBarVisible, getTitleBarAutoHide, subscribeTitleBarSettings } from '@/lib/titlebar-settings'
import { ContextMenu, type ContextMenuState } from '@/components/ContextMenu'
import { ResizablePanel, type PanelRect } from '@/components/ResizablePanel'
import Toggle from './Toggle'
import { row, btnSecondary, sectionLabel } from './shared'

const GAP_BETWEEN_PANELS = 16 // must match GAP in ResizablePanel

export default function SettingsModules() {
  const enabledModules = useSyncExternalStore(subscribeModules, getEnabledModules)
  const sidebarConfig = useSyncExternalStore(subscribeSidebarConfig, getSidebarConfig)
  const sidebarHeaderVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarHeaderVisible)
  const sidebarLogoVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarLogoVisible)
  const sidebarTitleSize = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleSize)
  const sidebarSearchVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarSearchVisible)
  const sidebarDefaultWidth = useSyncExternalStore(subscribeSidebarSettings, getSidebarDefaultWidth)
  const sidebarTitleLayout = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleLayout)
  const sidebarTitleText = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleText)
  const titleBarVisible = useSyncExternalStore(subscribeTitleBarSettings, getTitleBarVisible)
  const titleBarAutoHide = useSyncExternalStore(subscribeTitleBarSettings, getTitleBarAutoHide)

  // Module drag-and-drop state
  const [modDragHref, setModDragHref] = useState<string | null>(null)
  const [modDragFromCat, setModDragFromCat] = useState<string | null>(null)
  const [modDropCat, setModDropCat] = useState<string | null>(null)
  const [modDropIdx, setModDropIdx] = useState<number>(-1)
  const [editingModItem, setEditingModItem] = useState<string | null>(null)
  const [editingModCat, setEditingModCat] = useState<string | null>(null)
  const [modEditValue, setModEditValue] = useState('')
  const [settingsCtxMenu, setSettingsCtxMenu] = useState<ContextMenuState | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  // Panel rects for collision detection + swap
  const [panelRects, setPanelRects] = useState<Record<string, PanelRect>>({})
  const [swapRev, setSwapRev] = useState(0)
  const [forceRects, setForceRects] = useState<Record<string, PanelRect & { _rev: number }>>({})
  const [swapHoverTarget, setSwapHoverTarget] = useState<string | null>(null)

  // Check if a rect overlaps any panel except the given IDs (with gap)
  const wouldOverlapOthers = useCallback((rect: PanelRect, excludeIds: string[]): boolean => {
    const g = GAP_BETWEEN_PANELS
    for (const [id, r] of Object.entries(panelRects)) {
      if (excludeIds.includes(id)) continue
      const inflated = { x: r.x - g, y: r.y - g, w: r.w + g * 2, h: r.h + g * 2 }
      if (rect.x < inflated.x + inflated.w && rect.x + rect.w > inflated.x && rect.y < inflated.y + inflated.h && rect.y + rect.h > inflated.y) return true
    }
    return false
  }, [panelRects])
  const updatePanelRect = useCallback((id: string) => (rect: PanelRect) => {
    setPanelRects(prev => ({ ...prev, [id]: rect }))
  }, [])
  const getSiblings = useCallback((id: string): (PanelRect & { id: string })[] => {
    return Object.entries(panelRects).filter(([k]) => k !== id).map(([k, v]) => ({ ...v, id: k }))
  }, [panelRects])
  const handleSwap = useCallback((fromId: string) => (targetId: string) => {
    const a = panelRects[fromId]
    const b = panelRects[targetId]
    if (!a || !b) return
    const rev = swapRev + 1
    setSwapRev(rev)
    setForceRects({
      [fromId]: { x: b.x, y: b.y, w: b.w, h: b.h, _rev: rev },
      [targetId]: { x: a.x, y: a.y, w: a.w, h: a.h, _rev: rev },
    })
  }, [panelRects, swapRev])

  const toggleModule = (id: string) => {
    const current = getEnabledModules()
    const next = current.includes(id)
      ? current.filter(m => m !== id)
      : [...current, id]
    setEnabledModules(next)
  }

  // Resolve a nav item by href (built-in or custom module)
  const resolveItem = (href: string): { icon: React.ElementType; label: string; moduleId?: string } | null => {
    const navItem = navItemsByHref.get(href)
    if (navItem) return navItem
    if (href.startsWith('/custom/')) {
      const modId = href.slice('/custom/'.length)
      const customMod = (sidebarConfig.customModules || []).find(m => m.id === modId)
      if (customMod) return { icon: FileText, label: customMod.name }
    }
    return null
  }

  const handleModDragStart = (href: string, catId: string) => (e: React.DragEvent) => {
    setModDragHref(href)
    setModDragFromCat(catId)
    e.dataTransfer.setData('text/plain', href)
    e.dataTransfer.effectAllowed = 'move'
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4'
    }
  }

  const handleModDragEnd = (e: React.DragEvent) => {
    setModDragHref(null)
    setModDragFromCat(null)
    setModDropCat(null)
    setModDropIdx(-1)
    setSwapHoverTarget(null)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }

  const handleModDragOver = (catId: string, index: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setModDropCat(catId)
    setModDropIdx(index)
  }

  const handleModDrop = (catId: string, index: number) => (e: React.DragEvent) => {
    e.preventDefault()
    const draggedHref = modDragHref || e.dataTransfer.getData('text/plain')
    const fromCat = modDragFromCat
    if (!draggedHref || !fromCat) return

    // Dragging from Unused into a category — just re-enable (item is already in category list)
    if (fromCat === '__unused__') {
      const item = resolveItem(draggedHref)
      if (item?.moduleId && !enabledModules.includes(item.moduleId)) {
        toggleModule(item.moduleId)
      }
      setModDragHref(null)
      setModDragFromCat(null)
      setModDropCat(null)
      setModDropIdx(-1)
      return
    }

    const config = getSidebarConfig()
    const newCategories = config.categories.map(c => ({ ...c, items: [...c.items] }))

    const sourceCat = newCategories.find(c => c.id === fromCat)
    if (sourceCat) {
      sourceCat.items = sourceCat.items.filter(h => h !== draggedHref)
    }

    const targetCat = newCategories.find(c => c.id === catId)
    if (targetCat) {
      let adjustedIndex = index
      if (fromCat === catId) {
        const oldIndex = config.categories.find(c => c.id === catId)!.items.indexOf(draggedHref)
        if (oldIndex < index) adjustedIndex = Math.max(0, index - 1)
      }
      targetCat.items.splice(adjustedIndex, 0, draggedHref)
    }

    setSidebarConfig({ ...config, categories: newCategories })
    setModDragHref(null)
    setModDragFromCat(null)
    setModDropCat(null)
    setModDropIdx(-1)
  }

  const startEditCategory = (catId: string, currentName: string) => {
    setEditingModCat(catId)
    setEditingModItem(null)
    setModEditValue(currentName)
  }

  const confirmEditCategory = () => {
    if (!editingModCat || !modEditValue.trim()) {
      setEditingModCat(null)
      return
    }
    renameCategory(editingModCat, modEditValue.trim())
    setEditingModCat(null)
  }

  const startEditItem = (href: string) => {
    const item = resolveItem(href)
    if (!item) return
    setEditingModItem(href)
    setEditingModCat(null)
    setModEditValue(sidebarConfig.customNames[href] || item.label)
  }

  const confirmEditItem = () => {
    if (!editingModItem) return
    renameItem(editingModItem, modEditValue.trim())
    setEditingModItem(null)
  }

  const addCategory = () => {
    const config = getSidebarConfig()
    const id = `custom-${Date.now()}`
    setSidebarConfig({
      ...config,
      categories: [...config.categories, { id, name: 'New Category', items: [] }],
    })
    setEditingModCat(id)
    setModEditValue('New Category')
  }

  const deleteCategory = (catId: string) => {
    const config = getSidebarConfig()
    const cat = config.categories.find(c => c.id === catId)
    if (!cat || cat.items.length > 0) return
    setSidebarConfig({
      ...config,
      categories: config.categories.filter(c => c.id !== catId),
    })
  }

  const handleCreateModule = (catId?: string) => {
    const href = createCustomModule('New Module', catId)
    // Auto-start editing the new module name
    setTimeout(() => {
      setEditingModItem(href)
      setModEditValue('New Module')
    }, 50)
  }

  const handleDeleteModule = (href: string) => {
    softDeleteItem(href)
  }

  const dropIndicator = (
    <div style={{
      height: '2px',
      background: 'var(--accent)',
      borderRadius: '1px',
      margin: '0 8px',
      boxShadow: '0 0 6px var(--accent)',
    }} />
  )

  const toggleTitleBar = (show: boolean) => {
    setTitleBarVisible(show)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flexShrink: 0 }}>
        <div style={sectionLabel}>Sidebar</div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Drag to reorder. Double-click or right-click to rename. Move items between categories.
        </p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <button
          style={{ ...btnSecondary, padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={addCategory}
        >
          <Plus size={12} />
          Add Category
        </button>
        <button
          style={{ ...btnSecondary, padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={() => handleCreateModule()}
        >
          <FileText size={12} />
          Create Module
        </button>
        <button
          style={{ ...btnSecondary, padding: '6px 12px', fontSize: '11px', color: 'var(--text-muted)' }}
          onClick={() => {
            resetSidebarConfig(); setEditingModItem(null); setEditingModCat(null)
            // Also reset panel positions
            localStorage.removeItem('panel-sb-modules')
            localStorage.removeItem('panel-sb-unused')
            localStorage.removeItem('panel-sb-customize')
            window.location.reload()
          }}
        >
          Reset to Default
        </button>
        </div>
      </div>{/* end header */}

      <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Categories panel */}
      <ResizablePanel storageKey="sb-modules" title="Modules" panelId="modules" initialX={0} initialY={0} initialW={380} initialH={600} minW={250} minH={200} siblings={getSiblings('modules')} onRectChange={updatePanelRect('modules')} onSwap={handleSwap('modules')} forceRect={forceRects['modules']} swapTarget={swapHoverTarget === 'modules'} onSwapHover={setSwapHoverTarget}>
      <div
        onDragOver={e => {
          const data = modDragHref || ''
          if (data.startsWith('restore-category:')) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }
        }}
        onDrop={e => {
          const data = modDragHref || e.dataTransfer.getData('text/plain')
          if (data?.startsWith('restore-category:')) {
            e.preventDefault()
            const catId = data.slice('restore-category:'.length)
            const cfg = getSidebarConfig()
            const ucat = (cfg.unusedCategories || []).find(c => c.id === catId)
            if (ucat) {
              setSidebarConfig({
                ...cfg,
                categories: [...cfg.categories, ucat],
                unusedCategories: (cfg.unusedCategories || []).filter(c => c.id !== catId),
              })
            }
            setModDragHref(null)
            setModDragFromCat(null)
            setModDropCat(null)
            setModDropIdx(-1)
            setSwapHoverTarget(null)
          }
        }}
        style={{ minHeight: '100%' }}
      >
      {sidebarConfig.categories.map((cat) => (
        <div
          key={cat.id}
          style={{
            marginBottom: '16px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: modDropCat === cat.id && modDragHref ? 'rgba(155, 132, 236, 0.04)' : 'transparent',
            transition: 'background 0.15s',
            overflow: 'hidden',
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (cat.items.length === 0) {
              setModDropCat(cat.id)
              setModDropIdx(0)
            }
          }}
          onDrop={cat.items.length === 0 ? handleModDrop(cat.id, 0) : undefined}
        >
          {/* Category header */}
          <div
            draggable
            onDragStart={e => {
              e.dataTransfer.setData('text/plain', `category:${cat.id}`)
              e.dataTransfer.effectAllowed = 'move'
              setModDragHref(`category:${cat.id}`)
              setModDragFromCat(cat.id)
            }}
            onDragEnd={handleModDragEnd}
            onContextMenu={(e) => {
              e.preventDefault()
              setSettingsCtxMenu({
                x: e.clientX, y: e.clientY,
                items: [
                  { label: 'Rename Category', icon: Pencil, onClick: () => startEditCategory(cat.id, cat.name) },
                  { label: 'Create Module Here', icon: FileText, onClick: () => handleCreateModule(cat.id) },
                  {
                    label: 'Move All to Unused',
                    icon: EyeOff,
                    onClick: () => {
                      const current = getEnabledModules()
                      const toDisable = cat.items
                        .map(href => resolveItem(href)?.moduleId)
                        .filter(Boolean) as string[]
                      setEnabledModules(current.filter(id => !toDisable.includes(id)))
                    },
                    disabled: cat.items.length === 0,
                  },
                  ...(cat.items.length === 0 ? [{ label: 'Delete Category', icon: Trash2, onClick: () => deleteCategory(cat.id), danger: true }] : []),
                ],
              })
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            {editingModCat === cat.id ? (
              <input
                autoFocus
                aria-label="Rename category"
                value={modEditValue}
                onChange={e => setModEditValue(e.target.value)}
                onBlur={confirmEditCategory}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmEditCategory()
                  if (e.key === 'Escape') setEditingModCat(null)
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--accent)',
                  color: 'var(--text-primary)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  outline: 'none',
                  padding: '2px 0',
                  width: '200px',
                  fontFamily: 'inherit',
                }}
              />
            ) : (
              <span
                onDoubleClick={() => startEditCategory(cat.id, cat.name)}
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  cursor: 'text',
                  userSelect: 'none',
                }}
                title="Double-click or right-click to edit"
              >
                {cat.name}
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {cat.items.length}
              </span>
              {cat.items.length === 0 && (
                <button
                  onClick={() => deleteCategory(cat.id)}
                  aria-label={`Delete ${cat.name} category`}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '2px',
                    background: 'transparent', border: 'none', color: 'var(--text-muted)',
                    cursor: 'pointer', borderRadius: '4px',
                  }}
                  title="Delete empty category"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Items */}
          <div style={{ padding: cat.items.length > 0 ? '4px 0' : '0' }}>
            {cat.items.length === 0 && modDragHref && (
              <div
                style={{ padding: '12px', textAlign: 'center', color: 'var(--accent)', fontSize: '11px', fontWeight: 600 }}
                onDragOver={(e) => { e.preventDefault(); setModDropCat(cat.id); setModDropIdx(0) }}
                onDrop={handleModDrop(cat.id, 0)}
              >
                Drop here
              </div>
            )}
            {cat.items.length === 0 && !modDragHref && (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                Empty — drag items here or right-click to create
              </div>
            )}
            {cat.items.map((href, idx) => {
              const resolved = resolveItem(href)
              if (!resolved) return null
              const Icon = resolved.icon
              const displayName = sidebarConfig.customNames[href] || resolved.label
              const isEnabled = !resolved.moduleId || enabledModules.includes(resolved.moduleId)
              if (!isEnabled) return null
              const isDragTarget = modDropCat === cat.id && modDropIdx === idx && modDragHref !== href
              const isDragTargetAfter = modDropCat === cat.id && modDropIdx === idx + 1 && idx === cat.items.length - 1 && modDragHref !== href
              const isBeingDragged = modDragHref === href
              const isCustom = href.startsWith('/custom/')
              const originalName = resolved.label

              return (
                <div key={href}>
                  {isDragTarget && dropIndicator}
                  <div
                    draggable
                    onDragStart={handleModDragStart(href, cat.id)}
                    onDragEnd={handleModDragEnd}
                    onDragOver={handleModDragOver(cat.id, idx)}
                    onDrop={handleModDrop(cat.id, idx)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      const menuItems: { label: string; icon: React.ElementType; onClick: () => void; danger?: boolean; disabled?: boolean }[] = [
                        { label: 'Rename', icon: Pencil, onClick: () => startEditItem(href) },
                        { label: 'Move Up', icon: ArrowUp, onClick: () => moveItem(href, 'up'), disabled: idx === 0 },
                        { label: 'Move Down', icon: ArrowDown, onClick: () => moveItem(href, 'down'), disabled: idx === cat.items.length - 1 },
                      ]
                      menuItems.push({ label: 'Delete', icon: Trash2, onClick: () => handleDeleteModule(href), danger: true })
                      setSettingsCtxMenu({ x: e.clientX, y: e.clientY, items: menuItems })
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      opacity: isBeingDragged ? 0.3 : isEnabled ? 1 : 0.45,
                      transition: 'opacity 0.15s, background 0.1s',
                      cursor: 'grab',
                      borderRadius: '6px',
                      margin: '0 4px',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <GripVertical size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, cursor: 'grab' }} />
                    <Icon size={16} style={{ flexShrink: 0, color: isEnabled ? 'var(--text-secondary)' : 'var(--text-muted)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingModItem === href ? (
                        <input
                          autoFocus
                          aria-label="Rename module"
                          value={modEditValue}
                          onChange={e => setModEditValue(e.target.value)}
                          onBlur={confirmEditItem}
                          onKeyDown={e => {
                            if (e.key === 'Enter') confirmEditItem()
                            if (e.key === 'Escape') setEditingModItem(null)
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px solid var(--accent)',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            outline: 'none',
                            padding: '1px 0',
                            width: '100%',
                            minWidth: 0,
                            fontFamily: 'inherit',
                          }}
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => { e.stopPropagation(); startEditItem(href) }}
                          style={{
                            fontSize: '13px',
                            color: isEnabled ? 'var(--text-primary)' : 'var(--text-muted)',
                            cursor: 'text',
                            userSelect: 'none',
                          }}
                          title="Double-click or right-click to edit"
                        >
                          {displayName}
                          {sidebarConfig.customNames[href] && !isCustom && (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px', fontStyle: 'italic' }}>
                              ({originalName})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  {isDragTargetAfter && dropIndicator}
                </div>
              )
            })}
            {/* Drop zone at end of category */}
            {cat.items.length > 0 && (
              <div
                style={{ height: '8px' }}
                onDragOver={handleModDragOver(cat.id, cat.items.length)}
                onDrop={handleModDrop(cat.id, cat.items.length)}
              >
                {modDropCat === cat.id && modDropIdx === cat.items.length && modDragHref && dropIndicator}
              </div>
            )}
          </div>
        </div>
      ))}
      </div>{/* end drop zone */}

      </ResizablePanel>

      {/* Unused Modules */}
      {(() => {
        const allCatHrefs = new Set(sidebarConfig.categories.flatMap(c => c.items))
        // Built-in modules that are disabled
        const disabledBuiltins = Array.from(allCatHrefs).filter(href => {
          const item = resolveItem(href)
          if (!item || !item.moduleId) return false
          return !enabledModules.includes(item.moduleId)
        })
        // Custom modules not in any category (orphaned)
        const orphanedCustom = (sidebarConfig.customModules || [])
          .map(m => `/custom/${m.id}`)
          .filter(href => !allCatHrefs.has(href) && !(sidebarConfig.deletedItems || []).some(d => d.href === href))
        const disabledItems = [...disabledBuiltins, ...orphanedCustom]
        return (
          <ResizablePanel storageKey="sb-unused" title={`Unused ${disabledItems.length || ''}`} panelId="unused" initialX={394} initialY={0} initialW={250} initialH={280} minW={160} minH={100} siblings={getSiblings('unused')} onRectChange={updatePanelRect('unused')} onSwap={handleSwap('unused')} forceRect={forceRects['unused']} swapTarget={swapHoverTarget === 'unused'} onSwapHover={setSwapHoverTarget}>
          <div
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setModDropCat('__unused__') }}
            onDragLeave={() => { if (modDropCat === '__unused__') setModDropCat(null) }}
            onDrop={e => {
              e.preventDefault()
              const href = modDragHref || e.dataTransfer.getData('text/plain')
              if (!href) return

              // Handle category drop — disable/delete all items in the category
              if (href.startsWith('category:')) {
                const catId = href.slice('category:'.length)
                const cat = sidebarConfig.categories.find(c => c.id === catId)
                if (cat) {
                  const cfg = getSidebarConfig()
                  setSidebarConfig({
                    ...cfg,
                    categories: cfg.categories.filter(c => c.id !== catId),
                    unusedCategories: [...(cfg.unusedCategories || []), cat],
                  })
                }
              } else {
                const item = resolveItem(href)
                if (item?.moduleId && enabledModules.includes(item.moduleId)) {
                  toggleModule(item.moduleId)
                } else {
                  // Custom module — remove from category (orphan it)
                  const cfg = getSidebarConfig()
                  setSidebarConfig({
                    ...cfg,
                    categories: cfg.categories.map(c => ({
                      ...c,
                      items: c.items.filter(h => h !== href),
                    })),
                  })
                }
              }
              setModDragHref(null)
              setModDragFromCat(null)
              setModDropCat(null)
              setModDropIdx(-1)
              setSwapHoverTarget(null)
            }}
            style={{
              height: '100%',
              background: modDropCat === '__unused__' ? 'rgba(155, 132, 236, 0.06)' : 'transparent',
              transition: 'background 0.15s',
            }}
          >
            {disabledItems.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                {modDragHref ? 'Drop here to disable' : 'All modules active'}
              </div>
            ) : (
              <div style={{ padding: '4px 0' }}>
                {disabledItems.map(href => {
                  const item = resolveItem(href)
                  if (!item) return null
                  const Icon = item.icon
                  const displayName = sidebarConfig.customNames[href] || item.label
                  return (
                    <div
                      key={href}
                      draggable
                      onDragStart={handleModDragStart(href, '__unused__')}
                      onDragEnd={handleModDragEnd}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '7px 12px',
                        cursor: 'grab',
                        borderRadius: '6px',
                        margin: '0 4px',
                        opacity: 0.6,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; (e.currentTarget as HTMLElement).style.opacity = '1' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.opacity = '0.6' }}
                    >
                      <Icon size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', flex: 1 }}>{displayName}</span>
                      <button
                        onClick={() => {
                          if (item?.moduleId) {
                            toggleModule(item.moduleId)
                          } else {
                            // Custom module — add back to first category
                            const cfg = getSidebarConfig()
                            const first = cfg.categories[0]
                            if (first) {
                              setSidebarConfig({
                                ...cfg,
                                categories: cfg.categories.map(c =>
                                  c === first ? { ...c, items: [...c.items, href] } : c
                                ),
                              })
                            }
                          }
                        }}
                        aria-label={`Enable ${displayName}`}
                        style={{
                          display: 'flex', alignItems: 'center', padding: '2px 6px',
                          background: 'transparent', border: '1px solid var(--border)',
                          borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer',
                          fontSize: '10px', fontWeight: 600,
                        }}
                      >
                        Enable
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {/* Unused categories */}
            {(sidebarConfig.unusedCategories || []).map(ucat => (
              <div
                key={ucat.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('text/plain', `restore-category:${ucat.id}`)
                  e.dataTransfer.effectAllowed = 'move'
                  setModDragHref(`restore-category:${ucat.id}`)
                }}
                onDragEnd={handleModDragEnd}
                style={{ margin: '4px', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', cursor: 'grab' }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', background: 'rgba(255,255,255,0.02)',
                  borderBottom: ucat.items.length > 0 ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {ucat.name}
                  </span>
                  <button
                    onClick={() => {
                      const cfg = getSidebarConfig()
                      setSidebarConfig({
                        ...cfg,
                        categories: [...cfg.categories, ucat],
                        unusedCategories: (cfg.unusedCategories || []).filter(c => c.id !== ucat.id),
                      })
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', padding: '2px 6px',
                      background: 'transparent', border: '1px solid var(--border)',
                      borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer',
                      fontSize: '9px', fontWeight: 600,
                    }}
                  >
                    Restore
                  </button>
                </div>
                {ucat.items.map(href => {
                  const item = resolveItem(href)
                  if (!item) return null
                  const Icon = item.icon
                  return (
                    <div key={href} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', opacity: 0.5 }}>
                      <Icon size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sidebarConfig.customNames[href] || item.label}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          </ResizablePanel>
        )
      })()}

      {/* Customize panel */}
      <ResizablePanel storageKey="sb-customize" title="Customize" panelId="customize" initialX={658} initialY={0} initialW={280} initialH={600} minW={200} minH={200} siblings={getSiblings('customize')} onRectChange={updatePanelRect('customize')} onSwap={handleSwap('customize')} forceRect={forceRects['customize']} swapTarget={swapHoverTarget === 'customize'} onSwapHover={setSwapHoverTarget}>
        <div style={{ padding: '8px 12px' }}>
          <div style={{ ...row, padding: '8px 0' }}>
            <span style={{ fontSize: '12px' }}>Header</span>
            <Toggle on={sidebarHeaderVisible} onToggle={v => setSidebarHeaderVisible(v)} label="Sidebar header" />
          </div>
          <div style={{ ...row, padding: '8px 0' }}>
            <span style={{ fontSize: '12px' }}>Logo</span>
            <Toggle on={sidebarLogoVisible} onToggle={v => setSidebarLogoVisible(v)} label="Sidebar logo" />
          </div>
          <div style={{ ...row, padding: '8px 0' }}>
            <span style={{ fontSize: '12px' }}>Search bar</span>
            <Toggle on={sidebarSearchVisible} onToggle={v => setSidebarSearchVisible(v)} label="Search bar" />
          </div>
          <div style={{ ...row, padding: '8px 0' }}>
            <span style={{ fontSize: '12px' }}>Width</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="range"
                min={100}
                max={400}
                defaultValue={sidebarDefaultWidth}
                onInput={e => {
                  const label = (e.target as HTMLInputElement).nextElementSibling
                  if (label) label.textContent = (e.target as HTMLInputElement).value + 'px'
                }}
                onMouseUp={e => setSidebarDefaultWidth(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={e => setSidebarDefaultWidth(Number((e.target as HTMLInputElement).value))}
                aria-label="Default sidebar width"
                style={{ width: '70px', accentColor: 'var(--accent)' }}
              />
              <span
                onDoubleClick={e => {
                  const span = e.currentTarget
                  const current = sidebarDefaultWidth
                  const input = document.createElement('input')
                  input.type = 'text'
                  input.inputMode = 'numeric'
                  input.value = String(current)
                  Object.assign(input.style, {
                    width: '40px', background: 'transparent', border: 'none',
                    borderBottom: '1px solid var(--accent)', color: 'var(--text-primary)',
                    fontSize: '10px', fontFamily: 'monospace', textAlign: 'center',
                    outline: 'none', padding: '0',
                  })
                  span.textContent = ''
                  span.appendChild(input)
                  input.focus()
                  input.select()
                  const commit = () => {
                    const w = Math.max(100, Math.min(400, parseInt(input.value, 10) || 200))
                    setSidebarDefaultWidth(w)
                    span.textContent = w + 'px'
                  }
                  input.addEventListener('blur', commit)
                  input.addEventListener('keydown', ev => {
                    if (ev.key === 'Enter') input.blur()
                    if (ev.key === 'Escape') { span.textContent = current + 'px' }
                  })
                }}
                style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', cursor: 'text', userSelect: 'none' }}
              >
                {sidebarDefaultWidth}px
              </span>
            </div>
          </div>
          <div style={{ ...row, padding: '8px 0' }}>
            <span style={{ fontSize: '12px' }}>Title</span>
            {!editingTitle ? (
              <span
                onDoubleClick={() => {
                  setTitleDraft(sidebarTitleText)
                  setEditingTitle(true)
                }}
                style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', cursor: 'text', userSelect: 'none' }}
              >
                {sidebarTitleText || 'OPENCLAW'}
              </span>
            ) : (
              <input
                autoFocus
                aria-label="Sidebar title text"
                defaultValue={sidebarTitleText}
                onBlur={e => {
                  const v = e.currentTarget.value.trim()
                  if (v) setSidebarTitleText(v)
                  setEditingTitle(false)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) setSidebarTitleText(v); setEditingTitle(false) }
                  if (e.key === 'Escape') { setSidebarTitleText(sidebarTitleText); setEditingTitle(false) }
                }}
                style={{
                  width: '90px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                  borderRadius: '6px', padding: '4px 8px', color: 'var(--text-primary)',
                  fontSize: '11px', fontFamily: 'monospace', textAlign: 'right', outline: 'none',
                }}
              />
            )}
          </div>
          <div style={{ ...row, padding: '8px 0' }}>
            <span style={{ fontSize: '12px' }}>Font size</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="range"
                min={10}
                max={40}
                defaultValue={sidebarTitleSize}
                onInput={e => {
                  const v = Number((e.target as HTMLInputElement).value)
                  setSidebarTitleSize(v)
                  const label = (e.target as HTMLInputElement).nextElementSibling
                  if (label) label.textContent = v + 'px'
                }}
                aria-label="Title font size"
                style={{ width: '60px', accentColor: 'var(--accent)' }}
              />
              <span
                onDoubleClick={e => {
                  const span = e.currentTarget
                  const current = sidebarTitleSize
                  const input = document.createElement('input')
                  input.type = 'text'
                  input.inputMode = 'numeric'
                  input.value = String(current)
                  Object.assign(input.style, {
                    width: '40px', background: 'transparent', border: 'none',
                    borderBottom: '1px solid var(--accent)', color: 'var(--text-primary)',
                    fontSize: '10px', fontFamily: 'monospace', textAlign: 'center',
                    outline: 'none', padding: '0',
                  })
                  span.textContent = ''
                  span.appendChild(input)
                  input.focus()
                  input.select()
                  const commit = () => {
                    const v = Math.max(10, Math.min(40, parseInt(input.value, 10) || 22))
                    setSidebarTitleSize(v)
                    span.textContent = v + 'px'
                  }
                  input.addEventListener('blur', commit)
                  input.addEventListener('keydown', ev => {
                    if (ev.key === 'Enter') input.blur()
                    if (ev.key === 'Escape') { span.textContent = current + 'px' }
                  })
                }}
                style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', cursor: 'text', userSelect: 'none' }}
              >
                {sidebarTitleSize}px
              </span>
            </div>
          </div>
          <div style={{ ...row, padding: '8px 0', borderBottom: 'none' }}>
            <span style={{ fontSize: '12px' }}>Layout</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['one-line', 'two-line'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => setSidebarTitleLayout(opt)}
                  style={{
                    padding: '3px 8px', fontSize: '10px',
                    fontWeight: sidebarTitleLayout === opt ? 600 : 450,
                    color: sidebarTitleLayout === opt ? 'var(--text-on-color)' : 'var(--text-secondary)',
                    background: sidebarTitleLayout === opt ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                    border: `1px solid ${sidebarTitleLayout === opt ? 'var(--border-accent)' : 'var(--border)'}`,
                    borderRadius: '6px', cursor: 'pointer',
                  }}
                >
                  {opt === 'one-line' ? '1 line' : '2 lines'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ ...row, padding: '8px 0' }}>
            <span style={{ fontSize: '12px' }}>Title bar</span>
            <Toggle on={titleBarVisible} onToggle={v => toggleTitleBar(v)} label="Window title bar" />
          </div>
          <div style={{ ...row, padding: '8px 0', borderBottom: 'none' }}>
            <span style={{ fontSize: '12px' }}>Auto-hide</span>
            <Toggle on={titleBarAutoHide} onToggle={v => setTitleBarAutoHide(v)} label="Auto-hide title bar" />
          </div>
        </div>
      </ResizablePanel>

      {/* Recycle Bin panel */}
      {(() => {
        const deleted = sidebarConfig.deletedItems || []
        return (
          <ResizablePanel storageKey="sb-recycle" title={`Recycle Bin ${deleted.length}`} panelId="recycle" initialX={394} initialY={294} initialW={250} initialH={306} minW={160} minH={100} siblings={getSiblings('recycle')} onRectChange={updatePanelRect('recycle')} onSwap={handleSwap('recycle')} forceRect={forceRects['recycle']} swapTarget={swapHoverTarget === 'recycle'} onSwapHover={setSwapHoverTarget}>
            <div style={{ padding: '4px 0' }}>
              {deleted.length === 0 && (
                <div style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                  Recycle bin is empty
                </div>
              )}
              {deleted.map(d => {
                const item = resolveItem(d.href)
                const Icon = item?.icon || FileText
                const name = sidebarConfig.customNames[d.href] || item?.label || d.href
                return (
                  <div key={d.href} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px',
                    borderRadius: '6px', margin: '0 4px', opacity: 0.6,
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; (e.currentTarget as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.opacity = '0.6' }}
                  >
                    <Icon size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', flex: 1 }}>{name}</span>
                    <button
                      onClick={() => restoreItem(d.href)}
                      style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => permanentlyDelete(d.href)}
                      style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', background: 'transparent', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '4px', color: 'var(--red)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}
                    >
                      Delete
                    </button>
                  </div>
                )
              })}
              {deleted.length > 0 && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', marginTop: '4px' }}>
                  <button
                    onClick={emptyRecycleBin}
                    style={{ ...btnSecondary, padding: '4px 10px', fontSize: '10px', color: 'var(--red)', borderColor: 'rgba(248,113,113,0.3)' }}
                  >
                    Empty Recycle Bin
                  </button>
                </div>
              )}
            </div>
          </ResizablePanel>
        )
      })()}

      {/* Combined resize handle — one panel left, multiple right */}
      {(() => {
        const ids = Object.keys(panelRects)
        const gap = GAP_BETWEEN_PANELS
        const combinedHandles: React.ReactNode[] = []

        // For each panel, find all panels adjacent to its right edge
        for (const leftId of ids) {
          const left = panelRects[leftId]
          if (!left) continue
          const leftRight = left.x + left.w
          const rightNeighbors = ids.filter(id => {
            if (id === leftId) return false
            const r = panelRects[id]
            if (!r) return false
            return r.x > leftRight && r.x - leftRight <= gap * 2
          })
          if (rightNeighbors.length < 2) continue // only create combined handle for 2+ neighbors

          // Compute the full vertical span
          const allRects = rightNeighbors.map(id => panelRects[id])
          const minY = Math.min(left.y, ...allRects.map(r => r.y))
          const maxY = Math.max(left.y + left.h, ...allRects.map(r => r.y + r.h))
          const handleX = leftRight
          const handleGap = (allRects[0]?.x || leftRight + gap) - leftRight

          combinedHandles.push(
            <div
              key={`combined-${leftId}`}
              onMouseDown={e => {
                e.preventDefault()
                const startX = e.clientX
                const origLeftW = left.w
                const origRights = rightNeighbors.map(id => ({ id, ...panelRects[id] }))
                const onMove = (ev: MouseEvent) => {
                  const dx = ev.clientX - startX
                  const newLeftW = Math.max(150, origLeftW + dx)
                  const actualDx = newLeftW - origLeftW
                  // Check if any right panel would be too small
                  const allValid = origRights.every(r => r.w - actualDx >= 150)
                  if (!allValid) return
                  const rev = Date.now() % 100000
                  const rects: Record<string, PanelRect & { _rev: number }> = {
                    [leftId]: { ...left, w: newLeftW, _rev: rev },
                  }
                  for (const r of origRights) {
                    rects[r.id] = { x: r.x + actualDx, y: r.y, w: r.w - actualDx, h: r.h, _rev: rev }
                  }
                  setForceRects(rects)
                }
                const onUp = () => {
                  document.removeEventListener('mousemove', onMove)
                  document.removeEventListener('mouseup', onUp)
                  document.body.style.cursor = ''
                  document.body.style.userSelect = ''
                }
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }}
              onMouseEnter={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '1' }}
              onMouseLeave={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '0' }}
              style={{
                position: 'absolute',
                left: handleX,
                top: minY,
                width: handleGap,
                height: maxY - minY,
                cursor: 'col-resize',
                zIndex: 99999,
              }}
            >
              <div style={{
                position: 'absolute', top: '10%', bottom: '10%', left: '50%', width: '1.5px', marginLeft: '-0.75px',
                background: 'var(--accent)', borderRadius: '1px', opacity: 0, transition: 'opacity 0.15s',
              }} />
            </div>,
          )
        }
        // Also check right-to-left: one panel on right, multiple on left
        for (const rightId of ids) {
          const right = panelRects[rightId]
          if (!right) continue
          const rightLeft = right.x
          const leftNeighbors = ids.filter(id => {
            if (id === rightId) return false
            const l = panelRects[id]
            if (!l) return false
            const lRight = l.x + l.w
            return lRight < rightLeft && rightLeft - lRight <= gap * 2
          })
          if (leftNeighbors.length < 2) continue

          const allRects = leftNeighbors.map(id => panelRects[id])
          const minY = Math.min(right.y, ...allRects.map(r => r.y))
          const maxY = Math.max(right.y + right.h, ...allRects.map(r => r.y + r.h))
          const handleGap = rightLeft - Math.max(...allRects.map(r => r.x + r.w))
          const handleX = rightLeft - handleGap

          combinedHandles.push(
            <div
              key={`combined-r-${rightId}`}
              onMouseDown={e => {
                e.preventDefault()
                const startX = e.clientX
                const origRightX = right.x, origRightW = right.w
                const origLefts = leftNeighbors.map(id => ({ id, ...panelRects[id] }))
                const onMove = (ev: MouseEvent) => {
                  const dx = ev.clientX - startX
                  const newRightX = origRightX + dx
                  const newRightW = Math.max(150, origRightW - dx)
                  if (newRightW < 150) return
                  const allValid = origLefts.every(l => l.w + dx >= 150)
                  if (!allValid) return
                  const rev = Date.now() % 100000
                  const rects: Record<string, PanelRect & { _rev: number }> = {
                    [rightId]: { x: newRightX, y: right.y, w: newRightW, h: right.h, _rev: rev },
                  }
                  for (const l of origLefts) {
                    rects[l.id] = { x: l.x, y: l.y, w: l.w + dx, h: l.h, _rev: rev }
                  }
                  setForceRects(rects)
                }
                const onUp = () => {
                  document.removeEventListener('mousemove', onMove)
                  document.removeEventListener('mouseup', onUp)
                  document.body.style.cursor = ''
                  document.body.style.userSelect = ''
                }
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }}
              onMouseEnter={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '1' }}
              onMouseLeave={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '0' }}
              style={{
                position: 'absolute',
                left: handleX,
                top: minY,
                width: handleGap,
                height: maxY - minY,
                cursor: 'col-resize',
                zIndex: 99999,
              }}
            >
              <div style={{
                position: 'absolute', top: '10%', bottom: '10%', left: '50%', width: '1.5px', marginLeft: '-0.75px',
                background: 'var(--accent)', borderRadius: '1px', opacity: 0, transition: 'opacity 0.15s',
              }} />
            </div>,
          )
        }

        return combinedHandles
      })()}

      {/* Shared resize handles between adjacent panels */}
      {(() => {
        const ids = Object.keys(panelRects)
        const gap = GAP_BETWEEN_PANELS

        const handles: React.ReactNode[] = []
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const a = panelRects[ids[i]], b = panelRects[ids[j]]
            if (!a || !b) continue
            const aRight = a.x + a.w, bLeft = b.x
            const bRight = b.x + b.w, aLeft = a.x
            // Vertical overlap check
            const vOverlap = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
            if (vOverlap > 20) {
              // a is left of b
              if (bLeft > aRight && bLeft - aRight <= gap * 2) {
                const top = Math.max(a.y, b.y)
                const bottom = Math.min(a.y + a.h, b.y + b.h)
                const leftId = ids[i], rightId = ids[j]
                handles.push(
                  <div
                    key={`h-${leftId}-${rightId}`}
                    onMouseDown={e => {
                      e.preventDefault()
                      const startX = e.clientX
                      const origAW = a.w, origBX = b.x, origBW = b.w
                      const onMove = (ev: MouseEvent) => {
                        const dx = ev.clientX - startX
                        const newAW = Math.max(150, origAW + dx)
                        const newBX = origBX + (newAW - origAW)
                        const newBW = Math.max(150, origBW - (newAW - origAW))
                        const newLeftRect = { ...a, w: newAW }
                        const newRightRect = { ...b, x: newBX, w: newBW }
                        if (newAW >= 150 && newBW >= 150 &&
                            !wouldOverlapOthers(newLeftRect, [leftId, rightId]) &&
                            !wouldOverlapOthers(newRightRect, [leftId, rightId])) {
                          const rev = Date.now() % 100000
                          setForceRects({
                            [leftId]: { ...newLeftRect, _rev: rev },
                            [rightId]: { ...newRightRect, _rev: rev },
                          })
                        }
                      }
                      const onUp = () => {
                        document.removeEventListener('mousemove', onMove)
                        document.removeEventListener('mouseup', onUp)
                        document.body.style.cursor = ''
                        document.body.style.userSelect = ''
                      }
                      document.body.style.cursor = 'col-resize'
                      document.body.style.userSelect = 'none'
                      document.addEventListener('mousemove', onMove)
                      document.addEventListener('mouseup', onUp)
                    }}
                    onMouseEnter={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '0' }}
                    style={{
                      position: 'absolute',
                      left: aRight,
                      top,
                      width: gap,
                      height: bottom - top,
                      cursor: 'col-resize',
                      zIndex: 99999,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: '10%', bottom: '10%', left: '50%', width: '1.5px', marginLeft: '-0.75px',
                      background: 'var(--accent)', borderRadius: '1px', opacity: 0, transition: 'opacity 0.15s',
                    }} />
                  </div>,
                )
              }
              // b is left of a
              if (aLeft > bRight && aLeft - bRight <= gap * 2) {
                const top = Math.max(a.y, b.y)
                const bottom = Math.min(a.y + a.h, b.y + b.h)
                const leftId = ids[j], rightId = ids[i]
                handles.push(
                  <div
                    key={`h-${leftId}-${rightId}`}
                    onMouseDown={e => {
                      e.preventDefault()
                      const startX = e.clientX
                      const origBW2 = b.w, origAX2 = a.x, origAW2 = a.w
                      const onMove = (ev: MouseEvent) => {
                        const dx = ev.clientX - startX
                        const newBW = Math.max(150, origBW2 + dx)
                        const newAX = origAX2 + (newBW - origBW2)
                        const newAW = Math.max(150, origAW2 - (newBW - origBW2))
                        const newLeftRect = { ...b, w: newBW }
                        const newRightRect = { ...a, x: newAX, w: newAW }
                        if (newBW >= 150 && newAW >= 150 &&
                            !wouldOverlapOthers(newLeftRect, [leftId, rightId]) &&
                            !wouldOverlapOthers(newRightRect, [leftId, rightId])) {
                          const rev = Date.now() % 100000
                          setForceRects({
                            [leftId]: { ...newLeftRect, _rev: rev },
                            [rightId]: { ...newRightRect, _rev: rev },
                          })
                        }
                      }
                      const onUp = () => {
                        document.removeEventListener('mousemove', onMove)
                        document.removeEventListener('mouseup', onUp)
                        document.body.style.cursor = ''
                        document.body.style.userSelect = ''
                      }
                      document.body.style.cursor = 'col-resize'
                      document.body.style.userSelect = 'none'
                      document.addEventListener('mousemove', onMove)
                      document.addEventListener('mouseup', onUp)
                    }}
                    onMouseEnter={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '0' }}
                    style={{
                      position: 'absolute',
                      left: bRight,
                      top,
                      width: gap,
                      height: bottom - top,
                      cursor: 'col-resize',
                      zIndex: 99999,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: '10%', bottom: '10%', left: '50%', width: '1.5px', marginLeft: '-0.75px',
                      background: 'var(--accent)', borderRadius: '1px', opacity: 0, transition: 'opacity 0.15s',
                    }} />
                  </div>,
                )
              }
            }
          }
        }
        // Check vertical adjacency (top/bottom)
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const a = panelRects[ids[i]], b = panelRects[ids[j]]
            if (!a || !b) continue
            const aBottom = a.y + a.h, bTop = b.y
            const bBottom = b.y + b.h, aTop = a.y
            const hOverlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
            if (hOverlap > 20) {
              // a is above b
              if (bTop > aBottom && bTop - aBottom <= gap * 2) {
                const left = Math.max(a.x, b.x)
                const right = Math.min(a.x + a.w, b.x + b.w)
                const topId = ids[i], bottomId = ids[j]
                handles.push(
                  <div
                    key={`v-${topId}-${bottomId}`}
                    onMouseDown={e => {
                      e.preventDefault()
                      const startY = e.clientY
                      const origAH = a.h, origBY = b.y, origBH = b.h
                      const onMove = (ev: MouseEvent) => {
                        const dy = ev.clientY - startY
                        const newAH = Math.max(100, origAH + dy)
                        const newBY = origBY + (newAH - origAH)
                        const newBH = Math.max(100, origBH - (newAH - origAH))
                        const newTopRect = { ...a, h: newAH }
                        const newBottomRect = { ...b, y: newBY, h: newBH }
                        if (newAH >= 100 && newBH >= 100 &&
                            !wouldOverlapOthers(newTopRect, [topId, bottomId]) &&
                            !wouldOverlapOthers(newBottomRect, [topId, bottomId])) {
                          const rev = Date.now() % 100000
                          setForceRects({
                            [topId]: { ...newTopRect, _rev: rev },
                            [bottomId]: { ...newBottomRect, _rev: rev },
                          })
                        }
                      }
                      const onUp = () => {
                        document.removeEventListener('mousemove', onMove)
                        document.removeEventListener('mouseup', onUp)
                        document.body.style.cursor = ''
                        document.body.style.userSelect = ''
                      }
                      document.body.style.cursor = 'row-resize'
                      document.body.style.userSelect = 'none'
                      document.addEventListener('mousemove', onMove)
                      document.addEventListener('mouseup', onUp)
                    }}
                    onMouseEnter={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '0' }}
                    style={{
                      position: 'absolute',
                      left,
                      top: aBottom,
                      width: right - left,
                      height: bTop - aBottom,
                      cursor: 'row-resize',
                      zIndex: 99999,
                    }}
                  >
                    <div style={{
                      position: 'absolute', left: '10%', right: '10%', top: '50%', height: '1.5px', marginTop: '-0.75px',
                      background: 'var(--accent)', borderRadius: '1px', opacity: 0, transition: 'opacity 0.15s',
                    }} />
                  </div>,
                )
              }
              // b is above a
              if (aTop > bBottom && aTop - bBottom <= gap * 2) {
                const left = Math.max(a.x, b.x)
                const right = Math.min(a.x + a.w, b.x + b.w)
                const topId = ids[j], bottomId = ids[i]
                handles.push(
                  <div
                    key={`v-${topId}-${bottomId}`}
                    onMouseDown={e => {
                      e.preventDefault()
                      const startY = e.clientY
                      const origBH = b.h, origAY = a.y, origAH = a.h
                      const onMove = (ev: MouseEvent) => {
                        const dy = ev.clientY - startY
                        const newBH = Math.max(100, origBH + dy)
                        const newAY = origAY + (newBH - origBH)
                        const newAH = Math.max(100, origAH - (newBH - origBH))
                        const newTopRect = { ...b, h: newBH }
                        const newBottomRect = { ...a, y: newAY, h: newAH }
                        if (newBH >= 100 && newAH >= 100 &&
                            !wouldOverlapOthers(newTopRect, [topId, bottomId]) &&
                            !wouldOverlapOthers(newBottomRect, [topId, bottomId])) {
                          const rev = Date.now() % 100000
                          setForceRects({
                            [topId]: { ...newTopRect, _rev: rev },
                            [bottomId]: { ...newBottomRect, _rev: rev },
                          })
                        }
                      }
                      const onUp = () => {
                        document.removeEventListener('mousemove', onMove)
                        document.removeEventListener('mouseup', onUp)
                        document.body.style.cursor = ''
                        document.body.style.userSelect = ''
                      }
                      document.body.style.cursor = 'row-resize'
                      document.body.style.userSelect = 'none'
                      document.addEventListener('mousemove', onMove)
                      document.addEventListener('mouseup', onUp)
                    }}
                    onMouseEnter={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '0' }}
                    style={{
                      position: 'absolute',
                      left,
                      top: bBottom,
                      width: right - left,
                      height: aTop - bBottom,
                      cursor: 'row-resize',
                      zIndex: 99999,
                    }}
                  >
                    <div style={{
                      position: 'absolute', left: '10%', right: '10%', top: '50%', height: '1.5px', marginTop: '-0.75px',
                      background: 'var(--accent)', borderRadius: '1px', opacity: 0, transition: 'opacity 0.15s',
                    }} />
                  </div>,
                )
              }
            }
          }
        }

        return handles
      })()}

      </div>{/* end scratchpad */}

      {/* Context menu for settings modules */}
      {settingsCtxMenu && <ContextMenu {...settingsCtxMenu} onClose={() => setSettingsCtxMenu(null)} />}
    </div>
  )
}
