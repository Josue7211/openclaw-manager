import { describe, it, expect } from 'vitest'
import { row, rowLast, val, inputStyle, btnStyle, btnSecondary, sectionLabel } from '../shared'

describe('settings/shared style constants', () => {
  describe('row', () => {
    it('is a flex row with space-between', () => {
      expect(row.display).toBe('flex')
      expect(row.justifyContent).toBe('space-between')
      expect(row.alignItems).toBe('center')
    })

    it('has bottom border and padding', () => {
      expect(row.borderBottom).toBe('1px solid var(--border)')
      expect(row.padding).toBe('12px 0')
    })

    it('uses CSS variables for color', () => {
      expect(row.color).toBe('var(--text-primary)')
    })

    it('sets font size', () => {
      expect(row.fontSize).toBe('13px')
    })
  })

  describe('rowLast', () => {
    it('inherits all row properties except borderBottom', () => {
      expect(rowLast.display).toBe(row.display)
      expect(rowLast.justifyContent).toBe(row.justifyContent)
      expect(rowLast.alignItems).toBe(row.alignItems)
      expect(rowLast.padding).toBe(row.padding)
      expect(rowLast.fontSize).toBe(row.fontSize)
    })

    it('removes the bottom border', () => {
      expect(rowLast.borderBottom).toBe('none')
    })
  })

  describe('val', () => {
    it('uses secondary text color and monospace font', () => {
      expect(val.color).toBe('var(--text-secondary)')
      expect(val.fontFamily).toBe('monospace')
      expect(val.fontSize).toBe('12px')
    })
  })

  describe('inputStyle', () => {
    it('has elevated background and border', () => {
      expect(inputStyle.background).toBe('var(--bg-elevated)')
      expect(inputStyle.border).toBe('1px solid var(--border)')
    })

    it('has rounded corners', () => {
      expect(inputStyle.borderRadius).toBe('8px')
    })

    it('uses monospace font', () => {
      expect(inputStyle.fontFamily).toBe('monospace')
    })

    it('has a fixed width', () => {
      expect(inputStyle.width).toBe('280px')
    })

    it('has no outline', () => {
      expect(inputStyle.outline).toBe('none')
    })
  })

  describe('btnStyle', () => {
    it('uses accent background and text-on-accent color', () => {
      expect(btnStyle.background).toBe('var(--accent)')
      expect(btnStyle.color).toBe('var(--text-on-accent)')
    })

    it('has no native border', () => {
      expect(btnStyle.border).toBe('none')
    })

    it('uses pointer cursor', () => {
      expect(btnStyle.cursor).toBe('pointer')
    })

    it('has bold font weight', () => {
      expect(btnStyle.fontWeight).toBe(600)
    })

    it('uses CSS variable for border radius', () => {
      expect(btnStyle.borderRadius).toBe('var(--radius-md)')
    })
  })

  describe('btnSecondary', () => {
    it('inherits btnStyle properties', () => {
      expect(btnSecondary.cursor).toBe('pointer')
      expect(btnSecondary.fontSize).toBe(btnStyle.fontSize)
    })

    it('overrides to transparent background with border', () => {
      expect(btnSecondary.background).toBe('transparent')
      expect(btnSecondary.border).toBe('1px solid var(--border)')
    })

    it('uses secondary text color', () => {
      expect(btnSecondary.color).toBe('var(--text-secondary)')
    })

    it('has lighter font weight than primary', () => {
      expect(btnSecondary.fontWeight).toBe(500)
      expect(btnSecondary.fontWeight).toBeLessThan(btnStyle.fontWeight as number)
    })
  })

  describe('sectionLabel', () => {
    it('uses muted text color and monospace font', () => {
      expect(sectionLabel.color).toBe('var(--text-muted)')
      expect(sectionLabel.fontFamily).toBe('monospace')
    })

    it('is uppercase with letter spacing', () => {
      expect(sectionLabel.textTransform).toBe('uppercase')
      expect(sectionLabel.letterSpacing).toBe('0.08em')
    })

    it('uses CSS variable for font size', () => {
      expect(sectionLabel.fontSize).toBe('var(--text-xs)')
    })

    it('has vertical spacing', () => {
      expect(sectionLabel.marginBottom).toBe('16px')
      expect(sectionLabel.marginTop).toBe('8px')
    })
  })

  describe('all exports are valid CSSProperties', () => {
    it('exports exactly 7 style constants', () => {
      const styles = { row, rowLast, val, inputStyle, btnStyle, btnSecondary, sectionLabel }
      expect(Object.keys(styles)).toHaveLength(7)
    })

    it('all exports are plain objects', () => {
      for (const style of [row, rowLast, val, inputStyle, btnStyle, btnSecondary, sectionLabel]) {
        expect(typeof style).toBe('object')
        expect(style).not.toBeNull()
      }
    })
  })
})
