import { useState } from 'react'
import { MagicWand, Plus } from '@phosphor-icons/react'
import type { JobForm, StageId } from '@/pages/job-hunter-types'
import { STAGES, normalizeTags } from '@/pages/job-hunter-domain'

function extractField(patterns: RegExp[], text: string): string {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function inferRole(description: string): string {
  const explicit = extractField(
    [/(?:role|position|title)\s*[:-]\s*([^\n.]+)/i, /hiring\s+(?:for|an?)\s+([^\n.]+)/i],
    description,
  )
  if (explicit) return explicit

  const phrases = description
    .split(/[\n.]/)
    .map(part => part.trim())
    .filter(Boolean)
  const candidate = phrases.find(part =>
    /engineer|specialist|analyst|support|coordinator|intern|developer|assistant/i.test(part),
  )
  return candidate ? candidate.replace(/^(we are hiring|looking for|seeking)\s+/i, '').trim() : ''
}

function inferCompany(description: string): string {
  const explicit = extractField([/company\s*[:-]\s*([^\n.]+)/i, /at\s+([A-Z][A-Za-z0-9& .-]{1,40})/i], description)
  return explicit
}

function inferLocation(description: string): string {
  const explicit = extractField(
    [
      /location\s*[:-]\s*([^\n.]+)/i,
      /\b(?:in|based in|located in)\s+([A-Z][A-Za-z]+(?:,\s*[A-Z]{2})?)\b/i,
      /(remote(?:\s*-\s*[A-Z]{2,})?)/i,
      /(hybrid(?:\s+in\s+[^\n.]+)?)/i,
    ],
    description,
  )
  return explicit
}

interface IntakePanelProps {
  form: JobForm
  onChange: (next: JobForm) => void
  onSubmit: () => void
}

export function IntakePanel({ form, onChange, onSubmit }: IntakePanelProps) {
  const [extractHint, setExtractHint] = useState('')

  const extractFromDescription = () => {
    const description = form.notes.trim()
    if (!description) {
      setExtractHint('Paste a job description first, then extract fields.')
      return
    }

    const role = inferRole(description)
    const company = inferCompany(description)
    const location = inferLocation(description)
    const inferredTags = normalizeTags(
      [
        form.tags,
        /support|ticket|device|troubleshoot/i.test(description) ? 'support' : '',
        /automation|workflow|integration|ai/i.test(description) ? 'automation' : '',
        /data|annotation|analyst/i.test(description) ? 'data' : '',
      ]
        .filter(Boolean)
        .join(', '),
    )

    onChange({
      ...form,
      company: form.company || company,
      role: form.role || role,
      location: !form.location || form.location === 'Remote - US' ? location || 'Remote - US' : form.location,
      tags: inferredTags.join(', '),
    })

    setExtractHint(
      company || role || location
        ? 'Filled the fields I could infer from the pasted description.'
        : 'No obvious company, role, or location was found. Edit manually.',
    )
  }

  return (
    <section
      aria-label="Manual intake"
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Plus size={14} style={{ color: 'var(--accent)' }} />
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
              Manual intake
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={extractFromDescription}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 10px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <MagicWand size={14} />
          Extract from description
        </button>
      </div>

      <form
        onSubmit={event => {
          event.preventDefault()
          onSubmit()
        }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Company</span>
          <input
            aria-label="Company"
            value={form.company}
            onChange={event => onChange({ ...form, company: event.target.value })}
            required
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
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Role</span>
          <input
            aria-label="Role"
            value={form.role}
            onChange={event => onChange({ ...form, role: event.target.value })}
            required
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
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Location</span>
          <input
            aria-label="Location"
            value={form.location}
            onChange={event => onChange({ ...form, location: event.target.value })}
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
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Source</span>
          <input
            aria-label="Source"
            value={form.source}
            onChange={event => onChange({ ...form, source: event.target.value })}
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
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Stage</span>
          <select
            aria-label="Stage"
            value={form.stage}
            onChange={event => onChange({ ...form, stage: event.target.value as StageId })}
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: '13px',
            }}
          >
            {STAGES.map(stage => (
              <option key={stage.id} value={stage.id}>
                {stage.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Next action</span>
          <input
            aria-label="Next action"
            value={form.nextAction}
            onChange={event => onChange({ ...form, nextAction: event.target.value })}
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
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tags</span>
          <input
            aria-label="Tags"
            value={form.tags}
            onChange={event => onChange({ ...form, tags: event.target.value })}
            placeholder="automation, support, urgent"
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
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Pasted description</span>
          <textarea
            aria-label="Pasted description"
            value={form.notes}
            onChange={event => onChange({ ...form, notes: event.target.value })}
            rows={3}
            required
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

        <div
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {extractHint || 'Creates a scored dossier with tailored assets.'}
          </div>
          <button
            type="submit"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 12px',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--text-on-color)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            Create dossier
          </button>
        </div>
      </form>
    </section>
  )
}
