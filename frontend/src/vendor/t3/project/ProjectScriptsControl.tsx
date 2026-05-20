// Copied/adapted from T3 Code apps/web/src/components/ProjectScriptsControl.tsx.
// ClawControl keeps this as the active project action toolbar boundary and
// supplies thin callbacks for terminal/review/info/environment behavior.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Bug,
  CaretDown,
  Flask,
  Gear,
  GitDiff,
  Hammer,
  Info,
  ListChecks,
  Play,
  Plus,
  Terminal,
  Trash,
  Wrench,
} from '@phosphor-icons/react'
import { primaryProjectScript as resolvePrimaryProjectScript } from './projectScripts'

export type ProjectScriptIcon = 'play' | 'test' | 'lint' | 'configure' | 'build' | 'debug'

export interface ProjectScript {
  id: string
  name: string
  command: string
  cwd?: string | null
  icon?: ProjectScriptIcon | string | null
  runOnWorktreeCreate?: boolean
}

export interface ProjectScriptStatusSnapshot {
  title: string
  displayText: string
  status: 'connecting' | 'running' | 'exited' | 'error'
  cwd?: string
  error?: string | null
}

interface ProjectScriptsControlProps {
  scripts: ProjectScript[]
  preferredScriptId?: string | null
  terminalStatus?: ProjectScriptStatusSnapshot | null
  onSelectScript?: (scriptId: string) => void
  onRunScript: (script: ProjectScript) => void
  onAddScript: () => void
  onEditScript: (script: ProjectScript) => void
  onDeleteScript: (script: ProjectScript) => void
  onChangeEnvironment: () => void
  onOpenTerminal: () => void
  onOpenReview: () => void
  onOpenInfo: () => void
}

function primaryProjectScript(scripts: ProjectScript[], preferredScriptId?: string | null): ProjectScript | null {
  if (preferredScriptId) {
    const preferred = scripts.find(script => script.id === preferredScriptId)
    if (preferred) return preferred
  }
  return resolvePrimaryProjectScript(scripts)
}

function ScriptIcon({ icon, size = 15 }: { icon?: string | null; size?: number }) {
  if (icon === 'test') return <Flask size={size} />
  if (icon === 'lint') return <ListChecks size={size} />
  if (icon === 'configure') return <Wrench size={size} />
  if (icon === 'build') return <Hammer size={size} />
  if (icon === 'debug') return <Bug size={size} />
  return <Play size={size} weight="fill" />
}

function useDismissibleMenu(open: boolean, setOpen: (open: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return undefined
    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, setOpen])
  return ref
}

function ToolbarButton({
  label,
  children,
  onClick,
  iconOnly = false,
  expanded,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  iconOnly?: boolean
  expanded?: boolean
}) {
  return (
    <button
      type="button"
      className="chat-toolbar-button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      onClick={onClick}
      style={{
        minHeight: 32,
        minWidth: iconOnly ? 32 : 0,
        maxWidth: iconOnly ? 32 : 220,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: iconOnly ? 0 : 7,
        padding: iconOnly ? 0 : '0 10px',
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function MenuButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
      style={{
        border: 0,
        borderRadius: 6,
        background: active ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 30,
        padding: '0 8px',
        textAlign: 'left',
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      {icon}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

export default function ProjectScriptsControl({
  scripts,
  preferredScriptId = null,
  terminalStatus,
  onSelectScript,
  onRunScript,
  onAddScript,
  onEditScript,
  onDeleteScript,
  onChangeEnvironment,
  onOpenTerminal,
  onOpenReview,
  onOpenInfo,
}: ProjectScriptsControlProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useDismissibleMenu(menuOpen, setMenuOpen)
  const primaryScript = primaryProjectScript(scripts, preferredScriptId)
  const closeMenu = () => setMenuOpen(false)

  return (
    <div
      data-testid="chat-top-actions-toolbar"
      aria-label="Project scripts"
      className="chat-top-actions-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
        flexWrap: 'wrap',
        color: 'var(--text-muted)',
        fontSize: 12,
        minWidth: 0,
      }}
    >
      {terminalStatus && (
        <span
          role="status"
          aria-label="Terminal status"
          title={terminalStatus.cwd || undefined}
          style={{
            minHeight: 28,
            maxWidth: 220,
            border: '1px solid var(--border)',
            borderRadius: 999,
            background: terminalStatus.error
              ? 'color-mix(in srgb, var(--red-500) 12%, transparent)'
              : 'var(--bg-card)',
            color: terminalStatus.error
              ? 'var(--red-500)'
              : terminalStatus.status === 'running'
                ? 'var(--secondary)'
                : 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 9px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <Terminal size={13} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {terminalStatus.title}: {terminalStatus.displayText}
          </span>
        </span>
      )}

      {primaryScript ? (
        <ToolbarButton label={`Run ${primaryScript.name}`} onClick={() => onRunScript(primaryScript)}>
          <ScriptIcon icon={primaryScript.icon} />
          <span>{`Run ${primaryScript.name}`}</span>
        </ToolbarButton>
      ) : (
        <ToolbarButton label="Add action" onClick={onAddScript}>
          <Plus size={15} />
          <span>Add action</span>
        </ToolbarButton>
      )}

      <div ref={menuRef} style={{ position: 'relative' }}>
        <ToolbarButton
          label="More project actions"
          onClick={() => setMenuOpen(current => !current)}
          iconOnly
          expanded={menuOpen}
        >
          <CaretDown size={15} />
        </ToolbarButton>
        {menuOpen && (
          <div
            role="menu"
            aria-label="Project action menu"
            style={{
              position: 'absolute',
              zIndex: 20,
              right: 0,
              top: 36,
              width: 244,
              display: 'grid',
              gap: 3,
              padding: 5,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--bg-panel)',
              boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
            }}
          >
            {scripts.map(script => (
              <MenuButton
                key={script.id}
                label={script.runOnWorktreeCreate ? `${script.name} (setup)` : script.name}
                icon={<ScriptIcon icon={script.icon} size={14} />}
                active={primaryScript?.id === script.id}
                onClick={() => {
                  onSelectScript?.(script.id)
                  closeMenu()
                }}
              />
            ))}
            <MenuButton
              label="Add action"
              icon={<Plus size={14} />}
              onClick={() => {
                onAddScript()
                closeMenu()
              }}
            />
            {primaryScript && (
              <>
                <MenuButton
                  label="Edit selected action"
                  icon={<Gear size={14} />}
                  onClick={() => {
                    onEditScript(primaryScript)
                    closeMenu()
                  }}
                />
                <MenuButton
                  label="Delete selected action"
                  icon={<Trash size={14} />}
                  onClick={() => {
                    onDeleteScript(primaryScript)
                    closeMenu()
                  }}
                />
              </>
            )}
            <MenuButton
              label="Change environment"
              icon={<Gear size={14} />}
              onClick={() => {
                onChangeEnvironment()
                closeMenu()
              }}
            />
          </div>
        )}
      </div>

      <ToolbarButton label="Open terminal" onClick={onOpenTerminal} iconOnly>
        <Terminal size={15} />
      </ToolbarButton>
      <ToolbarButton label="Review changes" onClick={onOpenReview} iconOnly>
        <GitDiff size={15} />
      </ToolbarButton>
      <ToolbarButton label="Session info" onClick={onOpenInfo} iconOnly>
        <Info size={15} />
      </ToolbarButton>
    </div>
  )
}
