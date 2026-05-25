/*
 * Copied/adapted from T3 Code apps/web/src/components/chat/ProviderInstanceIcon.tsx
 * (MIT License). T3 renders provider icons when available; this clawctrl
 * adapter uses stable initials for local provider instances.
 */

import { memo, type CSSProperties } from 'react'

export function providerInstanceInitials(label: string): string {
  const words = label.replace(/[_-]+/g, ' ').split(/\s+/u).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0]?.slice(0, 2).toUpperCase() ?? ''
  return words
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '')
    .join('')
}

export const ProviderInstanceIcon = memo(function ProviderInstanceIcon(props: {
  driverKind: string
  displayName: string
  accentColor?: string | undefined
  showBadge?: boolean
  size?: number
}) {
  const accentStyle = props.accentColor
    ? ({ '--provider-accent': props.accentColor } as CSSProperties)
    : undefined
  const size = props.size ?? 22

  return (
    <span
      data-provider-driver={props.driverKind}
      data-provider-accent-color={props.accentColor}
      aria-hidden="true"
      style={{
        ...accentStyle,
        position: 'relative',
        width: size,
        height: size,
        borderRadius: 6,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: '1px solid var(--border)',
        background: props.accentColor
          ? 'color-mix(in srgb, var(--provider-accent) 16%, var(--bg-card))'
          : 'var(--bg-card)',
        color: props.accentColor || 'var(--text-secondary)',
        fontSize: 10,
        fontWeight: 800,
        lineHeight: 1,
      }}
    >
      {providerInstanceInitials(props.displayName)}
      {props.showBadge && (
        <span
          style={{
            position: 'absolute',
            right: -3,
            bottom: -3,
            minWidth: 10,
            height: 10,
            borderRadius: 999,
            border: '1px solid var(--bg-base)',
            background: props.accentColor || 'var(--accent)',
          }}
        />
      )}
    </span>
  )
})
