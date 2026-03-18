import { personalDashboardItems, agentDashboardItems } from './nav-items'

export interface SidebarCategory {
  id: string
  name: string
  items: string[] // hrefs in display order
}

export interface CustomModule {
  id: string
  name: string
}

export interface DeletedItem {
  href: string
  fromCatId: string
  deletedAt: number
}

export interface SidebarConfig {
  categories: SidebarCategory[]
  customNames: Record<string, string> // href -> custom display name
  customModules: CustomModule[]
  deletedItems?: DeletedItem[]
  unusedCategories?: SidebarCategory[] // categories moved to Unused
  recycledCategories?: SidebarCategory[] // categories moved to Recycle Bin
  panelTitles?: Record<string, string> // panelId -> custom title
}

const STORAGE_KEY = 'sidebar-config'

function getDefaultConfig(): SidebarConfig {
  return {
    categories: [
      {
        id: 'personal',
        name: 'Personal Dashboard',
        items: personalDashboardItems.map(i => i.href),
      },
      {
        id: 'agent',
        name: 'Agent Dashboard',
        items: agentDashboardItems.map(i => i.href),
      },
    ],
    customNames: {},
    customModules: [],
  }
}

// All known built-in hrefs
function getBuiltinHrefs(): Set<string> {
  return new Set([
    ...personalDashboardItems.map(i => i.href),
    ...agentDashboardItems.map(i => i.href),
  ])
}

// Ensure all known nav items are present (handles newly added modules)
function ensureComplete(config: SidebarConfig): SidebarConfig {
  const builtinHrefs = getBuiltinHrefs()
  const customHrefs = new Set((config.customModules || []).map(m => `/custom/${m.id}`))
  const allValidHrefs = new Set([...builtinHrefs, ...customHrefs])
  const configuredHrefs = new Set(config.categories.flatMap(c => c.items))

  const missingPersonal = personalDashboardItems
    .filter(i => !configuredHrefs.has(i.href))
    .map(i => i.href)
  const missingAgent = agentDashboardItems
    .filter(i => !configuredHrefs.has(i.href))
    .map(i => i.href)

  // Check if cleanup is needed: removed items or duplicates
  const allItems = config.categories.flatMap(c => c.items)
  const hasDupes = new Set(allItems).size !== allItems.length
  let hasInvalid = false
  for (const cat of config.categories) {
    if (cat.items.some(h => !allValidHrefs.has(h))) { hasInvalid = true; break }
  }
  if (missingPersonal.length === 0 && missingAgent.length === 0 && !hasDupes && !hasInvalid) {
    return config
  }

  // Deduplicate: each href should only appear once across all categories
  const seen = new Set<string>()
  const updated: SidebarConfig = {
    ...config,
    customModules: config.customModules || [],
    categories: config.categories.map(c => ({
      ...c,
      items: c.items.filter(h => {
        if (!allValidHrefs.has(h) || seen.has(h)) return false
        seen.add(h)
        return true
      }),
    })),
  }

  if (missingPersonal.length > 0) {
    const target = updated.categories.find(c => c.id === 'personal') || updated.categories[0]
    if (target) target.items = [...target.items, ...missingPersonal]
  }
  if (missingAgent.length > 0) {
    const target = updated.categories.find(c => c.id === 'agent') || updated.categories[updated.categories.length - 1]
    if (target) target.items = [...target.items, ...missingAgent]
  }

  return updated
}

const _listeners = new Set<() => void>()
let _cached: SidebarConfig | null = null

// Undo/redo stacks — stores serialized configs (max 30)
const _undoStack: string[] = []
const _redoStack: string[] = []
const MAX_UNDO = 30

export function getSidebarConfig(): SidebarConfig {
  if (_cached) return _cached
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as SidebarConfig
      if (parsed && Array.isArray(parsed.categories)) {
        if (!parsed.customModules) parsed.customModules = []
        const cleaned = ensureComplete(parsed)
        // Save cleaned version back if it changed
        const cleanedStr = JSON.stringify(cleaned)
        if (cleanedStr !== raw) localStorage.setItem(STORAGE_KEY, cleanedStr)
        _cached = cleaned
        return _cached
      }
    }
  } catch { /* fall through */ }
  _cached = getDefaultConfig()
  return _cached
}

export function setSidebarConfig(config: SidebarConfig): void {
  // Push current state to undo stack before changing
  const current = localStorage.getItem(STORAGE_KEY)
  if (current) {
    _undoStack.push(current)
    if (_undoStack.length > MAX_UNDO) _undoStack.shift()
  }
  // New edit invalidates redo history
  _redoStack.length = 0
  // Auto-clean standalone categories: remove empty ones, split multi-item ones
  const cleanedCats: SidebarCategory[] = []
  for (const c of config.categories) {
    if (c.name) {
      cleanedCats.push(c)
    } else if (c.items.length === 1) {
      cleanedCats.push(c)
    } else if (c.items.length > 1) {
      // Split each item into its own standalone category
      for (const item of c.items) {
        cleanedCats.push({ id: `standalone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: '', items: [item] })
      }
    }
    // empty standalones (items.length === 0) are dropped
  }
  config = { ...config, categories: cleanedCats }
  _cached = config
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  _listeners.forEach(fn => fn())
}

/** Undo the last sidebar config change. Returns true if undone. */
export function undoSidebarConfig(): boolean {
  const prev = _undoStack.pop()
  if (!prev) return false
  try {
    // Push current state to redo stack
    const current = localStorage.getItem(STORAGE_KEY)
    if (current) _redoStack.push(current)
    const parsed = JSON.parse(prev) as SidebarConfig
    _cached = parsed
    localStorage.setItem(STORAGE_KEY, prev)
    _listeners.forEach(fn => fn())
    return true
  } catch {
    return false
  }
}

/** Redo the last undone sidebar config change. Returns true if redone. */
export function redoSidebarConfig(): boolean {
  const next = _redoStack.pop()
  if (!next) return false
  try {
    // Push current state to undo stack
    const current = localStorage.getItem(STORAGE_KEY)
    if (current) _undoStack.push(current)
    const parsed = JSON.parse(next) as SidebarConfig
    _cached = parsed
    localStorage.setItem(STORAGE_KEY, next)
    _listeners.forEach(fn => fn())
    return true
  } catch {
    return false
  }
}

export function resetSidebarConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
  _cached = getDefaultConfig()
  _listeners.forEach(fn => fn())
}

export function subscribeSidebarConfig(fn: () => void): () => void {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

/** Move an item up or down within its category */
export function moveItem(href: string, direction: 'up' | 'down'): void {
  const config = getSidebarConfig()
  const newCategories = config.categories.map(c => ({ ...c, items: [...c.items] }))
  for (const cat of newCategories) {
    const idx = cat.items.indexOf(href)
    if (idx === -1) continue
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= cat.items.length) return
    // Swap
    ;[cat.items[idx], cat.items[targetIdx]] = [cat.items[targetIdx], cat.items[idx]]
    setSidebarConfig({ ...config, categories: newCategories })
    return
  }
}

/** Move an item from one category to another */
export function moveItemToCategory(href: string, fromCatId: string, toCatId: string, toIndex: number): void {
  const config = getSidebarConfig()
  const newCategories = config.categories.map(c => ({ ...c, items: [...c.items] }))

  const sourceCat = newCategories.find(c => c.id === fromCatId)
  const targetCat = newCategories.find(c => c.id === toCatId)
  if (!sourceCat || !targetCat) return

  sourceCat.items = sourceCat.items.filter(h => h !== href)
  targetCat.items.splice(toIndex, 0, href)
  setSidebarConfig({ ...config, categories: newCategories })
}

/** Rename a sidebar item */
export function renameItem(href: string, newName: string): void {
  const config = getSidebarConfig()
  const newCustomNames = { ...config.customNames }

  // For custom modules, also update the module name
  if (href.startsWith('/custom/')) {
    const modId = href.slice('/custom/'.length)
    const newMods = (config.customModules || []).map(m =>
      m.id === modId ? { ...m, name: newName } : m
    )
    if (!newName.trim()) {
      delete newCustomNames[href]
      setSidebarConfig({ ...config, customNames: newCustomNames, customModules: newMods })
    } else {
      newCustomNames[href] = newName
      setSidebarConfig({ ...config, customNames: newCustomNames, customModules: newMods })
    }
    return
  }

  if (!newName.trim()) {
    delete newCustomNames[href]
  } else {
    newCustomNames[href] = newName
  }
  setSidebarConfig({ ...config, customNames: newCustomNames })
}

/** Rename a category */
export function renameCategory(catId: string, newName: string): void {
  if (!newName.trim()) return
  const config = getSidebarConfig()
  setSidebarConfig({
    ...config,
    categories: config.categories.map(c =>
      c.id === catId ? { ...c, name: newName.trim() } : c
    ),
  })
}

/** Create a custom module and add it to a category */
export function createCustomModule(name: string, categoryId?: string): string {
  const config = getSidebarConfig()
  const id = `mod-${Date.now()}`
  const href = `/custom/${id}`
  const newMod: CustomModule = { id, name }

  // Add to specified category or the last one
  const targetCat = categoryId
    ? config.categories.find(c => c.id === categoryId)
    : config.categories[config.categories.length - 1]

  const newCategories = config.categories.map(c => {
    if (c === targetCat) {
      return { ...c, items: [...c.items, href] }
    }
    return c
  })

  setSidebarConfig({
    ...config,
    categories: newCategories,
    customModules: [...(config.customModules || []), newMod],
  })

  return href
}

/** Delete a custom module */
export function deleteCustomModule(modId: string): void {
  const config = getSidebarConfig()
  const href = `/custom/${modId}`
  setSidebarConfig({
    ...config,
    categories: config.categories.map(c => ({
      ...c,
      items: c.items.filter(h => h !== href),
    })),
    customModules: (config.customModules || []).filter(m => m.id !== modId),
    customNames: Object.fromEntries(
      Object.entries(config.customNames).filter(([k]) => k !== href)
    ),
  })
}

/** Soft-delete an item — move to recycle bin */
export function softDeleteItem(href: string): void {
  const config = getSidebarConfig()
  let fromCatId = ''
  for (const cat of config.categories) {
    if (cat.items.includes(href)) { fromCatId = cat.id; break }
  }
  const deleted: DeletedItem = { href, fromCatId, deletedAt: Date.now() }
  setSidebarConfig({
    ...config,
    categories: config.categories.map(c => ({
      ...c,
      items: c.items.filter(h => h !== href),
    })),
    deletedItems: [...(config.deletedItems || []), deleted],
  })
}

/** Restore an item from recycle bin */
export function restoreItem(href: string): void {
  const config = getSidebarConfig()
  const deleted = (config.deletedItems || []).find(d => d.href === href)
  if (!deleted) return
  const targetCat = config.categories.find(c => c.id === deleted.fromCatId) || config.categories[0]
  setSidebarConfig({
    ...config,
    categories: config.categories.map(c =>
      c === targetCat ? { ...c, items: [...c.items, href] } : c
    ),
    deletedItems: (config.deletedItems || []).filter(d => d.href !== href),
  })
}

/** Permanently delete from recycle bin */
export function permanentlyDelete(href: string): void {
  const config = getSidebarConfig()
  const isCustom = href.startsWith('/custom/')
  setSidebarConfig({
    ...config,
    deletedItems: (config.deletedItems || []).filter(d => d.href !== href),
    ...(isCustom ? {
      customModules: (config.customModules || []).filter(m => `/custom/${m.id}` !== href),
      customNames: Object.fromEntries(
        Object.entries(config.customNames).filter(([k]) => k !== href && !k.startsWith(href + '::'))
      ),
    } : {}),
  })
}

/** Clear recycle bin */
export function emptyRecycleBin(): void {
  const config = getSidebarConfig()
  const deleted = config.deletedItems || []
  let newCustomModules = config.customModules || []
  let newCustomNames = { ...config.customNames }
  for (const d of deleted) {
    if (d.href.startsWith('/custom/')) {
      newCustomModules = newCustomModules.filter(m => `/custom/${m.id}` !== d.href)
      newCustomNames = Object.fromEntries(
        Object.entries(newCustomNames).filter(([k]) => k !== d.href && !k.startsWith(d.href + '::'))
      )
    }
  }
  setSidebarConfig({ ...config, deletedItems: [], customModules: newCustomModules, customNames: newCustomNames })
}
