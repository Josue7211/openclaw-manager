import { useEffect, useState } from 'react'
import type { CareerProfile, OpportunityDossier } from '@/pages/job-hunter-types'
import { badgeStyle } from '@/pages/job-hunter-domain'

function splitList(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

interface ProfilePanelProps {
  profile: CareerProfile
  selectedDossier?: OpportunityDossier | null
  onChange: (next: CareerProfile) => void
}

export function ProfilePanel({ profile, selectedDossier, onChange }: ProfilePanelProps) {
  const [preferredLocationsInput, setPreferredLocationsInput] = useState(profile.preferredLocations.join(', '))
  const [targetRolesInput, setTargetRolesInput] = useState(profile.targetRoles.join(', '))
  const [strengthsInput, setStrengthsInput] = useState(profile.strengths.join(', '))

  useEffect(() => {
    setPreferredLocationsInput(profile.preferredLocations.join(', '))
  }, [profile.preferredLocations])

  useEffect(() => {
    setTargetRolesInput(profile.targetRoles.join(', '))
  }, [profile.targetRoles])

  useEffect(() => {
    setStrengthsInput(profile.strengths.join(', '))
  }, [profile.strengths])

  return (
    <section
      aria-label="Career profile"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '10px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
            }}
          >
            Career profile
          </div>
          <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            {selectedDossier ? `Tailoring ${selectedDossier.company}` : 'Scoring and asset defaults'}
          </div>
        </div>
        <span style={badgeStyle('applied')}>${profile.payFloor}/hr</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Pay floor</span>
          <input
            aria-label="Pay floor"
            type="number"
            min={0}
            step={1}
            value={profile.payFloor}
            onChange={event => onChange({ ...profile, payFloor: Number(event.target.value || 0) })}
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: '13px',
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Preferred locations</span>
          <input
            aria-label="Preferred locations"
            value={preferredLocationsInput}
            onChange={event => {
              setPreferredLocationsInput(event.target.value)
              onChange({ ...profile, preferredLocations: splitList(event.target.value) })
            }}
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: '13px',
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Target roles</span>
          <input
            aria-label="Target roles"
            value={targetRolesInput}
            onChange={event => {
              setTargetRolesInput(event.target.value)
              onChange({ ...profile, targetRoles: splitList(event.target.value) })
            }}
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: '13px',
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Core strengths</span>
          <textarea
            aria-label="Core strengths"
            rows={1}
            value={strengthsInput}
            onChange={event => {
              setStrengthsInput(event.target.value)
              onChange({ ...profile, strengths: splitList(event.target.value) })
            }}
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              resize: 'vertical',
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Narrative</span>
          <textarea
            aria-label="Narrative"
            rows={2}
            value={profile.narrative}
            onChange={event => onChange({ ...profile, narrative: event.target.value })}
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              resize: 'vertical',
            }}
          />
        </label>
      </div>

      <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {profile.targetRoles.slice(0, 4).map(role => (
          <span key={role} style={badgeStyle('sourcing')}>
            {role}
          </span>
        ))}
        {profile.strengths.slice(0, 3).map(strength => (
          <span key={strength} style={badgeStyle('interviewing')}>
            {strength}
          </span>
        ))}
      </div>
    </section>
  )
}
