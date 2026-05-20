import { beforeEach, describe, expect, it, vi } from 'vitest'

async function loadStore() {
  vi.resetModules()
  return import('../ui-customization-store')
}

describe('ui-customization-store', () => {
  beforeEach(() => {
    localStorage.clear()
    document.head.innerHTML = ''
  })

  it('previews style rules without persisting until commit', async () => {
    const store = await loadStore()

    store.previewUiStyleRule({
      id: 'rule-1',
      selector: '[data-testid="target"]',
      styles: { padding: '6px', backgroundColor: 'red' },
    })

    expect(document.getElementById('clawcontrol-ui-customizations')?.textContent).toContain('padding: 6px')
    expect(localStorage.getItem('ui-customization-state')).toBeNull()

    expect(store.commitUiCustomizationDraft()).toBe(true)
    expect(localStorage.getItem('ui-customization-state')).toContain('rule-1')
  })

  it('route-scopes style rules when a route is provided', async () => {
    const store = await loadStore()

    store.previewUiStyleRule({
      id: 'rule-1',
      selector: '[data-testid="target"]',
      route: '/todos',
      styles: { rowGap: '8px', textAlign: 'center' },
    })

    const css = document.getElementById('clawcontrol-ui-customizations')?.textContent || ''
    expect(css).toContain(':root[data-claw-route="/todos"] [data-testid="target"]')
    expect(css).toContain('row-gap: 8px')
    expect(css).toContain('text-align: center')
  })

  it('supports undo, redo, and discard for unsaved style drafts', async () => {
    const store = await loadStore()

    store.previewUiStyleRule({
      id: 'rule-1',
      selector: '.target',
      styles: { padding: '6px' },
    })
    store.previewUiStyleRule({
      id: 'rule-1',
      selector: '.target',
      styles: { padding: '12px' },
    })

    expect(document.getElementById('clawcontrol-ui-customizations')?.textContent).toContain('12px')
    expect(store.undoUiCustomizationDraft()).toBe(true)
    expect(document.getElementById('clawcontrol-ui-customizations')?.textContent).toContain('6px')
    expect(store.redoUiCustomizationDraft()).toBe(true)
    expect(document.getElementById('clawcontrol-ui-customizations')?.textContent).toContain('12px')
    expect(store.discardUiCustomizationDraft()).toBe(true)
    expect(document.getElementById('clawcontrol-ui-customizations')?.textContent).not.toContain('12px')
  })

  it('drops unsafe CSS values and unsupported properties', async () => {
    const store = await loadStore()

    expect(() => store.previewUiStyleRule({
      id: 'rule-1',
      selector: '.target',
      styles: {
        background: 'url(javascript:alert(1))',
        position: 'fixed',
      },
    })).toThrow(/No safe CSS/)
  })
})
