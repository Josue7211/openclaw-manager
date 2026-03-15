import { describe, it, expect, vi, beforeEach } from 'vitest'

// Module keeps state in module-level variables — re-import for each test
let getSidebarConfig: typeof import('../sidebar-config').getSidebarConfig
let setSidebarConfig: typeof import('../sidebar-config').setSidebarConfig
let resetSidebarConfig: typeof import('../sidebar-config').resetSidebarConfig
let subscribeSidebarConfig: typeof import('../sidebar-config').subscribeSidebarConfig
let moveItem: typeof import('../sidebar-config').moveItem
let moveItemToCategory: typeof import('../sidebar-config').moveItemToCategory
let renameItem: typeof import('../sidebar-config').renameItem
let renameCategory: typeof import('../sidebar-config').renameCategory
let createCustomModule: typeof import('../sidebar-config').createCustomModule
let deleteCustomModule: typeof import('../sidebar-config').deleteCustomModule
let softDeleteItem: typeof import('../sidebar-config').softDeleteItem
let restoreItem: typeof import('../sidebar-config').restoreItem
let permanentlyDelete: typeof import('../sidebar-config').permanentlyDelete
let emptyRecycleBin: typeof import('../sidebar-config').emptyRecycleBin
let undoSidebarConfig: typeof import('../sidebar-config').undoSidebarConfig
let redoSidebarConfig: typeof import('../sidebar-config').redoSidebarConfig

async function loadModule() {
  vi.resetModules()
  const mod = await import('../sidebar-config')
  getSidebarConfig = mod.getSidebarConfig
  setSidebarConfig = mod.setSidebarConfig
  resetSidebarConfig = mod.resetSidebarConfig
  subscribeSidebarConfig = mod.subscribeSidebarConfig
  moveItem = mod.moveItem
  moveItemToCategory = mod.moveItemToCategory
  renameItem = mod.renameItem
  renameCategory = mod.renameCategory
  createCustomModule = mod.createCustomModule
  deleteCustomModule = mod.deleteCustomModule
  softDeleteItem = mod.softDeleteItem
  restoreItem = mod.restoreItem
  permanentlyDelete = mod.permanentlyDelete
  emptyRecycleBin = mod.emptyRecycleBin
  undoSidebarConfig = mod.undoSidebarConfig
  redoSidebarConfig = mod.redoSidebarConfig
}

beforeEach(async () => {
  localStorage.clear()
  await loadModule()
})

describe('getSidebarConfig', () => {
  it('returns default config when localStorage is empty', () => {
    const config = getSidebarConfig()
    expect(config.categories).toHaveLength(2)
    expect(config.categories[0].id).toBe('personal')
    expect(config.categories[1].id).toBe('agent')
    expect(config.customNames).toEqual({})
    expect(config.customModules).toEqual([])
  })

  it('returns cached value on subsequent calls', () => {
    const first = getSidebarConfig()
    const second = getSidebarConfig()
    expect(first).toBe(second) // Same object reference
  })

  it('reads config from localStorage if present', async () => {
    const stored = {
      categories: [
        { id: 'personal', name: 'My Personal', items: ['/'] },
        { id: 'agent', name: 'My Agents', items: ['/dashboard'] },
      ],
      customNames: { '/': 'My Home' },
      customModules: [],
    }
    localStorage.setItem('sidebar-config', JSON.stringify(stored))
    await loadModule()
    const config = getSidebarConfig()
    expect(config.customNames).toEqual({ '/': 'My Home' })
    // ensureComplete adds missing items
    expect(config.categories[0].items).toContain('/')
  })

  it('falls back to defaults on invalid JSON', async () => {
    localStorage.setItem('sidebar-config', 'not-valid-json')
    await loadModule()
    const config = getSidebarConfig()
    expect(config.categories).toHaveLength(2)
    expect(config.categories[0].id).toBe('personal')
  })

  it('adds missing nav items via ensureComplete', async () => {
    // Store config with only one personal item — rest should be appended
    const stored = {
      categories: [
        { id: 'personal', name: 'Personal Dashboard', items: ['/'] },
        { id: 'agent', name: 'Agent Dashboard', items: ['/dashboard'] },
      ],
      customNames: {},
      customModules: [],
    }
    localStorage.setItem('sidebar-config', JSON.stringify(stored))
    await loadModule()
    const config = getSidebarConfig()
    // Should have more items than what was stored (missing items appended)
    expect(config.categories[0].items.length).toBeGreaterThan(1)
    expect(config.categories[0].items).toContain('/chat')
    expect(config.categories[1].items).toContain('/missions')
  })

  it('deduplicates items across categories', async () => {
    const stored = {
      categories: [
        { id: 'personal', name: 'Personal', items: ['/', '/chat', '/chat'] },
        { id: 'agent', name: 'Agent', items: ['/dashboard', '/'] },
      ],
      customNames: {},
      customModules: [],
    }
    localStorage.setItem('sidebar-config', JSON.stringify(stored))
    await loadModule()
    const config = getSidebarConfig()
    const allItems = config.categories.flatMap(c => c.items)
    const unique = new Set(allItems)
    expect(allItems.length).toBe(unique.size)
  })
})

describe('setSidebarConfig', () => {
  it('persists config to localStorage', () => {
    const config = getSidebarConfig()
    const modified = { ...config, customNames: { '/': 'Home Base' } }
    setSidebarConfig(modified)
    const stored = JSON.parse(localStorage.getItem('sidebar-config')!)
    expect(stored.customNames).toEqual({ '/': 'Home Base' })
  })

  it('notifies subscribers', () => {
    const cb = vi.fn()
    subscribeSidebarConfig(cb)
    setSidebarConfig(getSidebarConfig())
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('pushes current state to undo stack', () => {
    setSidebarConfig(getSidebarConfig()) // initial set
    const config = getSidebarConfig()
    setSidebarConfig({ ...config, customNames: { '/': 'Changed' } })
    // Undo should bring back previous state
    const undone = undoSidebarConfig()
    expect(undone).toBe(true)
  })

  it('clears redo stack on new edit', () => {
    const config = getSidebarConfig()
    setSidebarConfig({ ...config, customNames: { '/': 'A' } })
    setSidebarConfig({ ...config, customNames: { '/': 'B' } })
    undoSidebarConfig() // undo B -> A
    // Now redo stack has one entry
    // New edit should clear it
    setSidebarConfig({ ...config, customNames: { '/': 'C' } })
    const redone = redoSidebarConfig()
    expect(redone).toBe(false) // redo stack cleared
  })
})

describe('resetSidebarConfig', () => {
  it('clears localStorage and restores defaults', () => {
    const config = getSidebarConfig()
    setSidebarConfig({ ...config, customNames: { '/': 'Custom' } })
    resetSidebarConfig()
    expect(localStorage.getItem('sidebar-config')).toBeNull()
    expect(getSidebarConfig().customNames).toEqual({})
  })

  it('notifies subscribers', () => {
    const cb = vi.fn()
    subscribeSidebarConfig(cb)
    resetSidebarConfig()
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('subscribeSidebarConfig', () => {
  it('returns an unsubscribe function that stops notifications', () => {
    const cb = vi.fn()
    const unsub = subscribeSidebarConfig(cb)
    unsub()
    setSidebarConfig(getSidebarConfig())
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('moveItem', () => {
  it('moves an item up within its category', () => {
    const config = getSidebarConfig()
    const secondItem = config.categories[0].items[1]
    moveItem(secondItem, 'up')
    const updated = getSidebarConfig()
    expect(updated.categories[0].items[0]).toBe(secondItem)
  })

  it('moves an item down within its category', () => {
    const config = getSidebarConfig()
    const firstItem = config.categories[0].items[0]
    moveItem(firstItem, 'down')
    const updated = getSidebarConfig()
    expect(updated.categories[0].items[1]).toBe(firstItem)
  })

  it('does nothing when moving first item up', () => {
    const config = getSidebarConfig()
    const firstItem = config.categories[0].items[0]
    const originalOrder = [...config.categories[0].items]
    moveItem(firstItem, 'up')
    const updated = getSidebarConfig()
    expect(updated.categories[0].items).toEqual(originalOrder)
  })

  it('does nothing when moving last item down', () => {
    const config = getSidebarConfig()
    const items = config.categories[0].items
    const lastItem = items[items.length - 1]
    const originalOrder = [...items]
    moveItem(lastItem, 'down')
    const updated = getSidebarConfig()
    expect(updated.categories[0].items).toEqual(originalOrder)
  })

  it('does nothing for an unknown href', () => {
    const config = getSidebarConfig()
    const original = JSON.stringify(config)
    moveItem('/nonexistent', 'up')
    // Config should be unchanged (no setSidebarConfig called)
    expect(JSON.stringify(getSidebarConfig())).toBe(original)
  })
})

describe('moveItemToCategory', () => {
  it('moves an item between categories', () => {
    const config = getSidebarConfig()
    const href = config.categories[0].items[0]
    moveItemToCategory(href, 'personal', 'agent', 0)
    const updated = getSidebarConfig()
    expect(updated.categories[0].items).not.toContain(href)
    expect(updated.categories[1].items[0]).toBe(href)
  })

  it('inserts at specified index', () => {
    const config = getSidebarConfig()
    const href = config.categories[0].items[0]
    moveItemToCategory(href, 'personal', 'agent', 2)
    const updated = getSidebarConfig()
    expect(updated.categories[1].items[2]).toBe(href)
  })

  it('does nothing with invalid category IDs', () => {
    const config = getSidebarConfig()
    const original = JSON.stringify(config)
    moveItemToCategory('/', 'nonexistent', 'agent', 0)
    // Should not change since source category doesn't exist
    expect(JSON.stringify(getSidebarConfig())).toBe(original)
  })
})

describe('renameItem', () => {
  it('sets a custom name for an item', () => {
    renameItem('/', 'Home Base')
    const config = getSidebarConfig()
    expect(config.customNames['/']).toBe('Home Base')
  })

  it('removes custom name when given empty string', () => {
    renameItem('/', 'Home Base')
    renameItem('/', '')
    const config = getSidebarConfig()
    expect(config.customNames['/']).toBeUndefined()
  })

  it('also updates the module name for custom modules', () => {
    const href = createCustomModule('My Widget', 'personal')
    renameItem(href, 'Renamed Widget')
    const config = getSidebarConfig()
    expect(config.customNames[href]).toBe('Renamed Widget')
    const modId = href.slice('/custom/'.length)
    const mod = config.customModules.find(m => m.id === modId)
    expect(mod!.name).toBe('Renamed Widget')
  })
})

describe('renameCategory', () => {
  it('renames an existing category', () => {
    renameCategory('personal', 'My Stuff')
    const config = getSidebarConfig()
    expect(config.categories.find(c => c.id === 'personal')!.name).toBe('My Stuff')
  })

  it('does nothing when given empty name', () => {
    const original = getSidebarConfig().categories.find(c => c.id === 'personal')!.name
    renameCategory('personal', '  ')
    const config = getSidebarConfig()
    expect(config.categories.find(c => c.id === 'personal')!.name).toBe(original)
  })

  it('trims whitespace from name', () => {
    renameCategory('personal', '  Trimmed  ')
    const config = getSidebarConfig()
    expect(config.categories.find(c => c.id === 'personal')!.name).toBe('Trimmed')
  })
})

describe('createCustomModule', () => {
  it('returns a href starting with /custom/', () => {
    const href = createCustomModule('Test Module')
    expect(href).toMatch(/^\/custom\/mod-\d+$/)
  })

  it('adds the module to customModules', () => {
    createCustomModule('Test Module')
    const config = getSidebarConfig()
    expect(config.customModules).toHaveLength(1)
    expect(config.customModules[0].name).toBe('Test Module')
  })

  it('adds the href to the last category by default', () => {
    const href = createCustomModule('Test Module')
    const config = getSidebarConfig()
    const lastCat = config.categories[config.categories.length - 1]
    expect(lastCat.items).toContain(href)
  })

  it('adds the href to a specified category', () => {
    const href = createCustomModule('Test Module', 'personal')
    const config = getSidebarConfig()
    expect(config.categories.find(c => c.id === 'personal')!.items).toContain(href)
  })
})

describe('deleteCustomModule', () => {
  it('removes the module from customModules and all categories', () => {
    const href = createCustomModule('Test Module')
    const modId = href.slice('/custom/'.length)
    deleteCustomModule(modId)
    const config = getSidebarConfig()
    expect(config.customModules).toHaveLength(0)
    const allItems = config.categories.flatMap(c => c.items)
    expect(allItems).not.toContain(href)
  })

  it('removes custom names for the deleted module', () => {
    const href = createCustomModule('Test Module')
    renameItem(href, 'Custom Name')
    const modId = href.slice('/custom/'.length)
    deleteCustomModule(modId)
    const config = getSidebarConfig()
    expect(config.customNames[href]).toBeUndefined()
  })
})

describe('softDeleteItem', () => {
  it('moves an item to deletedItems and removes from category', () => {
    softDeleteItem('/chat')
    const config = getSidebarConfig()
    const allItems = config.categories.flatMap(c => c.items)
    expect(allItems).not.toContain('/chat')
    expect(config.deletedItems).toHaveLength(1)
    expect(config.deletedItems![0].href).toBe('/chat')
    expect(config.deletedItems![0].fromCatId).toBe('personal')
  })

  it('records deletedAt timestamp', () => {
    const before = Date.now()
    softDeleteItem('/chat')
    const config = getSidebarConfig()
    expect(config.deletedItems![0].deletedAt).toBeGreaterThanOrEqual(before)
  })
})

describe('restoreItem', () => {
  it('restores an item from deletedItems to its original category', () => {
    softDeleteItem('/chat')
    restoreItem('/chat')
    const config = getSidebarConfig()
    expect(config.deletedItems).toHaveLength(0)
    const personalItems = config.categories.find(c => c.id === 'personal')!.items
    expect(personalItems).toContain('/chat')
  })

  it('does nothing if the item is not in deletedItems', () => {
    const before = JSON.stringify(getSidebarConfig())
    restoreItem('/nonexistent')
    expect(JSON.stringify(getSidebarConfig())).toBe(before)
  })

  it('restores to first category if original category no longer exists', () => {
    // Delete from personal, then rename personal's id so it won't match
    softDeleteItem('/chat')
    const config = getSidebarConfig()
    // Manually modify the stored deleted item's fromCatId to a non-existing one
    const modified = {
      ...config,
      deletedItems: config.deletedItems!.map(d => ({ ...d, fromCatId: 'nonexistent' })),
    }
    setSidebarConfig(modified)
    restoreItem('/chat')
    const updated = getSidebarConfig()
    expect(updated.deletedItems).toHaveLength(0)
    // Falls back to first category
    expect(updated.categories[0].items).toContain('/chat')
  })
})

describe('permanentlyDelete', () => {
  it('removes item from deletedItems', () => {
    softDeleteItem('/chat')
    permanentlyDelete('/chat')
    const config = getSidebarConfig()
    expect(config.deletedItems).toHaveLength(0)
  })

  it('also removes custom module data for custom hrefs', () => {
    const href = createCustomModule('Widget')
    softDeleteItem(href)
    permanentlyDelete(href)
    const config = getSidebarConfig()
    expect(config.customModules).toHaveLength(0)
    expect(config.deletedItems).toHaveLength(0)
  })
})

describe('emptyRecycleBin', () => {
  it('clears all deleted items', () => {
    softDeleteItem('/chat')
    softDeleteItem('/todos')
    emptyRecycleBin()
    const config = getSidebarConfig()
    expect(config.deletedItems).toEqual([])
  })

  it('cleans up custom module data for deleted custom modules', () => {
    const href = createCustomModule('Widget')
    renameItem(href, 'Named Widget')
    softDeleteItem(href)
    emptyRecycleBin()
    const config = getSidebarConfig()
    expect(config.customModules).toHaveLength(0)
    expect(config.customNames[href]).toBeUndefined()
  })
})

describe('undoSidebarConfig / redoSidebarConfig', () => {
  it('undo returns false when nothing to undo', () => {
    expect(undoSidebarConfig()).toBe(false)
  })

  it('redo returns false when nothing to redo', () => {
    expect(redoSidebarConfig()).toBe(false)
  })

  it('undo reverses the last change', () => {
    renameItem('/', 'Original Name')
    renameItem('/', 'Changed Name')
    expect(getSidebarConfig().customNames['/']).toBe('Changed Name')
    undoSidebarConfig()
    expect(getSidebarConfig().customNames['/']).toBe('Original Name')
  })

  it('redo re-applies the last undone change', () => {
    renameItem('/', 'Original Name')
    renameItem('/', 'Changed Name')
    undoSidebarConfig()
    expect(getSidebarConfig().customNames['/']).toBe('Original Name')
    redoSidebarConfig()
    expect(getSidebarConfig().customNames['/']).toBe('Changed Name')
  })

  it('multiple undo/redo cycles work', () => {
    renameItem('/', 'A')
    renameItem('/', 'B')
    renameItem('/', 'C')
    undoSidebarConfig() // C -> B
    undoSidebarConfig() // B -> A
    expect(getSidebarConfig().customNames['/']).toBe('A')
    redoSidebarConfig() // A -> B
    expect(getSidebarConfig().customNames['/']).toBe('B')
    redoSidebarConfig() // B -> C
    expect(getSidebarConfig().customNames['/']).toBe('C')
  })
})
