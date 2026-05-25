// Copied/adapted from T3 Code apps/web/src/components/ProjectScriptsControl.tsx.
// clawctrl keeps this as the active project action toolbar boundary and
// supplies thin callbacks for terminal/review/info/environment behavior.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  Bug,
  CaretDown,
  ClipboardText,
  Flask,
  FolderOpen,
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
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { primaryProjectScript as resolvePrimaryProjectScript } from './projectScripts'
import { keybindingValueForCommand, type ResolvedProjectScriptKeybindingsConfig } from './projectScriptKeybindings'

export type ProjectScriptIcon = 'play' | 'test' | 'lint' | 'configure' | 'build' | 'debug'

export interface ProjectScript {
  id: string
  name: string
  command: string
  cwd?: string | null
  icon?: ProjectScriptIcon | string | null
  runOnWorktreeCreate?: boolean
  keybinding?: string | null
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
  projectReady?: boolean
  projectName?: string | null
  projectPath?: string | null
  projectEnvironmentLabel?: string | null
  projectUnavailableLabel?: string
  onSelectScript?: (scriptId: string) => void
  onRunScript: (script: ProjectScript) => void
  onAddScript: () => void
  onEditScript: (script: ProjectScript) => void
  onDeleteScript: (script: ProjectScript) => void
  onRenameProject?: () => void
  onDeleteProject?: () => void
  onAddProject?: () => void
  onClearProject?: () => void
  onChangeEnvironment: () => void
  onOpenTerminal: () => void
  onOpenReview: () => void
  onOpenInfo: () => void
  keybindings?: ResolvedProjectScriptKeybindingsConfig
}

const EMPTY_PROJECT_SCRIPT_KEYBINDINGS: ResolvedProjectScriptKeybindingsConfig = []
const PROJECT_MENU_Z_INDEX = 10000

function normalizeShortcutToken(value: string): string {
  const token = value.trim().toLowerCase()
  if (token === 'cmd' || token === 'command' || token === 'meta') return 'mod'
  if (token === 'control') return 'ctrl'
  if (token === 'option') return 'alt'
  if (token === 'esc') return 'escape'
  return token
}

function shortcutMatchesEvent(shortcut: string, event: KeyboardEvent): boolean {
  const tokens = shortcut
    .split('+')
    .map(normalizeShortcutToken)
    .filter(Boolean)
  const keyToken = tokens.find(token => !['mod', 'ctrl', 'alt', 'shift'].includes(token))
  if (!keyToken) return false

  const expectedMod = tokens.includes('mod')
  const expectedCtrl = tokens.includes('ctrl')
  const expectedAlt = tokens.includes('alt')
  const expectedShift = tokens.includes('shift')
  const isMacLike = /mac|iphone|ipad|ipod/i.test(navigator.platform || '')
  const requiredCtrl = expectedCtrl || (!isMacLike && expectedMod)
  const requiredMeta = isMacLike && expectedMod
  const eventKey = normalizeShortcutToken(event.key === ' ' ? 'space' : event.key)

  return eventKey === keyToken
    && event.ctrlKey === requiredCtrl
    && event.metaKey === requiredMeta
    && event.altKey === expectedAlt
    && event.shiftKey === expectedShift
}

function scriptCommandKey(script: ProjectScript): string {
  return `script.${script.id}.run`
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

function useDismissibleMenu(
  open: boolean,
  setOpen: (open: boolean) => void,
  floatingRef?: RefObject<HTMLElement | null>,
) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return undefined
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && ref.current?.contains(target)) return
      if (target instanceof Node && floatingRef?.current?.contains(target)) return
      setOpen(false)
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
  }, [floatingRef, open, setOpen])
  return ref
}

function opaqueMenuBackground(): string {
  return '#18181f'
}

function menuItemBackground({ active, danger }: { active?: boolean; danger?: boolean }): string {
  if (danger) return 'color-mix(in srgb, var(--danger, #ef4444) 13%, var(--bg-card-solid, #18181f))'
  if (active) return 'color-mix(in srgb, var(--accent) 16%, var(--bg-card-solid, #18181f))'
  return 'transparent'
}

const menuFocusableSelector = [
  'button:not([disabled])',
  '[role="menuitem"]:not([disabled])',
].join(',')

function menuFocusableItems(menu: HTMLElement | null): HTMLElement[] {
  if (!menu) return []
  return Array.from(menu.querySelectorAll<HTMLElement>(menuFocusableSelector))
}

function focusMenuItem(menu: HTMLElement | null, index: number) {
  const item = menuFocusableItems(menu)[index]
  if (item) item.focus()
}

function handleMenuNavigation(
  event: ReactKeyboardEvent<HTMLElement>,
  menu: HTMLElement | null,
  onClose: () => void,
) {
  if (event.key === 'Escape') {
    event.preventDefault()
    onClose()
    return
  }

  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = menuFocusableItems(menu)
  if (items.length === 0) return

  event.preventDefault()
  const currentIndex = items.findIndex((item) => item === document.activeElement)
  if (event.key === 'Home') {
    items[0]?.focus()
    return
  }
  if (event.key === 'End') {
    items[items.length - 1]?.focus()
    return
  }
  const direction = event.key === 'ArrowDown' ? 1 : -1
  const fallbackIndex = direction > 0 ? -1 : 0
  const nextIndex = (currentIndex === -1 ? fallbackIndex : currentIndex) + direction
  items[(nextIndex + items.length) % items.length]?.focus()
}

function compactProjectPath(path: string): string {
  const value = path.trim().replace(/\\/g, '/').replace(/\/+$/g, '')
  if (!value) return ''
  const parts = value.split('/').filter(Boolean)
  if (parts.length <= 2) return value
  return `.../${parts.slice(-2).join('/')}`
}

function ToolbarButton({
  label,
  children,
  onClick,
  buttonRef,
  iconOnly = false,
  expanded,
  disabled = false,
  danger = false,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  buttonRef?: RefObject<HTMLButtonElement | null>
  iconOnly?: boolean
  expanded?: boolean
  disabled?: boolean
  danger?: boolean
}) {
  const borderColor = danger
    ? 'color-mix(in srgb, var(--danger, #ef4444) 36%, var(--border))'
    : 'var(--border)'
  const background = danger
    ? 'color-mix(in srgb, var(--danger, #ef4444) 12%, var(--bg-card-solid, #18181f))'
    : 'var(--bg-card)'
  const foreground = disabled
    ? 'var(--text-muted)'
    : danger
      ? 'var(--danger, #ef4444)'
      : 'var(--text-primary)'

  return (
    <button
      ref={buttonRef}
      type="button"
      className="chat-toolbar-button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      style={{
        minHeight: 32,
        minWidth: iconOnly ? 32 : 0,
        maxWidth: iconOnly ? 32 : 220,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        background,
        color: foreground,
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
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
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
  disabled = false,
  danger = false,
}: {
  label: string
  icon: ReactNode
  active?: boolean
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  const color = disabled
    ? 'var(--text-muted)'
    : danger
      ? 'var(--danger, #ef4444)'
      : active
        ? 'var(--text-primary)'
        : 'var(--text-muted)'

  return (
    <button
      type="button"
      role="menuitem"
      aria-current={active ? 'true' : undefined}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        onClick()
      }}
      style={{
        border: danger ? '1px solid color-mix(in srgb, var(--danger, #ef4444) 26%, transparent)' : '1px solid transparent',
        borderRadius: 6,
        background: menuItemBackground({ active, danger }),
        color,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 30,
        padding: '0 8px',
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 13,
        opacity: disabled ? 0.55 : 1,
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
  projectReady = true,
  projectName,
  projectPath,
  projectEnvironmentLabel,
  projectUnavailableLabel = 'Select project',
  onSelectScript,
  onRunScript,
  onAddScript,
  onEditScript,
  onDeleteScript,
  onRenameProject,
  onDeleteProject,
  onAddProject,
  onClearProject,
  onChangeEnvironment,
  onOpenTerminal,
  onOpenReview,
  onOpenInfo,
  keybindings = EMPTY_PROJECT_SCRIPT_KEYBINDINGS,
}: ProjectScriptsControlProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const floatingMenuRef = useRef<HTMLDivElement | null>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 244 })
  const menuRef = useDismissibleMenu(menuOpen, setMenuOpen, floatingMenuRef)
  const primaryScript = projectReady ? primaryProjectScript(scripts, preferredScriptId) : null
  const closeMenu = () => setMenuOpen(false)
  const menuWidth = 244
  const projectLabel = projectName?.trim() || 'current project'
  const compactPath = compactProjectPath(projectPath || '')
  const projectPathText = projectPath?.trim() || ''
  const projectPathCopyId = projectPathText ? `project-path:${projectPathText}` : ''
  const {
    copyToClipboard,
    copiedContext,
    errorContext,
  } = useCopyToClipboard<{ id: string }>()
  const projectPathCopied = copiedContext?.id === projectPathCopyId
  const projectPathCopyErrored = errorContext?.id === projectPathCopyId
  const projectPathCopyDefaultLabel = projectReady ? 'Copy project path' : 'Copy selected folder path'
  const projectPathCopyCopiedLabel = projectReady ? 'Copied project path' : 'Copied selected folder path'
  const projectPathCopyRetryLabel = projectReady ? 'Retry copy project path' : 'Retry copy selected folder path'
  const projectPathCopyLabel = projectPathCopyErrored
    ? projectPathCopyRetryLabel
    : projectPathCopied
      ? projectPathCopyCopiedLabel
      : projectPathCopyDefaultLabel
  const projectMetadata = [
    projectEnvironmentLabel?.trim(),
    compactPath,
  ].filter(Boolean).join(' / ')
  const hasUnavailableSelectedProject = !projectReady && Boolean(projectPath?.trim())
  const showProjectFooter = Boolean(projectPathText)
    || (projectReady && (onRenameProject || onDeleteProject))
    || (hasUnavailableSelectedProject && (onAddProject || onClearProject || onDeleteProject))
  const projectDeleteLabel = projectReady
    ? `Remove project ${projectLabel}`
    : 'Remove selected folder'
  const resolvedKeybindings = useMemo(() => [
    ...scripts
      .map((script) => {
        const key = script.keybinding?.trim()
        return key ? { key, command: scriptCommandKey(script) } : null
      })
      .filter((binding): binding is { key: string; command: string } => Boolean(binding)),
    ...keybindings,
  ], [keybindings, scripts])

  useEffect(() => {
    if (!projectReady || resolvedKeybindings.length === 0) return undefined
    const handleScriptShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const target = event.target
      if (
        target instanceof HTMLElement
        && (
          target.closest('input, textarea, select, [contenteditable="true"]')
          || target.closest('[role="dialog"], [role="menu"]')
        )
      ) {
        return
      }
      const script = scripts.find((candidate) => {
        const shortcut = keybindingValueForCommand(resolvedKeybindings, scriptCommandKey(candidate))
        return Boolean(shortcut && shortcutMatchesEvent(shortcut, event))
      })
      if (!script) return
      event.preventDefault()
      onSelectScript?.(script.id)
      onRunScript(script)
      setMenuOpen(false)
    }
    document.addEventListener('keydown', handleScriptShortcut)
    return () => document.removeEventListener('keydown', handleScriptShortcut)
  }, [onRunScript, onSelectScript, projectReady, resolvedKeybindings, scripts])

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger || typeof window === 'undefined') return
    const rect = trigger.getBoundingClientRect()
    const gutter = 8
    const availableWidth = Math.max(120, window.innerWidth - gutter * 2)
    const width = Math.min(menuWidth, availableWidth)
    const renderedHeight = floatingMenuRef.current?.offsetHeight || 238
    const maxLeft = Math.max(gutter, window.innerWidth - width - gutter)
    const left = Math.min(Math.max(gutter, rect.right - width), maxLeft)
    const hasRoomBelow = rect.bottom + 4 + renderedHeight <= window.innerHeight - gutter
    const unclampedTop = hasRoomBelow ? rect.bottom + 4 : rect.top - renderedHeight - 4
    const maxTop = Math.max(gutter, window.innerHeight - renderedHeight - gutter)
    const top = Math.min(Math.max(gutter, unclampedTop), maxTop)
    setMenuPosition({ top, left, width })
  }, [])

  useLayoutEffect(() => {
    if (menuOpen) updateMenuPosition()
  }, [menuOpen, updateMenuPosition])

  useEffect(() => {
    if (!menuOpen) return
    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [menuOpen, updateMenuPosition])

  useEffect(() => {
    if (!menuOpen) return
    window.requestAnimationFrame(() => focusMenuItem(floatingMenuRef.current, 0))
  }, [menuOpen])

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

      {!projectReady ? (
        <ToolbarButton label={projectUnavailableLabel} onClick={onChangeEnvironment}>
          <FolderOpen size={15} />
          <span>{projectUnavailableLabel}</span>
        </ToolbarButton>
      ) : primaryScript ? (
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
          buttonRef={triggerRef}
          label="More project actions"
          onClick={() => setMenuOpen(current => !current)}
          iconOnly
          expanded={menuOpen}
        >
          <CaretDown size={15} />
        </ToolbarButton>
        {menuOpen && createPortal(
          <div
            ref={floatingMenuRef}
            role="menu"
            aria-label="Project action menu"
            onKeyDown={(event) => handleMenuNavigation(event, floatingMenuRef.current, () => {
              setMenuOpen(false)
              triggerRef.current?.focus()
            })}
            style={{
              position: 'fixed',
              zIndex: PROJECT_MENU_Z_INDEX,
              left: menuPosition.left,
              top: menuPosition.top,
              width: menuPosition.width,
              maxHeight: 'min(360px, calc(100vh - 16px))',
              overflow: 'hidden',
              display: 'grid',
              gridTemplateRows: 'minmax(0, 1fr) auto',
              gap: 3,
              padding: 5,
              border: '1px solid var(--border-strong, var(--border))',
              borderRadius: 8,
              background: opaqueMenuBackground(),
              backgroundColor: '#18181f',
              opacity: 1,
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              backgroundClip: 'padding-box',
              isolation: 'isolate',
              boxShadow: '0 18px 42px rgba(0, 0, 0, 0.56), 0 0 0 1px rgba(255, 255, 255, 0.04)',
            }}
          >
            <div
              data-t3-project-action-menu-scroll
              style={{
                minHeight: 0,
                overflowY: 'auto',
                display: 'grid',
                gap: 3,
                paddingRight: 1,
              }}
            >
              {projectReady && scripts.map(script => (
                <MenuButton
                  key={script.id}
                  label={[
                    script.runOnWorktreeCreate ? `${script.name} (setup)` : script.name,
                    keybindingValueForCommand(resolvedKeybindings, scriptCommandKey(script)),
                  ].filter(Boolean).join(' · ')}
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
                disabled={!projectReady}
                onClick={() => {
                  if (!projectReady) return
                  onAddScript()
                  closeMenu()
                }}
              />
              {projectReady && primaryScript && (
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
                    danger
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
            {showProjectFooter ? (
              <div
                data-t3-project-action-menu-footer
                style={{
                  display: 'grid',
                  gap: 3,
                  borderTop: '1px solid var(--border)',
                  paddingTop: 5,
                  marginTop: 2,
                  background: opaqueMenuBackground(),
                  backgroundColor: '#18181f',
                }}
              >
                <div
                  role="group"
                  aria-label="Current project"
                  style={{
                    display: 'grid',
                    gap: 2,
                    minWidth: 0,
                    padding: '2px 6px 4px',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    lineHeight: 1.25,
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {projectLabel}
                  </span>
                  {projectMetadata ? (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {projectMetadata}
                    </span>
                  ) : null}
                </div>
                {projectPathText ? (
                  <MenuButton
                    label={projectPathCopyLabel}
                    icon={<ClipboardText size={14} />}
                    active={projectPathCopied}
                    danger={projectPathCopyErrored}
                    onClick={() => {
                      void copyToClipboard(projectPathText, { id: projectPathCopyId })
                      closeMenu()
                    }}
                  />
                ) : null}
                {projectReady && onRenameProject ? (
                  <MenuButton
                    label={`Rename project ${projectLabel}`}
                    icon={<Gear size={14} />}
                    onClick={() => {
                      onRenameProject()
                      closeMenu()
                    }}
                  />
                ) : null}
                {!projectReady && onAddProject ? (
                  <MenuButton
                    label="Add selected folder"
                    icon={<FolderOpen size={14} />}
                    onClick={() => {
                      onAddProject()
                      closeMenu()
                    }}
                  />
                ) : null}
                {!projectReady && onClearProject ? (
                  <MenuButton
                    label="Clear selected folder"
                    icon={<FolderOpen size={14} />}
                    onClick={() => {
                      onClearProject()
                      closeMenu()
                    }}
                  />
                ) : null}
                {(projectReady || hasUnavailableSelectedProject) && onDeleteProject ? (
                  <div
                    role="group"
                    aria-label="Project danger actions"
                    style={{
                      display: 'grid',
                      gap: 3,
                      borderTop: '1px solid color-mix(in srgb, var(--danger, #ef4444) 34%, var(--border))',
                      marginTop: 3,
                      paddingTop: 5,
                    }}
                  >
                    <MenuButton
                      label={projectDeleteLabel}
                      icon={<Trash size={14} />}
                      danger
                      onClick={() => {
                        onDeleteProject()
                        closeMenu()
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>,
          document.body,
        )}
      </div>

      <ToolbarButton label={projectReady ? 'Open terminal' : 'Select a project before opening terminal'} onClick={onOpenTerminal} iconOnly disabled={!projectReady}>
        <Terminal size={15} />
      </ToolbarButton>
      <ToolbarButton label={projectReady ? 'Review changes' : 'Select a project before reviewing changes'} onClick={onOpenReview} iconOnly disabled={!projectReady}>
        <GitDiff size={15} />
      </ToolbarButton>
      <ToolbarButton label="Session info" onClick={onOpenInfo} iconOnly>
        <Info size={15} />
      </ToolbarButton>
    </div>
  )
}
