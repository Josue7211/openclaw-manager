import type { ITheme } from '@xterm/xterm'

/**
 * Build an xterm.js ITheme from the app's CSS custom properties.
 * Reads computed styles from document.documentElement so it auto-syncs
 * with the theme blend slider and dark/light mode.
 */
export function buildThemeFromCSS(): ITheme {
  const style = getComputedStyle(document.documentElement)
  const get = (name: string) => style.getPropertyValue(name).trim()

  return {
    background: get('--bg-base') || '#0a0a0c',
    foreground: get('--text-primary') || '#e4e4ec',
    cursor: get('--accent') || '#a78bfa',
    cursorAccent: get('--bg-base') || '#0a0a0c',
    selectionBackground: 'rgba(167, 139, 250, 0.3)',
    selectionForeground: undefined,
    // ANSI 16-color palette
    black: '#1a1a2e',
    red: get('--red') || '#f87171',
    green: get('--green') || '#34d399',
    yellow: get('--yellow') || '#eab308',
    blue: get('--blue') || '#60a5fa',
    magenta: get('--purple') || '#9b84ec',
    cyan: get('--cyan') || '#22d3ee',
    white: get('--text-primary') || '#e4e4ec',
    brightBlack: get('--text-muted') || '#8b8fa3',
    brightRed: get('--red-bright') || '#fca5a5',
    brightGreen: get('--green-bright') || '#6ee7b7',
    brightYellow: get('--yellow-bright') || '#facc15',
    brightBlue: get('--blue-bright') || '#a5b4fc',
    brightMagenta: get('--accent-bright') || '#c4b5fd',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff',
    // Scrollbar (thin overlay)
    scrollbarSliderBackground: 'rgba(255, 255, 255, 0.1)',
    scrollbarSliderHoverBackground: 'rgba(255, 255, 255, 0.2)',
    scrollbarSliderActiveBackground: 'rgba(255, 255, 255, 0.3)',
  }
}
