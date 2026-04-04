import React, { useSyncExternalStore } from 'react'
import {
  getSidebarTitleLayout,
  getSidebarTitleSize,
  getSidebarTitleText,
  subscribeSidebarSettings,
} from '@/lib/sidebar-settings'

interface TypewriterTitleProps {
  availableWidth: number
}

const TypewriterTitle = React.memo(function TypewriterTitle({ availableWidth }: TypewriterTitleProps) {
  const layout = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleLayout)
  const titleText = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleText)
  const titleSize = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleSize)
  const twoLine = layout === 'two-line'
  const charWidth = Math.round(titleSize * 0.68)

  if (twoLine) {
    const words = titleText.toUpperCase().split(' ')
    const line1 = words[0] || ''
    const line2 = words.slice(1).join(' ') || ''
    const maxPerLine = Math.max(0, Math.floor(availableWidth / charWidth))
    const line1Visible = Math.min(line1.length, maxPerLine)
    const line2Visible = Math.min(line2.length, maxPerLine)
    const line1Full = line1Visible === line1.length
    const line2Full = line2Visible === line2.length
    const line1Cursor = line1Visible > 0 && !line1Full
    const line2Cursor = line2Visible > 0 && !line2Full

    if (line1Visible === 0) return null

    return (
      <div
        style={{
          fontSize: `${titleSize}px`,
          fontWeight: 700,
          fontFamily: "'Bitcount Prop Double', monospace",
          color: 'var(--text-primary)',
          letterSpacing: '0.08em',
          lineHeight: 0.9,
          whiteSpace: 'pre',
          width: 'fit-content',
        }}
      >
        {line1.slice(0, line1Visible)}
        {line1Cursor && <span className="type-cursor">|</span>}
        {line2Visible > 0 && (
          <>
            {'\n'}
            {line2.slice(0, line2Visible)}
            {line2Cursor && <span className="type-cursor">|</span>}
          </>
        )}
      </div>
    )
  }

  const text = titleText.toUpperCase()
  const visibleCount = Math.min(text.length, Math.max(0, Math.floor(availableWidth / charWidth)))
  const visibleText = text.slice(0, visibleCount)
  const showCursor = visibleCount > 0 && visibleCount < text.length

  if (visibleCount === 0) return null

  return (
    <div
      style={{
        fontSize: `${titleSize}px`,
        fontWeight: 700,
        fontFamily: "'Bitcount Prop Double', monospace",
        color: 'var(--text-primary)',
        letterSpacing: '0.08em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        width: 'fit-content',
      }}
    >
      {visibleText}
      {showCursor && <span className="type-cursor">|</span>}
    </div>
  )
})

export default TypewriterTitle
