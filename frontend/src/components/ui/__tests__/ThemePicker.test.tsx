import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock theme-store before importing ThemePicker
vi.mock('@/lib/theme-store', () => ({
  useThemeState: () => ({
    mode: 'dark',
    activeThemeId: 'default-dark',
    overrides: {},
    customThemes: [],
  }),
  setActiveTheme: vi.fn(),
  setMode: vi.fn(),
  setAccentOverride: vi.fn(),
}))

// Mock theme-engine (imported by theme-store)
vi.mock('@/lib/theme-engine', () => ({
  applyTheme: vi.fn(),
}))

import ThemePicker from '../../ThemePicker'
import { BUILT_IN_THEMES } from '@/lib/theme-definitions'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ThemePicker', () => {
  it('renders all 24 built-in theme cards when open', () => {
    render(<ThemePicker open={true} onClose={() => {}} />)

    const radios = screen.getAllByRole('radio')
    // 24 theme cards + 3 mode radio buttons = 27 radios total
    // Themes appear as role="radio" within radiogroup sections
    const themeRadios = radios.filter(r => r.getAttribute('aria-label')?.includes('theme'))
    expect(themeRadios.length).toBe(BUILT_IN_THEMES.length)
  })

  it('has role="dialog" and aria-modal="true"', () => {
    render(<ThemePicker open={true} onClose={() => {}} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Choose theme')
  })

  it('mode selector has 3 radio buttons (Dark, Light, System)', () => {
    render(<ThemePicker open={true} onClose={() => {}} />)

    const modeGroup = screen.getByRole('radiogroup', { name: 'Theme mode' })
    expect(modeGroup).toBeInTheDocument()

    const modeRadios = within(modeGroup).getAllByRole('radio')
    expect(modeRadios).toHaveLength(3)

    expect(modeRadios[0]).toHaveTextContent('Dark')
    expect(modeRadios[1]).toHaveTextContent('Light')
    expect(modeRadios[2]).toHaveTextContent('System')

    // Dark should be checked (matching state.mode)
    expect(modeRadios[0]).toHaveAttribute('aria-checked', 'true')
    expect(modeRadios[1]).toHaveAttribute('aria-checked', 'false')
    expect(modeRadios[2]).toHaveAttribute('aria-checked', 'false')
  })

  it('search input filters themes by name', async () => {
    const user = userEvent.setup()
    render(<ThemePicker open={true} onClose={() => {}} />)

    const searchInput = screen.getByPlaceholderText('Search themes...')
    await user.type(searchInput, 'Nord')

    // Only Nord should appear (plus mode radios)
    const themeRadios = screen.getAllByRole('radio').filter(r => r.getAttribute('aria-label')?.includes('theme'))
    expect(themeRadios.length).toBe(1)
    expect(themeRadios[0]).toHaveAttribute('aria-label', 'Nord theme')
  })

  it('shows empty state when search has no results', async () => {
    const user = userEvent.setup()
    render(<ThemePicker open={true} onClose={() => {}} />)

    const searchInput = screen.getByPlaceholderText('Search themes...')
    await user.type(searchInput, 'xyznonexistent')

    expect(screen.getByText('No matching themes')).toBeInTheDocument()
    expect(screen.getByText('Try a different search term.')).toBeInTheDocument()
  })

  it('does not render when open is false', () => {
    render(<ThemePicker open={false} onClose={() => {}} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders category section headings', () => {
    render(<ThemePicker open={true} onClose={() => {}} />)

    // "Dark" and "Light" appear twice each (once in mode selector, once as section heading)
    const darkElements = screen.getAllByText('Dark')
    expect(darkElements.length).toBeGreaterThanOrEqual(2) // mode button + section heading

    const lightElements = screen.getAllByText('Light')
    expect(lightElements.length).toBeGreaterThanOrEqual(2) // mode button + section heading

    // These only appear as section headings
    expect(screen.getByText('Colorful')).toBeInTheDocument()
    expect(screen.getByText('High Contrast')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })
})
