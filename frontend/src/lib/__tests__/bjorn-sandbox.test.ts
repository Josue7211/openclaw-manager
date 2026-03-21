import { describe, it, expect } from 'vitest'
import { buildSandboxHTML, getThemeVarsCSS } from '../bjorn-sandbox'

describe('buildSandboxHTML', () => {
  const themeCSS = ':root { --accent: #ff6b6b; }'
  const source = 'function BjornWidget() { return h("div", null, "Hello") }'

  it('returns valid HTML structure', () => {
    const html = buildSandboxHTML(source, themeCSS)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<div id="root"></div>')
  })

  it('contains CSP meta tag with correct policy', () => {
    const html = buildSandboxHTML(source, themeCSS)
    expect(html).toContain("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'")
  })

  it('injects theme vars CSS', () => {
    const html = buildSandboxHTML(source, themeCSS)
    expect(html).toContain('--accent: #ff6b6b')
  })

  it('contains the component source', () => {
    const html = buildSandboxHTML(source, themeCSS)
    expect(html).toContain('BjornWidget')
  })

  it('contains the requestData bridge helper', () => {
    const html = buildSandboxHTML(source, themeCSS)
    expect(html).toContain('window.requestData')
    expect(html).toContain('data-request')
  })

  it('contains 10-second timeout value', () => {
    const html = buildSandboxHTML(source, themeCSS)
    expect(html).toContain('10000')
  })

  it('does NOT contain allow-same-origin', () => {
    const html = buildSandboxHTML(source, themeCSS)
    expect(html).not.toContain('allow-same-origin')
  })

  it('contains minimal DOM builder (h function)', () => {
    const html = buildSandboxHTML(source, themeCSS)
    expect(html).toContain('function h(tag, props)')
  })
})

describe('getThemeVarsCSS', () => {
  it('returns a string', () => {
    const result = getThemeVarsCSS()
    expect(typeof result).toBe('string')
  })

  it('returns empty string or :root block in JSDOM', () => {
    const result = getThemeVarsCSS()
    // JSDOM may or may not have CSS custom properties
    expect(result === '' || result.includes(':root')).toBe(true)
  })
})
