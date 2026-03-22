import { describe, it, expect } from 'vitest'
import {
  BUILTIN_WIDGETS,
  getWidget,
  getWidgetsByCategory,
  getWidgetBundles,
  getWidgetPresets,
  registerWidget,
} from '../widget-registry'
import type { WidgetDefinition } from '../widget-registry'

describe('BUILTIN_WIDGETS', () => {
  it('has exactly 24 entries', () => {
    expect(BUILTIN_WIDGETS).toHaveLength(24)
  })

  it('contains all expected widget IDs', () => {
    const ids = BUILTIN_WIDGETS.map(w => w.id)
    expect(ids).toContain('agent-status')
    expect(ids).toContain('heartbeat')
    expect(ids).toContain('agents')
    expect(ids).toContain('missions')
    expect(ids).toContain('memory')
    expect(ids).toContain('idea-briefing')
    expect(ids).toContain('network')
    expect(ids).toContain('sessions')
  })

  it('each entry has all required fields', () => {
    for (const widget of BUILTIN_WIDGETS) {
      expect(widget.id).toBeTruthy()
      expect(widget.name).toBeTruthy()
      expect(widget.description).toBeTruthy()
      expect(widget.icon).toBeTruthy()
      expect(widget.category).toBeTruthy()
      expect(widget.tier).toBe('builtin')
      expect(widget.defaultSize).toBeDefined()
      expect(widget.defaultSize.w).toBeGreaterThan(0)
      expect(widget.defaultSize.h).toBeGreaterThan(0)
      expect(typeof widget.component).toBe('function')
    }
  })
})

describe('getWidget', () => {
  it('returns a WidgetDefinition for "heartbeat"', () => {
    const widget = getWidget('heartbeat')
    expect(widget).toBeDefined()
    expect(widget!.id).toBe('heartbeat')
    expect(widget!.tier).toBe('builtin')
    expect(widget!.defaultSize).toEqual({ w: 1, h: 2 })
  })

  it('returns undefined for nonexistent widget', () => {
    expect(getWidget('nonexistent')).toBeUndefined()
  })

  it('returns correct metadata for agent-status', () => {
    const widget = getWidget('agent-status')
    expect(widget).toBeDefined()
    expect(widget!.category).toBe('monitoring')
    expect(widget!.icon).toBe('Robot')
    expect(widget!.defaultSize).toEqual({ w: 1, h: 2 })
    expect(widget!.minSize).toEqual({ w: 1, h: 2 })
  })

  it('returns correct metadata for agents', () => {
    const widget = getWidget('agents')
    expect(widget).toBeDefined()
    expect(widget!.category).toBe('ai')
    expect(widget!.icon).toBe('UsersThree')
    expect(widget!.defaultSize).toEqual({ w: 2, h: 3 })
    expect(widget!.minSize).toEqual({ w: 2, h: 2 })
  })

  it('returns correct metadata for missions', () => {
    const widget = getWidget('missions')
    expect(widget).toBeDefined()
    expect(widget!.category).toBe('productivity')
    expect(widget!.icon).toBe('Rocket')
    expect(widget!.defaultSize).toEqual({ w: 2, h: 3 })
  })

  it('returns correct metadata for memory', () => {
    const widget = getWidget('memory')
    expect(widget).toBeDefined()
    expect(widget!.category).toBe('productivity')
    expect(widget!.icon).toBe('Brain')
  })

  it('returns correct metadata for idea-briefing', () => {
    const widget = getWidget('idea-briefing')
    expect(widget).toBeDefined()
    expect(widget!.category).toBe('productivity')
    expect(widget!.icon).toBe('Lightbulb')
    expect(widget!.defaultSize).toEqual({ w: 2, h: 2 })
  })

  it('returns correct metadata for network', () => {
    const widget = getWidget('network')
    expect(widget).toBeDefined()
    expect(widget!.category).toBe('monitoring')
    expect(widget!.icon).toBe('WifiHigh')
  })

  it('returns correct metadata for sessions', () => {
    const widget = getWidget('sessions')
    expect(widget).toBeDefined()
    expect(widget!.category).toBe('monitoring')
    expect(widget!.icon).toBe('Terminal')
  })
})

describe('getWidgetsByCategory', () => {
  it('returns object with category keys', () => {
    const categories = getWidgetsByCategory()
    expect(categories).toHaveProperty('monitoring')
    expect(categories).toHaveProperty('productivity')
    expect(categories).toHaveProperty('ai')
  })

  it('monitoring contains correct widgets', () => {
    const categories = getWidgetsByCategory()
    const monitoringIds = categories['monitoring'].map(w => w.id)
    expect(monitoringIds).toContain('agent-status')
    expect(monitoringIds).toContain('heartbeat')
    expect(monitoringIds).toContain('network')
    expect(monitoringIds).toContain('sessions')
  })

  it('productivity contains correct widgets', () => {
    const categories = getWidgetsByCategory()
    const productivityIds = categories['productivity'].map(w => w.id)
    expect(productivityIds).toContain('missions')
    expect(productivityIds).toContain('memory')
    expect(productivityIds).toContain('idea-briefing')
  })

  it('ai contains correct widgets', () => {
    const categories = getWidgetsByCategory()
    const aiIds = categories['ai'].map(w => w.id)
    expect(aiIds).toContain('agents')
  })
})

describe('getWidgetBundles', () => {
  it('returns 5 bundles', () => {
    const bundles = getWidgetBundles()
    expect(bundles).toHaveLength(5)
  })

  it('has Agent Monitor bundle', () => {
    const bundles = getWidgetBundles()
    const agentMonitor = bundles.find(b => b.name === 'Agent Monitor')
    expect(agentMonitor).toBeDefined()
    expect(agentMonitor!.widgetIds).toEqual(['agent-status', 'agents', 'heartbeat'])
  })

  it('has Mission Control bundle', () => {
    const bundles = getWidgetBundles()
    const missionControl = bundles.find(b => b.name === 'Mission Control')
    expect(missionControl).toBeDefined()
    expect(missionControl!.widgetIds).toEqual(['missions', 'idea-briefing', 'pipeline-status'])
  })

  it('has System Overview bundle', () => {
    const bundles = getWidgetBundles()
    const systemOverview = bundles.find(b => b.name === 'System Overview')
    expect(systemOverview).toBeDefined()
    expect(systemOverview!.widgetIds).toEqual(['homelab-vms', 'network-status', 'network', 'sessions'])
  })

  it('has Daily Driver bundle', () => {
    const bundles = getWidgetBundles()
    const dailyDriver = bundles.find(b => b.name === 'Daily Driver')
    expect(dailyDriver).toBeDefined()
    expect(dailyDriver!.widgetIds).toEqual(['todos', 'calendar', 'reminders', 'inbox'])
  })

  it('has Media Suite bundle', () => {
    const bundles = getWidgetBundles()
    const mediaSuite = bundles.find(b => b.name === 'Media Suite')
    expect(mediaSuite).toBeDefined()
    expect(mediaSuite!.widgetIds).toEqual(['now-playing', 'upcoming-media'])
  })
})

describe('getWidgetPresets', () => {
  it('returns 4 presets', () => {
    const presets = getWidgetPresets()
    expect(presets).toHaveLength(4)
  })

  it('each preset has required fields', () => {
    const presets = getWidgetPresets()
    for (const preset of presets) {
      expect(preset.id).toBeTruthy()
      expect(preset.name).toBeTruthy()
      expect(preset.description).toBeTruthy()
      expect(preset.icon).toBeTruthy()
      expect(preset.widgets.length).toBeGreaterThan(0)
    }
  })

  it('each preset widget has pluginId and layout', () => {
    const presets = getWidgetPresets()
    for (const preset of presets) {
      for (const widget of preset.widgets) {
        expect(widget.pluginId).toBeTruthy()
        expect(widget.layout).toBeDefined()
        expect(typeof widget.layout.x).toBe('number')
        expect(typeof widget.layout.y).toBe('number')
        expect(widget.layout.w).toBeGreaterThan(0)
        expect(widget.layout.h).toBeGreaterThan(0)
      }
    }
  })

  it('all preset widget pluginIds reference registered widgets', () => {
    const presets = getWidgetPresets()
    for (const preset of presets) {
      for (const widget of preset.widgets) {
        expect(getWidget(widget.pluginId)).toBeDefined()
      }
    }
  })

  it('has Monitoring preset', () => {
    const presets = getWidgetPresets()
    const monitoring = presets.find(p => p.id === 'monitoring')
    expect(monitoring).toBeDefined()
    expect(monitoring!.widgets).toHaveLength(5)
  })

  it('has Productivity preset', () => {
    const presets = getWidgetPresets()
    const productivity = presets.find(p => p.id === 'productivity')
    expect(productivity).toBeDefined()
    expect(productivity!.widgets).toHaveLength(5)
  })

  it('has Notes Workspace preset', () => {
    const presets = getWidgetPresets()
    const notes = presets.find(p => p.id === 'notes-workspace')
    expect(notes).toBeDefined()
    expect(notes!.widgets).toHaveLength(2)
  })

  it('has Media Center preset', () => {
    const presets = getWidgetPresets()
    const media = presets.find(p => p.id === 'media-center')
    expect(media).toBeDefined()
    expect(media!.widgets).toHaveLength(3)
  })
})

describe('registerWidget', () => {
  it('registers a custom widget that can be retrieved with getWidget', () => {
    const customWidget: WidgetDefinition = {
      id: 'test-custom-widget',
      name: 'Test Widget',
      description: 'A test widget',
      icon: 'Star',
      category: 'custom',
      tier: 'user',
      defaultSize: { w: 1, h: 1 },
      component: () => Promise.resolve({ default: (() => null) as unknown as React.ComponentType }),
    }
    registerWidget(customWidget)
    const result = getWidget('test-custom-widget')
    expect(result).toBeDefined()
    expect(result!.name).toBe('Test Widget')
    expect(result!.tier).toBe('user')
  })

  it('accepts "primitives" as a valid category', () => {
    const primWidget: WidgetDefinition = {
      id: 'test-prim-widget',
      name: 'Primitive Widget',
      description: 'A primitives category widget',
      icon: 'Cube',
      category: 'primitives',
      tier: 'builtin',
      defaultSize: { w: 2, h: 2 },
      component: () => Promise.resolve({ default: (() => null) as unknown as React.ComponentType }),
    }
    registerWidget(primWidget)
    const result = getWidget('test-prim-widget')
    expect(result).toBeDefined()
    expect(result!.category).toBe('primitives')

    // Should also appear in getWidgetsByCategory under 'primitives'
    const categories = getWidgetsByCategory()
    expect(categories['primitives']).toBeDefined()
    const primIds = categories['primitives'].map(w => w.id)
    expect(primIds).toContain('test-prim-widget')
  })
})
