# Career Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing `Job Hunter` module into a dossier-centered `Career Ops` workflow that supports intake, structured evaluation, tailored assets, and action tracking for urgent active search.

**Architecture:** Keep the existing `/jobs` route and current feed-search backend, but replace the page's center of gravity from loose live cards plus tracked leads into a single `OpportunityDossier` model. Build the rollout in-place inside the existing frontend module files so the first release ships quickly, stays local-first, and preserves later migration paths to backend persistence and broader sourcing.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, React Query, localStorage-backed frontend domain state, existing Axum jobs search route.

---

## File Structure

### Existing files to modify

- `frontend/src/pages/JobHunter.tsx`
  - Keep as the routed page entry for `/jobs`
  - Rework page state around dossiers, intake, queue, and dossier detail
- `frontend/src/pages/job-hunter-types.ts`
  - Add dossier, evaluation, asset, timeline, and career profile types
- `frontend/src/pages/job-hunter-domain.ts`
  - Add dossier creation, evaluation, migration helpers, queue sorting, storage accessors, and recommendation logic
- `frontend/src/lib/modules.ts`
  - Rename module label from `Job Hunter` to `Career Ops`
- `frontend/src/lib/nav-items.ts`
  - Rename sidebar label from `Job Hunter` to `Career Ops`
- `frontend/src/lib/keybindings.ts`
  - Rename keyboard navigation label to `Go to Career Ops`
- `frontend/src/components/OnboardingWelcome.tsx`
  - Rename module copy in onboarding
- `frontend/src/components/wizard/WizardModules.tsx`
  - Rename module card copy in setup wizard
- `frontend/src/__tests__/route-audit.test.tsx`
  - Update mocks and visible page text assertions
- `frontend/src/pages/__tests__/module-smoke.test.tsx`
  - Keep route smoke passing after label changes
- `frontend/src/lib/__tests__/modules.test.ts`
  - Update expected module names
- `frontend/src/lib/__tests__/sidebar-config.test.ts`
  - Update expected sidebar labels

### New files to create

- `frontend/src/pages/career-ops/DossierPanel.tsx`
  - Focused dossier detail UI
- `frontend/src/pages/career-ops/OpportunityQueue.tsx`
  - Ranked queue list extracted out of the page
- `frontend/src/pages/career-ops/ActionQueue.tsx`
  - Next-actions list for today
- `frontend/src/pages/career-ops/ProfilePanel.tsx`
  - Career profile editor and strategy settings
- `frontend/src/pages/career-ops/IntakePanel.tsx`
  - Paste JD/URL/manual intake form
- `frontend/src/pages/__tests__/CareerOpsPage.test.tsx`
  - Page-level tests for intake, queue, and dossier rendering
- `frontend/src/lib/__tests__/career-ops-domain.test.ts`
  - Domain tests for dossier creation, migration, scoring, and persistence

## Task 1: Create The Dossier Domain Model

**Files:**
- Modify: `frontend/src/pages/job-hunter-types.ts`
- Modify: `frontend/src/pages/job-hunter-domain.ts`
- Test: `frontend/src/lib/__tests__/career-ops-domain.test.ts`

- [ ] **Step 1: Write the failing domain tests**

```ts
import { describe, expect, it } from 'vitest'
import type { LiveJob } from '@/pages/job-hunter-types'
import {
  createDossierFromJob,
  createDossierFromManualIntake,
  evaluateDossier,
  migrateLeadToDossier,
  sortDossiersForQueue,
} from '@/pages/job-hunter-domain'

const sampleJob: LiveJob = {
  id: '1',
  source: 'Remotive',
  sourceId: 'remotive-1',
  title: 'Junior Automation Engineer',
  company: 'Acme',
  category: 'Software Development',
  jobType: 'Full-time',
  location: 'Remote - US',
  salary: '$70,000 - $90,000',
  publishedAt: new Date().toISOString(),
  url: 'https://example.com/jobs/1',
  summary: 'Build AI automation tooling and internal workflows.',
}

describe('career ops dossier domain', () => {
  it('creates a dossier from a live job with seeded overview data', () => {
    const dossier = createDossierFromJob(sampleJob)
    expect(dossier.company).toBe('Acme')
    expect(dossier.role).toBe('Junior Automation Engineer')
    expect(dossier.source.kind).toBe('live-search')
    expect(dossier.assets.resumeBullets).toEqual([])
  })

  it('evaluates a dossier into pursue, hold, or skip with reasons', () => {
    const dossier = createDossierFromJob(sampleJob)
    const evaluated = evaluateDossier(dossier)
    expect(['pursue', 'hold', 'skip']).toContain(evaluated.evaluation.recommendation)
    expect(evaluated.evaluation.reasonsToPursue.length + evaluated.evaluation.reasonsToAvoid.length).toBeGreaterThan(0)
  })

  it('migrates a tracked lead into a dossier timeline-safe shape', () => {
    const dossier = migrateLeadToDossier({
      id: 'lead-1',
      company: 'Acme',
      role: 'Junior Automation Engineer',
      location: 'Remote',
      source: 'Manual',
      stage: 'applied',
      nextAction: 'Follow up Friday',
      due: 'Friday',
      priority: 'high',
      tags: ['automation'],
      notes: 'Strong fit',
    })
    expect(dossier.stage).toBe('applied')
    expect(dossier.timeline[0]?.type).toBe('migrated')
  })

  it('sorts dossiers by recommendation, urgency, and freshness', () => {
    const pursue = evaluateDossier(createDossierFromJob(sampleJob))
    const hold = {
      ...pursue,
      id: 'hold-1',
      evaluation: { ...pursue.evaluation, recommendation: 'hold', fitScore: 55 },
    }
    const sorted = sortDossiersForQueue([hold, pursue])
    expect(sorted[0].evaluation.recommendation).toBe('pursue')
  })

  it('creates a dossier from manual intake text without a feed job', () => {
    const dossier = createDossierFromManualIntake({
      company: 'Beta Corp',
      role: 'IT Support Specialist',
      location: 'Fort Myers, FL',
      description: 'Entry-level support role with ticketing and device setup.',
      sourceLabel: 'Manual paste',
      sourceUrl: '',
    })
    expect(dossier.source.kind).toBe('manual')
    expect(dossier.notes).toContain('Entry-level support role')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/__tests__/career-ops-domain.test.ts`

Expected: FAIL with missing exports such as `createDossierFromJob` or missing file `career-ops-domain.test.ts`.

- [ ] **Step 3: Add dossier and profile types**

```ts
export type DossierRecommendation = 'pursue' | 'hold' | 'skip'
export type DossierSourceKind = 'live-search' | 'manual'
export type TimelineEventType = 'created' | 'evaluated' | 'asset-generated' | 'stage-changed' | 'note-added' | 'migrated'

export interface CareerProfile {
  targetRoles: string[]
  payFloor: number
  preferredLocations: string[]
  narrative: string
  strengths: string[]
  urgencyMode: 'urgent-active-search'
}

export interface DossierEvaluation {
  fitScore: number
  recommendation: DossierRecommendation
  reasonsToPursue: string[]
  reasonsToAvoid: string[]
  riskFlags: string[]
  confidenceGaps: string[]
}

export interface DossierAssetSet {
  resumeBullets: string[]
  coverNote: string
  outreachBlurb: string
  interviewPrompts: string[]
}

export interface DossierTimelineEvent {
  id: string
  type: TimelineEventType
  at: string
  label: string
}

export interface OpportunityDossier {
  id: string
  company: string
  role: string
  location: string
  source: {
    kind: DossierSourceKind
    label: string
    sourceId?: string
    url?: string
  }
  salaryText: string
  estimatedHourlyRate: number | null
  summary: string
  stage: StageId
  nextAction: string
  due: string
  tags: string[]
  notes: string
  createdAt: string
  updatedAt: string
  evaluation: DossierEvaluation
  assets: DossierAssetSet
  timeline: DossierTimelineEvent[]
}
```

- [ ] **Step 4: Implement dossier creation, migration, evaluation, and queue sort helpers**

```ts
export const DOSSIER_STORAGE_KEY = 'career-ops-dossiers'
export const PROFILE_STORAGE_KEY = 'career-ops-profile'

export function createEmptyAssets(): DossierAssetSet {
  return {
    resumeBullets: [],
    coverNote: '',
    outreachBlurb: '',
    interviewPrompts: [],
  }
}

export function defaultCareerProfile(): CareerProfile {
  return {
    targetRoles: ['AI automation', 'data annotation', 'IT support', 'entry level engineering'],
    payFloor: TARGET_PROFILE.payFloor,
    preferredLocations: ['Remote - US', 'Fort Myers, FL'],
    narrative: TARGET_PROFILE.background,
    strengths: ['AI automation projects', 'computer engineering coursework', 'self-directed tooling'],
    urgencyMode: 'urgent-active-search',
  }
}

export function createDossierFromJob(job: LiveJob): OpportunityDossier {
  const now = new Date().toISOString()
  return {
    id: createId(),
    company: job.company,
    role: job.title,
    location: job.location,
    source: {
      kind: 'live-search',
      label: job.source,
      sourceId: job.sourceId,
      url: job.url,
    },
    salaryText: job.salary ?? '',
    estimatedHourlyRate: estimateHourlyRate(job.salary),
    summary: truncate(job.summary, 280),
    stage: 'sourcing',
    nextAction: 'Review fit and tailor application assets',
    due: 'Today',
    tags: uniqueStrings([job.category, job.jobType]),
    notes: job.summary,
    createdAt: now,
    updatedAt: now,
    evaluation: {
      fitScore: 0,
      recommendation: 'hold',
      reasonsToPursue: [],
      reasonsToAvoid: [],
      riskFlags: [],
      confidenceGaps: [],
    },
    assets: createEmptyAssets(),
    timeline: [{ id: createId(), type: 'created', at: now, label: 'Dossier created from live search' }],
  }
}

export function createDossierFromManualIntake(input: {
  company: string
  role: string
  location: string
  description: string
  sourceLabel: string
  sourceUrl?: string
}): OpportunityDossier {
  const now = new Date().toISOString()
  return {
    id: createId(),
    company: input.company,
    role: input.role,
    location: input.location,
    source: { kind: 'manual', label: input.sourceLabel, url: input.sourceUrl },
    salaryText: '',
    estimatedHourlyRate: null,
    summary: truncate(input.description, 280),
    stage: 'sourcing',
    nextAction: 'Score opportunity and tailor assets',
    due: 'Today',
    tags: [],
    notes: input.description,
    createdAt: now,
    updatedAt: now,
    evaluation: {
      fitScore: 0,
      recommendation: 'hold',
      reasonsToPursue: [],
      reasonsToAvoid: [],
      riskFlags: [],
      confidenceGaps: [],
    },
    assets: createEmptyAssets(),
    timeline: [{ id: createId(), type: 'created', at: now, label: 'Dossier created from manual intake' }],
  }
}

export function migrateLeadToDossier(lead: TrackedLead): OpportunityDossier {
  const now = new Date().toISOString()
  return {
    id: lead.id,
    company: lead.company,
    role: lead.role,
    location: lead.location,
    source: { kind: 'manual', label: lead.source, url: lead.sourceUrl, sourceId: lead.sourceId },
    salaryText: '',
    estimatedHourlyRate: null,
    summary: truncate(lead.notes, 280),
    stage: lead.stage,
    nextAction: lead.nextAction,
    due: lead.due,
    tags: lead.tags,
    notes: lead.notes,
    createdAt: now,
    updatedAt: now,
    evaluation: {
      fitScore: lead.priority === 'high' ? 70 : lead.priority === 'medium' ? 55 : 40,
      recommendation: lead.priority === 'high' ? 'pursue' : 'hold',
      reasonsToPursue: [],
      reasonsToAvoid: [],
      riskFlags: [],
      confidenceGaps: [],
    },
    assets: createEmptyAssets(),
    timeline: [{ id: createId(), type: 'migrated', at: now, label: 'Migrated from tracked lead' }],
  }
}

export function evaluateDossier(dossier: OpportunityDossier, profile = defaultCareerProfile()): OpportunityDossier {
  const haystack = normalizeText([dossier.role, dossier.summary, dossier.location, dossier.notes].join(' '))
  const rate = dossier.estimatedHourlyRate
  const reasonsToPursue: string[] = []
  const reasonsToAvoid: string[] = []
  const riskFlags: string[] = []
  const confidenceGaps: string[] = []
  let fitScore = 0

  if (profile.targetRoles.some(term => haystack.includes(normalizeText(term)))) {
    fitScore += 28
    reasonsToPursue.push('Matches target role family')
  } else {
    reasonsToAvoid.push('Weak match against current target role family')
  }

  if (/remote|hybrid/.test(haystack)) {
    fitScore += 14
    reasonsToPursue.push('Location looks compatible')
  }

  if (rate != null && rate >= profile.payFloor) {
    fitScore += 22
    reasonsToPursue.push(`Estimated pay meets $${profile.payFloor}/hr floor`)
  } else if (rate == null) {
    confidenceGaps.push('Compensation not listed')
  } else {
    reasonsToAvoid.push('Estimated compensation is below target floor')
  }

  if (/intern|entry|support|automation|data|it/.test(haystack)) {
    fitScore += 18
    reasonsToPursue.push('Strong adjacency to current proof points')
  }

  if (!/apply|greenhouse|lever|workday|ashby|workable|career/.test(haystack)) {
    riskFlags.push('Application path unclear')
  }

  const recommendation: DossierRecommendation =
    fitScore >= 70 ? 'pursue' : fitScore >= 45 ? 'hold' : 'skip'

  return {
    ...dossier,
    updatedAt: new Date().toISOString(),
    evaluation: {
      fitScore,
      recommendation,
      reasonsToPursue,
      reasonsToAvoid,
      riskFlags,
      confidenceGaps,
    },
  }
}

export function sortDossiersForQueue(dossiers: OpportunityDossier[]): OpportunityDossier[] {
  const rank = { pursue: 0, hold: 1, skip: 2 }
  return [...dossiers].sort((a, b) => {
    const rec = rank[a.evaluation.recommendation] - rank[b.evaluation.recommendation]
    if (rec !== 0) return rec
    const score = b.evaluation.fitScore - a.evaluation.fitScore
    if (score !== 0) return score
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/__tests__/career-ops-domain.test.ts`

Expected: PASS with all dossier-domain tests green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/job-hunter-types.ts frontend/src/pages/job-hunter-domain.ts frontend/src/lib/__tests__/career-ops-domain.test.ts
git commit -m "feat: add career ops dossier domain model"
```

## Task 2: Migrate Page State From Loose Leads To Dossiers

**Files:**
- Modify: `frontend/src/pages/JobHunter.tsx`
- Modify: `frontend/src/pages/job-hunter-domain.ts`
- Test: `frontend/src/pages/__tests__/CareerOpsPage.test.tsx`

- [ ] **Step 1: Write the failing page-state tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import JobHunterPage from '@/pages/JobHunter'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <JobHunterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

it('shows Career Ops branding and the opportunity queue', async () => {
  renderPage()
  expect(screen.getByText('Career Ops')).toBeInTheDocument()
  expect(screen.getByText(/opportunity queue/i)).toBeInTheDocument()
})

it('creates a dossier from manual intake text', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.type(screen.getByLabelText(/job description/i), 'Entry-level automation role building AI tooling')
  await user.click(screen.getByRole('button', { name: /create dossier/i }))
  expect(screen.getByText(/manual intake/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/__tests__/CareerOpsPage.test.tsx`

Expected: FAIL because the page still renders `Job Hunter` and lacks manual dossier intake UI.

- [ ] **Step 3: Replace page-level local state with dossier-backed state**

```tsx
const [dossiers, setDossiers] = useState<OpportunityDossier[]>(() => loadDossiers())
const [careerProfile, setCareerProfile] = useState<CareerProfile>(() => loadCareerProfile())
const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null)
const [manualIntake, setManualIntake] = useState({
  company: '',
  role: '',
  location: 'Remote - US',
  description: '',
  sourceLabel: 'Manual intake',
  sourceUrl: '',
})

useEffect(() => {
  if (typeof window === 'undefined') return
  localStorage.setItem(DOSSIER_STORAGE_KEY, JSON.stringify(dossiers))
}, [dossiers])

useEffect(() => {
  if (typeof window === 'undefined') return
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(careerProfile))
}, [careerProfile])

const queuedDossiers = useMemo(() => sortDossiersForQueue(dossiers), [dossiers])
const selectedDossier = useMemo(
  () => queuedDossiers.find(dossier => dossier.id === selectedDossierId) ?? queuedDossiers[0] ?? null,
  [queuedDossiers, selectedDossierId],
)
```

- [ ] **Step 4: Convert live search actions into dossier creation**

```tsx
const addJobToDossiers = (job: LiveJob) => {
  setDossiers(prev => {
    const seeded = evaluateDossier(createDossierFromJob(job), careerProfile)
    const next = [seeded, ...prev.filter(item => item.source.sourceId !== job.sourceId)]
    return sortDossiersForQueue(next)
  })
}

const submitManualIntake = (event: FormEvent) => {
  event.preventDefault()
  const created = evaluateDossier(createDossierFromManualIntake(manualIntake), careerProfile)
  setDossiers(prev => sortDossiersForQueue([created, ...prev]))
  setSelectedDossierId(created.id)
  setManualIntake({
    company: '',
    role: '',
    location: 'Remote - US',
    description: '',
    sourceLabel: 'Manual intake',
    sourceUrl: '',
  })
}
```

- [ ] **Step 5: Add lightweight manual intake UI inside `JobHunter.tsx`**

```tsx
<section aria-label="Career Ops intake">
  <h2>Opportunity Queue</h2>
  <form onSubmit={submitManualIntake}>
    <input
      aria-label="Company"
      value={manualIntake.company}
      onChange={event => setManualIntake(prev => ({ ...prev, company: event.target.value }))}
      placeholder="Company"
    />
    <input
      aria-label="Role"
      value={manualIntake.role}
      onChange={event => setManualIntake(prev => ({ ...prev, role: event.target.value }))}
      placeholder="Role"
    />
    <textarea
      aria-label="Job description"
      value={manualIntake.description}
      onChange={event => setManualIntake(prev => ({ ...prev, description: event.target.value }))}
      placeholder="Paste job description or notes"
    />
    <button type="submit">Create dossier</button>
  </form>
</section>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/__tests__/CareerOpsPage.test.tsx`

Expected: PASS with branding and manual dossier creation covered.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/JobHunter.tsx frontend/src/pages/job-hunter-domain.ts frontend/src/pages/__tests__/CareerOpsPage.test.tsx
git commit -m "feat: migrate job hunter page state to career ops dossiers"
```

## Task 3: Extract Dossier, Queue, And Action UI Components

**Files:**
- Create: `frontend/src/pages/career-ops/OpportunityQueue.tsx`
- Create: `frontend/src/pages/career-ops/DossierPanel.tsx`
- Create: `frontend/src/pages/career-ops/ActionQueue.tsx`
- Modify: `frontend/src/pages/JobHunter.tsx`
- Test: `frontend/src/pages/__tests__/CareerOpsPage.test.tsx`

- [ ] **Step 1: Extend the page tests to verify dossier detail rendering**

```tsx
it('shows recommendation, risks, and generated assets in the selected dossier', async () => {
  renderPage()
  expect(await screen.findByText(/fit assessment/i)).toBeInTheDocument()
  expect(screen.getByText(/generated assets/i)).toBeInTheDocument()
  expect(screen.getByText(/next actions/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/__tests__/CareerOpsPage.test.tsx`

Expected: FAIL because the page still lacks extracted dossier sections and headings.

- [ ] **Step 3: Create `OpportunityQueue.tsx`**

```tsx
import type { OpportunityDossier } from '@/pages/job-hunter-types'

export function OpportunityQueue({
  dossiers,
  selectedId,
  onSelect,
}: {
  dossiers: OpportunityDossier[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <section aria-label="Opportunity queue">
      <h2>Opportunity Queue</h2>
      <ul style={{ display: 'grid', gap: '12px', listStyle: 'none', padding: 0, margin: 0 }}>
        {dossiers.map(dossier => (
          <li key={dossier.id}>
            <button type="button" onClick={() => onSelect(dossier.id)} aria-pressed={selectedId === dossier.id}>
              <strong>{dossier.company}</strong>
              <div>{dossier.role}</div>
              <div>{dossier.evaluation.recommendation} · {dossier.evaluation.fitScore}</div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Create `DossierPanel.tsx`**

```tsx
import type { OpportunityDossier } from '@/pages/job-hunter-types'

export function DossierPanel({ dossier }: { dossier: OpportunityDossier | null }) {
  if (!dossier) {
    return <section aria-label="Dossier detail"><p>No dossier selected yet.</p></section>
  }

  return (
    <section aria-label="Dossier detail">
      <h2>{dossier.company}</h2>
      <p>{dossier.role}</p>

      <h3>Fit Assessment</h3>
      <p>{dossier.evaluation.recommendation} · Score {dossier.evaluation.fitScore}</p>

      <h3>Risk Flags</h3>
      <ul>{dossier.evaluation.riskFlags.map(flag => <li key={flag}>{flag}</li>)}</ul>

      <h3>Generated Assets</h3>
      <ul>
        {dossier.assets.resumeBullets.map(line => <li key={line}>{line}</li>)}
        {!dossier.assets.resumeBullets.length && <li>No tailored assets yet.</li>}
      </ul>

      <h3>Next Actions</h3>
      <p>{dossier.nextAction}</p>
    </section>
  )
}
```

- [ ] **Step 5: Create `ActionQueue.tsx` and wire the components into `JobHunter.tsx`**

```tsx
import type { OpportunityDossier } from '@/pages/job-hunter-types'

export function ActionQueue({ dossiers }: { dossiers: OpportunityDossier[] }) {
  const actionable = dossiers.filter(dossier => dossier.evaluation.recommendation !== 'skip').slice(0, 5)
  return (
    <section aria-label="Action queue">
      <h2>Action Queue</h2>
      <ul>
        {actionable.map(dossier => (
          <li key={dossier.id}>
            {dossier.company}: {dossier.nextAction}
          </li>
        ))}
      </ul>
    </section>
  )
}

// In JobHunter.tsx
<div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)', gap: '24px' }}>
  <div style={{ display: 'grid', gap: '24px' }}>
    <OpportunityQueue dossiers={queuedDossiers} selectedId={selectedDossier?.id ?? null} onSelect={setSelectedDossierId} />
    <ActionQueue dossiers={queuedDossiers} />
  </div>
  <DossierPanel dossier={selectedDossier} />
</div>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/__tests__/CareerOpsPage.test.tsx`

Expected: PASS with queue and dossier detail visible.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/career-ops/OpportunityQueue.tsx frontend/src/pages/career-ops/DossierPanel.tsx frontend/src/pages/career-ops/ActionQueue.tsx frontend/src/pages/JobHunter.tsx frontend/src/pages/__tests__/CareerOpsPage.test.tsx
git commit -m "feat: add career ops queue and dossier panels"
```

## Task 4: Add Tailored Asset Generation And Profile Editing

**Files:**
- Create: `frontend/src/pages/career-ops/ProfilePanel.tsx`
- Create: `frontend/src/pages/career-ops/IntakePanel.tsx`
- Modify: `frontend/src/pages/job-hunter-domain.ts`
- Modify: `frontend/src/pages/JobHunter.tsx`
- Test: `frontend/src/lib/__tests__/career-ops-domain.test.ts`
- Test: `frontend/src/pages/__tests__/CareerOpsPage.test.tsx`

- [ ] **Step 1: Add failing tests for generated assets and profile updates**

```ts
it('generates tailored dossier assets from dossier facts and profile', () => {
  const dossier = evaluateDossier(createDossierFromJob(sampleJob))
  const next = generateDossierAssets(dossier, defaultCareerProfile())
  expect(next.assets.resumeBullets.length).toBeGreaterThan(0)
  expect(next.assets.coverNote).toContain('Acme')
})
```

```tsx
it('lets the user update pay floor strategy', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.clear(screen.getByLabelText(/pay floor/i))
  await user.type(screen.getByLabelText(/pay floor/i), '30')
  expect(screen.getByDisplayValue('30')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/__tests__/career-ops-domain.test.ts src/pages/__tests__/CareerOpsPage.test.tsx`

Expected: FAIL because `generateDossierAssets` and profile editing UI do not exist yet.

- [ ] **Step 3: Implement deterministic asset generation helpers**

```ts
export function generateDossierAssets(dossier: OpportunityDossier, profile: CareerProfile): OpportunityDossier {
  const bullets = [
    `Built hands-on projects aligned with ${dossier.role.toLowerCase()} responsibilities.`,
    `Applied ${profile.strengths[0]} experience to role themes from ${dossier.company}.`,
    `Demonstrated fast learning in ${dossier.location} compatible workflows and tools.`,
  ]

  const coverNote = `I am excited about the ${dossier.role} opportunity at ${dossier.company} because it aligns with my background in ${profile.strengths[0].toLowerCase()} and my focus on shipping practical automation work.`

  const outreachBlurb = `Hi, I’m reaching out about the ${dossier.role} role at ${dossier.company}. My background in ${profile.strengths[0].toLowerCase()} and self-directed engineering work makes this role a strong fit.`

  const interviewPrompts = [
    `Tell the story of a project that proves readiness for ${dossier.role}.`,
    `Explain why ${dossier.company} fits your current career direction.`,
    `Prepare one example that shows initiative under limited experience.`,
  ]

  return {
    ...dossier,
    updatedAt: new Date().toISOString(),
    assets: {
      resumeBullets: bullets,
      coverNote,
      outreachBlurb,
      interviewPrompts,
    },
    timeline: [
      { id: createId(), type: 'asset-generated', at: new Date().toISOString(), label: 'Generated tailored assets' },
      ...dossier.timeline,
    ],
  }
}
```

- [ ] **Step 4: Create `ProfilePanel.tsx` and `IntakePanel.tsx`, then wire them into the page**

```tsx
export function ProfilePanel({
  profile,
  onChange,
}: {
  profile: CareerProfile
  onChange: (next: CareerProfile) => void
}) {
  return (
    <section aria-label="Career profile">
      <h2>Profile / Strategy</h2>
      <label>
        Pay floor
        <input
          aria-label="Pay floor"
          type="number"
          value={profile.payFloor}
          onChange={event => onChange({ ...profile, payFloor: Number(event.target.value || 0) })}
        />
      </label>
    </section>
  )
}
```

```tsx
// In JobHunter.tsx, after dossier creation:
const createAndSelectDossier = (dossier: OpportunityDossier) => {
  const withAssets = generateDossierAssets(evaluateDossier(dossier, careerProfile), careerProfile)
  setDossiers(prev => sortDossiersForQueue([withAssets, ...prev.filter(item => item.id !== withAssets.id)]))
  setSelectedDossierId(withAssets.id)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/__tests__/career-ops-domain.test.ts src/pages/__tests__/CareerOpsPage.test.tsx`

Expected: PASS with generated asset coverage and editable pay floor strategy.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/career-ops/ProfilePanel.tsx frontend/src/pages/career-ops/IntakePanel.tsx frontend/src/pages/job-hunter-domain.ts frontend/src/pages/JobHunter.tsx frontend/src/lib/__tests__/career-ops-domain.test.ts frontend/src/pages/__tests__/CareerOpsPage.test.tsx
git commit -m "feat: add career ops assets and strategy editing"
```

## Task 5: Rename The Product Surface From Job Hunter To Career Ops

**Files:**
- Modify: `frontend/src/pages/JobHunter.tsx`
- Modify: `frontend/src/lib/modules.ts`
- Modify: `frontend/src/lib/nav-items.ts`
- Modify: `frontend/src/lib/keybindings.ts`
- Modify: `frontend/src/components/OnboardingWelcome.tsx`
- Modify: `frontend/src/components/wizard/WizardModules.tsx`
- Modify: `frontend/src/__tests__/route-audit.test.tsx`
- Modify: `frontend/src/lib/__tests__/modules.test.ts`
- Modify: `frontend/src/lib/__tests__/sidebar-config.test.ts`
- Modify: `frontend/src/pages/__tests__/module-smoke.test.tsx`

- [ ] **Step 1: Update the failing label assertions**

```ts
expect(module.name).toBe('Career Ops')
expect(navItem.label).toBe('Career Ops')
expect(keybinding.label).toBe('Go to Career Ops')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/__tests__/modules.test.ts src/lib/__tests__/sidebar-config.test.ts src/__tests__/route-audit.test.tsx src/pages/__tests__/module-smoke.test.tsx`

Expected: FAIL because the app still exposes `Job Hunter` strings.

- [ ] **Step 3: Update module, nav, keybinding, onboarding, and page header copy**

```ts
// frontend/src/lib/modules.ts
{ id: 'job-hunter', name: 'Career Ops', description: 'Opportunity dossiers, application assets, and job search operations', icon: 'MagnifyingGlass', route: '/jobs' }

// frontend/src/lib/nav-items.ts
{ href: '/jobs', label: 'Career Ops', icon: MagnifyingGlass, moduleId: 'job-hunter' }

// frontend/src/lib/keybindings.ts
{ id: 'nav-jobs', label: 'Go to Career Ops', key: 'j', mod: true, route: '/jobs' }

// frontend/src/pages/JobHunter.tsx
<PageHeader defaultTitle="Career Ops" defaultSubtitle="Opportunity dossiers, tailored assets, and action tracking" />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/__tests__/modules.test.ts src/lib/__tests__/sidebar-config.test.ts src/__tests__/route-audit.test.tsx src/pages/__tests__/module-smoke.test.tsx`

Expected: PASS with renamed product surface and route smoke still green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/JobHunter.tsx frontend/src/lib/modules.ts frontend/src/lib/nav-items.ts frontend/src/lib/keybindings.ts frontend/src/components/OnboardingWelcome.tsx frontend/src/components/wizard/WizardModules.tsx frontend/src/__tests__/route-audit.test.tsx frontend/src/lib/__tests__/modules.test.ts frontend/src/lib/__tests__/sidebar-config.test.ts frontend/src/pages/__tests__/module-smoke.test.tsx
git commit -m "feat: rename job hunter product surface to career ops"
```

## Task 6: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run focused frontend tests**

Run: `cd frontend && npx vitest run src/lib/__tests__/career-ops-domain.test.ts src/pages/__tests__/CareerOpsPage.test.tsx src/lib/__tests__/modules.test.ts src/lib/__tests__/sidebar-config.test.ts src/__tests__/route-audit.test.tsx src/pages/__tests__/module-smoke.test.tsx`

Expected: PASS with dossier domain, page behavior, and renamed module surface all green.

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run production build**

Run: `cd frontend && npm run build`

Expected: PASS with Vite build output and no new warnings that block shipping.

- [ ] **Step 4: Commit verification-only follow-up if needed**

```bash
git add frontend
git commit -m "test: verify career ops rollout"
```

## Self-Review

### Spec Coverage

- intake from live search and pasted/manual input: covered in Tasks 2 and 4
- dossier as durable core object: covered in Task 1
- richer structured evaluation: covered in Task 1
- tailored assets: covered in Task 4
- workflow state, action queue, and dossier detail: covered in Tasks 2 and 3
- profile and strategy storage: covered in Task 4
- product repositioning to `Career Ops`: covered in Task 5

### Gaps Checked

- no auto-apply work included
- no ATS automation included
- no backend persistence expansion included
- no negotiation workflows included

### Placeholder Scan

- removed `TODO`-style steps
- every task names exact files
- every verification step has exact commands
- every code-writing step includes concrete starter code

### Type Consistency

- `OpportunityDossier`, `CareerProfile`, `DossierEvaluation`, `DossierAssetSet`, and `DossierTimelineEvent` are introduced in Task 1 and used consistently later
- `generateDossierAssets`, `evaluateDossier`, `createDossierFromJob`, and `createDossierFromManualIntake` are defined before later tasks depend on them
