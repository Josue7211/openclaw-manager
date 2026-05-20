/*
 * Copied/adapted from T3 Code apps/web/src/components/Sidebar.tsx project
 * rename dialog and command-palette add-project flow (MIT License).
 * ClawControl keeps this as a small vendor boundary for project sidebar
 * dialogs instead of using raw window.prompt calls.
 */

import type { CSSProperties } from 'react'

export type ProjectSidebarDialogMode = 'add' | 'rename'

export default function ProjectSidebarDialog({
  mode,
  value,
  projectPath,
  onChange,
  onCancel,
  onSubmit,
}: {
  mode: ProjectSidebarDialogMode
  value: string
  projectPath?: string
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const title = mode === 'add' ? 'Add project' : 'Rename project'
  const label = mode === 'add' ? 'Project folder path' : 'Project title'
  const description = mode === 'add'
    ? 'Enter a local project directory to add it to the chat sidebar.'
    : projectPath
      ? `Update the title for ${projectPath}.`
      : 'Update the project title.'
  const placeholder = mode === 'add' ? '/Users/josue/project' : 'Project title'

  return (
    <div role="presentation" style={backdropStyle}>
      <section role="dialog" aria-modal="true" aria-label={title} style={dialogStyle}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h2 style={titleStyle}>{title}</h2>
          <p style={descriptionStyle}>{description}</p>
        </div>

        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>{label}</span>
          <input
            autoFocus
            aria-label={label}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onSubmit()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                onCancel()
              }
            }}
            style={inputStyle}
          />
        </label>

        <div style={footerStyle}>
          <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
            Cancel
          </button>
          <button type="button" onClick={onSubmit} style={primaryButtonStyle}>
            {mode === 'add' ? 'Add project' : 'Save'}
          </button>
        </div>
      </section>
    </div>
  )
}

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 80,
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background: 'rgba(0, 0, 0, 0.36)',
}

const dialogStyle: CSSProperties = {
  width: 'min(460px, calc(100vw - 48px))',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--bg-panel)',
  boxShadow: '0 18px 60px rgba(0, 0, 0, 0.38)',
  display: 'grid',
  gap: 16,
  padding: 18,
}

const titleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-primary)',
  fontSize: 16,
  lineHeight: 1.25,
}

const descriptionStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-muted)',
  fontSize: 12,
  lineHeight: 1.45,
}

const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
}

const fieldLabelStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: 12,
  fontWeight: 700,
}

const inputStyle: CSSProperties = {
  height: 34,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  padding: '0 10px',
  font: 'inherit',
}

const footerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
}

const secondaryButtonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--text-secondary)',
  height: 32,
  padding: '0 12px',
  cursor: 'pointer',
}

const primaryButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  background: 'var(--accent)',
  color: 'var(--text-on-color)',
  borderColor: 'var(--accent)',
}
