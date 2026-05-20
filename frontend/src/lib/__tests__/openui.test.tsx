import { describe, expect, it } from 'vitest'
import { createParser } from '@openuidev/react-lang'
import {
  clawOpenUiLibrary,
  extractFencedOpenUiLangFromResponse,
  extractOpenUiLangFromResponse,
} from '../openui'

describe('openui', () => {
  it('parses ClawControl OpenUI Lang snippets with the OpenUI parser', () => {
    const parser = createParser(clawOpenUiLibrary.toJSONSchema())
    const result = parser.parse('root = StatCard("Tasks", "7", "items", "up", "accent")')

    expect(result.root?.typeName).toBe('StatCard')
    expect(result.root?.props.title).toBe('Tasks')
    expect(result.meta.errors).toEqual([])
  })

  it('parses composed generated UI layouts for the assistant drawer', () => {
    const parser = createParser(clawOpenUiLibrary.toJSONSchema())
    const result = parser.parse('root = Stack([Card("Today", "Focus plan", "Focus", "Ship one task", "accent", [Metric("Time block", "90m", "Deep work", "accent"), Checklist("Rules", [{"label":"No context switching"}])])])')

    expect(result.root?.typeName).toBe('Stack')
    expect(result.meta.errors).toEqual([])
  })

  it('extracts only fenced OpenUI Lang for normal chat rendering', () => {
    expect(
      extractFencedOpenUiLangFromResponse('```openui\nroot = MarkdownDisplay("Hello")\n```'),
    ).toBe('root = MarkdownDisplay("Hello")')
    expect(extractFencedOpenUiLangFromResponse('Use <Button /> as text')).toBeNull()
  })

  it('allows looser extraction for module builder fallbacks', () => {
    expect(extractOpenUiLangFromResponse('root = MarkdownDisplay("Hello")')).toBe(
      'root = MarkdownDisplay("Hello")',
    )
  })
})
