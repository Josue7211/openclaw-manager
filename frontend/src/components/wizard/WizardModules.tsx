/**
 * WizardModules -- Module selection step with preset bundles and card grid.
 *
 * Three preset bundles (Essentials, Full Setup, Minimal) set module toggles.
 * Individual toggles deselect the active bundle. Unavailable modules are
 * dimmed with disabled toggles. Categories: Personal, Infrastructure, Agents.
 */

import React, { memo, useCallback } from 'react'
import {
  ChatCircle,
  CheckSquare,
  CalendarDots,
  Bell,
  Timer,
  Envelope,
  DeviceMobile,
  Desktop,
  FilmStrip,
  SquaresFour,
  Target,
  Robot,
  Brain,
  GitBranch,
  BookOpen,
  FileText,
} from '@phosphor-icons/react'
import {
  useWizardState,
  updateWizardField,
  PRESET_BUNDLES,
} from '@/lib/wizard-store'
import { APP_MODULES } from '@/lib/modules'

// ---------------------------------------------------------------------------
// Icon mapping (moduleId -> Phosphor component)
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ElementType> = {
  messages: DeviceMobile,
  chat: ChatCircle,
  todos: CheckSquare,
  calendar: CalendarDots,
  reminders: Bell,
  email: Envelope,
  pomodoro: Timer,
  notes: FileText,
  dashboard: SquaresFour,
  homelab: Desktop,
  media: FilmStrip,
  missions: Target,
  agents: Robot,
  memory: Brain,
  crons: CalendarDots,
  pipeline: GitBranch,
  knowledge: BookOpen,
}

// ---------------------------------------------------------------------------
// Module categories
// ---------------------------------------------------------------------------

interface CategoryDef {
  label: string
  moduleIds: string[]
}

const CATEGORIES: CategoryDef[] = [
  {
    label: 'Personal',
    moduleIds: ['messages', 'chat', 'todos', 'calendar', 'reminders', 'email', 'pomodoro', 'notes'],
  },
  {
    label: 'Infrastructure',
    moduleIds: ['dashboard', 'homelab', 'media'],
  },
  {
    label: 'Agents',
    moduleIds: ['missions', 'agents', 'memory', 'crons', 'pipeline', 'knowledge'],
  },
]

// ---------------------------------------------------------------------------
// Service requirement mapping
// ---------------------------------------------------------------------------

/** Map of moduleId to the wizard service key required for availability */
const SERVICE_REQUIREMENT: Record<string, string> = {
  messages: 'bluebubbles',
  reminders: 'mac-bridge',
  notes: 'couchdb',
}

/** Human-readable labels for required services */
const SERVICE_LABELS: Record<string, string> = {
  bluebubbles: 'BlueBubbles',
  'mac-bridge': 'Mac Bridge',
  couchdb: 'CouchDB',
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const PRESETS: { key: 'essentials' | 'full' | 'minimal'; label: string }[] = [
  { key: 'essentials', label: 'Essentials' },
  { key: 'full', label: 'Full Setup' },
  { key: 'minimal', label: 'Minimal' },
]

// ---------------------------------------------------------------------------
// Toggle (inline, matches settings Toggle pattern)
// ---------------------------------------------------------------------------

const ModuleToggle = memo(function ModuleToggle({
  on,
  disabled,
  onToggle,
  label,
  describedBy,
}: {
  on: boolean
  disabled?: boolean
  onToggle: (v: boolean) => void
  label: string
  describedBy?: string
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-disabled={disabled || undefined}
      aria-describedby={describedBy}
      onClick={disabled ? undefined : () => onToggle(!on)}
      style={{
        width: '36px',
        height: '20px',
        borderRadius: '10px',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? 'var(--accent-solid)' : 'var(--bg-white-15)',
        position: 'relative',
        transition: 'background 0.25s var(--ease-spring)',
        padding: 0,
        flexShrink: 0,
        opacity: disabled ? 0.3 : 1,
        pointerEvents: disabled ? 'none' : undefined,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '2px',
          left: on ? '18px' : '2px',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: 'var(--text-on-color)',
          boxShadow: '0 1px 3px var(--overlay-light)',
          transition: 'left 0.25s var(--ease-spring)',
        }}
      />
    </button>
  )
})

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WizardModules() {
  const wizard = useWizardState()

  const isModuleEnabled = useCallback(
    (id: string) => wizard.enabledModules.includes(id),
    [wizard.enabledModules],
  )

  /**
   * Determine if a module is unavailable based on wizard test results.
   * Returns the service label if unavailable, or null if available.
   */
  const getUnavailableReason = useCallback(
    (moduleId: string): string | null => {
      const requiredService = SERVICE_REQUIREMENT[moduleId]
      if (!requiredService) return null

      // Homelab is always shown as available (configured in Settings, not wizard)
      if (moduleId === 'homelab') return null

      const testResult = wizard.testResults[requiredService]
      // Available if test succeeded
      if (testResult?.status === 'success') return null

      return SERVICE_LABELS[requiredService] || requiredService
    },
    [wizard.testResults],
  )

  const handlePresetClick = useCallback(
    (preset: 'essentials' | 'full' | 'minimal') => {
      updateWizardField('activeBundle', preset)
      updateWizardField('enabledModules', [...PRESET_BUNDLES[preset]])
    },
    [],
  )

  const handleToggle = useCallback(
    (moduleId: string, enabled: boolean) => {
      const next = enabled
        ? [...wizard.enabledModules, moduleId]
        : wizard.enabledModules.filter(id => id !== moduleId)
      updateWizardField('enabledModules', next)
      // Deselect active bundle when toggling individually
      if (wizard.activeBundle !== null) {
        updateWizardField('activeBundle', null)
      }
    },
    [wizard.enabledModules, wizard.activeBundle],
  )

  return (
    <div style={{ width: '100%' }}>
      {/* Heading */}
      <h2
        style={{
          fontSize: '20px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: '0 0 4px',
        }}
      >
        Choose Your Modules
      </h2>
      <p
        style={{
          fontSize: '15px',
          color: 'var(--text-secondary)',
          margin: '0 0 var(--space-6, 24px)',
        }}
      >
        Start with a preset, then customize. You can change this anytime in Settings.
      </p>

      {/* Preset bundle pills */}
      <div
        role="radiogroup"
        aria-label="Module presets"
        style={{
          display: 'flex',
          gap: 'var(--space-2, 8px)',
          marginBottom: 'var(--space-6, 24px)',
        }}
      >
        {PRESETS.map(({ key, label }) => {
          const active = wizard.activeBundle === key
          return (
            <button
              key={key}
              role="radio"
              aria-checked={active}
              onClick={() => handlePresetClick(key)}
              style={{
                padding: '8px 20px',
                borderRadius: '999px',
                border: active ? 'none' : '1px solid var(--border)',
                background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                color: active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                fontWeight: active ? 600 : 400,
                fontSize: '15px',
                cursor: 'pointer',
                transition: 'all 0.2s var(--ease-out)',
              }}
              className={active ? undefined : 'hover-bg-bright'}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Module card grid grouped by category */}
      {CATEGORIES.map(({ label, moduleIds }) => {
        const modules = moduleIds
          .map(id => APP_MODULES.find(m => m.id === id))
          .filter(Boolean) as typeof APP_MODULES

        if (modules.length === 0) return null

        return (
          <div key={label} style={{ marginBottom: 'var(--space-6, 24px)' }}>
            {/* Category header */}
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 'var(--space-4, 16px)',
              }}
            >
              {label}
            </div>

            {/* Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 'var(--space-4, 16px)',
              }}
            >
              {modules.map(mod => {
                const enabled = isModuleEnabled(mod.id)
                const unavailableReason = getUnavailableReason(mod.id)
                const isUnavailable = unavailableReason !== null
                const Icon = ICON_MAP[mod.id] || SquaresFour
                const describedById = isUnavailable
                  ? `unavailable-${mod.id}`
                  : undefined

                return (
                  <label
                    key={mod.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: 'var(--space-4, 16px)',
                      background: 'var(--bg-card-solid)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      cursor: isUnavailable ? 'default' : 'pointer',
                      opacity: isUnavailable ? 0.45 : 1,
                      transition:
                        'background 0.2s var(--ease-out), transform 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out)',
                      minHeight: '44px',
                    }}
                    onMouseEnter={e => {
                      if (!isUnavailable) {
                        e.currentTarget.style.background = 'var(--bg-card-hover)'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                        e.currentTarget.style.boxShadow =
                          '0 4px 12px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)'
                      }
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'var(--bg-card-solid)'
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    {/* Top row: icon + name + toggle */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2, 8px)',
                      }}
                    >
                      <Icon
                        size={24}
                        weight="regular"
                        style={{
                          color: isUnavailable
                            ? 'var(--text-muted)'
                            : 'var(--text-primary)',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: '15px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {mod.name}
                      </span>
                      <ModuleToggle
                        on={enabled && !isUnavailable}
                        disabled={isUnavailable}
                        onToggle={v => handleToggle(mod.id, v)}
                        label={`Enable ${mod.name}`}
                        describedBy={describedById}
                      />
                    </div>

                    {/* Description */}
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        marginTop: '6px',
                        lineHeight: 1.4,
                      }}
                    >
                      {mod.description}
                    </div>

                    {/* Unavailable label */}
                    {isUnavailable && (
                      <div
                        id={describedById}
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          fontStyle: 'italic',
                          marginTop: '4px',
                        }}
                      >
                        Requires {unavailableReason}
                      </div>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
