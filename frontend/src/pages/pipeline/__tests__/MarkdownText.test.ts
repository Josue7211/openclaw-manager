import { describe, it, expect } from 'vitest'
import React from 'react'
import { MarkdownText } from '../MarkdownText'

/* ─── helpers ──────────────────────────────────────────────────────────── */

/** Render MarkdownText and return the React element tree for inspection */
function render(text: string) {
  return MarkdownText({ text })
}

/** Recursively collect all text content from a React element tree */
function collectText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return collectText((node as { props: { children?: React.ReactNode } }).props.children)
  }
  return ''
}

/** Find all elements of a given type in a React element tree */
function findElements(node: React.ReactNode, type: string): any[] {
  const results: any[] = []
  if (node == null || typeof node !== 'object') return results
  if (Array.isArray(node)) {
    for (const child of node) {
      results.push(...findElements(child, type))
    }
    return results
  }
  if ('type' in node) {
    const el = node as { type: unknown; props?: { children?: React.ReactNode } }
    if (el.type === type) results.push(node)
    if (el.props?.children) {
      results.push(...findElements(el.props.children, type))
    }
  }
  return results
}

/* ─── plain text ──────────────────────────────────────────────────────── */

describe('MarkdownText', () => {
  it('renders plain text without formatting', () => {
    const result = render('Hello world')
    const text = collectText(result)
    expect(text).toContain('Hello world')
  })

  it('renders empty string without errors', () => {
    const result = render('')
    expect(result).toBeDefined()
  })

  /* ─── bold ────────────────────────────────────────────────────────── */

  it('renders **bold** text as <strong>', () => {
    const result = render('This is **bold** text')
    const strongs = findElements(result, 'strong')
    expect(strongs).toHaveLength(1)
    expect(collectText(strongs[0])).toBe('bold')
  })

  it('renders multiple bold segments', () => {
    const result = render('**one** and **two**')
    const strongs = findElements(result, 'strong')
    expect(strongs).toHaveLength(2)
    expect(collectText(strongs[0])).toBe('one')
    expect(collectText(strongs[1])).toBe('two')
  })

  /* ─── inline code ─────────────────────────────────────────────────── */

  it('renders `code` as <code>', () => {
    const result = render('Run `npm install` first')
    const codes = findElements(result, 'code')
    expect(codes).toHaveLength(1)
    expect(collectText(codes[0])).toBe('npm install')
  })

  it('applies monospace font to code elements', () => {
    const result = render('Use `git status`')
    const codes = findElements(result, 'code')
    expect(codes[0].props.style.fontFamily).toBe('monospace')
  })

  /* ─── italic ──────────────────────────────────────────────────────── */

  it('renders *italic* text as <em>', () => {
    const result = render('This is *italic* text')
    const ems = findElements(result, 'em')
    expect(ems).toHaveLength(1)
    expect(collectText(ems[0])).toBe('italic')
  })

  it('renders _italic_ text as <em>', () => {
    const result = render('This is _italic_ text')
    const ems = findElements(result, 'em')
    expect(ems).toHaveLength(1)
    expect(collectText(ems[0])).toBe('italic')
  })

  /* ─── mixed inline ────────────────────────────────────────────────── */

  it('handles mixed formatting in a single line', () => {
    const result = render('**bold** and `code` and *italic*')
    const strongs = findElements(result, 'strong')
    const codes = findElements(result, 'code')
    const ems = findElements(result, 'em')
    expect(strongs).toHaveLength(1)
    expect(codes).toHaveLength(1)
    expect(ems).toHaveLength(1)
  })

  /* ─── bullet lists ────────────────────────────────────────────────── */

  it('renders bullet lines as <ul> with <li>', () => {
    const result = render('- item one\n- item two')
    const uls = findElements(result, 'ul')
    expect(uls).toHaveLength(1)
    const lis = findElements(uls[0], 'li')
    expect(lis).toHaveLength(2)
  })

  it('renders inline formatting inside bullet items', () => {
    const result = render('- **bold item**\n- `code item`')
    const uls = findElements(result, 'ul')
    expect(uls).toHaveLength(1)
    const strongs = findElements(uls[0], 'strong')
    const codes = findElements(uls[0], 'code')
    expect(strongs).toHaveLength(1)
    expect(codes).toHaveLength(1)
  })

  /* ─── multiline ───────────────────────────────────────────────────── */

  it('inserts <br> between non-bullet lines', () => {
    const result = render('line one\nline two\nline three')
    const brs = findElements(result, 'br')
    expect(brs).toHaveLength(2)
  })

  it('does not insert <br> between bullet lines', () => {
    const result = render('- a\n- b\n- c')
    const brs = findElements(result, 'br')
    expect(brs).toHaveLength(0)
  })

  it('handles mixed bullets and text', () => {
    const result = render('intro\n- bullet\noutro')
    const uls = findElements(result, 'ul')
    expect(uls).toHaveLength(1)
    const text = collectText(result)
    expect(text).toContain('intro')
    expect(text).toContain('bullet')
    expect(text).toContain('outro')
  })

  /* ─── separate bullet groups ──────────────────────────────────────── */

  it('creates separate <ul> elements for non-adjacent bullet groups', () => {
    const result = render('- a\n- b\nmiddle\n- c\n- d')
    const uls = findElements(result, 'ul')
    expect(uls).toHaveLength(2)
  })
})
