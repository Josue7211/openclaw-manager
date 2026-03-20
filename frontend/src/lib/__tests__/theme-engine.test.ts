import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../theme-definitions', () => {
  const draculaTheme = {
    id: 'dracula', name: 'Dracula', category: 'dark' as const, builtIn: true,
    colors: { 'bg-base': '#282a36', 'text-primary': '#f8f8f2', accent: '#bd93f9', 'glow-top-rgb': '189, 147, 249', 'green': '#50fa7b' },
  }
  const defaultDarkTheme = {
    id: 'default-dark', name: 'Default Dark', category: 'dark' as const, builtIn: true,
    colors: { 'bg-base': '#0a0a0c', 'text-primary': '#e4e4ec', accent: '#a78bfa', 'glow-top-rgb': '139, 92, 246', 'green': '#34d399' },
  }
  const defaultLightTheme = {
    id: 'default-light', name: 'Default Light', category: 'light' as const, builtIn: true,
    colors: { 'bg-base': '#f5f5f7', 'text-primary': '#1d1d1f', accent: '#7c3aed', 'glow-top-rgb': '124, 58, 237', 'green': '#059669' },
  }
  return {
    BUILT_IN_THEMES: [defaultDarkTheme, draculaTheme, defaultLightTheme],
    getThemeById: (id: string) => [defaultDarkTheme, draculaTheme, defaultLightTheme].find(t => t.id === id),
  }
})

vi.mock('../themes', () => ({
  applyAccentColor: vi.fn(),
  applyGlowColor: vi.fn(),
  applySecondaryColor: vi.fn(),
  applyTertiaryColor: vi.fn(),
  applyLogoColor: vi.fn(),
  DEFAULT_SECONDARY: '#34d399',
  DEFAULT_TERTIARY: '#818cf8',
}))

describe('theme-engine', () => {
  let setPropertySpy: ReturnType<typeof vi.fn>
  let matchMediaMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setPropertySpy = vi.fn()
    Object.defineProperty(document.documentElement, 'style', {
      value: { setProperty: setPropertySpy }, writable: true, configurable: true,
    })
    document.documentElement.dataset.theme = ''
    document.documentElement.dataset.themeId = ''
    matchMediaMock = vi.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)', media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    }))
    Object.defineProperty(window, 'matchMedia', { value: matchMediaMock, writable: true, configurable: true })
  })

  afterEach(() => { vi.restoreAllMocks() })

  describe('resolveThemeDefinition', () => {
    it('returns dracula preset for mode=dark and activeThemeId=dracula', async () => {
      const { resolveThemeDefinition } = await import('../theme-engine')
      const result = resolveThemeDefinition({ mode: 'dark', activeThemeId: 'dracula', overrides: {}, customThemes: [] })
      expect(result.id).toBe('dracula')
      expect(result.colors['bg-base']).toBe('#282a36')
    })

    it('returns activeThemeId for mode=system when OS is dark and theme is dark', async () => {
      const { resolveThemeDefinition } = await import('../theme-engine')
      const result = resolveThemeDefinition({ mode: 'system', activeThemeId: 'dracula', overrides: {}, customThemes: [] })
      expect(result.id).toBe('dracula')
    })

    it('returns default-light for mode=system when OS is light and activeThemeId is dark', async () => {
      matchMediaMock.mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: light)', media: query,
        addEventListener: vi.fn(), removeEventListener: vi.fn(),
        addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
      }))
      const { resolveThemeDefinition } = await import('../theme-engine')
      const result = resolveThemeDefinition({ mode: 'system', activeThemeId: 'dracula', overrides: {}, customThemes: [] })
      expect(result.id).toBe('default-light')
    })

    it('returns default-dark for mode=system when OS is dark and activeThemeId is light', async () => {
      const { resolveThemeDefinition } = await import('../theme-engine')
      const result = resolveThemeDefinition({ mode: 'system', activeThemeId: 'default-light', overrides: {}, customThemes: [] })
      expect(result.id).toBe('default-dark')
    })

    it('falls back to default-dark for unknown activeThemeId', async () => {
      const { resolveThemeDefinition } = await import('../theme-engine')
      const result = resolveThemeDefinition({ mode: 'dark', activeThemeId: 'nonexistent-theme', overrides: {}, customThemes: [] })
      expect(result.id).toBe('default-dark')
    })

    it('checks customThemes when ID not in BUILT_IN_THEMES', async () => {
      const { resolveThemeDefinition } = await import('../theme-engine')
      const customTheme = {
        id: 'my-custom', name: 'My Custom', category: 'dark' as const, builtIn: false,
        colors: { 'bg-base': '#111111', accent: '#ff0000', 'glow-top-rgb': '255, 0, 0', 'text-primary': '#fff' },
      }
      const result = resolveThemeDefinition({ mode: 'dark', activeThemeId: 'my-custom', overrides: {}, customThemes: [customTheme] })
      expect(result.id).toBe('my-custom')
    })
  })

  describe('deriveAlphaTints', () => {
    it('sets --accent-a10 to rgba(255, 0, 0, 0.1) for #ff0000', async () => {
      const { deriveAlphaTints } = await import('../theme-engine')
      deriveAlphaTints('#ff0000')
      expect(setPropertySpy).toHaveBeenCalledWith('--accent-a10', 'rgba(255, 0, 0, 0.1)')
    })

    it('sets --purple-a08 through --purple-a90', async () => {
      const { deriveAlphaTints } = await import('../theme-engine')
      deriveAlphaTints('#ff0000')
      expect(setPropertySpy).toHaveBeenCalledWith('--purple-a08', 'rgba(255, 0, 0, 0.08)')
      expect(setPropertySpy).toHaveBeenCalledWith('--purple-a90', 'rgba(255, 0, 0, 0.9)')
    })

    it('sets --border-accent from accent color', async () => {
      const { deriveAlphaTints } = await import('../theme-engine')
      deriveAlphaTints('#ff0000')
      expect(setPropertySpy).toHaveBeenCalledWith('--border-accent', 'rgba(255, 0, 0, 0.25)')
    })
  })

  describe('deriveSecondaryTints', () => {
    it('sets --secondary-a06 through --secondary-a45', async () => {
      const { deriveSecondaryTints } = await import('../theme-engine')
      deriveSecondaryTints('#34d399')
      expect(setPropertySpy).toHaveBeenCalledWith('--secondary-a06', 'rgba(52, 211, 153, 0.06)')
      expect(setPropertySpy).toHaveBeenCalledWith('--secondary-a08', 'rgba(52, 211, 153, 0.08)')
      expect(setPropertySpy).toHaveBeenCalledWith('--secondary-a12', 'rgba(52, 211, 153, 0.12)')
      expect(setPropertySpy).toHaveBeenCalledWith('--secondary-a14', 'rgba(52, 211, 153, 0.14)')
      expect(setPropertySpy).toHaveBeenCalledWith('--secondary-a15', 'rgba(52, 211, 153, 0.15)')
      expect(setPropertySpy).toHaveBeenCalledWith('--secondary-a20', 'rgba(52, 211, 153, 0.2)')
      expect(setPropertySpy).toHaveBeenCalledWith('--secondary-a25', 'rgba(52, 211, 153, 0.25)')
      expect(setPropertySpy).toHaveBeenCalledWith('--secondary-a30', 'rgba(52, 211, 153, 0.3)')
      expect(setPropertySpy).toHaveBeenCalledWith('--secondary-a45', 'rgba(52, 211, 153, 0.45)')
    })

    it('sets legacy --green-400-a* aliases', async () => {
      const { deriveSecondaryTints } = await import('../theme-engine')
      deriveSecondaryTints('#34d399')
      expect(setPropertySpy).toHaveBeenCalledWith('--green-400-a06', 'rgba(52, 211, 153, 0.06)')
      expect(setPropertySpy).toHaveBeenCalledWith('--green-400-a45', 'rgba(52, 211, 153, 0.45)')
    })

    it('sets legacy --emerald-a* and --green-a* aliases', async () => {
      const { deriveSecondaryTints } = await import('../theme-engine')
      deriveSecondaryTints('#34d399')
      expect(setPropertySpy).toHaveBeenCalledWith('--emerald-a12', 'rgba(52, 211, 153, 0.12)')
      expect(setPropertySpy).toHaveBeenCalledWith('--emerald-a15', 'rgba(52, 211, 153, 0.15)')
      expect(setPropertySpy).toHaveBeenCalledWith('--emerald-a20', 'rgba(52, 211, 153, 0.2)')
      expect(setPropertySpy).toHaveBeenCalledWith('--green-a12', 'rgba(52, 211, 153, 0.12)')
      expect(setPropertySpy).toHaveBeenCalledWith('--green-a15', 'rgba(52, 211, 153, 0.15)')
      expect(setPropertySpy).toHaveBeenCalledWith('--green-a25', 'rgba(52, 211, 153, 0.25)')
    })
  })

  describe('deriveTertiaryTints', () => {
    it('sets --tertiary-a12 and --tertiary-a15', async () => {
      const { deriveTertiaryTints } = await import('../theme-engine')
      deriveTertiaryTints('#818cf8')
      expect(setPropertySpy).toHaveBeenCalledWith('--tertiary-a12', 'rgba(129, 140, 248, 0.12)')
      expect(setPropertySpy).toHaveBeenCalledWith('--tertiary-a15', 'rgba(129, 140, 248, 0.15)')
    })

    it('sets legacy --blue-a12 and --blue-a15 aliases', async () => {
      const { deriveTertiaryTints } = await import('../theme-engine')
      deriveTertiaryTints('#818cf8')
      expect(setPropertySpy).toHaveBeenCalledWith('--blue-a12', 'rgba(129, 140, 248, 0.12)')
      expect(setPropertySpy).toHaveBeenCalledWith('--blue-a15', 'rgba(129, 140, 248, 0.15)')
    })
  })

  describe('applyTheme', () => {
    it('sets --bg-base CSS property from preset colors', async () => {
      const { applyTheme } = await import('../theme-engine')
      applyTheme({ mode: 'dark', activeThemeId: 'dracula', overrides: {}, customThemes: [] })
      expect(setPropertySpy).toHaveBeenCalledWith('--bg-base', '#282a36')
    })

    it('sets data-theme=light for light category presets', async () => {
      const { applyTheme } = await import('../theme-engine')
      applyTheme({ mode: 'light', activeThemeId: 'default-light', overrides: {}, customThemes: [] })
      expect(document.documentElement.dataset.theme).toBe('light')
    })

    it('sets data-theme=dark for dark category presets', async () => {
      const { applyTheme } = await import('../theme-engine')
      applyTheme({ mode: 'dark', activeThemeId: 'dracula', overrides: {}, customThemes: [] })
      expect(document.documentElement.dataset.theme).toBe('dark')
    })

    it('applies user accent override over preset default', async () => {
      const { applyAccentColor } = await import('../themes')
      const { applyTheme } = await import('../theme-engine')
      applyTheme({ mode: 'dark', activeThemeId: 'dracula', overrides: { dracula: { themeId: 'dracula', accent: '#ff0000' } }, customThemes: [] })
      expect(applyAccentColor).toHaveBeenCalledWith('#ff0000')
    })

    it('calls applySecondaryColor with green from theme def', async () => {
      const { applySecondaryColor } = await import('../themes')
      const { applyTheme } = await import('../theme-engine')
      applyTheme({ mode: 'dark', activeThemeId: 'dracula', overrides: {}, customThemes: [] })
      expect(applySecondaryColor).toHaveBeenCalledWith('#50fa7b')
    })

    it('calls applyTertiaryColor', async () => {
      const { applyTertiaryColor } = await import('../themes')
      const { applyTheme } = await import('../theme-engine')
      applyTheme({ mode: 'dark', activeThemeId: 'dracula', overrides: {}, customThemes: [] })
      expect(applyTertiaryColor).toHaveBeenCalled()
    })
  })

  describe('applyFontScale', () => {
    it('sets --text-base to 18px for scale 1.2', async () => {
      const { applyFontScale } = await import('../theme-engine')
      applyFontScale(1.2)
      expect(setPropertySpy).toHaveBeenCalledWith('--text-base', '18px')
    })

    it('sets --text-sm to 10.4px for scale 0.8', async () => {
      const { applyFontScale } = await import('../theme-engine')
      applyFontScale(0.8)
      expect(setPropertySpy).toHaveBeenCalledWith('--text-sm', '10.4px')
    })
  })

  describe('performRippleTransition', () => {
    it('runs apply function directly when startViewTransition is undefined', async () => {
      // @ts-expect-error -- testing non-standard API
      document.startViewTransition = undefined
      const { performRippleTransition } = await import('../theme-engine')
      const applyFn = vi.fn()
      performRippleTransition(applyFn, 100, 100)
      expect(applyFn).toHaveBeenCalled()
    })
  })
})
