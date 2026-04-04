import type React from 'react'

export const logoStyle: React.CSSProperties = {
  flexShrink: 0,
  width: '45px',
  height: '45px',
  minWidth: '45px',
  WebkitMaskImage: 'url(/logo-128.png)',
  WebkitMaskSize: 'contain',
  WebkitMaskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskImage: 'url(/logo-128.png)',
  maskSize: 'contain',
  maskRepeat: 'no-repeat',
  maskPosition: 'center',
  background: 'var(--logo-color)',
  filter: 'drop-shadow(0 2px 8px var(--logo-color))',
}

export const resizeHandleStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: '8px',
  height: '100%',
  cursor: 'col-resize',
  zIndex: 10,
  opacity: 0,
  transition: 'opacity var(--duration-fast) ease',
}

export const plusIconStyle: React.CSSProperties = { flexShrink: 0 }
export const settingsIconStyle: React.CSSProperties = { flexShrink: 0 }
export const overflowHiddenStyle: React.CSSProperties = { overflow: 'hidden' }

export const sectionLabelBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  borderRadius: '8px',
  transition: 'color var(--duration-fast)',
  whiteSpace: 'nowrap',
}

export const editingRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '5px 16px',
  borderRadius: '10px',
  marginBottom: '2px',
  background: 'var(--active-bg)',
}

export const editingInputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--accent)',
  color: 'var(--text-on-color)',
  fontSize: '13px',
  fontWeight: 600,
  outline: 'none',
  padding: '4px 0',
  minWidth: 0,
  fontFamily: 'inherit',
}

export const catRenameInputStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--accent)',
  color: 'var(--text-primary)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  outline: 'none',
  padding: '2px 0',
  width: '100%',
  fontFamily: 'inherit',
}

export const dividerStyle: React.CSSProperties = {
  height: '1px',
  margin: '4px 12px',
  background: 'linear-gradient(to right, transparent, var(--border-hover), transparent)',
}

export const fixedDividerStyle: React.CSSProperties = {
  ...dividerStyle,
  flexShrink: 0,
}
