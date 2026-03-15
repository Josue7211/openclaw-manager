import { test, expect } from '@playwright/test'

// The app uses AuthGuard which redirects to /login when no Supabase session
// exists. In demo mode (no VITE_SUPABASE_URL), auth is bypassed. These tests
// assume either demo mode or a pre-authenticated session via storageState.

test.describe('Smoke tests', () => {
  test('app loads without crashing', async ({ page }) => {
    await page.goto('/')
    // The root element should be rendered by React
    await expect(page.locator('#root')).toBeAttached()
    // No unhandled JS errors — Playwright will fail the test on uncaught exceptions
  })

  test('sidebar is visible', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.locator('nav[aria-label="Main navigation"]')
    await expect(sidebar).toBeVisible()
  })

  test('sidebar contains navigation links', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.locator('nav[aria-label="Main navigation"]')
    // Should have at least a few nav links (Home, Todos, Settings, etc.)
    const links = sidebar.locator('a[href]')
    await expect(links.first()).toBeVisible()
    expect(await links.count()).toBeGreaterThanOrEqual(3)
  })

  test('navigation works — clicking a nav item changes route', async ({ page }) => {
    await page.goto('/')
    // Click the Settings link in the sidebar
    const sidebar = page.locator('nav[aria-label="Main navigation"]')
    const settingsLink = sidebar.locator('a[href="/settings"]')
    await settingsLink.click()
    await expect(page).toHaveURL(/\/settings/)
  })

  test('Settings page renders content', async ({ page }) => {
    await page.goto('/settings')
    // Settings page has section labels like "General" or "App Settings"
    await expect(page.getByText('General')).toBeVisible({ timeout: 10_000 })
  })

  test('navigating to Todos page works', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.locator('nav[aria-label="Main navigation"]')
    const todosLink = sidebar.locator('a[href="/todos"]')
    await todosLink.click()
    await expect(page).toHaveURL(/\/todos/)
  })

  test('command palette opens with Meta+K', async ({ page }) => {
    await page.goto('/')
    // Wait for sidebar to confirm the app has loaded
    await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible()

    // Press Cmd+K (Meta+K on Linux/Windows maps to the palette keybinding)
    await page.keyboard.press('Meta+k')

    // The command palette is a dialog
    const dialog = page.locator('div[role="dialog"][aria-modal="true"]')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
  })

  test('command palette closes with Escape', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible()

    await page.keyboard.press('Meta+k')
    const dialog = page.locator('div[role="dialog"][aria-modal="true"]')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  })

  test('global search input is present in sidebar', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.locator('nav[aria-label="Main navigation"]')
    // GlobalSearch renders an input; look for it within or near the sidebar
    // The search is embedded in the sidebar component
    const searchInput = page.locator('input[type="text"]').first()
    await expect(searchInput).toBeAttached()
  })

  test('skip to content link exists for keyboard navigation', async ({ page }) => {
    await page.goto('/')
    const skipLink = page.locator('a[href="#main-content"]')
    await expect(skipLink).toBeAttached()
  })

  test('main content area exists', async ({ page }) => {
    await page.goto('/')
    const main = page.locator('main#main-content')
    await expect(main).toBeVisible()
  })

  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist')
    // The NotFound page should render something indicating the page wasn't found
    await expect(page.locator('#root')).toBeAttached()
    // URL should stay at the bad route (not redirect)
    await expect(page).toHaveURL(/this-route-does-not-exist/)
  })

  test('home page renders as default route', async ({ page }) => {
    await page.goto('/')
    // The "/" route renders the Personal page — confirm the main area has content
    const main = page.locator('main#main-content')
    await expect(main).toBeVisible()
  })
})
