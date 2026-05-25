/*
 * Copied/adapted from T3 Code's chat header/project context controls.
 * ClawControl passes project/session state and local usage UI in through props
 * so Chat.tsx does not own a bespoke header/context implementation.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CaretLeft,
  ClipboardText,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GitDiff,
  MagnifyingGlass,
  Terminal,
  Trash,
  X,
} from '@phosphor-icons/react'
import type { HermesSession } from '@/chat/t3-adapters/gatewaySessionTypes'
import type {
  ChatActivePanel,
  ChatWorkspaceProject,
} from '@/chat/t3-adapters/projectWorkspace'
import { hermesAgentProjectDisplayLabel } from '@/chat/t3-adapters/projectDisplayLabels'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { normalizeProjectPathForComparison } from './projectPaths'

const PROJECT_CONTEXT_DIALOG_Z_INDEX = 10020

export function projectRuntimeDisplayLabel(runtime: string): string {
  return hermesAgentProjectDisplayLabel(runtime)
}

function compactPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/g, '')
  if (!normalized) return ''
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 2) return normalized
  return `.../${parts.slice(-2).join('/')}`
}

function machineLabelForProjectPath(path: string): string {
  if (path.startsWith('/run/media/')) {
    const [, , , , volume] = path.split('/')
    if (volume) return volume
  }
  if (path.startsWith('/Volumes/')) {
    const [, , volume] = path.split('/')
    if (volume) return volume
  }
  if (path.startsWith('/Users/')) return 'Local Mac'
  if (path.startsWith('/home/')) return 'Linux'
  if (/^[A-Za-z]:[\\/]/.test(path)) return path.slice(0, 2)
  return ''
}

function projectMachineLabel(project: ChatWorkspaceProject): string {
  const label = project.machineLabel?.trim()
    || project.machine?.trim()
    || project.host?.trim()
    || machineLabelForProjectPath(project.path)
    || project.environmentId?.trim()
    || ''
  return label ? hermesAgentProjectDisplayLabel(label) : ''
}

function projectLocationLabel(project: ChatWorkspaceProject): string {
  const machine = projectMachineLabel(project)
  const path = compactPath(project.path)
  if (machine && path) return `${machine} / ${path}`
  return machine || path
}

function projectSelectOptionValue(project: ChatWorkspaceProject, duplicatePath = false): string {
  return duplicatePath ? JSON.stringify([project.environmentId || '', project.path]) : project.path
}

function unavailableProjectSelectOptionValue(path: string, environmentKey: string): string {
  return environmentKey ? JSON.stringify([environmentKey, path]) : path
}

function normalizedEnvironmentId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || ''
}

function preferredProjectForEnvironment(
  projects: ChatWorkspaceProject[],
  environmentId?: string | null,
): ChatWorkspaceProject | null {
  const environmentKey = normalizedEnvironmentId(environmentId)
  if (environmentKey) {
    return projects.find((project) => normalizedEnvironmentId(project.environmentId) === environmentKey) ?? null
  }
  return projects.find((project) => normalizedEnvironmentId(project.environmentId) === 'local')
    ?? projects.find((project) => !normalizedEnvironmentId(project.environmentId))
    ?? projects[0]
    ?? null
}

function projectFromSelectValue(
  value: string,
  projects: ChatWorkspaceProject[],
  environmentId?: string | null,
): ChatWorkspaceProject | null {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
      const environmentKey = parsed[0].trim().toLowerCase()
      const pathKey = normalizeProjectPathForComparison(parsed[1])
      return preferredProjectForEnvironment(
        projects.filter((project) => normalizeProjectPathForComparison(project.path) === pathKey),
        environmentKey,
      )
    }
  } catch {
    // Legacy select values were raw paths.
  }
  const pathKey = normalizeProjectPathForComparison(value)
  return preferredProjectForEnvironment(
    projects.filter((project) => normalizeProjectPathForComparison(project.path) === pathKey),
    environmentId,
  )
}

function selectableProjects(projects: ChatWorkspaceProject[]): ChatWorkspaceProject[] {
  return projects.filter((project) => project.path.trim())
}

function projectEnvironmentLabel(project: ChatWorkspaceProject): string {
  return projectMachineLabel(project) || 'Local'
}

function projectMatchesQuery(project: ChatWorkspaceProject, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  return [
    project.id,
    project.name,
    project.path,
    project.root,
    project.environmentId,
    project.machineLabel,
    project.machine,
    project.host,
    project.repositoryIdentity?.canonicalKey,
    project.repositoryIdentity?.displayName,
    project.repositoryIdentity?.name,
    project.repositoryIdentity?.owner,
    project.repositoryIdentity?.remoteName,
    project.repositoryIdentity?.remoteUrl,
  ]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(normalizedQuery))
}

function projectListItemKey(project: ChatWorkspaceProject): string {
  return [
    project.environmentId || 'local',
    project.id || '',
    normalizeProjectPathForComparison(project.path),
  ].join(':')
}

function projectIsSelected(
  project: ChatWorkspaceProject,
  projectPath: string,
  projectEnvironmentId?: string,
): boolean {
  const selectedPathKey = normalizeProjectPathForComparison(projectPath)
  if (!selectedPathKey || normalizeProjectPathForComparison(project.path) !== selectedPathKey) return false
  const environmentKey = normalizedEnvironmentId(projectEnvironmentId)
  return environmentKey
    ? normalizedEnvironmentId(project.environmentId) === environmentKey
    : true
}

interface ProjectSelectOption {
  value: string
  label: string
  disabled?: boolean
}

function projectSelectOptions(projects: ChatWorkspaceProject[]): ProjectSelectOption[] {
  const realProjects = selectableProjects(projects)
  if (realProjects.length === 0) return [{ value: '', label: 'Select a project' }]

  const nameCounts = realProjects.reduce<Record<string, number>>((counts, project) => {
    const key = project.name.trim().toLowerCase()
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
  const pathCounts = realProjects.reduce<Record<string, number>>((counts, project) => {
    const key = normalizeProjectPathForComparison(project.path)
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})

  return [
    { value: '', label: 'No project' },
    ...realProjects.map((project) => {
      const name = project.name || 'Project'
      const duplicateName = nameCounts[name.trim().toLowerCase()] > 1
      const duplicatePath = pathCounts[normalizeProjectPathForComparison(project.path)] > 1
      const location = projectLocationLabel(project)
      return {
        value: projectSelectOptionValue(project, duplicatePath),
        label: duplicateName && location ? `${name} - ${location}` : name,
      }
    }),
  ]
}

function projectSelectOptionsWithUnavailableSelection(
  projects: ChatWorkspaceProject[],
  projectPath: string,
  projectEnvironmentId?: string,
): ProjectSelectOption[] {
  const options = projectSelectOptions(projects)
  const realProjects = selectableProjects(projects)
  const pathKey = normalizeProjectPathForComparison(projectPath)
  const environmentKey = projectEnvironmentId?.trim().toLowerCase() || ''
  if (!pathKey) return options
  const matchingPathProjects = realProjects.filter((project) => normalizeProjectPathForComparison(project.path) === pathKey)
  const matchingEnvironmentProject = matchingPathProjects.find((project) => (
    !environmentKey || (project.environmentId || '').trim().toLowerCase() === environmentKey
  ))
  if (matchingEnvironmentProject) return options
  const selectedValue = unavailableProjectSelectOptionValue(projectPath, environmentKey)
  if (options.some((option) => option.value === selectedValue)) return options
  const environmentLabel = environmentKey ? `${hermesAgentProjectDisplayLabel(environmentKey)} / ` : ''
  const unavailableOption = {
    value: selectedValue,
    label: `Unavailable - ${environmentLabel}${compactPath(projectPath) || projectPath}`,
    disabled: true,
  }
  if (realProjects.length === 0) {
    return [
      { value: '', label: 'No project' },
      unavailableOption,
    ]
  }
  return [
    options[0],
    unavailableOption,
    ...options.slice(1),
  ]
}

function projectSelectValue(projectPath: string, projectEnvironmentId: string | undefined, projects: ChatWorkspaceProject[]): string {
  const realProjects = selectableProjects(projects)
  const pathKey = normalizeProjectPathForComparison(projectPath)
  const duplicatePath = realProjects.filter((project) => normalizeProjectPathForComparison(project.path) === pathKey).length > 1
  const environmentKey = normalizedEnvironmentId(projectEnvironmentId)
  const exact = preferredProjectForEnvironment(
    realProjects.filter((project) => project.path === projectPath),
    environmentKey,
  )
  if (exact) return projectSelectOptionValue(exact, duplicatePath)
  if (!pathKey) return ''
  const normalizedEnvironmentMatch = preferredProjectForEnvironment(
    realProjects.filter((project) => normalizeProjectPathForComparison(project.path) === pathKey),
    environmentKey,
  )
  if (normalizedEnvironmentMatch) return projectSelectOptionValue(normalizedEnvironmentMatch, duplicatePath)
  if (environmentKey) return unavailableProjectSelectOptionValue(projectPath, environmentKey)
  return projectPath
}

function projectSelectChangeHandler(
  projects: ChatWorkspaceProject[],
  onProjectChange: (value: string, environmentId?: string | null) => void,
  projectEnvironmentId?: string | null,
) {
  const realProjects = selectableProjects(projects)
  return (value: string) => {
    const project = projectFromSelectValue(value, realProjects, projectEnvironmentId)
    if (project) {
      onProjectChange(project.path, project.environmentId ?? null)
      return
    }
    onProjectChange(value, null)
  }
}

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
  disabled = false,
  danger = false,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  iconOnly?: boolean
  expanded?: boolean
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      disabled={disabled}
      className="chat-context-button hover-bg"
      style={{
        height: 30,
        width: iconOnly ? 30 : undefined,
        border: danger
          ? '1px solid color-mix(in srgb, var(--danger, #ef4444) 32%, var(--border))'
          : '1px solid var(--border)',
        borderRadius: 8,
        background: danger
          ? 'color-mix(in srgb, var(--danger, #ef4444) 12%, var(--bg-card-solid, #18181f))'
          : 'var(--bg-card)',
        color: disabled ? 'var(--text-muted)' : danger ? 'var(--danger, #ef4444)' : 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: iconOnly ? 0 : '0 10px',
        font: 'inherit',
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
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
  disabled = false,
  onChange,
}: {
  label: string
  value: string
  options: ProjectSelectOption[]
  icon?: ReactNode
  maxWidth?: number
  subtle?: boolean
  disabled?: boolean
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
        background: subtle
          ? 'color-mix(in srgb, var(--bg-card-solid, #18181f) 92%, var(--bg-base, #0a0a0c))'
          : 'var(--bg-card-solid, #18181f)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
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
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        style={{
          maxWidth,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          background: 'var(--bg-card-solid, #18181f)',
          backgroundColor: 'var(--bg-card-solid, #18181f)',
          color: 'inherit',
          font: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled} style={{ background: 'var(--bg-card-solid, #18181f)', color: 'var(--text-primary)' }}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ProjectEnvironmentProjectList({
  projects,
  projectPath,
  projectEnvironmentId,
  onProjectChange,
  onAddProject,
}: {
  projects: ChatWorkspaceProject[]
  projectPath: string
  projectEnvironmentId?: string
  onProjectChange: (value: string, environmentId?: string | null) => void
  onAddProject?: (path?: string) => void
}) {
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const realProjects = useMemo(() => selectableProjects(projects), [projects])
  const filteredProjects = useMemo(
    () => realProjects.filter((project) => projectMatchesQuery(project, query)),
    [query, realProjects],
  )
  const projectOptions = useMemo(() => [
    { kind: 'none' as const },
    ...filteredProjects.map((project) => ({ kind: 'project' as const, project })),
  ], [filteredProjects])
  const selectedOptionIndex = useMemo(() => {
    if (!projectPath.trim()) return 0
    const selectedProjectIndex = filteredProjects.findIndex((project) => (
      projectIsSelected(project, projectPath, projectEnvironmentId)
    ))
    if (selectedProjectIndex >= 0) return selectedProjectIndex + 1
    return query.trim() && filteredProjects.length > 0 ? 1 : 0
  }, [filteredProjects, projectEnvironmentId, projectPath, query])
  const selectedProjectMissing = useMemo(() => {
    if (!projectPath.trim()) return false
    return !realProjects.some((project) => projectIsSelected(project, projectPath, projectEnvironmentId))
  }, [projectEnvironmentId, projectPath, realProjects])
  const {
    copyToClipboard: copyUnavailableProjectPath,
    copiedContext: copiedUnavailableProjectPathContext,
    errorContext: errorUnavailableProjectPathContext,
  } = useCopyToClipboard<{ id: string }>()
  const missingEnvironmentLabel = projectEnvironmentId?.trim()
    ? hermesAgentProjectDisplayLabel(projectEnvironmentId)
    : ''
  const missingProjectLabel = [
    missingEnvironmentLabel,
    compactPath(projectPath) || projectPath,
  ].filter(Boolean).join(' / ')
  const unavailableProjectCopyId = `unavailable-project-path:${missingEnvironmentLabel || 'local'}:${projectPath}`
  const unavailableProjectCopyLabel = errorUnavailableProjectPathContext?.id === unavailableProjectCopyId
    ? 'Retry copy selected folder path'
    : copiedUnavailableProjectPathContext?.id === unavailableProjectCopyId
      ? 'Copied selected folder path'
      : 'Copy selected folder path'

  useEffect(() => {
    setActiveIndex(Math.min(selectedOptionIndex, Math.max(0, projectOptions.length - 1)))
  }, [projectOptions.length, selectedOptionIndex])

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const listboxId = 'chat-environment-project-folders'
  const activeOptionId = `${listboxId}-option-${activeIndex}`

  const selectOption = (index: number) => {
    const option = projectOptions[index]
    if (!option) return
    if (option.kind === 'none') {
      onProjectChange('', null)
      return
    }
    onProjectChange(option.project.path, option.project.environmentId ?? null)
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label
        style={{
          height: 32,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg-card-solid, #18181f)',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 9px',
        }}
      >
        <MagnifyingGlass size={14} style={{ flexShrink: 0 }} />
        <input
          ref={searchRef}
          aria-label="Search project folders"
          aria-controls={listboxId}
          aria-activedescendant={projectOptions.length > 0 ? activeOptionId : undefined}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((current) => Math.min(projectOptions.length - 1, current + 1))
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((current) => Math.max(0, current - 1))
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              selectOption(activeIndex)
              return
            }
            if (event.key === 'Escape' && query) {
              event.preventDefault()
              event.stopPropagation()
              setQuery('')
            }
          }}
          placeholder="Search project folders"
          style={{
            minWidth: 0,
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            font: 'inherit',
            fontSize: 12,
          }}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear project search"
            title="Clear project search"
            onClick={() => setQuery('')}
            style={{
              width: 24,
              height: 24,
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <X size={12} />
          </button>
        ) : null}
      </label>
      {selectedProjectMissing ? (
        <div
          role="status"
          aria-label="Selected project unavailable"
          style={{
            border: '1px solid color-mix(in srgb, var(--warning, #f59e0b) 32%, var(--border))',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--warning, #f59e0b) 11%, var(--bg-card-solid, #18181f))',
            color: 'var(--text-secondary)',
            display: 'grid',
            gap: 8,
            padding: '9px 10px',
          }}
        >
          <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>Selected folder unavailable</strong>
            <span style={{ color: 'var(--text-muted)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {missingProjectLabel}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ProjectContextToolbarButton
              label={unavailableProjectCopyLabel}
              onClick={() => {
                void copyUnavailableProjectPath(projectPath, { id: unavailableProjectCopyId })
              }}
            >
              <ClipboardText size={14} />
              <span>Copy path</span>
            </ProjectContextToolbarButton>
            {onAddProject ? (
              <ProjectContextToolbarButton label="Add selected project folder" onClick={() => onAddProject(projectPath)}>
                <FolderPlus size={14} />
                <span>Add selected folder</span>
              </ProjectContextToolbarButton>
            ) : null}
            <ProjectContextToolbarButton label="Clear selected folder" onClick={() => onProjectChange('', null)}>
              <X size={14} />
              <span>Clear</span>
            </ProjectContextToolbarButton>
          </div>
        </div>
      ) : null}
      <div
        id={listboxId}
        role="listbox"
        aria-label="Project folders"
        style={{
          maxHeight: 220,
          overflowY: 'auto',
          display: 'grid',
          gap: 5,
          padding: 2,
        }}
      >
        <button
          id={`${listboxId}-option-0`}
          type="button"
          role="option"
          aria-selected={!projectPath.trim()}
          onClick={() => onProjectChange('', null)}
          onMouseEnter={() => setActiveIndex(0)}
          style={{
            minHeight: 38,
            border: !projectPath.trim() || activeIndex === 0
              ? '1px solid var(--accent)'
              : '1px solid var(--border)',
            borderRadius: 8,
            background: !projectPath.trim() || activeIndex === 0
              ? 'color-mix(in srgb, var(--accent) 14%, var(--bg-card-solid, #18181f))'
              : 'var(--bg-card-solid, #18181f)',
            color: 'var(--text-secondary)',
            display: 'grid',
            gap: 2,
            padding: '7px 9px',
            cursor: 'pointer',
            textAlign: 'left',
            font: 'inherit',
          }}
        >
          <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>No project</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Unscoped chat</span>
        </button>
        {filteredProjects.map((project, index) => {
          const selected = projectIsSelected(project, projectPath, projectEnvironmentId)
          const environment = projectEnvironmentLabel(project)
          const optionIndex = index + 1
          const active = activeIndex === optionIndex
          return (
            <button
              key={projectListItemKey(project)}
              id={`${listboxId}-option-${optionIndex}`}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={`Select project folder ${project.name} ${environment}`}
              onClick={() => onProjectChange(project.path, project.environmentId ?? null)}
              onMouseEnter={() => setActiveIndex(optionIndex)}
              style={{
                minHeight: 48,
                border: selected || active ? '1px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 8,
                background: selected || active
                  ? 'color-mix(in srgb, var(--accent) 14%, var(--bg-card-solid, #18181f))'
                  : 'var(--bg-card-solid, #18181f)',
                color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                display: 'grid',
                gap: 3,
                padding: '8px 9px',
                cursor: 'pointer',
                textAlign: 'left',
                font: 'inherit',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700 }}>
                  {project.name || 'Project'}
                </span>
                <span style={{ flexShrink: 0, color: selected ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11 }}>
                  {environment}
                </span>
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 11 }}>
                {project.path}
              </span>
            </button>
          )
        })}
        {filteredProjects.length === 0 ? (
          <div
            role="status"
            style={{
              minHeight: 38,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--bg-card-solid, #18181f)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 9px',
              fontSize: 12,
            }}
          >
            No matching project folders
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ProjectHeaderPanel({
  panel,
  project,
  projectPath,
  projectEnvironmentId,
  session,
  runtime,
  branch,
  projectReady = true,
  onClose,
  onRunReview,
}: {
  panel: Exclude<ChatActivePanel, null>
  project: ChatWorkspaceProject
  projectPath?: string
  projectEnvironmentId?: string | null
  session: HermesSession | null
  runtime: string
  branch: string
  projectReady?: boolean
  onClose: () => void
  onRunReview: () => void
}) {
  const title = panel === 'review' ? 'Diff review' : 'Session info'
  const selectedUnavailablePath = !projectReady ? projectPath?.trim() || '' : ''
  const selectedUnavailableEnvironment = !projectReady && projectEnvironmentId?.trim()
    ? hermesAgentProjectDisplayLabel(projectEnvironmentId)
    : ''
  const projectInfoLabel = projectReady
    ? project.name
    : selectedUnavailablePath
      ? 'Selected folder unavailable'
      : 'No project selected'
  const projectDirectoryLabel = projectReady
    ? project.path
    : selectedUnavailablePath || 'Unscoped chat'
  const reviewDirectoryLabel = projectReady
    ? project.path
    : selectedUnavailablePath || 'No project folder selected'
  const reviewActionLabel = projectReady
    ? 'Run Hermes review'
    : selectedUnavailablePath
      ? 'Selected folder unavailable'
      : 'Select a project before review'
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
            {projectReady
              ? 'Hermes Agent reviews the selected project directory with the current workspace context.'
              : 'Hermes Agent needs an available project directory before it can review changes.'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <ProjectContextToolbarButton label={reviewActionLabel} onClick={onRunReview} disabled={!projectReady}>
              <GitDiff size={15} />
              <span>{reviewActionLabel}</span>
            </ProjectContextToolbarButton>
            <code style={{ fontSize: 11, color: projectReady ? 'var(--text-muted)' : 'var(--warning, #f59e0b)' }}>
              {reviewDirectoryLabel}
            </code>
          </div>
        </div>
      ) : (
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '6px 12px', margin: 0, fontSize: 12 }}>
          <dt style={{ color: 'var(--text-muted)' }}>Chat</dt>
          <dd style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.label || 'New chat'}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Thread</dt>
          <dd style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.key || 'unsaved'}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Project</dt>
          <dd style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {projectInfoLabel}
          </dd>
          <dt style={{ color: 'var(--text-muted)' }}>Directory</dt>
          <dd style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {projectDirectoryLabel}
          </dd>
          {selectedUnavailableEnvironment ? (
            <>
              <dt style={{ color: 'var(--text-muted)' }}>Environment</dt>
              <dd style={{ margin: 0 }}>{selectedUnavailableEnvironment}</dd>
            </>
          ) : null}
          {projectReady ? (
            <>
              <dt style={{ color: 'var(--text-muted)' }}>Runtime</dt>
              <dd style={{ margin: 0 }}>{projectRuntimeDisplayLabel(runtime)}</dd>
              <dt style={{ color: 'var(--text-muted)' }}>Branch</dt>
              <dd style={{ margin: 0 }}>{branch}</dd>
            </>
          ) : null}
        </dl>
      )}
    </section>
  )
}

export function ProjectComposerContextBar({
  projectPath,
  projectEnvironmentId,
  projects,
  onProjectChange,
  runtime,
  runtimeModes,
  onRuntimeChange,
  branch,
  branches,
  onBranchChange,
  projectReady = true,
  onAddProject,
  onOpenEnvironment,
  usageSlot,
}: {
  projectPath: string
  projectEnvironmentId?: string
  projects: ChatWorkspaceProject[]
  onProjectChange: (value: string, environmentId?: string | null) => void
  runtime: string
  runtimeModes: string[]
  onRuntimeChange: (value: string) => void
  branch: string
  branches: string[]
  onBranchChange: (value: string) => void
  projectReady?: boolean
  onAddProject?: (path?: string) => void
  onOpenEnvironment?: () => void
  usageSlot?: ReactNode
}) {
  const projectOptions = projectSelectOptionsWithUnavailableSelection(projects, projectPath, projectEnvironmentId)
  const selectedProjectPath = projectSelectValue(projectPath, projectEnvironmentId, projects)
  const handleProjectChange = projectSelectChangeHandler(projects, onProjectChange, projectEnvironmentId)
  const addProjectLabel = projectPath.trim() ? 'Add selected folder' : 'Add project folder'
  const selectedProjectUnavailable = !projectReady && Boolean(projectPath.trim())
  const selectedProject = projectFromSelectValue(selectedProjectPath, selectableProjects(projects), projectEnvironmentId)
  const workspaceControlsDisabled = !projectReady && selectableProjects(projects).length === 0
  const projectSummaryTitle = projectReady
    ? (selectedProject?.name || 'Project chat')
    : selectedProjectUnavailable
      ? 'Selected folder unavailable'
      : 'No project selected'
  const projectSummaryPath = projectReady
    ? (selectedProject?.path || projectPath)
    : selectedProjectUnavailable
      ? projectPath
      : 'Choose a folder to scope chat, terminal, scripts, review, and file context.'
  const projectSummaryEnvironment = projectReady
    ? (selectedProject ? projectEnvironmentLabel(selectedProject) : projectEnvironmentId?.trim() ? hermesAgentProjectDisplayLabel(projectEnvironmentId) : 'Local')
    : selectedProjectUnavailable
      ? projectEnvironmentId?.trim()
        ? hermesAgentProjectDisplayLabel(projectEnvironmentId)
        : 'Unknown environment'
      : 'Unscoped'
  const projectSummaryAccent = projectReady
    ? 'var(--secondary)'
    : selectedProjectUnavailable
      ? 'var(--warning, #f59e0b)'
      : 'var(--accent)'
  const projectSummaryBorder = selectedProjectUnavailable
    ? '1px solid color-mix(in srgb, var(--warning, #f59e0b) 42%, var(--border))'
    : projectReady
      ? '1px solid color-mix(in srgb, var(--secondary) 28%, var(--border))'
      : '1px solid color-mix(in srgb, var(--accent) 24%, var(--border))'
  const projectSummaryBackground = selectedProjectUnavailable
    ? 'color-mix(in srgb, var(--warning, #f59e0b) 11%, var(--bg-card-solid, #18181f))'
    : projectReady
      ? 'color-mix(in srgb, var(--secondary) 8%, var(--bg-card-solid, #18181f))'
      : 'color-mix(in srgb, var(--accent) 8%, var(--bg-card-solid, #18181f))'
  const {
    copyToClipboard: copyComposerProjectPath,
    copiedContext: copiedComposerProjectPathContext,
    errorContext: errorComposerProjectPathContext,
  } = useCopyToClipboard<{ id: string }>()
  const composerProjectCopyId = `composer-project-path:${projectEnvironmentId?.trim() || 'local'}:${projectPath}`
  const composerProjectCopyLabel = errorComposerProjectPathContext?.id === composerProjectCopyId
    ? 'Retry copy selected folder path'
    : copiedComposerProjectPathContext?.id === composerProjectCopyId
      ? 'Copied selected folder path'
      : 'Copy selected folder path'
  const handleAddProject = () => {
    onAddProject?.(projectPath.trim() ? projectPath : undefined)
  }
  const handleClearUnavailableProject = () => {
    onProjectChange('', null)
  }
  const canCopyProjectPath = Boolean(projectPath.trim())

  return (
    <div
      data-testid="chat-local-context-toolbar"
      data-t3-project-context-toolbar
      aria-label="Local chat context"
      className="chat-local-context-toolbar"
      style={{
        display: 'grid',
        gap: 8,
        color: 'var(--text-muted)',
        fontSize: 12,
        width: '100%',
      }}
    >
      <div
        className="chat-context-project-strip"
        role="status"
        aria-label="Selected chat project context"
        style={{
          border: projectSummaryBorder,
          borderRadius: 8,
          background: projectSummaryBackground,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          minWidth: 0,
          padding: '8px 10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: projectSummaryAccent,
              boxShadow: `0 0 12px ${projectSummaryAccent}`,
              flexShrink: 0,
            }}
          />
          <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.2 }}>
                {projectSummaryTitle}
              </strong>
              <span
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 999,
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  lineHeight: 1.2,
                  padding: '2px 7px',
                  whiteSpace: 'nowrap',
                }}
              >
                {projectSummaryEnvironment}
              </span>
            </div>
            <span
              title={projectSummaryPath}
              style={{
                color: selectedProjectUnavailable ? 'var(--warning, #f59e0b)' : 'var(--text-muted)',
                fontFamily: projectReady || selectedProjectUnavailable ? 'monospace' : 'inherit',
                fontSize: 11,
                lineHeight: 1.3,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {projectSummaryPath}
            </span>
          </div>
        </div>
        <div className="chat-context-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
          {onOpenEnvironment ? (
            <ProjectContextToolbarButton label="Manage project context" onClick={onOpenEnvironment}>
              <FolderOpen size={14} />
              <span>Manage</span>
            </ProjectContextToolbarButton>
          ) : null}
          {!projectReady && onAddProject ? (
            <ProjectContextToolbarButton label={addProjectLabel} onClick={handleAddProject}>
              <FolderPlus size={14} />
              <span>{addProjectLabel}</span>
            </ProjectContextToolbarButton>
          ) : null}
          {canCopyProjectPath ? (
            <ProjectContextToolbarButton
              label={composerProjectCopyLabel}
              onClick={() => {
                void copyComposerProjectPath(projectPath, { id: composerProjectCopyId })
              }}
            >
              <ClipboardText size={14} />
              <span>Copy path</span>
            </ProjectContextToolbarButton>
          ) : null}
          {canCopyProjectPath ? (
            <ProjectContextToolbarButton label="Clear selected folder" onClick={handleClearUnavailableProject}>
              <X size={14} />
              <span>Clear</span>
            </ProjectContextToolbarButton>
          ) : null}
        </div>
      </div>
      <div className="chat-context-primary" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        <ProjectContextSelect
          label="Project"
          icon={<FolderOpen size={14} />}
          value={selectedProjectPath}
          onChange={handleProjectChange}
          options={projectOptions}
          maxWidth={180}
          subtle
        />
        <ProjectContextSelect
          label="Runtime"
          icon={<Terminal size={14} />}
          value={runtime}
          onChange={onRuntimeChange}
          options={runtimeModes.map((value) => ({ value, label: projectRuntimeDisplayLabel(value) }))}
          maxWidth={160}
          subtle
          disabled={workspaceControlsDisabled}
        />
        <ProjectContextSelect
          label="Branch"
          icon={<GitBranch size={14} />}
          value={branch}
          onChange={onBranchChange}
          options={branches.map((value) => ({ value, label: value }))}
          maxWidth={190}
          subtle
          disabled={workspaceControlsDisabled}
        />
        {usageSlot}
      </div>
    </div>
  )
}

export function ProjectEnvironmentDialog({
  projectPath,
  projectEnvironmentId,
  projects,
  runtime,
  runtimeModes,
  branch,
  branches,
  onProjectChange,
  onRuntimeChange,
  onBranchChange,
  projectReady = true,
  onAddProject,
  onRemoveProject,
  onClose,
}: {
  projectPath: string
  projectEnvironmentId?: string
  projects: ChatWorkspaceProject[]
  runtime: string
  runtimeModes: string[]
  branch: string
  branches: string[]
  onProjectChange: (value: string, environmentId?: string | null) => void
  onRuntimeChange: (value: string) => void
  onBranchChange: (value: string) => void
  projectReady?: boolean
  onAddProject?: (path?: string) => void
  onRemoveProject?: (path: string, environmentId?: string | null) => void
  onClose: () => void
}) {
  const projectOptions = projectSelectOptionsWithUnavailableSelection(projects, projectPath, projectEnvironmentId)
  const selectedProjectPath = projectSelectValue(projectPath, projectEnvironmentId, projects)
  const handleProjectChange = projectSelectChangeHandler(projects, onProjectChange, projectEnvironmentId)
  const selectedProject = projectReady
    ? projectFromSelectValue(selectedProjectPath, selectableProjects(projects), projectEnvironmentId)
    : null
  const selectedProjectUnavailable = !projectReady && Boolean(projectPath.trim())
  const handleAddProject = () => {
    onAddProject?.(selectedProjectUnavailable ? projectPath : undefined)
  }
  const handleRemoveProject = () => {
    if (!(projectReady || selectedProjectUnavailable) || !projectPath.trim()) return
    onRemoveProject?.(
      selectedProject?.path ?? projectPath,
      selectedProject?.environmentId ?? projectEnvironmentId ?? null,
    )
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Environment settings"
      data-t3-project-environment-dialog
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: PROJECT_CONTEXT_DIALOG_Z_INDEX,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0, 0, 0, 0.72)',
      }}
    >
      <div
        data-t3-project-environment-panel
        style={{
          width: 'min(520px, calc(100vw - 32px))',
          display: 'grid',
          gap: 14,
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'linear-gradient(var(--bg-panel-solid, var(--bg-card-solid, #18181f)), var(--bg-panel-solid, var(--bg-card-solid, #18181f))), var(--bg-base, #0a0a0c)',
          backgroundClip: 'padding-box',
          opacity: 1,
          isolation: 'isolate',
          padding: 18,
          boxShadow: '0 22px 60px rgba(0,0,0,0.36)',
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20 }}>Environment settings</h2>
        <ProjectContextSelect label="Project" icon={<FolderOpen size={14} />} value={selectedProjectPath} onChange={handleProjectChange} options={projectOptions} maxWidth={360} />
        {selectedProject && onRemoveProject ? (
          <section
            aria-label="Selected project actions"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'linear-gradient(var(--bg-card-solid, #18181f), var(--bg-card-solid, #18181f)), var(--bg-base, #0a0a0c)',
              backgroundClip: 'padding-box',
              display: 'grid',
              gap: 10,
              padding: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>{selectedProject.name || 'Selected project'}</strong>
                <span
                  title={selectedProject.path}
                  style={{
                    color: 'var(--text-muted)',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 340,
                  }}
                >
                  {selectedProject.path}
                </span>
              </div>
              <ProjectContextToolbarButton label={`Remove selected project ${selectedProject.name || selectedProject.path}`} onClick={handleRemoveProject} danger>
                <Trash size={14} />
                <span>Remove selected project</span>
              </ProjectContextToolbarButton>
            </div>
          </section>
        ) : null}
        <ProjectEnvironmentProjectList
          projects={projects}
          projectPath={projectPath}
          projectEnvironmentId={projectEnvironmentId}
          onProjectChange={onProjectChange}
          onAddProject={onAddProject}
        />
        <ProjectContextSelect label="Runtime" icon={<Terminal size={14} />} value={runtime} onChange={onRuntimeChange} options={runtimeModes.map((value) => ({ value, label: projectRuntimeDisplayLabel(value) }))} maxWidth={360} disabled={!projectReady} />
        <ProjectContextSelect label="Branch" icon={<GitBranch size={14} />} value={branch} onChange={onBranchChange} options={branches.map((value) => ({ value, label: value }))} maxWidth={360} disabled={!projectReady} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {onAddProject ? (
              <ProjectContextToolbarButton label={selectedProjectUnavailable ? 'Add selected folder' : 'Add project folder'} onClick={handleAddProject}>
                <FolderPlus size={14} />
                <span>{selectedProjectUnavailable ? 'Add selected folder' : 'Add project folder'}</span>
              </ProjectContextToolbarButton>
            ) : null}
            {selectedProjectUnavailable && onRemoveProject ? (
              <ProjectContextToolbarButton label="Remove selected folder" onClick={handleRemoveProject} danger>
                <Trash size={14} />
                <span>Remove selected folder</span>
              </ProjectContextToolbarButton>
            ) : null}
          </div>
          <ProjectContextToolbarButton label="Close environment settings" onClick={onClose}>Close</ProjectContextToolbarButton>
        </div>
      </div>
    </div>
  )
}
