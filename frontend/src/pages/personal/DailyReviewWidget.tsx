import { useEffect, useState, useCallback } from 'react'
import { ClipboardText, CaretDown, CaretRight, X } from '@phosphor-icons/react'
import { Skeleton } from '@/components/Skeleton'
import { api } from '@/lib/api'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useEscapeKey } from '@/lib/hooks/useEscapeKey'
import { todayISO } from '@/lib/utils'
import type { Todo, Mission } from '@/lib/types'
import type { DailyReviewRecord } from './types'

function ReviewField({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'var(--hover-bg)', borderRadius: '10px', padding: '12px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
      <p style={{ margin: 0, fontSize: '12px', color: value ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: value ? 'normal' : 'italic', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
        {value || 'Nothing recorded'}
      </p>
    </div>
  )
}

function ReviewPrompt({ label, placeholder, value, onChange, accentColor }: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; accentColor: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: accentColor, marginBottom: '8px' }}>{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        rows={3}
        style={{
          width: '100%', background: 'var(--hover-bg)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '10px 12px', fontSize: '13px', color: 'var(--text-primary)',
          outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
        onFocus={e => { e.target.style.borderColor = accentColor }}
        onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
      />
    </div>
  )
}

export default function DailyReviewWidget({ todos, missions }: { todos: Todo[]; missions: Mission[] }) {
  const today = todayISO()
  const [collapsed, setCollapsed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [review, setReview] = useState<DailyReviewRecord | null>(null)
  const [loadingReview, setLoadingReview] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ accomplishments: '', priorities: '', notes: '' })

  const fetchReview = useCallback(() => {
    setLoadingReview(true)
    api.get<{ review?: DailyReviewRecord }>(`/api/daily-review?date=${today}`)
      .then(d => { setReview(d.review || null); setLoadingReview(false) })
      .catch(() => setLoadingReview(false))
  }, [today])

  useEffect(() => { fetchReview() }, [fetchReview])

  const closeModal = useCallback(() => setModalOpen(false), [])
  const trapRef = useFocusTrap(modalOpen)
  useEscapeKey(closeModal, modalOpen)

  const openModal = () => {
    setForm({
      accomplishments: review?.accomplishments || '',
      priorities: review?.priorities || '',
      notes: review?.notes || '',
    })
    setModalOpen(true)
  }

  const saveReview = async () => {
    setSaving(true)
    try {
      const d = await api.post<{ review?: DailyReviewRecord }>('/api/daily-review', { date: today, ...form })
      if (d.review) setReview(d.review)
      setModalOpen(false)
    } catch (e) {
      console.error('saveReview failed:', e)
    } finally {
      setSaving(false)
    }
  }

  const completedToday = todos.filter(t => t.done).length
  const activeMissions = missions.filter(m => m.status === 'active' || m.status === 'pending').length

  return (
    <>
      <div className="card" style={{ padding: '0', marginBottom: '24px', border: '1px solid var(--purple-a20)', overflow: 'hidden' }}>
        {/* Header row */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setCollapsed(c => !c)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed(c => !c) } }}
          aria-expanded={!collapsed}
          aria-label="Toggle daily review"
          style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 20px',
            cursor: 'pointer', userSelect: 'none', width: '100%', border: 'none', fontSize: 'inherit', fontFamily: 'inherit',
            background: 'var(--purple-a08)',
            borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          }}
        >
          {collapsed ? <CaretRight size={14} style={{ color: 'var(--accent)' }} /> : <CaretDown size={14} style={{ color: 'var(--accent)' }} />}
          <ClipboardText size={14} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Daily Review
          </span>
          {review && (
            <span className="badge badge-green" style={{ marginLeft: '4px', fontSize: '9px' }}>logged</span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {completedToday} done &middot; {activeMissions} active missions
            </span>
            <button
              onClick={e => { e.stopPropagation(); openModal() }}
              style={{
                background: 'var(--accent)', border: 'none', borderRadius: '10px',
                color: 'var(--text-on-accent)', padding: '5px 12px', fontSize: '11px', fontWeight: 600,
                cursor: 'pointer', letterSpacing: '0.02em',
                transition: 'filter 0.15s ease, transform 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.15)'; e.currentTarget.style.transform = 'scale(1.03)' }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)' }}
            >
              {review ? 'Edit Review' : 'Start Daily Review'}
            </button>
          </div>
        </div>

        {/* Body */}
        {!collapsed && (
          <div style={{ padding: '16px 20px' }}>
            {loadingReview ? (
              <div style={{ display: 'flex', gap: '16px' }}>
                <Skeleton width="33%" height="60px" style={{ marginBottom: 0 }} />
                <Skeleton width="33%" height="60px" style={{ marginBottom: 0 }} />
                <Skeleton width="33%" height="60px" style={{ marginBottom: 0 }} />
              </div>
            ) : !review ? (
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No review logged for today yet. Click &quot;Start Daily Review&quot; to capture your day.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <ReviewField label="Accomplishments" value={review.accomplishments} color="var(--secondary)" />
                <ReviewField label="Top Priority Tomorrow" value={review.priorities} color="var(--accent)" />
                <ReviewField label="Blockers / Notes" value={review.notes} color="var(--tertiary)" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'var(--overlay-heavy)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-review-title"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-accent)',
              borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '560px',
              boxShadow: '0 24px 64px var(--overlay-heavy)', display: 'flex', flexDirection: 'column', gap: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 id="daily-review-title" style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Daily Review</h2>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{today}</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                aria-label="Close daily review"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            <ReviewPrompt
              label="1. What did you accomplish today?"
              placeholder="Shipped X, fixed Y, reviewed Z\u2026"
              value={form.accomplishments}
              onChange={v => setForm(f => ({ ...f, accomplishments: v }))}
              accentColor="var(--secondary)"
            />
            <ReviewPrompt
              label="2. What's the top priority tomorrow?"
              placeholder="The single most important thing\u2026"
              value={form.priorities}
              onChange={v => setForm(f => ({ ...f, priorities: v }))}
              accentColor="var(--accent)"
            />
            <ReviewPrompt
              label="3. Any blockers or notes?"
              placeholder="Waiting on X, context for tomorrow\u2026"
              value={form.notes}
              onChange={v => setForm(f => ({ ...f, notes: v }))}
              accentColor="var(--tertiary)"
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-secondary)', padding: '8px 18px', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={saveReview}
                disabled={saving}
                style={{
                  background: 'var(--accent)', border: 'none', borderRadius: '10px',
                  color: 'var(--text-on-accent)', padding: '8px 20px', fontSize: '13px', fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving\u2026' : 'Save Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
