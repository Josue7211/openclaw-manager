/*
 * Copied/adapted from T3 Code apps/web/src/components/ProjectScriptsControl.tsx
 * (MIT License). ClawControl keeps the dialog in the T3 vendor boundary and
 * supplies project persistence through the chat adapter.
 */

import { useId, useState, type FormEvent } from 'react'
import {
  Bug,
  Flask,
  Hammer,
  ListChecks,
  Play,
  Trash,
  Wrench,
} from '@phosphor-icons/react'
import type { ProjectScript, ProjectScriptIcon } from './ProjectScriptsControl'

const SCRIPT_ICONS: Array<{ id: ProjectScriptIcon; label: string }> = [
  { id: 'play', label: 'Play' },
  { id: 'test', label: 'Test' },
  { id: 'lint', label: 'Lint' },
  { id: 'configure', label: 'Configure' },
  { id: 'build', label: 'Build' },
  { id: 'debug', label: 'Debug' },
]

export interface ProjectScriptDialogDraft {
  name: string
  command: string
  icon: ProjectScriptIcon | string | null
  runOnWorktreeCreate: boolean
}

interface ProjectScriptDialogProps {
  mode: 'add' | 'edit'
  draft: ProjectScriptDialogDraft
  editingScript?: ProjectScript | null
  onDraftChange: (draft: ProjectScriptDialogDraft) => void
  onCancel: () => void
  onSave: () => void
  onDelete?: (script: ProjectScript) => void
}

function isProjectScriptIcon(value: string | null | undefined): value is ProjectScriptIcon {
  return SCRIPT_ICONS.some(icon => icon.id === value)
}

function normalizedIcon(value: string | null | undefined): ProjectScriptIcon {
  return isProjectScriptIcon(value) ? value : 'play'
}

function ScriptIcon({ icon, size = 16 }: { icon: string | null | undefined; size?: number }) {
  const value = normalizedIcon(icon)
  if (value === 'test') return <Flask size={size} />
  if (value === 'lint') return <ListChecks size={size} />
  if (value === 'configure') return <Wrench size={size} />
  if (value === 'build') return <Hammer size={size} />
  if (value === 'debug') return <Bug size={size} />
  return <Play size={size} weight="fill" />
}

export default function ProjectScriptDialog({
  mode,
  draft,
  editingScript = null,
  onDraftChange,
  onCancel,
  onSave,
  onDelete,
}: ProjectScriptDialogProps) {
  const formId = useId()
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const isEditing = mode === 'edit'

  const updateDraft = (patch: Partial<ProjectScriptDialogDraft>) => {
    onDraftChange({ ...draft, ...patch })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.name.trim()) {
      setValidationError('Name is required.')
      return
    }
    if (!draft.command.trim()) {
      setValidationError('Command is required.')
      return
    }
    setValidationError(null)
    onSave()
  }

  return (
    <>
      <div role="dialog" aria-modal="true" aria-label={isEditing ? 'Edit Action' : 'Add Action'} style={overlayStyle}>
        <form id={formId} onSubmit={submit} style={dialogStyle}>
          <header style={{ display: 'grid', gap: 5 }}>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20 }}>
              {isEditing ? 'Edit Action' : 'Add Action'}
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
              Actions are project-scoped commands you can run from the top bar.
            </p>
          </header>

          <label style={labelStyle}>
            Name
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  aria-label="Choose icon"
                  aria-expanded={iconPickerOpen}
                  onClick={() => setIconPickerOpen(open => !open)}
                  style={iconButtonStyle}
                >
                  <ScriptIcon icon={draft.icon} size={18} />
                </button>
                {iconPickerOpen && (
                  <div role="menu" aria-label="Action icons" style={iconPickerStyle}>
                    {SCRIPT_ICONS.map(icon => (
                      <button
                        key={icon.id}
                        type="button"
                        role="menuitem"
                        aria-current={normalizedIcon(draft.icon) === icon.id ? 'true' : undefined}
                        onClick={() => {
                          updateDraft({ icon: icon.id })
                          setIconPickerOpen(false)
                        }}
                        style={{
                          ...iconChoiceStyle,
                          borderColor: normalizedIcon(draft.icon) === icon.id
                            ? 'color-mix(in srgb, var(--accent) 68%, var(--border))'
                            : 'var(--border)',
                          background: normalizedIcon(draft.icon) === icon.id
                            ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                            : 'transparent',
                        }}
                      >
                        <ScriptIcon icon={icon.id} />
                        <span>{icon.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                value={draft.name}
                onChange={(event) => updateDraft({ name: event.target.value })}
                autoFocus
                placeholder="Test"
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </label>

          <label style={labelStyle}>
            Command
            <textarea
              value={draft.command}
              onChange={(event) => updateDraft({ command: event.target.value })}
              placeholder="npm run test"
              rows={5}
              style={textareaStyle}
            />
          </label>

          <label style={switchRowStyle}>
            <span>Run automatically on project setup</span>
            <input
              type="checkbox"
              checked={draft.runOnWorktreeCreate}
              onChange={(event) => updateDraft({ runOnWorktreeCreate: event.target.checked })}
            />
          </label>

          {validationError && (
            <p role="alert" style={{ margin: 0, color: 'var(--red-500)', fontSize: 13 }}>
              {validationError}
            </p>
          )}

          <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            {isEditing && editingScript && onDelete && (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                style={{ ...buttonStyle, marginRight: 'auto', color: 'var(--red-500)' }}
              >
                <Trash size={14} />
                Delete
              </button>
            )}
            <button type="button" onClick={onCancel} style={buttonStyle}>Cancel</button>
            <button type="submit" style={primaryButtonStyle}>
              {isEditing ? 'Save changes' : 'Save action'}
            </button>
          </footer>
        </form>
      </div>

      {deleteConfirmOpen && editingScript && onDelete && (
        <div role="alertdialog" aria-modal="true" aria-label={`Delete action ${editingScript.name}?`} style={overlayStyle}>
          <div style={{ ...dialogStyle, width: 'min(420px, calc(100vw - 32px))' }}>
            <header style={{ display: 'grid', gap: 5 }}>
              <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>
                Delete action "{editingScript.name}"?
              </h2>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                This action cannot be undone.
              </p>
            </header>
            <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setDeleteConfirmOpen(false)} style={buttonStyle}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(false)
                  onDelete(editingScript)
                }}
                style={{ ...primaryButtonStyle, background: 'var(--red-500)' }}
              >
                Delete action
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(0, 0, 0, 0.38)',
} as const

const dialogStyle = {
  width: 'min(520px, calc(100vw - 32px))',
  display: 'grid',
  gap: 14,
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--bg-panel)',
  padding: 18,
  boxShadow: '0 22px 60px rgba(0,0,0,0.36)',
} as const

const labelStyle = {
  display: 'grid',
  gap: 6,
  color: 'var(--text-muted)',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
} as const

const inputStyle = {
  height: 36,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  padding: '0 10px',
  font: 'inherit',
  textTransform: 'none',
} as const

const textareaStyle = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  padding: 10,
  font: 'inherit',
  resize: 'vertical',
  textTransform: 'none',
} as const

const iconButtonStyle = {
  width: 36,
  height: 36,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
} as const

const iconPickerStyle = {
  position: 'absolute',
  zIndex: 42,
  top: 42,
  left: 0,
  width: 220,
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 6,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-panel)',
  padding: 8,
  boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
} as const

const iconChoiceStyle = {
  minHeight: 58,
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  display: 'grid',
  placeItems: 'center',
  gap: 4,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 11,
} as const

const switchRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  padding: '9px 10px',
  fontSize: 13,
} as const

const buttonStyle = {
  minHeight: 32,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '0 12px',
  font: 'inherit',
  cursor: 'pointer',
} as const

const primaryButtonStyle = {
  ...buttonStyle,
  background: 'var(--accent)',
  color: 'var(--text-on-color)',
} as const
