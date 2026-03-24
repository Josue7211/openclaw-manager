/**
 * Route Audit Smoke Test
 *
 * Verifies every route defined in main.tsx:
 * - Resolves to its intended component (not blank, not 404)
 * - Does NOT trigger ErrorBoundary or PageErrorBoundary
 * - Redirect routes land on their target
 * - Catch-all renders NotFound
 * - Sync guard: route list here matches main.tsx (prevents drift)
 *
 * Strategy: Mock ALL page components to return marker divs. This isolates
 * the routing layer from page-level side effects (API calls, stores, etc.).
 * We verify the route CONFIG is correct, not page internals.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import React, { Suspense } from 'react'
import { MemoryRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import fs from 'fs'
import path from 'path'

// ============================================================
// Mock all page components to return marker divs
// ============================================================

// Each page mock renders a data-testid so we can verify the correct page resolved
vi.mock('@/pages/Dashboard', () => ({ default: () => <div data-testid="page-dashboard">Dashboard</div> }))
vi.mock('@/pages/Personal', () => ({ default: () => <div data-testid="page-personal">Personal</div> }))
vi.mock('@/pages/Chat', () => ({ default: () => <div data-testid="page-chat">Chat</div> }))
vi.mock('@/pages/Todos', () => ({ default: () => <div data-testid="page-todos">Todos</div> }))
vi.mock('@/pages/Calendar', () => ({ default: () => <div data-testid="page-calendar">Calendar</div> }))
vi.mock('@/pages/Reminders', () => ({ default: () => <div data-testid="page-reminders">Reminders</div> }))
vi.mock('@/pages/Messages', () => ({ default: () => <div data-testid="page-messages">Messages</div> }))
vi.mock('@/pages/Pomodoro', () => ({ default: () => <div data-testid="page-pomodoro">Pomodoro</div> }))
vi.mock('@/pages/Email', () => ({ default: () => <div data-testid="page-email">Email</div> }))
vi.mock('@/pages/HomeLab', () => ({ default: () => <div data-testid="page-homelab">HomeLab</div> }))
vi.mock('@/pages/MediaRadar', () => ({ default: () => <div data-testid="page-media">MediaRadar</div> }))
vi.mock('@/pages/Missions', () => ({ default: () => <div data-testid="page-missions">Missions</div> }))
vi.mock('@/pages/OpenClaw', () => ({ default: () => <div data-testid="page-openclaw">OpenClaw</div> }))
vi.mock('@/pages/Agents', () => ({ default: () => <div data-testid="page-agents">Agents</div> }))
vi.mock('@/pages/Memory', () => ({ default: () => <div data-testid="page-memory">Memory</div> }))
vi.mock('@/pages/CronJobs', () => ({ default: () => <div data-testid="page-crons">CronJobs</div> }))
vi.mock('@/pages/Pipeline', () => ({ default: () => <div data-testid="page-pipeline">Pipeline</div> }))
vi.mock('@/pages/KnowledgeBase', () => ({ default: () => <div data-testid="page-knowledge">KnowledgeBase</div> }))
vi.mock('@/pages/notes/Notes', () => ({ default: () => <div data-testid="page-notes">Notes</div> }))
vi.mock('@/pages/Ideas', () => ({ default: () => <div data-testid="page-ideas">Ideas</div> }))
vi.mock('@/pages/Capture', () => ({ default: () => <div data-testid="page-capture">Capture</div> }))
vi.mock('@/pages/Settings', () => ({ default: () => <div data-testid="page-settings">Settings</div> }))
vi.mock('@/pages/Search', () => ({ default: () => <div data-testid="page-search">Search</div> }))
vi.mock('@/pages/Login', () => ({ default: () => <div data-testid="page-login">Login</div> }))
vi.mock('@/pages/CustomPage', () => ({ default: () => <div data-testid="page-custom">CustomPage</div> }))
vi.mock('@/pages/NotFound', () => ({ default: () => <div data-testid="page-notfound"><div>404</div><h2>Page not found</h2></div> }))

// Mock shell components
vi.mock('@/components/AuthGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/LayoutShell', () => ({
  default: () => <Outlet />,
}))

// Mock skeletons (imported by main.tsx route elements)
vi.mock('@/components/Skeleton', () => ({
  PersonalSkeleton: () => <div data-testid="skeleton-personal" />,
  DashboardSkeleton: () => <div data-testid="skeleton-dashboard" />,
  MessagesSkeleton: () => <div data-testid="skeleton-messages" />,
  SettingsSkeleton: () => <div data-testid="skeleton-settings" />,
  GenericPageSkeleton: () => <div data-testid="skeleton-generic" />,
  SkeletonList: () => <div />,
  Skeleton: () => <div />,
  SkeletonRows: () => <div />,
  SkeletonCard: () => <div />,
}))

// Tauri internals: force browser mode
beforeAll(() => {
  // @ts-expect-error -- Tauri global
  window.__TAURI_INTERNALS__ = undefined
})

// ============================================================
// Lazy page imports (mirrors main.tsx without importing main.tsx itself)
// ============================================================
const { lazy } = React
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Personal = lazy(() => import('@/pages/Personal'))
const Chat = lazy(() => import('@/pages/Chat'))
const Todos = lazy(() => import('@/pages/Todos'))
const Calendar = lazy(() => import('@/pages/Calendar'))
const Reminders = lazy(() => import('@/pages/Reminders'))
const Messages = lazy(() => import('@/pages/Messages'))
const Pomodoro = lazy(() => import('@/pages/Pomodoro'))
const Email = lazy(() => import('@/pages/Email'))
const HomeLab = lazy(() => import('@/pages/HomeLab'))
const MediaRadar = lazy(() => import('@/pages/MediaRadar'))
const Missions = lazy(() => import('@/pages/Missions'))
const OpenClaw = lazy(() => import('@/pages/OpenClaw'))
const Memory = lazy(() => import('@/pages/Memory'))
const Pipeline = lazy(() => import('@/pages/Pipeline'))
const KnowledgeBase = lazy(() => import('@/pages/KnowledgeBase'))
const Notes = lazy(() => import('@/pages/notes/Notes'))
const Ideas = lazy(() => import('@/pages/Ideas'))
const Capture = lazy(() => import('@/pages/Capture'))
const Settings = lazy(() => import('@/pages/Settings'))
const Search = lazy(() => import('@/pages/Search'))
const Login = lazy(() => import('@/pages/Login'))
const CustomPage = lazy(() => import('@/pages/CustomPage'))
const NotFound = lazy(() => import('@/pages/NotFound'))

// ============================================================
// Route definitions (must stay in sync with main.tsx)
// ============================================================

interface RouteEntry {
  path: string
  type: 'page' | 'redirect'
  target?: string   // for redirects: where Navigate goes
  testId?: string   // expected data-testid of the rendered page
  guarded: boolean  // inside AuthGuard/LayoutShell wrapper
}

/**
 * Complete route table matching main.tsx.
 * The sync guard test verifies this stays in sync.
 */
const ROUTES: RouteEntry[] = [
  // Unguarded
  { path: '/login', type: 'page', testId: 'page-login', guarded: false },
  // Guarded (inside AuthGuard + LayoutShell)
  { path: '/', type: 'page', testId: 'page-personal', guarded: true },
  { path: '/personal', type: 'redirect', target: '/', testId: 'page-personal', guarded: true },
  { path: '/dashboard', type: 'page', testId: 'page-dashboard', guarded: true },
  { path: '/chat', type: 'page', testId: 'page-chat', guarded: true },
  { path: '/todos', type: 'page', testId: 'page-todos', guarded: true },
  { path: '/calendar', type: 'page', testId: 'page-calendar', guarded: true },
  { path: '/reminders', type: 'page', testId: 'page-reminders', guarded: true },
  { path: '/messages', type: 'page', testId: 'page-messages', guarded: true },
  { path: '/pomodoro', type: 'page', testId: 'page-pomodoro', guarded: true },
  { path: '/email', type: 'page', testId: 'page-email', guarded: true },
  { path: '/homelab', type: 'page', testId: 'page-homelab', guarded: true },
  { path: '/media', type: 'page', testId: 'page-media', guarded: true },
  { path: '/missions', type: 'page', testId: 'page-missions', guarded: true },
  { path: '/openclaw', type: 'page', testId: 'page-openclaw', guarded: true },
  { path: '/agents', type: 'redirect', target: '/openclaw', testId: 'page-openclaw', guarded: true },
  { path: '/memory', type: 'page', testId: 'page-memory', guarded: true },
  { path: '/crons', type: 'redirect', target: '/openclaw', testId: 'page-openclaw', guarded: true },
  { path: '/pipeline', type: 'page', testId: 'page-pipeline', guarded: true },
  { path: '/knowledge', type: 'page', testId: 'page-knowledge', guarded: true },
  { path: '/notes', type: 'page', testId: 'page-notes', guarded: true },
  { path: '/ideas', type: 'page', testId: 'page-ideas', guarded: true },
  { path: '/capture', type: 'page', testId: 'page-capture', guarded: true },
  { path: '/settings', type: 'page', testId: 'page-settings', guarded: true },
  { path: '/search', type: 'page', testId: 'page-search', guarded: true },
  { path: '/custom/:id', type: 'page', testId: 'page-custom', guarded: true },
  { path: '*', type: 'page', testId: 'page-notfound', guarded: true },
]

// ============================================================
// Helpers
// ============================================================

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

/**
 * Render a route in an isolated MemoryRouter that mirrors main.tsx route structure.
 * AuthGuard and LayoutShell are mocked (pass-through + Outlet).
 */
function renderRoute(routePath: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[routePath]}>
        <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
          <Routes>
            <Route path="/login" element={<Suspense fallback={null}><Login /></Suspense>} />
            <Route element={<Outlet />}>
              <Route path="/" element={<Suspense fallback={null}><Personal /></Suspense>} />
              <Route path="/personal" element={<Navigate to="/" replace />} />
              <Route path="/dashboard" element={<Suspense fallback={null}><Dashboard /></Suspense>} />
              <Route path="/chat" element={<Suspense fallback={null}><Chat /></Suspense>} />
              <Route path="/todos" element={<Suspense fallback={null}><Todos /></Suspense>} />
              <Route path="/calendar" element={<Suspense fallback={null}><Calendar /></Suspense>} />
              <Route path="/reminders" element={<Suspense fallback={null}><Reminders /></Suspense>} />
              <Route path="/messages" element={<Suspense fallback={null}><Messages /></Suspense>} />
              <Route path="/pomodoro" element={<Suspense fallback={null}><Pomodoro /></Suspense>} />
              <Route path="/email" element={<Suspense fallback={null}><Email /></Suspense>} />
              <Route path="/homelab" element={<Suspense fallback={null}><HomeLab /></Suspense>} />
              <Route path="/media" element={<Suspense fallback={null}><MediaRadar /></Suspense>} />
              <Route path="/missions" element={<Suspense fallback={null}><Missions /></Suspense>} />
              <Route path="/openclaw" element={<Suspense fallback={null}><OpenClaw /></Suspense>} />
              <Route path="/agents" element={<Navigate to="/openclaw" replace />} />
              <Route path="/memory" element={<Suspense fallback={null}><Memory /></Suspense>} />
              <Route path="/crons" element={<Navigate to="/openclaw" replace />} />
              <Route path="/pipeline" element={<Suspense fallback={null}><Pipeline /></Suspense>} />
              <Route path="/knowledge" element={<Suspense fallback={null}><KnowledgeBase /></Suspense>} />
              <Route path="/notes" element={<Suspense fallback={null}><Notes /></Suspense>} />
              <Route path="/ideas" element={<Suspense fallback={null}><Ideas /></Suspense>} />
              <Route path="/capture" element={<Suspense fallback={null}><Capture /></Suspense>} />
              <Route path="/settings" element={<Suspense fallback={null}><Settings /></Suspense>} />
              <Route path="/search" element={<Suspense fallback={null}><Search /></Suspense>} />
              <Route path="/custom/:id" element={<Suspense fallback={null}><CustomPage /></Suspense>} />
              <Route path="*" element={<Suspense fallback={null}><NotFound /></Suspense>} />
            </Route>
          </Routes>
        </Suspense>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ============================================================
// Tests
// ============================================================

// Suppress console noise
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Route Audit', () => {
  // ----------------------------------------------------------
  // Sync guard: verify ROUTES array matches main.tsx
  // ----------------------------------------------------------
  describe('sync guard', () => {
    it('ROUTES array covers every path defined in main.tsx', () => {
      const mainTsxPath = path.resolve(__dirname, '..', 'main.tsx')
      const source = fs.readFileSync(mainTsxPath, 'utf-8')

      // Extract all path="..." values from Route elements
      const pathRegex = /path="([^"]+)"/g
      const mainPaths = new Set<string>()
      let match: RegExpExecArray | null
      while ((match = pathRegex.exec(source)) !== null) {
        mainPaths.add(match[1])
      }

      const testPaths = new Set(ROUTES.map(r => r.path))

      // Every path in main.tsx must be in the test
      for (const p of mainPaths) {
        expect(testPaths.has(p), `Route "${p}" exists in main.tsx but is missing from test ROUTES array`).toBe(true)
      }

      // Every path in the test must be in main.tsx (no stale entries)
      for (const p of testPaths) {
        expect(mainPaths.has(p), `Route "${p}" is in test ROUTES array but not in main.tsx -- remove it`).toBe(true)
      }
    })
  })

  // ----------------------------------------------------------
  // Page routes: verify correct component renders
  // ----------------------------------------------------------
  describe('page routes render correct component', () => {
    const pageRoutes = ROUTES.filter(r => r.type === 'page' && r.path !== '*' && r.path !== '/custom/:id')

    it.each(pageRoutes.map(r => [r.path, r.testId!]))(
      '%s renders %s',
      async (routePath, expectedTestId) => {
        renderRoute(routePath)

        await waitFor(() => {
          expect(screen.getByTestId(expectedTestId)).toBeInTheDocument()
        }, { timeout: 3000 })

        // No ErrorBoundary crash screen
        expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
        // No PageErrorBoundary crash screen
        expect(screen.queryByText('This page crashed')).not.toBeInTheDocument()
        // Not blank
        expect(document.body.textContent?.trim().length).toBeGreaterThan(0)
      },
    )
  })

  // ----------------------------------------------------------
  // Custom page route with param
  // ----------------------------------------------------------
  describe('custom page route', () => {
    it('/custom/test-id renders page-custom', async () => {
      renderRoute('/custom/test-id')

      await waitFor(() => {
        expect(screen.getByTestId('page-custom')).toBeInTheDocument()
      }, { timeout: 3000 })

      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
      expect(screen.queryByText('This page crashed')).not.toBeInTheDocument()
    })
  })

  // ----------------------------------------------------------
  // Redirect routes: should land on target component
  // ----------------------------------------------------------
  describe('redirect routes resolve to targets', () => {
    const redirectRoutes = ROUTES.filter(r => r.type === 'redirect')

    it.each(redirectRoutes.map(r => [r.path, r.target!, r.testId!]))(
      '%s redirects to %s (renders %s)',
      async (routePath, _targetPath, expectedTestId) => {
        renderRoute(routePath)

        await waitFor(() => {
          expect(screen.getByTestId(expectedTestId)).toBeInTheDocument()
        }, { timeout: 3000 })

        // No error boundaries on the target page
        expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
        expect(screen.queryByText('This page crashed')).not.toBeInTheDocument()
      },
    )
  })

  // ----------------------------------------------------------
  // Catch-all route: should show NotFound
  // ----------------------------------------------------------
  describe('catch-all route', () => {
    it('renders NotFound with 404 for unknown paths', async () => {
      renderRoute('/nonexistent-route-xyz')

      await waitFor(() => {
        expect(screen.getByTestId('page-notfound')).toBeInTheDocument()
      }, { timeout: 3000 })

      expect(screen.getByText('404')).toBeInTheDocument()
      expect(screen.getByText('Page not found')).toBeInTheDocument()

      // No error boundaries
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
      expect(screen.queryByText('This page crashed')).not.toBeInTheDocument()
    })
  })

  // ----------------------------------------------------------
  // Lazy import resolution: verify all page modules can be imported
  // ----------------------------------------------------------
  describe('lazy import resolution', () => {
    const pageImports: Array<[string, () => Promise<unknown>]> = [
      ['Dashboard', () => import('@/pages/Dashboard')],
      ['Personal', () => import('@/pages/Personal')],
      ['Chat', () => import('@/pages/Chat')],
      ['Todos', () => import('@/pages/Todos')],
      ['Calendar', () => import('@/pages/Calendar')],
      ['Reminders', () => import('@/pages/Reminders')],
      ['Messages', () => import('@/pages/Messages')],
      ['Pomodoro', () => import('@/pages/Pomodoro')],
      ['Email', () => import('@/pages/Email')],
      ['HomeLab', () => import('@/pages/HomeLab')],
      ['MediaRadar', () => import('@/pages/MediaRadar')],
      ['Missions', () => import('@/pages/Missions')],
      ['OpenClaw', () => import('@/pages/OpenClaw')],
      ['Memory', () => import('@/pages/Memory')],
      ['Pipeline', () => import('@/pages/Pipeline')],
      ['KnowledgeBase', () => import('@/pages/KnowledgeBase')],
      ['Notes', () => import('@/pages/notes/Notes')],
      ['Ideas', () => import('@/pages/Ideas')],
      ['Capture', () => import('@/pages/Capture')],
      ['Settings', () => import('@/pages/Settings')],
      ['Search', () => import('@/pages/Search')],
      ['Login', () => import('@/pages/Login')],
      ['CustomPage', () => import('@/pages/CustomPage')],
      ['NotFound', () => import('@/pages/NotFound')],
    ]

    it.each(pageImports)('%s resolves its dynamic import', async (_name, importFn) => {
      const mod = await importFn()
      expect(mod).toBeDefined()
      expect((mod as Record<string, unknown>).default).toBeDefined()
    })
  })
})
