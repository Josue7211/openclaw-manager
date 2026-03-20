import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DashboardTabs } from '@/components/dashboard/DashboardTabs'
import { DotIndicators } from '@/components/dashboard/DotIndicators'
import type { DashboardPage } from '@/lib/dashboard-store'

/* ── Mock dashboard-store ──────────────────────────────────────────────── */

const mockAddPage = vi.fn()
const mockRemovePage = vi.fn()
const mockRenamePage = vi.fn()
const mockSetActivePage = vi.fn()
const mockReorderPages = vi.fn()

vi.mock('@/lib/dashboard-store', () => ({
  addPage: (...args: unknown[]) => mockAddPage(...args),
  removePage: (...args: unknown[]) => mockRemovePage(...args),
  renamePage: (...args: unknown[]) => mockRenamePage(...args),
  setActivePage: (...args: unknown[]) => mockSetActivePage(...args),
  reorderPages: (...args: unknown[]) => mockReorderPages(...args),
}))

/* ── Helpers ───────────────────────────────────────────────────────────── */

const pages: DashboardPage[] = [
  { id: 'page-1', name: 'Home', sortOrder: 0, layouts: {}, widgetConfigs: {} },
  { id: 'page-2', name: 'Work', sortOrder: 1, layouts: {}, widgetConfigs: {} },
  { id: 'page-3', name: 'Monitor', sortOrder: 2, layouts: {}, widgetConfigs: {} },
]

function renderTabs(
  overrides: Partial<{
    pages: DashboardPage[]
    activePageId: string
    editMode: boolean
    dotIndicatorsEnabled: boolean
  }> = {},
) {
  return render(
    <DashboardTabs
      pages={overrides.pages ?? pages}
      activePageId={overrides.activePageId ?? 'page-1'}
      editMode={overrides.editMode ?? false}
      dotIndicatorsEnabled={overrides.dotIndicatorsEnabled ?? false}
    />,
  )
}

/* ── DashboardTabs ─────────────────────────────────────────────────────── */

describe('DashboardTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /* -- Rendering -- */

  it('renders a tab for each dashboard page with correct name', () => {
    renderTabs()
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Monitor')).toBeInTheDocument()
  })

  it('active tab has aria-selected true', () => {
    renderTabs({ activePageId: 'page-2' })
    const workTab = screen.getByRole('tab', { name: 'Work' })
    expect(workTab).toHaveAttribute('aria-selected', 'true')
  })

  it('inactive tabs have aria-selected false', () => {
    renderTabs({ activePageId: 'page-1' })
    const workTab = screen.getByRole('tab', { name: 'Work' })
    expect(workTab).toHaveAttribute('aria-selected', 'false')
  })

  it('tab has role="tab" and tablist has role="tablist"', () => {
    renderTabs()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBeGreaterThanOrEqual(3)
  })

  /* -- Click behavior -- */

  it('clicking inactive tab calls setActivePage with that page ID', () => {
    renderTabs({ activePageId: 'page-1' })
    fireEvent.click(screen.getByRole('tab', { name: 'Work' }))
    expect(mockSetActivePage).toHaveBeenCalledWith('page-2')
  })

  /* -- Add page -- */

  it('"+" button calls addPage("New Page")', () => {
    renderTabs()
    fireEvent.click(screen.getByLabelText('Add dashboard page'))
    expect(mockAddPage).toHaveBeenCalledWith('New Page')
  })

  /* -- Rename flow -- */

  it('double-clicking tab label enters inline rename mode', () => {
    renderTabs({ activePageId: 'page-1' })
    const homeTab = screen.getByRole('tab', { name: 'Home' })
    fireEvent.doubleClick(homeTab)
    const input = screen.getByDisplayValue('Home')
    expect(input).toBeInTheDocument()
    expect(input.tagName).toBe('INPUT')
  })

  it('pressing Enter in rename input commits the rename via renamePage()', async () => {
    const user = userEvent.setup()
    renderTabs({ activePageId: 'page-1' })
    const homeTab = screen.getByRole('tab', { name: 'Home' })
    fireEvent.doubleClick(homeTab)
    const input = screen.getByDisplayValue('Home')
    await user.clear(input)
    await user.type(input, 'Dashboard{Enter}')
    expect(mockRenamePage).toHaveBeenCalledWith('page-1', 'Dashboard')
  })

  it('pressing Escape in rename input cancels without renaming', async () => {
    const user = userEvent.setup()
    renderTabs({ activePageId: 'page-1' })
    const homeTab = screen.getByRole('tab', { name: 'Home' })
    fireEvent.doubleClick(homeTab)
    const input = screen.getByDisplayValue('Home')
    await user.clear(input)
    await user.type(input, 'NewName{Escape}')
    expect(mockRenamePage).not.toHaveBeenCalled()
  })

  it('rename input max length is 20 characters', () => {
    renderTabs({ activePageId: 'page-1' })
    const homeTab = screen.getByRole('tab', { name: 'Home' })
    fireEvent.doubleClick(homeTab)
    const input = screen.getByDisplayValue('Home') as HTMLInputElement
    expect(input.maxLength).toBe(20)
  })

  /* -- Delete flow -- */

  it('right-clicking tab shows context menu with "Delete page" option', () => {
    renderTabs()
    const workTab = screen.getByRole('tab', { name: 'Work' })
    fireEvent.contextMenu(workTab)
    expect(screen.getByText('Delete page')).toBeInTheDocument()
  })

  it('delete confirmation appears before actual deletion', () => {
    renderTabs()
    const workTab = screen.getByRole('tab', { name: 'Work' })
    fireEvent.contextMenu(workTab)
    fireEvent.click(screen.getByText('Delete page'))
    expect(screen.getByText(/Delete 'Work'/)).toBeInTheDocument()
    expect(mockRemovePage).not.toHaveBeenCalled()
  })

  it('confirming delete calls removePage', () => {
    renderTabs()
    const workTab = screen.getByRole('tab', { name: 'Work' })
    fireEvent.contextMenu(workTab)
    fireEvent.click(screen.getByText('Delete page'))
    fireEvent.click(screen.getByText('Delete'))
    expect(mockRemovePage).toHaveBeenCalledWith('page-2')
  })

  it('cannot delete the last remaining page (delete option hidden)', () => {
    const singlePage: DashboardPage[] = [
      { id: 'page-1', name: 'Home', sortOrder: 0, layouts: {}, widgetConfigs: {} },
    ]
    renderTabs({ pages: singlePage, activePageId: 'page-1' })
    const homeTab = screen.getByRole('tab', { name: 'Home' })
    fireEvent.contextMenu(homeTab)
    expect(screen.queryByText('Delete page')).not.toBeInTheDocument()
  })
})

/* ── DotIndicators ─────────────────────────────────────────────────────── */

describe('DotIndicators', () => {
  it('renders correct number of dots matching page count', () => {
    const { container } = render(
      <DotIndicators pageCount={3} activeIndex={0} visible />,
    )
    const dots = container.querySelectorAll('[data-dot]')
    expect(dots.length).toBe(3)
  })

  it('active dot uses accent color', () => {
    const { container } = render(
      <DotIndicators pageCount={3} activeIndex={1} visible />,
    )
    const dots = container.querySelectorAll('[data-dot]')
    const activeDot = dots[1] as HTMLElement
    expect(activeDot.style.background).toContain('var(--accent)')
  })

  it('inactive dots use muted color', () => {
    const { container } = render(
      <DotIndicators pageCount={3} activeIndex={1} visible />,
    )
    const dots = container.querySelectorAll('[data-dot]')
    const inactiveDot = dots[0] as HTMLElement
    expect(inactiveDot.style.opacity).toBe('0.3')
  })

  it('hidden when visible is false', () => {
    const { container } = render(
      <DotIndicators pageCount={3} activeIndex={0} visible={false} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
