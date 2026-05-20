import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'

const {
  mockMoveItemToCategory,
  mockMoveCategoryToIndex,
  mockNavigate,
  sidebarConfig,
  dashboardState,
  unreadCounts,
  themeState,
  enabledModules,
} = vi.hoisted(() => ({
  mockMoveItemToCategory: vi.fn(),
  mockMoveCategoryToIndex: vi.fn(),
  mockNavigate: vi.fn(),
  sidebarConfig: {
    categories: [
      { id: 'personal', name: 'Personal Dashboard', items: ['/homelab', '/media'] },
      { id: 'training', name: 'Training', items: [] },
      { id: 'homelab-cat', name: 'Homelab', items: [] },
    ],
    customNames: {},
    customModules: [],
    collapsedCategories: {},
  },
  dashboardState: { pages: [], activePageId: null },
  unreadCounts: {},
  themeState: { pageOverrides: {}, categoryOverrides: {}, customThemes: [] },
  enabledModules: ['homelab', 'media'],
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: React.PropsWithChildren<{ to: string }>) => <a href="#" data-to={to} {...props}>{children}</a>,
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => mockNavigate,
}))

vi.mock('@/lib/sidebar-config', () => ({
  getSidebarConfig: () => sidebarConfig,
  setSidebarConfig: vi.fn(),
  subscribeSidebarConfig: () => () => {},
  setCategoryCollapsed: vi.fn(),
  moveItem: vi.fn(),
  moveItemToCategory: mockMoveItemToCategory,
  moveCategoryToIndex: mockMoveCategoryToIndex,
  renameItem: vi.fn(),
  renameCategory: vi.fn(),
  createCustomModule: vi.fn(),
  softDeleteItem: vi.fn(),
}))

vi.mock('@/lib/sidebar-settings', () => ({
  subscribeSidebarSettings: () => () => {},
  getSidebarHeaderVisible: () => true,
  getSidebarDefaultWidth: () => 260,
  setSidebarDefaultWidth: vi.fn(),
  getSidebarSearchVisible: () => false,
  getSidebarLogoVisible: () => false,
  getSidebarTitleSize: () => 22,
}))

vi.mock('@/lib/modules', () => ({
  subscribeModules: () => () => {},
  getEnabledModules: () => enabledModules,
}))

vi.mock('@/lib/unread-store', () => ({
  useUnreadCounts: () => unreadCounts,
  markRead: vi.fn(),
}))

vi.mock('@/lib/dashboard-store', () => ({
  getDashboardState: () => dashboardState,
  subscribeDashboard: () => () => {},
  setActivePage: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {},
}))

vi.mock('@/lib/theme-store', () => ({
  useThemeState: () => themeState,
  clearPageOverride: vi.fn(),
  clearCategoryOverride: vi.fn(),
}))

vi.mock('@/lib/theme-definitions', () => ({
  BUILT_IN_THEMES: [],
}))

vi.mock('@/lib/query-keys', () => ({
  queryKeys: {
    todos: ['todos'],
    missions: ['missions'],
    prefs: ['prefs'],
  },
}))

vi.mock('@/lib/nav-items', () => ({
  navItemsByHref: new Map([
    ['/homelab', { href: '/homelab', label: 'Home Lab', icon: () => null, moduleId: 'homelab' }],
    ['/media', { href: '/media', label: 'Media Command', icon: () => null, moduleId: 'media' }],
  ]),
}))

vi.mock('../GlobalSearch', () => ({
  default: () => null,
}))

vi.mock('../NotificationCenter', () => ({
  NotificationBell: () => null,
}))

vi.mock('../StatusBar', () => ({
  StatusBar: () => null,
}))

vi.mock('../sidebar/SectionDivider', () => ({
  default: () => null,
}))

vi.mock('../sidebar/SidebarQuickCapture', () => ({
  default: () => null,
}))

vi.mock('../assistant/GlobalAssistantLauncher', () => ({
  default: () => <button data-testid="global-ai-chat-launcher">AI Chat</button>,
}))

vi.mock('../sidebar/ThemeOverrideMenu', () => ({
  default: () => null,
}))

vi.mock('../sidebar/TypewriterTitle', () => ({
  default: () => null,
}))

vi.mock('../ContextMenu', () => ({
  ContextMenu: ({ items }: { items: Array<{ label: string; onClick: () => void }> }) => (
    <div>
      {items.map(item => (
        <button key={item.label} onClick={item.onClick}>{item.label}</button>
      ))}
    </div>
  ),
}))

import Sidebar from '../Sidebar'

function renderSidebar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Sidebar width={260} onWidthChange={() => {}} draggingRef={{ current: false }} />
    </QueryClientProvider>,
  )
}

function mockElementFromPoint(element: Element) {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => element),
  })
}

describe('Sidebar live category moves', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sidebarConfig.categories = [
      { id: 'personal', name: 'Personal Dashboard', items: ['/homelab', '/media'] },
      { id: 'training', name: 'Training', items: [] },
      { id: 'homelab-cat', name: 'Homelab', items: [] },
    ]
  })

  it('offers moving Home Lab into Homelab from the live sidebar menu', () => {
    renderSidebar()

    fireEvent.contextMenu(screen.getByText('Home Lab'))
    fireEvent.click(screen.getByText('Move to Homelab'))

    expect(mockMoveItemToCategory).toHaveBeenCalledWith('/homelab', 'homelab-cat', 0)
  })

  it('offers moving Media Command into Homelab from the live sidebar menu', () => {
    renderSidebar()

    fireEvent.contextMenu(screen.getByText('Media Command'))
    fireEvent.click(screen.getByText('Move to Homelab'))

    expect(mockMoveItemToCategory).toHaveBeenCalledWith('/media', 'homelab-cat', 0)
  })

  it('pointer-drags Home Lab into an empty Homelab category header', () => {
    renderSidebar()
    const homeLab = screen.getByText('Home Lab').closest('a')!
    const homelabHeader = screen.getByRole('button', { name: 'Homelab' })
    mockElementFromPoint(homelabHeader)

    fireEvent.pointerDown(homeLab, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 12, clientY: 12 })
    fireEvent.pointerUp(window, { clientX: 12, clientY: 12 })

    expect(mockMoveItemToCategory).toHaveBeenCalledWith('/homelab', 'homelab-cat', 0)
  })

  it('pointer-drags Media Command after Home Lab inside Homelab', () => {
    sidebarConfig.categories = [
      { id: 'personal', name: 'Personal Dashboard', items: ['/media'] },
      { id: 'training', name: 'Training', items: [] },
      { id: 'homelab-cat', name: 'Homelab', items: ['/homelab'] },
    ]
    renderSidebar()
    const mediaRadar = screen.getByText('Media Command').closest('a')!
    const homeLab = screen.getByText('Home Lab').closest('a')!
    vi.spyOn(homeLab, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 120,
      bottom: 32,
      width: 120,
      height: 32,
      toJSON: () => ({}),
    })
    mockElementFromPoint(homeLab)

    fireEvent.pointerDown(mediaRadar, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 12, clientY: 24 })
    fireEvent.pointerUp(window, { clientX: 12, clientY: 24 })

    expect(mockMoveItemToCategory).toHaveBeenCalledWith('/media', 'homelab-cat', 1)
  })

  it('pointer-drags Homelab above Training', () => {
    renderSidebar()
    const homelabHeader = screen.getByRole('button', { name: 'Homelab' })
    const trainingHeader = screen.getByRole('button', { name: 'Training' })
    vi.spyOn(trainingHeader, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 100,
      top: 100,
      left: 0,
      right: 120,
      bottom: 132,
      width: 120,
      height: 32,
      toJSON: () => ({}),
    })
    mockElementFromPoint(trainingHeader)

    fireEvent.pointerDown(homelabHeader, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 12, clientY: 104 })
    fireEvent.pointerUp(window, { clientX: 12, clientY: 104 })

    expect(mockMoveCategoryToIndex).toHaveBeenCalledWith('homelab-cat', 1)
  })

  it('does not suppress link clicks for small pointer movement', () => {
    renderSidebar()
    const homeLab = screen.getByText('Home Lab').closest('a')!
    fireEvent.pointerDown(homeLab, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 2, clientY: 2 })
    fireEvent.pointerUp(window, { clientX: 2, clientY: 2 })

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    homeLab.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(false)
  })

  it('suppresses link clicks after drag-threshold movement', () => {
    renderSidebar()
    const homeLab = screen.getByText('Home Lab').closest('a')!
    const homelabHeader = screen.getByRole('button', { name: 'Homelab' })
    mockElementFromPoint(homelabHeader)

    fireEvent.pointerDown(homeLab, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 12, clientY: 12 })
    fireEvent.pointerUp(window, { clientX: 12, clientY: 12 })

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    homeLab.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
  })
})
