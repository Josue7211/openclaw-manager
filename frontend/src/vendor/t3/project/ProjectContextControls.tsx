/*
 * Copied/adapted from T3 Code's chat header/project context controls.
 * ClawControl passes project/session state and local usage UI in through props
 * so Chat.tsx does not own a bespoke header/context implementation.
 */

import type { ReactNode } from 'react'
import {
  CaretLeft,
  FolderOpen,
  GitBranch,
  GitDiff,
  Terminal,
} from '@phosphor-icons/react'
import type { ClaudeSession } from '@/chat/t3-adapters/gatewaySessionTypes'
import type {
  ChatActivePanel,
  ChatWorkspaceProject,
} from '@/chat/t3-adapters/projectWorkspace'

function ContextIconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="hover-bg"
      style={{
        width: 30,
        height: 30,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg-card)',
        color: 'var(--text-secondary)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

export function ProjectContextToolbarButton({
  label,
  onClick,
  children,
  iconOnly = false,
  expanded,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  iconOnly?: boolean
  expanded?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      className="chat-context-button hover-bg"
      style={{
        height: 30,
        width: iconOnly ? 30 : undefined,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg-card)',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: iconOnly ? 0 : '0 10px',
        font: 'inherit',
        fontSize: 12,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

export function ProjectContextSelect({
  label,
  value,
  options,
  icon,
  maxWidth = 170,
  subtle = false,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  icon?: ReactNode
  maxWidth?: number
  subtle?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label
      title={label}
      className="chat-context-select"
      style={{
        height: 30,
        border: subtle ? '1px solid transparent' : '1px solid var(--border)',
        borderRadius: 8,
        background: subtle ? 'transparent' : 'var(--bg-card)',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 8px',
        minWidth: 0,
      }}
    >
      {icon}
      <select
        aria-label={label}
        className="chat-context-select-control"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          maxWidth,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ProjectHeaderPanel({
  panel,
  project,
  session,
  runtime,
  branch,
  onClose,
  onRunReview,
}: {
  panel: Exclude<ChatActivePanel, null>
  project: ChatWorkspaceProject
  session: ClaudeSession | null
  runtime: string
  branch: string
  onClose: () => void
  onRunReview: () => void
}) {
  const title = panel === 'review' ? 'Diff review' : 'Session info'
  return (
    <section
      role="region"
      aria-label={title}
      data-t3-project-header-panel
      style={{
        flexShrink: 0,
        display: 'grid',
        gap: 10,
        marginBottom: 12,
        padding: 12,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg-card)',
        color: 'var(--text-secondary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>{title}</strong>
        <ContextIconButton label={`Close ${title}`} onClick={onClose}>
          <CaretLeft size={14} />
        </ContextIconButton>
      </div>
      {panel === 'review' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>
            Review runs in the selected project directory with Codex CLI review mode.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <ProjectContextToolbarButton label="Run Codex review" onClick={onRunReview}>
              <GitDiff size={15} />
              <span>Run Codex review</span>
            </ProjectContextToolbarButton>
            <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{project.path}</code>
          </div>
        </div>
      ) : (
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '6px 12px', margin: 0, fontSize: 12 }}>
          <dt style={{ color: 'var(--text-muted)' }}>Chat</dt>
          <dd style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.label || 'New chat'}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Thread</dt>
          <dd style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.key || 'unsaved'}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Project</dt>
          <dd style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.name}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Directory</dt>
          <dd style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.path}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Runtime</dt>
          <dd style={{ margin: 0 }}>{runtime}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Branch</dt>
          <dd style={{ margin: 0 }}>{branch}</dd>
        </dl>
      )}
    </section>
  )
}

export function ProjectComposerContextBar({
  projectPath,
  projects,
  onProjectChange,
  runtime,
  runtimeModes,
  onRuntimeChange,
  branch,
  branches,
  onBranchChange,
  usageSlot,
}: {
  projectPath: string
  projects: ChatWorkspaceProject[]
  onProjectChange: (value: string) => void
  runtime: string
  runtimeModes: string[]
  onRuntimeChange: (value: string) => void
  branch: string
  branches: string[]
  onBranchChange: (value: string) => void
  usageSlot?: ReactNode
}) {
  return (
    <div
      data-testid="chat-local-context-toolbar"
      data-t3-project-context-toolbar
      aria-label="Local chat context"
      className="chat-local-context-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        color: 'var(--text-muted)',
        fontSize: 12,
      }}
    >
      <ProjectContextSelect
        label="Project"
        icon={<FolderOpen size={14} />}
        value={projectPath}
        onChange={onProjectChange}
        options={projects.map((project) => ({ value: project.path, label: project.name }))}
        maxWidth={180}
        subtle
      />
      <ProjectContextSelect
        label="Runtime"
        icon={<Terminal size={14} />}
        value={runtime}
        onChange={onRuntimeChange}
        options={runtimeModes.map((value) => ({ value, label: value }))}
        maxWidth={160}
        subtle
      />
      <ProjectContextSelect
        label="Branch"
        icon={<GitBranch size={14} />}
        value={branch}
        onChange={onBranchChange}
        options={branches.map((value) => ({ value, label: value }))}
        maxWidth={190}
        subtle
      />
      {usageSlot}
    </div>
  )
}

export function ProjectEnvironmentDialog({
  projectPath,
  projects,
  runtime,
  runtimeModes,
  branch,
  branches,
  onProjectChange,
  onRuntimeChange,
  onBranchChange,
  onClose,
}: {
  projectPath: string
  projects: ChatWorkspaceProject[]
  runtime: string
  runtimeModes: string[]
  branch: string
  branches: string[]
  onProjectChange: (value: string) => void
  onRuntimeChange: (value: string) => void
  onBranchChange: (value: string) => void
  onClose: () => void
}) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Environment settings" data-t3-project-environment-dialog style={{
      position: 'fixed',
      inset: 0,
      zIndex: 40,
      display: 'grid',
      placeItems: 'center',
      background: 'rgba(0, 0, 0, 0.38)',
    }}>
      <div style={{
        width: 'min(520px, calc(100vw - 32px))',
        display: 'grid',
        gap: 14,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--bg-panel)',
        padding: 18,
        boxShadow: '0 22px 60px rgba(0,0,0,0.36)',
      }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20 }}>Environment settings</h2>
        <ProjectContextSelect label="Project" icon={<FolderOpen size={14} />} value={projectPath} onChange={onProjectChange} options={projects.map((project) => ({ value: project.path, label: project.name }))} maxWidth={360} />
        <ProjectContextSelect label="Runtime" icon={<Terminal size={14} />} value={runtime} onChange={onRuntimeChange} options={runtimeModes.map((value) => ({ value, label: value }))} maxWidth={360} />
        <ProjectContextSelect label="Branch" icon={<GitBranch size={14} />} value={branch} onChange={onBranchChange} options={branches.map((value) => ({ value, label: value }))} maxWidth={360} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ProjectContextToolbarButton label="Close environment settings" onClick={onClose}>Close</ProjectContextToolbarButton>
        </div>
      </div>
    </div>
  )
}
