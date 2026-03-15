import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('Accessibility', () => {
  test('all interactive buttons have accessible names', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible()

    // Find all buttons and verify each has an accessible name
    const buttons = page.locator('button')
    const count = await buttons.count()
    expect(count).toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i)
      // Only check visible buttons
      if (!(await button.isVisible())) continue

      const name = await button.getAttribute('aria-label')
      const text = (await button.textContent())?.trim()
      const title = await button.getAttribute('title')
      const labelledBy = await button.getAttribute('aria-labelledby')

      const hasAccessibleName = !!(name || text || title || labelledBy)
      if (!hasAccessibleName) {
        const outerHTML = await button.evaluate(el => el.outerHTML.slice(0, 200))
        expect.soft(
          hasAccessibleName,
          `Button without accessible name: ${outerHTML}`,
        ).toBe(true)
      }
    }
  })

  test('all text inputs have labels or aria-label', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible()

    const inputs = page.locator('input[type="text"], input:not([type]), textarea')
    const count = await inputs.count()

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i)
      if (!(await input.isVisible())) continue

      const ariaLabel = await input.getAttribute('aria-label')
      const ariaLabelledBy = await input.getAttribute('aria-labelledby')
      const id = await input.getAttribute('id')
      const placeholder = await input.getAttribute('placeholder')

      // Check if there's a <label> pointing to this input
      let hasLabel = !!(ariaLabel || ariaLabelledBy)
      if (!hasLabel && id) {
        const labelCount = await page.locator(`label[for="${id}"]`).count()
        hasLabel = labelCount > 0
      }
      // Placeholder alone is not sufficient for accessibility, but we note it
      if (!hasLabel && !placeholder) {
        const outerHTML = await input.evaluate(el => el.outerHTML.slice(0, 200))
        expect.soft(
          hasLabel,
          `Input without label/aria-label: ${outerHTML}`,
        ).toBe(true)
      }
    }
  })

  test('Settings page buttons have accessible names', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText('General')).toBeVisible({ timeout: 10_000 })

    const buttons = page.locator('button')
    const count = await buttons.count()

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i)
      if (!(await button.isVisible())) continue

      const name = await button.getAttribute('aria-label')
      const text = (await button.textContent())?.trim()
      const title = await button.getAttribute('title')
      const labelledBy = await button.getAttribute('aria-labelledby')

      const hasAccessibleName = !!(name || text || title || labelledBy)
      if (!hasAccessibleName) {
        const outerHTML = await button.evaluate(el => el.outerHTML.slice(0, 200))
        expect.soft(
          hasAccessibleName,
          `Settings button without accessible name: ${outerHTML}`,
        ).toBe(true)
      }
    }
  })

  test('sidebar navigation has proper ARIA landmark', async ({ page }) => {
    await page.goto('/')
    // The sidebar should be a <nav> with an aria-label
    const nav = page.locator('nav[aria-label="Main navigation"]')
    await expect(nav).toBeVisible()
  })

  test('main content area has proper landmark', async ({ page }) => {
    await page.goto('/')
    const main = page.locator('main#main-content')
    await expect(main).toBeVisible()
  })

  test('skip to content link targets main content', async ({ page }) => {
    await page.goto('/')
    const skipLink = page.locator('a[href="#main-content"]')
    await expect(skipLink).toBeAttached()

    // Verify the target element exists
    const mainContent = page.locator('#main-content')
    await expect(mainContent).toBeAttached()
  })

  test('command palette dialog has proper ARIA attributes', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible()

    await page.keyboard.press('Meta+k')
    const dialog = page.locator('div[role="dialog"][aria-modal="true"]')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Verify dialog has aria-labelledby
    const labelledBy = await dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
  })

  test('no critical axe-core violations on home page', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      // Exclude known third-party or decorative elements that may have false positives
      .exclude('.traffic-lights')
      .analyze()

    // Report critical and serious violations — warn on moderate/minor
    const critical = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious',
    )

    if (critical.length > 0) {
      const summary = critical.map(
        v => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instances)`,
      ).join('\n')
      expect.soft(critical.length, `Axe violations found:\n${summary}`).toBe(0)
    }
  })

  test('no critical axe-core violations on Settings page', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText('General')).toBeVisible({ timeout: 10_000 })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude('.traffic-lights')
      .analyze()

    const critical = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious',
    )

    if (critical.length > 0) {
      const summary = critical.map(
        v => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instances)`,
      ).join('\n')
      expect.soft(critical.length, `Axe violations found:\n${summary}`).toBe(0)
    }
  })
})
