/*
 * Copied/adapted from T3 Code apps/web/src/components/Sidebar.tsx project
 * rename dialog and command-palette add-project flow (MIT License).
 * This app keeps this as a small vendor boundary for project sidebar
 * dialogs instead of using raw window.prompt calls.
 */

import { useEffect, useRef, type CSSProperties } from 'react'
import { hermesAgentProjectDisplayLabel } from '@/chat/t3-adapters/projectDisplayLabels'

export type ProjectSidebarDialogMode = 'add' | 'rename' | 'delete'

const PROJECT_DIALOG_Z_INDEX = 10020

export default function ProjectSidebarDialog({
  mode,
  value,
  projectPath,
  projectEnvironmentLabel,
  error,
  submitting = false,
  onChange,
  onCancel,
  onBrowse,
  onSubmit,
}: {
  mode: ProjectSidebarDialogMode
  value: string
  projectPath?: string
  projectEnvironmentLabel?: string
  error?: string | null
  submitting?: boolean
  onChange: (value: string) => void
  onCancel: () => void
  onBrowse?: () => void
  onSubmit: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const title = mode === 'add' ? 'Add project' : mode === 'delete' ? 'Remove project' : 'Rename project'
  const titleId = `project-sidebar-dialog-${mode}-title`
  const descriptionId = `project-sidebar-dialog-${mode}-description`
  const label = mode === 'add' ? 'Project folder path' : 'Project title'
  const description = mode === 'add'
    ? 'Enter local project directories to add them to the Hermes Agent workspace.'
    : mode === 'delete'
      ? 'Remove this project from the Hermes Agent workspace. Saved chats and files are not deleted.'
      : projectPath
        ? `Update the title for ${projectPath}.`
        : 'Update the project title.'
  const placeholder = mode === 'add' ? '/path/to/project' : 'Project title'
  const submitDisabled = submitting || (mode !== 'delete' && !value.trim())
  const submitLabel = mode === 'delete'
    ? `Remove project ${value.trim() || 'Untitled project'}`
    : undefined

  useEffect(() => {
    if (submitting) return
    if (mode === 'delete') dialogRef.current?.focus()
  }, [mode, submitting])

  useEffect(() => {
    if (submitting) return
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (mode === 'delete' && event.key === 'Enter') {
        event.preventDefault()
        onSubmit()
      }
    }
    window.addEventListener('keydown', handleDialogKeyDown)
    return () => window.removeEventListener('keydown', handleDialogKeyDown)
  }, [mode, onCancel, onSubmit, submitting])

  return (
    <div role="presentation" style={backdropStyle}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        style={dialogStyle}
      >
        <div style={{ display: 'grid', gap: 4 }}>
          <h2 id={titleId} style={titleStyle}>{title}</h2>
          <p id={descriptionId} style={descriptionStyle}>{description}</p>
        </div>

        {mode === 'delete' ? (
          <ProjectDeleteSummary
            projectName={value}
            projectPath={projectPath}
            projectEnvironmentLabel={projectEnvironmentLabel}
          />
        ) : (
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>{label}</span>
            {mode === 'add' ? (
              <textarea
                autoFocus
                aria-label={label}
                value={value}
                placeholder={placeholder}
                disabled={submitting}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  if (submitting) return
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    onSubmit()
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onCancel()
                  }
                }}
                rows={3}
                style={textareaStyle}
              />
            ) : (
              <input
                autoFocus
                aria-label={label}
                value={value}
                placeholder={placeholder}
                disabled={submitting}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  if (submitting) return
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
            )}
          </label>
        )}

        {error ? (
          <div role="alert" style={errorStyle}>
            {error}
          </div>
        ) : null}

        <div style={footerStyle}>
          <button type="button" onClick={onCancel} disabled={submitting} style={buttonStyle(secondaryButtonStyle, submitting)}>
            Cancel
          </button>
          {mode === 'add' && onBrowse ? (
            <button type="button" onClick={onBrowse} disabled={submitting} style={buttonStyle(secondaryButtonStyle, submitting)}>
              Choose folder
            </button>
          ) : null}
          <button
            type="button"
            aria-label={submitLabel}
            onClick={onSubmit}
            disabled={submitDisabled}
            style={buttonStyle(mode === 'delete' ? destructiveButtonStyle : primaryButtonStyle, submitDisabled)}
          >
            {submitting
              ? mode === 'add'
                ? 'Adding...'
                : mode === 'delete'
                  ? 'Removing...'
                  : 'Saving...'
              : mode === 'add'
                ? 'Add project'
                : mode === 'delete'
                  ? 'Remove project'
                  : 'Save'}
          </button>
        </div>
      </section>
    </div>
  )
}

function ProjectDeleteSummary({
  projectName,
  projectPath,
  projectEnvironmentLabel,
}: {
  projectName: string
  projectPath?: string
  projectEnvironmentLabel?: string
}) {
  const displayEnvironmentLabel = projectEnvironmentLabel
    ? hermesAgentProjectDisplayLabel(projectEnvironmentLabel)
    : ''

  return (
    <div style={deleteSummaryStyle}>
      <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
        <span style={fieldLabelStyle}>Project</span>
        <span style={deleteProjectNameStyle}>{projectName || 'Untitled project'}</span>
        {displayEnvironmentLabel ? (
          <span style={environmentStyle}>
            {displayEnvironmentLabel}
          </span>
        ) : null}
        {projectPath ? <code style={pathStyle}>{projectPath}</code> : null}
      </div>
      <div role="note" style={warningStyle}>
        This only removes the project entry from the Hermes Agent workspace. It does not delete the folder, repository, or chat history.
      </div>
    </div>
  )
}

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: PROJECT_DIALOG_Z_INDEX,
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background: 'rgba(0, 0, 0, 0.68)',
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
}

const dialogStyle: CSSProperties = {
  width: 'min(460px, calc(100vw - 48px))',
  border: '1px solid var(--border)',
  borderRadius: 10,
  backgroundColor: '#18181f',
  backgroundClip: 'padding-box',
  opacity: 1,
  isolation: 'isolate',
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
  width: '100%',
  boxSizing: 'border-box',
  height: 34,
  border: '1px solid var(--border)',
  borderRadius: 8,
  backgroundColor: '#0a0a0c',
  color: 'var(--text-primary)',
  padding: '0 10px',
  font: 'inherit',
}

const textareaStyle: CSSProperties = {
  ...inputStyle,
  height: 'auto',
  minHeight: 82,
  padding: '8px 10px',
  lineHeight: 1.35,
  resize: 'vertical',
}

const errorStyle: CSSProperties = {
  border: '1px solid color-mix(in srgb, var(--danger, #ef4444) 55%, transparent)',
  borderRadius: 8,
  backgroundColor: 'color-mix(in srgb, var(--danger, #ef4444) 12%, #0a0a0c)',
  color: 'var(--danger, #ef4444)',
  fontSize: 12,
  lineHeight: 1.45,
  padding: '8px 10px',
}

const footerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
}

const secondaryButtonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  backgroundColor: '#18181f',
  color: 'var(--text-secondary)',
  height: 32,
  padding: '0 12px',
  cursor: 'pointer',
}

const primaryButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  backgroundColor: 'var(--accent)',
  color: 'var(--text-on-color)',
  borderColor: 'var(--accent)',
}

const destructiveButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  backgroundColor: 'var(--red-500, #ef4444)',
  color: '#fff',
  borderColor: 'var(--red-500, #ef4444)',
}

const deleteSummaryStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  border: '1px solid var(--border)',
  borderRadius: 8,
  backgroundColor: '#0a0a0c',
  padding: 12,
}

const deleteProjectNameStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: 14,
  fontWeight: 700,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const environmentStyle: CSSProperties = {
  width: 'fit-content',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  border: '1px solid var(--border)',
  borderRadius: 999,
  background: 'var(--bg-card-solid, #18181f)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  lineHeight: 1.3,
  padding: '2px 7px',
}

const pathStyle: CSSProperties = {
  display: 'block',
  minWidth: 0,
  overflowWrap: 'anywhere',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
  fontSize: 11,
  lineHeight: 1.45,
}

const warningStyle: CSSProperties = {
  border: '1px solid color-mix(in srgb, var(--red-500, #ef4444) 42%, transparent)',
  borderRadius: 8,
  background: 'color-mix(in srgb, var(--red-500, #ef4444) 10%, var(--bg-base, #0a0a0c))',
  color: 'var(--text-secondary)',
  fontSize: 12,
  lineHeight: 1.45,
  padding: '8px 10px',
}

function buttonStyle(base: CSSProperties, disabled: boolean): CSSProperties {
  return {
    ...base,
    cursor: disabled ? 'not-allowed' : base.cursor,
    opacity: disabled ? 0.58 : base.opacity,
  }
}
