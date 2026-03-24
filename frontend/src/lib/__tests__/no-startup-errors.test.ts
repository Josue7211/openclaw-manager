import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const mainTsxPath = join(__dirname, '..', '..', 'main.tsx')
const mainTsxContent = readFileSync(mainTsxPath, 'utf-8')

describe('startup error prevention', () => {
  it('has unhandledrejection guard for Tauri runtime errors', () => {
    expect(mainTsxContent).toContain('unhandledrejection')
    expect(mainTsxContent).toContain('event.preventDefault()')
  })

  it('has no stale sidecar binaries in src-tauri/binaries/', () => {
    const binariesDir = join(__dirname, '..', '..', '..', '..', 'src-tauri', 'binaries')
    const entries = readdirSync(binariesDir)
    const nonGitkeep = entries.filter((f) => f !== '.gitkeep')
    expect(nonGitkeep).toEqual([])
  })

  it('all Tauri invoke() calls in main.tsx have error handling', () => {
    // Find all invoke( or invoke< patterns and verify each has .catch( or } catch nearby.
    // Use a wide context window (500 chars before, 300 after) because invoke() calls
    // may be deep inside try { } blocks that span many lines.
    const invokePattern = /invoke[<(]/g
    let match: RegExpExecArray | null
    const unhandled: string[] = []

    while ((match = invokePattern.exec(mainTsxContent)) !== null) {
      const start = Math.max(0, match.index - 500)
      const end = Math.min(mainTsxContent.length, match.index + 300)
      const context = mainTsxContent.slice(start, end)

      // Check for .catch( or } catch or catch { in surrounding context
      const hasCatch = context.includes('.catch(') || context.includes('} catch') || context.includes('catch {')
      // Also check if the invoke is inside a try block
      const hasTry = context.includes('try {') || context.includes('try{')
      if (!hasCatch && !hasTry) {
        unhandled.push(
          `invoke() at offset ${match.index} lacks error handling: ...${mainTsxContent.slice(match.index, match.index + 60)}...`
        )
      }
    }

    expect(unhandled).toEqual([])
  })

  it('no temporary debug code remains in main.tsx', () => {
    expect(mainTsxContent).not.toContain('[FFIR DEBUG]')
    expect(mainTsxContent).not.toContain('[FFIR CAPTURED]')
    expect(mainTsxContent).not.toContain('_origConsoleError')
  })
})
