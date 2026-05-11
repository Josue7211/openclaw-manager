import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { getRequestBaseForPath } from '@/lib/api'
import { Button } from '@/components/ui/Button'

interface PublicIntakeForm {
  id: string
  token: string
  title: string
  fields: string[]
  clientName: string
  language: string
}

export default function TrainingPublicIntake() {
  const { token = '' } = useParams()
  const [form, setForm] = useState<PublicIntakeForm | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [language, setLanguage] = useState<'en' | 'es'>('en')

  const endpoint = useMemo(() => `/api/training/public/intake/${encodeURIComponent(token)}`, [token])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`${getRequestBaseForPath(endpoint)}${endpoint}`)
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error || 'Intake form unavailable')
        if (!cancelled) {
          setForm(payload.data.form)
          setLanguage(payload.data.form.language === 'es' ? 'es' : 'en')
          setAnswers(Object.fromEntries(payload.data.form.fields.map((field: string) => [field, ''])))
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Intake form unavailable')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [endpoint])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(`${getRequestBaseForPath(endpoint)}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || 'Could not submit intake')
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit intake')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      color: 'var(--text-primary)',
      padding: '32px 18px',
      display: 'grid',
      placeItems: 'start center',
    }}>
      <section style={{
        width: 'min(760px, 100%)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-card)',
        padding: '22px',
        display: 'grid',
        gap: '16px',
      }}>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading intake...</div>
        ) : error && !form ? (
          <div style={{ color: 'var(--red)', fontSize: '14px' }}>{error}</div>
        ) : submitted ? (
          <div style={{ display: 'grid', gap: '8px' }}>
            <h1 style={{ margin: 0, fontSize: '24px' }}>Submitted</h1>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>Your intake was sent.</p>
          </div>
        ) : form ? (
          <form onSubmit={submit} style={{ display: 'grid', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start' }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: '24px' }}>{localizedTitle(form.title, language)}</h1>
                  {form.clientName && <p style={{ margin: '6px 0 0', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 800 }}>For {form.clientName}</p>}
                </div>
                <label style={{ display: 'grid', gap: '5px', minWidth: '120px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Language</span>
                  <select value={language} onChange={event => setLanguage(event.currentTarget.value === 'es' ? 'es' : 'en')} style={inputStyle}>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                  </select>
                </label>
              </div>
              <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
                {form.title.toLowerCase().includes('follow-up')
                  ? copy(language, 'Answer what changed or what your coach still needs.', 'Responde lo que cambió o lo que tu entrenador todavía necesita.')
                  : copy(language, 'Complete each field before your first session.', 'Completa cada campo antes de tu primera sesión.')}
              </p>
            </div>
            {error && <div style={{ color: 'var(--red)', fontSize: '13px' }}>{error}</div>}
            {form.fields.map(field => (
              <label key={field} style={{ display: 'grid', gap: '7px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{fieldLabel(field, language)}</span>
                <textarea
                  value={answers[field] || ''}
                  onChange={event => {
                    const value = event.currentTarget.value
                    event.currentTarget.style.height = 'auto'
                    event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`
                    setAnswers(current => ({ ...current, [field]: value }))
                  }}
                  style={textAreaStyle}
                  rows={1}
                />
              </label>
            ))}
            <Button type="submit" disabled={submitting}>{submitting ? copy(language, 'Submitting...', 'Enviando...') : copy(language, 'Submit', 'Enviar')}</Button>
          </form>
        ) : null}
      </section>
    </main>
  )
}

function copy(language: 'en' | 'es', english: string, spanish: string): string {
  return language === 'es' ? spanish : english
}

function localizedTitle(title: string, language: 'en' | 'es'): string {
  if (language !== 'es') return title
  if (title === 'Member Follow-up') return 'Seguimiento de miembro'
  if (title === 'CEO Client Intake') return 'Formulario inicial'
  if (title === 'InBody & Assessment Update') return 'Actualización InBody'
  if (title === 'Weekly Check-in') return 'Chequeo semanal'
  return title
}

function fieldLabel(field: string, language: 'en' | 'es'): string {
  if (language !== 'es') return field
  return spanishLabels[field] || field
}

const spanishLabels: Record<string, string> = {
  'Allergies (food or medication)': 'Alergias (comida o medicamentos)',
  'Supplements with doses': 'Suplementos con dosis',
  Medications: 'Medicamentos',
  'Medical conditions': 'Condiciones médicas',
  'Average sleep hours': 'Horas promedio de sueño',
  'Sleep quality': 'Calidad del sueño',
  'Stress level': 'Nivel de estrés',
  'Nutrition style': 'Estilo de alimentación',
  'Protein intake estimate (grams/day)': 'Proteína estimada (gramos/día)',
  'Protein intake estimate': 'Proteína estimada (gramos/día)',
  'Favorite foods': 'Comidas favoritas',
  'Food dislikes / foods avoided': 'Comidas que no le gustan / evita',
  'Hydration habits / water intake': 'Hábitos de hidratación / agua',
  'How much water do you drink per day?': '¿Cuánta agua tomas al día?',
  'How many bottles or cups of water do you drink on a normal day?': '¿Cuánta agua tomas al día?',
  'Barriers to consistency': 'Barreras para mantener consistencia',
  'Questions for coach': 'Preguntas para el entrenador',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  padding: '10px 11px',
  font: 'inherit',
  fontSize: '14px',
  resize: 'none',
}

const textAreaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: '44px',
  overflow: 'hidden',
}
