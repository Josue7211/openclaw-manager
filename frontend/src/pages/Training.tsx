import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowsClockwise,
  Barbell,
  CaretLeft,
  CaretRight,
  CalendarCheck,
  ChatCircle,
  ClipboardText,
  CreditCard,
  DotsThree,
  FirstAidKit,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Pulse,
  TrendUp,
  Trash,
  UploadSimple,
  UsersThree,
} from '@phosphor-icons/react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { ContextMenu, type ContextMenuState } from '@/components/ContextMenu'
import { useTauriQuery } from '@/hooks/useTauriQuery'
import { api } from '@/lib/api'
import {
  addDays as calendarAddDays,
  addMonths,
  CalendarEvent,
  CalendarResponse,
  GRID_END,
  GRID_START,
  MONTH_NAMES,
  parseLocalDate,
  toDateKey,
  weekStart,
} from './calendar/shared'
import { MonthView } from './calendar/MonthView'
import { WeekView } from './calendar/WeekView'
import { EventDetails } from './calendar/EventDetails'

type TrainingView = 'dashboard' | 'clients' | 'calendar' | 'forms'
type ClientStatus = 'active' | 'onboarding' | 'paused'
type FormStatus = 'active' | 'draft'
type ClientSection = 'overview' | 'sessions' | 'overload' | 'metrics' | 'program' | 'notes'

interface TrainingSession {
  id: string
  date: string
  sessionType: string
  duration: string
  attendance: string
  focus: string
  readiness: string
  performance: string
  notes: string
  nextAction: string
}

interface ProgressiveOverloadRecord {
  id: string
  exercise: string
  movementPattern: string
  lastSessionDate: string
  currentLoad: string
  currentReps: string
  currentSets: string
  targetLoad: string
  targetReps: string
  targetSets: string
  progressionRule: string
  notes: string
}

interface InBodyScan {
  id: string
  date: string
  totalBodyWater: string
  dryLeanMass: string
  weight: string
  bodyFatMass: string
  bodyFat: string
  bmi: string
  leanMass: string
  skeletalMuscleMass: string
  basalMetabolicRate: string
  visceralFatLevel: string
  bodyFatControl: string
  leanBodyMassControl: string
  leftArmLean: string
  leftArmPercent: string
  rightArmLean: string
  rightArmPercent: string
  trunkLean: string
  trunkPercent: string
  leftLegLean: string
  leftLegPercent: string
  rightLegLean: string
  rightLegPercent: string
  notes: string
  sourceText: string
}

interface TrainingClient {
  id: string
  name: string
  status: ClientStatus
  age: string
  primaryLanguage: string
  preferredContact: string
  packageName: string
  paymentStatus: string
  onboardingStage: string
  sessionCadence: string
  nextSession: string
  emergencyContact: string
  occupation: string
  goal: string
  phone: string
  email: string
  startDate: string
  latestInbodyDate: string
  nextCheckIn: string
  latestWeight: string
  bodyFat: string
  leanMass: string
  restingHeartRate: string
  sleepAverage: string
  stepsAverage: string
  programPhase: string
  adherence: string
  currentSplit: string
  supplements: string
  injuries: string
  nutritionNotes: string
  habitNotes: string
  assessmentNotes: string
  communicationNotes: string
  adminNotes: string
  intakeNotes: string
  coachNotes: string
  inbodyScans: InBodyScan[]
  sessions: TrainingSession[]
  overloadRecords: ProgressiveOverloadRecord[]
  createdAt: string
}

interface TrainingFormTemplate {
  id: string
  title: string
  status: FormStatus
  purpose: string
  fields: string[]
  updatedAt: string
}

interface IntakeLink {
  id: string
  token: string
  title: string
  fields: string[]
  clientId: string
  clientName: string
  language: string
  active: boolean
  expiresAt?: string | null
  expired?: boolean
  createdAt: string
  updatedAt: string
}

interface IntakeSubmission {
  id: string
  linkId: string
  title: string
  clientId: string
  clientName: string
  answers: Record<string, string>
  createdAt: string
  reviewedAt?: string | null
  appliedAt?: string | null
}

const PUBLIC_FORM_PATH = '/form'

function publicFormBaseUrl(): string {
  const configuredSiteUrl = import.meta.env.VITE_SITE_URL?.trim()
  return (configuredSiteUrl || window.location.origin).replace(/\/+$/, '')
}

function publicFormUrl(token: string): string {
  return `${publicFormBaseUrl()}${PUBLIC_FORM_PATH}/${token}`
}

const CLIENTS_STORAGE_KEY = 'training-clients'
const FORMS_STORAGE_KEY = 'training-forms'
const TRAINING_CALENDAR_STORAGE_KEY = 'training-calendar-name'

const NEW_CLIENT_INTAKE_FIELDS = [
  'Full name',
  'Age',
  'Primary language',
  'Phone',
  'Email',
  'Preferred contact method',
  'Occupation / daily activity',
  'Primary goal',
  'Secondary goals',
  'Why now?',
  'Training history',
  'Current workout split',
  'Preferred training days/times',
  'Current cardio',
  'Injuries / limitations',
  'Pain triggers',
  'Medical conditions',
  'Medications',
  'Supplements with doses',
  'Nutrition style',
  'Typical breakfast',
  'Typical lunch',
  'Typical dinner',
  'Snacks / cravings',
  'Protein intake estimate (grams/day)',
  'How much water do you drink per day?',
  'Alcohol / smoking',
  'Average sleep hours',
  'Sleep quality',
  'Daily steps estimate',
  'Stress level',
  'Barriers to consistency',
  'Emergency contact',
  'Consent',
]

const ASSESSMENT_UPDATE_FIELDS = [
  'Client name',
  'Assessment date',
  'InBody date',
  'Weight',
  'Body fat mass',
  'PBF %',
  'BMI',
  'SMM',
  'Visceral fat level',
  'Total body water',
  'Right arm %',
  'Left arm %',
  'Right leg %',
  'Left leg %',
  'Waist measurement',
  'Hip measurement',
  'Progress photos',
  'Strength markers',
  'Energy level',
  'Adherence %',
  'Sleep average',
  'Steps average',
  'Coach notes',
]

const WEEKLY_CHECK_IN_FIELDS = [
  'Client name',
  'Week of',
  'Current weight',
  'Sessions completed',
  'Cardio completed',
  'Average sleep hours',
  'Energy level',
  'Soreness / recovery',
  'Stress level',
  'Hunger / cravings',
  'Nutrition adherence %',
  'Protein hit days',
  'Water hit days',
  'Steps average',
  'Wins this week',
  'Problems this week',
  'Pain / injury changes',
  'Questions for coach',
]

const FOLLOW_UP_FIELDS = [
  'Allergies (food or medication)',
  'Supplements with doses',
  'Medications',
  'Average sleep hours',
  'Protein intake estimate (grams/day)',
  'Favorite foods',
  'Food dislikes / foods avoided',
  'How much water do you drink per day?',
  'Questions for coach',
]

const DEFAULT_FORMS: TrainingFormTemplate[] = [
  {
    id: 'new-client-intake',
    title: 'CEO Client Intake',
    status: 'active',
    purpose:
      'Complete coaching profile: contact, goals, schedule, health, nutrition, supplements, sleep, recovery, and barriers.',
    fields: NEW_CLIENT_INTAKE_FIELDS,
    updatedAt: today(),
  },
  {
    id: 'assessment-update',
    title: 'InBody & Assessment Update',
    status: 'active',
    purpose: 'Scan numbers, measurements, photos, adherence, recovery, and coach notes.',
    fields: ASSESSMENT_UPDATE_FIELDS,
    updatedAt: today(),
  },
  {
    id: 'weekly-check-in',
    title: 'Weekly Check-in',
    status: 'active',
    purpose: 'Weekly compliance, recovery, nutrition, obstacles, and client questions.',
    fields: WEEKLY_CHECK_IN_FIELDS,
    updatedAt: today(),
  },
  {
    id: 'member-follow-up',
    title: 'Member Follow-up',
    status: 'active',
    purpose:
      'Short follow-up for existing members. Only asks for info club sign-in, schedule, and InBody do not already provide.',
    fields: FOLLOW_UP_FIELDS,
    updatedAt: today(),
  },
]

const RAMON_WORK_IMAGE_SCAN_ID = 'ramon-work-3-inbody'
const RAMON_WORK_IMAGE_SCAN_DATE = '2026-05-06'
const RAMON_WORKOUT_SPLIT =
  'Schedule: Monday-Thursday\nMonday afternoon; Tuesday-Thursday at 10 AM.\nUpper/lower split 4x/week.'
const RAMON_WORK_IMAGE_SCAN: InBodyScan = {
  id: RAMON_WORK_IMAGE_SCAN_ID,
  date: RAMON_WORK_IMAGE_SCAN_DATE,
  totalBodyWater: '96.1',
  dryLeanMass: '',
  weight: '167.2',
  bodyFatMass: '36.2',
  bodyFat: '21.6',
  bmi: '25.4',
  leanMass: '',
  skeletalMuscleMass: '74.5',
  basalMetabolicRate: '',
  visceralFatLevel: '7',
  bodyFatControl: '',
  leanBodyMassControl: '',
  leftArmLean: '',
  leftArmPercent: '109.8',
  rightArmLean: '',
  rightArmPercent: '109.5',
  trunkLean: '',
  trunkPercent: '',
  leftLegLean: '',
  leftLegPercent: '94',
  rightLegLean: '',
  rightLegPercent: '94.2',
  notes:
    'From uploaded handwritten note Work-3.jpg. Corrected schedule: Monday-Thursday. Monday afternoon; Tuesday-Thursday at 10 AM. Upper/lower split 4x/week. Initial InBody.',
  sourceText:
    'Schedule: Monday-Thursday\nMonday afternoon; Tuesday-Thursday at 10 AM\nUpper lower 4x\nInitial InBody\nWater: 96.1\nWeight: 167.2\nMM: 74.5\nFM: 36.2\nVF: 7\nBMI: 25.4\nPBF: 21.6%\nRA: 109.5\nLA: 109.8\nRL: 94.2\nLL: 94',
}

const RAMON_CLIENT: TrainingClient = {
  id: 'ramon-godoy',
  name: 'Ramon Godoy',
  status: 'active',
  age: '41',
  primaryLanguage: 'Spanish',
  preferredContact: '',
  packageName: 'Personal training',
  paymentStatus: 'untracked',
  onboardingStage: 'intake needed',
  sessionCadence: '',
  nextSession: '',
  emergencyContact: '',
  occupation: '',
  goal: '',
  phone: '',
  email: '',
  startDate: today(),
  latestInbodyDate: RAMON_WORK_IMAGE_SCAN.date,
  nextCheckIn: '',
  latestWeight: RAMON_WORK_IMAGE_SCAN.weight,
  bodyFat: RAMON_WORK_IMAGE_SCAN.bodyFat,
  leanMass: '',
  restingHeartRate: '',
  sleepAverage: '',
  stepsAverage: '',
  programPhase: '',
  adherence: '',
  currentSplit: RAMON_WORKOUT_SPLIT,
  supplements: '',
  injuries:
    'Ankle discomfort/clicking from migration route. Does not seem severe; monitor during lower-body work. Main issue may be fear/confidence.',
  nutritionNotes: '',
  habitNotes: 'Gym rest days: Friday-Sunday. He still works those days.',
  assessmentNotes: `${RAMON_WORK_IMAGE_SCAN.notes}\nAnkle clicks/discomfort noted; seems not severe but may cause fear. Monitor pain, swelling, range of motion, and exercise confidence.\nInBody body-water marker looked fairly good in the 90s; 100+ is the well-hydrated target.`,
  communicationNotes: 'Spanish preferred. From Venezuela.',
  adminNotes: '',
  intakeNotes: 'Spanish speaker. Single. Kids are in Colombia.',
  coachNotes:
    'Private context only, not form material: Venezuelan like my family. Single, kids in Colombia. May have crossed multiple countries through the Darien route to reach the USA; ankle issue may have started there. Treat as sensitive, unconfirmed background and do not ask unless trust/relevance is clear.',
  inbodyScans: [RAMON_WORK_IMAGE_SCAN],
  sessions: [],
  overloadRecords: [],
  createdAt: new Date().toISOString(),
}

const DEFAULT_CLIENTS: TrainingClient[] = [RAMON_CLIENT]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeInBodyScans(client: Partial<TrainingClient>): InBodyScan[] {
  if (Array.isArray(client.inbodyScans)) {
    return client.inbodyScans
      .filter((scan): scan is InBodyScan => Boolean(scan?.id && scan?.date))
      .map(scan => ({
        ...scan,
        totalBodyWater: scan.totalBodyWater || '',
        dryLeanMass: scan.dryLeanMass || '',
        weight: scan.weight || '',
        bodyFatMass: scan.bodyFatMass || '',
        bodyFat: scan.bodyFat || '',
        bmi: scan.bmi || '',
        leanMass: scan.leanMass || '',
        skeletalMuscleMass: scan.skeletalMuscleMass || '',
        basalMetabolicRate: scan.basalMetabolicRate || '',
        visceralFatLevel: scan.visceralFatLevel || '',
        bodyFatControl: scan.bodyFatControl || '',
        leanBodyMassControl: scan.leanBodyMassControl || '',
        leftArmLean: scan.leftArmLean || '',
        leftArmPercent: scan.leftArmPercent || '',
        rightArmLean: scan.rightArmLean || '',
        rightArmPercent: scan.rightArmPercent || '',
        trunkLean: scan.trunkLean || '',
        trunkPercent: scan.trunkPercent || '',
        leftLegLean: scan.leftLegLean || '',
        leftLegPercent: scan.leftLegPercent || '',
        rightLegLean: scan.rightLegLean || '',
        rightLegPercent: scan.rightLegPercent || '',
        notes: scan.notes || '',
        sourceText: scan.sourceText || '',
      }))
  }
  if (!client.latestInbodyDate) return []
  return [
    createInBodyScan({
      date: client.latestInbodyDate,
      weight: client.latestWeight || '',
      bodyFat: client.bodyFat || '',
      leanMass: client.leanMass || '',
    }),
  ]
}

function isRamonClient(client: Pick<TrainingClient, 'id' | 'name'>): boolean {
  return client.id === RAMON_CLIENT.id || client.name.toLowerCase() === RAMON_CLIENT.name.toLowerCase()
}

function withRamonWorkImageDefaults(client: TrainingClient): TrainingClient {
  if (!isRamonClient(client)) return client
  const hasSeedScan = client.inbodyScans.some(scan => scan.id === RAMON_WORK_IMAGE_SCAN_ID)
  const inbodyScans = hasSeedScan
    ? client.inbodyScans.map(scan => {
        if (scan.id !== RAMON_WORK_IMAGE_SCAN_ID) return scan
        const hasOldSchedule = scan.notes.includes('Wed') || scan.sourceText.includes('Wed')
        return {
          ...RAMON_WORK_IMAGE_SCAN,
          ...scan,
          date: RAMON_WORK_IMAGE_SCAN_DATE,
          notes: hasOldSchedule ? RAMON_WORK_IMAGE_SCAN.notes : scan.notes,
          sourceText: hasOldSchedule ? RAMON_WORK_IMAGE_SCAN.sourceText : scan.sourceText,
        }
      })
    : [RAMON_WORK_IMAGE_SCAN, ...client.inbodyScans]
  const hasOldSplit =
    client.currentSplit.includes('Wed') || client.currentSplit.includes('Sat') || client.currentSplit.includes('Sun')
  return {
    ...client,
    inbodyScans,
    latestInbodyDate:
      !client.latestInbodyDate || client.latestInbodyDate === '2026-05-08'
        ? RAMON_WORK_IMAGE_SCAN_DATE
        : client.latestInbodyDate,
    latestWeight: client.latestWeight || RAMON_WORK_IMAGE_SCAN.weight,
    bodyFat: client.bodyFat || RAMON_WORK_IMAGE_SCAN.bodyFat,
    currentSplit: !client.currentSplit || hasOldSplit ? RAMON_WORKOUT_SPLIT : client.currentSplit,
    injuries: client.injuries || RAMON_CLIENT.injuries,
    habitNotes: client.habitNotes || RAMON_CLIENT.habitNotes,
    communicationNotes: client.communicationNotes || RAMON_CLIENT.communicationNotes,
    intakeNotes: client.intakeNotes || RAMON_CLIENT.intakeNotes,
    coachNotes: client.coachNotes || RAMON_CLIENT.coachNotes,
    assessmentNotes: client.assessmentNotes || RAMON_WORK_IMAGE_SCAN.notes,
  }
}

function loadClients(): TrainingClient[] {
  if (typeof window === 'undefined') return DEFAULT_CLIENTS
  try {
    const raw = localStorage.getItem(CLIENTS_STORAGE_KEY)
    if (!raw) return DEFAULT_CLIENTS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_CLIENTS
    const clients = parsed
      .filter((item): item is TrainingClient => Boolean(item?.id && item?.name))
      .map(client =>
        withRamonWorkImageDefaults({
          ...client,
          age: client.age || '',
          primaryLanguage: client.primaryLanguage || '',
          preferredContact: client.preferredContact || '',
          packageName: client.packageName || '',
          paymentStatus: client.paymentStatus || '',
          onboardingStage: client.onboardingStage || '',
          sessionCadence: client.sessionCadence || '',
          nextSession: client.nextSession || '',
          emergencyContact: client.emergencyContact || '',
          occupation: client.occupation || '',
          latestWeight: client.latestWeight || '',
          bodyFat: client.bodyFat || '',
          leanMass: client.leanMass || '',
          restingHeartRate: client.restingHeartRate || '',
          sleepAverage: client.sleepAverage || '',
          stepsAverage: client.stepsAverage || '',
          programPhase: client.programPhase || '',
          adherence: client.adherence || '',
          nutritionNotes: client.nutritionNotes || '',
          habitNotes: client.habitNotes || '',
          assessmentNotes: client.assessmentNotes || '',
          communicationNotes: client.communicationNotes || '',
          adminNotes: client.adminNotes || '',
          inbodyScans: normalizeInBodyScans(client),
          sessions: Array.isArray(client.sessions) ? client.sessions : [],
          overloadRecords: Array.isArray(client.overloadRecords) ? client.overloadRecords : [],
        }),
      )
    const hasRamon = clients.some(
      client => client.id === RAMON_CLIENT.id || client.name.toLowerCase() === RAMON_CLIENT.name.toLowerCase(),
    )
    return hasRamon ? clients : [RAMON_CLIENT, ...clients]
  } catch {
    return DEFAULT_CLIENTS
  }
}

function loadForms(): TrainingFormTemplate[] {
  if (typeof window === 'undefined') return DEFAULT_FORMS
  try {
    const raw = localStorage.getItem(FORMS_STORAGE_KEY)
    if (!raw) return DEFAULT_FORMS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_FORMS
    const stored = parsed.filter((item): item is TrainingFormTemplate => Boolean(item?.id && item?.title))
    const upgraded = DEFAULT_FORMS.map(defaultForm => {
      const existing = stored.find(form => form.id === defaultForm.id)
      if (!existing) return defaultForm
      const fields = Array.from(new Set([...existing.fields, ...defaultForm.fields]))
      return {
        ...existing,
        title: existing.title === 'New Client Intake' ? defaultForm.title : existing.title,
        purpose: existing.purpose.length < defaultForm.purpose.length ? defaultForm.purpose : existing.purpose,
        status: existing.status === 'draft' && defaultForm.status === 'active' ? 'active' : existing.status,
        fields,
      }
    })
    return [...upgraded, ...stored.filter(form => !DEFAULT_FORMS.some(defaultForm => defaultForm.id === form.id))]
  } catch {
    return DEFAULT_FORMS
  }
}

function createClient(): TrainingClient {
  return {
    id: createId('client'),
    name: 'New client',
    status: 'onboarding',
    age: '',
    primaryLanguage: '',
    preferredContact: '',
    packageName: '',
    paymentStatus: 'untracked',
    onboardingStage: 'lead',
    sessionCadence: '',
    nextSession: '',
    emergencyContact: '',
    occupation: '',
    goal: '',
    phone: '',
    email: '',
    startDate: today(),
    latestInbodyDate: '',
    nextCheckIn: '',
    latestWeight: '',
    bodyFat: '',
    leanMass: '',
    restingHeartRate: '',
    sleepAverage: '',
    stepsAverage: '',
    programPhase: '',
    adherence: '',
    currentSplit: '',
    supplements: '',
    injuries: '',
    nutritionNotes: '',
    habitNotes: '',
    assessmentNotes: '',
    communicationNotes: '',
    adminNotes: '',
    intakeNotes: '',
    coachNotes: '',
    inbodyScans: [],
    sessions: [],
    overloadRecords: [],
    createdAt: new Date().toISOString(),
  }
}

function createSession(): TrainingSession {
  return {
    id: createId('session'),
    date: today(),
    sessionType: 'Training',
    duration: '',
    attendance: 'completed',
    focus: '',
    readiness: '',
    performance: '',
    notes: '',
    nextAction: '',
  }
}

function createInBodyScan(patch: Partial<InBodyScan> = {}): InBodyScan {
  return {
    id: createId('inbody'),
    date: today(),
    totalBodyWater: '',
    dryLeanMass: '',
    weight: '',
    bodyFatMass: '',
    bodyFat: '',
    bmi: '',
    leanMass: '',
    skeletalMuscleMass: '',
    basalMetabolicRate: '',
    visceralFatLevel: '',
    bodyFatControl: '',
    leanBodyMassControl: '',
    leftArmLean: '',
    leftArmPercent: '',
    rightArmLean: '',
    rightArmPercent: '',
    trunkLean: '',
    trunkPercent: '',
    leftLegLean: '',
    leftLegPercent: '',
    rightLegLean: '',
    rightLegPercent: '',
    notes: '',
    sourceText: '',
    ...patch,
  }
}

function createOverloadRecord(): ProgressiveOverloadRecord {
  return {
    id: createId('overload'),
    exercise: '',
    movementPattern: '',
    lastSessionDate: today(),
    currentLoad: '',
    currentReps: '',
    currentSets: '',
    targetLoad: '',
    targetReps: '',
    targetSets: '',
    progressionRule: '',
    notes: '',
  }
}

function viewFromPath(pathname: string): TrainingView {
  if (pathname.endsWith('/clients')) return 'clients'
  if (pathname.endsWith('/calendar')) return 'calendar'
  if (pathname.endsWith('/forms')) return 'forms'
  return 'dashboard'
}

function answerGetter(answers: Record<string, string>): (...keys: string[]) => string {
  const normalized = new Map(
    Object.entries(answers).map(([key, value]) => [
      key.toLowerCase().replace(/[^a-z0-9]/g, ''),
      String(value || '').trim(),
    ]),
  )
  return (...keys: string[]) => {
    for (const key of keys) {
      const value = normalized.get(key.toLowerCase().replace(/[^a-z0-9]/g, ''))
      if (value) return value
    }
    return ''
  }
}

function compactLines(values: string[]): string {
  return values
    .map(value => value.trim())
    .filter(Boolean)
    .join('\n')
}

function loadTrainingCalendarName(): string {
  if (typeof window === 'undefined') return ''
  try {
    const stored = localStorage.getItem(TRAINING_CALENDAR_STORAGE_KEY) || ''
    return stored === '__all__' ? '' : stored
  } catch {
    return ''
  }
}

function resolveTrainingCalendarName(calendarNames: string[], preferred: string): string {
  if (calendarNames.length === 0) return ''
  const normalizedPreferred = preferred.trim().toLowerCase()
  if (normalizedPreferred) {
    const exact = calendarNames.find(name => name.toLowerCase() === normalizedPreferred)
    if (exact) return exact
  }
  const trainerizeWork = calendarNames.find(name => {
    const lower = name.toLowerCase()
    return lower.includes('trainerize') && lower.includes('work')
  })
  if (trainerizeWork) return trainerizeWork
  const trainerize = calendarNames.find(name => name.toLowerCase().includes('trainerize'))
  if (trainerize) return trainerize
  const exactWork = calendarNames.find(name => name.trim().toLowerCase() === 'work')
  if (exactWork) return exactWork
  const work = calendarNames.find(name => name.toLowerCase().includes('work'))
  if (work) return work
  return calendarNames[0]
}

function uniqueCalendarNames(events: CalendarEvent[]): string[] {
  return Array.from(new Set(events.map(event => event.calendar).filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

function withoutBlankPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== '')) as Partial<T>
}

const pageStyle: CSSProperties = {
  padding: '18px',
  width: '100%',
  minHeight: '100%',
}

const cardStyle: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: '16px',
}

const labelStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 700,
}

const fieldStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  padding: '9px 10px',
  font: 'inherit',
  fontSize: '13px',
}

export default function TrainingPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const view = viewFromPath(location.pathname)
  const [clients, setClients] = useState<TrainingClient[]>(() => loadClients())
  const [forms, setForms] = useState<TrainingFormTemplate[]>(() => loadForms())
  const [selectedTrainingCalendar, setSelectedTrainingCalendar] = useState(() => loadTrainingCalendarName())
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const {
    data: calendarData,
    isLoading: calendarLoading,
    isFetching: calendarFetching,
    refetch: refetchCalendar,
  } = useTauriQuery<CalendarResponse>(['training-calendar'], '/api/calendar', {
    enabled: view === 'calendar',
    staleTime: 60_000,
  })

  useEffect(() => {
    localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(clients))
  }, [clients])

  useEffect(() => {
    localStorage.setItem(FORMS_STORAGE_KEY, JSON.stringify(forms))
  }, [forms])

  const selectedClient = clients.find(client => client.id === selectedClientId)
  const activeClients = clients.filter(client => client.status === 'active')
  const injuredClients = clients.filter(client => client.injuries.trim().length > 0)
  const checkInsDue = clients.filter(client => client.nextCheckIn && client.nextCheckIn <= today())
  const unpaidClients = clients.filter(
    client =>
      client.paymentStatus.toLowerCase().includes('due') || client.paymentStatus.toLowerCase().includes('unpaid'),
  )
  const filteredClients = clients.filter(client => {
    const query = clientSearch.toLowerCase().trim()
    if (!query) return true
    return [client.name, client.goal, client.phone, client.email, client.primaryLanguage, client.packageName].some(
      value => value.toLowerCase().includes(query),
    )
  })
  const calendarEvents = calendarData?.events ?? []
  const trainingCalendarNames = useMemo(() => uniqueCalendarNames(calendarEvents), [calendarEvents])
  const activeTrainingCalendar = useMemo(
    () => resolveTrainingCalendarName(trainingCalendarNames, selectedTrainingCalendar),
    [trainingCalendarNames, selectedTrainingCalendar],
  )
  const trainingCalendarEvents = useMemo(
    () => calendarEvents.filter(event => activeTrainingCalendar && event.calendar === activeTrainingCalendar),
    [activeTrainingCalendar, calendarEvents],
  )
  const calendarError = calendarData?.error
    ? calendarData.message ||
      (calendarData.error === 'missing_credentials' ? 'iCloud calendar is not connected.' : 'Calendar sync failed.')
    : null

  useEffect(() => {
    if (!activeTrainingCalendar || activeTrainingCalendar === selectedTrainingCalendar) return
    setSelectedTrainingCalendar(activeTrainingCalendar)
  }, [activeTrainingCalendar, selectedTrainingCalendar])

  useEffect(() => {
    if (!selectedTrainingCalendar) return
    try {
      localStorage.setItem(TRAINING_CALENDAR_STORAGE_KEY, selectedTrainingCalendar)
    } catch {
      // ignore storage access failures
    }
  }, [selectedTrainingCalendar])

  const recentClients = useMemo(() => {
    return [...clients]
      .sort((a, b) => (b.latestInbodyDate || b.createdAt).localeCompare(a.latestInbodyDate || a.createdAt))
      .slice(0, 5)
  }, [clients])

  function addClient() {
    const next = createClient()
    setClients(current => [next, ...current])
    setSelectedClientId(next.id)
    navigate('/training/clients')
  }

  function updateClient(id: string, patch: Partial<TrainingClient>) {
    setClients(current => current.map(client => (client.id === id ? { ...client, ...patch } : client)))
  }

  function deleteClient(id: string) {
    const remaining = clients.filter(item => item.id !== id)
    setClients(remaining)
    if (selectedClientId === id) {
      setSelectedClientId(remaining[0]?.id || null)
    }
  }

  function addForm() {
    setForms(current => [
      {
        id: createId('form'),
        title: 'Custom Coaching Form',
        status: 'draft',
        purpose: 'Focused data capture for a specific coaching decision.',
        fields: [
          'Client name',
          'Date',
          'Goal of form',
          'Current status',
          'Numbers / details',
          'Coach notes',
          'Next action',
        ],
        updatedAt: today(),
      },
      ...current,
    ])
    navigate('/training/forms')
  }

  function applyIntakeAnswers(answers: Record<string, string>, clientId = '', fallbackClientName = '') {
    const answer = answerGetter(answers)
    const targetClient = clientId ? clients.find(client => client.id === clientId) : null
    const answeredName = answer('Full name', 'Client name', 'Name').trim()
    const name = answeredName || fallbackClientName.trim() || targetClient?.name || ''
    if (!name) return
    const scanDate = answer('InBody date', 'Assessment date')
    const inbodyScan = scanDate
      ? createInBodyScan({
          date: scanDate,
          weight: answer('Weight', 'Current weight'),
          bodyFatMass: answer('Body fat mass', 'FM'),
          bodyFat: answer('PBF %', 'Body fat %', 'Percent body fat'),
          bmi: answer('BMI'),
          skeletalMuscleMass: answer('SMM', 'MM', 'Skeletal muscle mass'),
          visceralFatLevel: answer('Visceral fat level', 'Visceral fat', 'VF'),
          totalBodyWater: answer('Total body water', 'Water'),
          rightArmPercent: answer('Right arm %', 'RA'),
          leftArmPercent: answer('Left arm %', 'LA'),
          rightLegPercent: answer('Right leg %', 'RL'),
          leftLegPercent: answer('Left leg %', 'LL'),
          notes: answer('Coach notes', 'Notes'),
          sourceText: Object.entries(answers)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n'),
        })
      : null
    const followUpOnly =
      Boolean(clientId) || (!answer('Full name') && Boolean(answer('Client name') || fallbackClientName))

    const patch: Partial<TrainingClient> = {
      ...(answeredName ? { name } : {}),
      ...(followUpOnly
        ? {}
        : {
            age: answer('Age'),
            primaryLanguage: answer('Primary language', 'Language'),
            preferredContact: answer('Preferred contact method', 'Preferred contact'),
            phone: answer('Phone'),
            email: answer('Email'),
            emergencyContact: answer('Emergency contact'),
            occupation: answer('Occupation / daily activity', 'Occupation'),
            goal: compactLines([
              answer('Primary goal', 'Goals', 'Goal'),
              answer('Secondary goals'),
              answer('Why now?'),
            ]),
          }),
      injuries: compactLines([
        answer('Injuries / limitations', 'Injuries'),
        answer('Pain triggers'),
        answer('Pain / injury changes'),
      ]),
      supplements: answer('Supplements with doses', 'Supplements'),
      currentSplit: compactLines([
        answer('Current workout split'),
        answer('Preferred training days/times'),
        answer('Training history'),
      ]),
      nutritionNotes: compactLines([
        answer('Nutrition style'),
        answer('Typical breakfast'),
        answer('Typical lunch'),
        answer('Typical dinner'),
        answer('Snacks / cravings'),
        answer('Protein intake estimate (grams/day)', 'Protein intake estimate'),
        answer('Favorite foods'),
        answer('Food dislikes / foods avoided', 'Food restrictions / foods avoided'),
        answer('Hunger / cravings'),
        answer('Nutrition adherence %'),
        answer('Protein hit days'),
        answer(
          'How much water do you drink per day?',
          'How many bottles or cups of water do you drink on a normal day?',
          'Hydration habits / water intake',
          'Water intake',
          'Water hit days',
        ),
      ]),
      habitNotes: compactLines([
        answer('Current cardio'),
        answer('Daily steps estimate', 'Steps average'),
        answer('Average sleep hours', 'Sleep average'),
        answer('Sleep quality'),
        answer('Rest days / recovery'),
        answer('Stress level'),
        answer('Alcohol / smoking'),
        answer('Barriers to consistency'),
        answer('Wins this week'),
        answer('Problems this week'),
      ]),
      adminNotes: compactLines([
        answer('Allergies (food or medication)', 'Allergies'),
        answer('Medical conditions'),
        answer('Medications'),
        answer('Consent'),
      ]),
      assessmentNotes: compactLines([
        answer('Measurements'),
        answer('Waist measurement'),
        answer('Hip measurement'),
        answer('Progress photos'),
        answer('Strength markers'),
        answer('Energy level'),
        answer('Soreness / recovery'),
        answer('Questions for coach'),
        answer('Coach notes', 'Notes'),
      ]),
      sleepAverage: answer('Average sleep hours', 'Sleep average'),
      stepsAverage: answer('Daily steps estimate', 'Steps average'),
      adherence: answer('Adherence %', 'Nutrition adherence %'),
      restingHeartRate: answer('Resting heart rate', 'Resting HR'),
      intakeNotes: Object.entries(answers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n'),
      onboardingStage: 'intake received',
    }

    setClients(current => {
      const existing = clientId
        ? current.find(client => client.id === clientId)
        : current.find(client => client.name.toLowerCase() === name.toLowerCase())
      if (existing) {
        return current.map(client => {
          if (client.id !== existing.id) return client
          const scans = inbodyScan ? [inbodyScan, ...(client.inbodyScans || [])] : client.inbodyScans
          return {
            ...client,
            ...withoutBlankPatch(patch),
            ...(inbodyScan ? { ...latestInBodyPatch(scans, client), inbodyScans: scans } : {}),
          }
        })
      }
      const nextClient = {
        ...createClient(),
        ...withoutBlankPatch(patch),
        id: createId('client'),
        status: 'onboarding' as ClientStatus,
      }
      const scans = inbodyScan ? [inbodyScan] : []
      return [
        { ...nextClient, ...(inbodyScan ? { ...latestInBodyPatch(scans, nextClient), inbodyScans: scans } : {}) },
        ...current,
      ]
    })
    navigate('/training/clients')
  }

  return (
    <div style={pageStyle}>
      {view !== 'clients' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '18px',
          }}
        >
          <PageHeader
            defaultTitle={view === 'calendar' ? 'Training Calendar' : view === 'forms' ? 'Forms' : 'Training Dashboard'}
            defaultSubtitle="clients, intake, assessments, splits, injuries, and coaching notes"
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={addForm}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <ClipboardText size={16} />
              Form
            </Button>
            <Button onClick={addClient} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={16} />
              Client
            </Button>
            {view === 'calendar' && (
              <Button
                variant="secondary"
                onClick={() => void refetchCalendar()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <ArrowsClockwise
                  size={16}
                  style={{ animation: calendarFetching ? 'spin 0.8s linear infinite' : 'none' }}
                />
                Refresh
              </Button>
            )}
          </div>
        </div>
      )}

      {view === 'dashboard' && (
        <DashboardView
          activeCount={activeClients.length}
          injuredCount={injuredClients.length}
          checkInsDueCount={checkInsDue.length}
          unpaidCount={unpaidClients.length}
          recentClients={recentClients}
          forms={forms}
          onAddClient={addClient}
        />
      )}

      {view === 'clients' && (
        <ClientsView
          clients={clients}
          filteredClients={filteredClients}
          selectedClient={selectedClient}
          selectedClientId={selectedClient?.id || null}
          clientSearch={clientSearch}
          onSearch={setClientSearch}
          onSelect={setSelectedClientId}
          onUpdate={updateClient}
          onDelete={deleteClient}
          onAddClient={addClient}
        />
      )}

      {view === 'calendar' && (
        <CalendarView
          events={trainingCalendarEvents}
          calendarNames={trainingCalendarNames}
          selectedCalendarName={activeTrainingCalendar}
          loading={calendarLoading}
          fetching={calendarFetching}
          errorMessage={calendarError}
          onSelectCalendar={setSelectedTrainingCalendar}
          onRefresh={() => void refetchCalendar()}
        />
      )}

      {view === 'forms' && (
        <FormsView
          forms={forms}
          clients={clients}
          onUpdate={(id, patch) =>
            setForms(current =>
              current.map(form => (form.id === id ? { ...form, ...patch, updatedAt: today() } : form)),
            )
          }
          onAddForm={addForm}
          onApplyAnswers={applyIntakeAnswers}
        />
      )}
    </div>
  )
}

function DashboardView({
  activeCount,
  injuredCount,
  checkInsDueCount,
  unpaidCount,
  recentClients,
  forms,
  onAddClient,
}: {
  activeCount: number
  injuredCount: number
  checkInsDueCount: number
  unpaidCount: number
  recentClients: TrainingClient[]
  forms: TrainingFormTemplate[]
  onAddClient: () => void
}) {
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <MetricCard label="Active clients" value={activeCount} icon={<UsersThree size={19} />} tone="var(--green)" />
        <MetricCard
          label="Check-ins due"
          value={checkInsDueCount}
          icon={<CalendarCheck size={19} />}
          tone="var(--amber)"
        />
        <MetricCard label="Injury flags" value={injuredCount} icon={<FirstAidKit size={19} />} tone="var(--red)" />
        <MetricCard label="Payment flags" value={unpaidCount} icon={<CreditCard size={19} />} tone="var(--cyan)" />
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '16px' }}
      >
        <section style={cardStyle}>
          <SectionHeader title="Client Command Queue" meta="latest assessments and due work" />
          {recentClients.length === 0 ? (
            <EmptyPanel
              title="No clients yet"
              body="Add the first client, then track intake, InBody dates, splits, supplements, injuries, and notes from their profile."
              actionLabel="Add client"
              onAction={onAddClient}
            />
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {recentClients.map(client => (
                <Link key={client.id} to="/training/clients" style={{ ...rowStyle, textDecoration: 'none' }}>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{client.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '3px' }}>
                      {client.goal || 'No goal set'} · InBody {client.latestInbodyDate || 'not logged'} ·{' '}
                      {client.packageName || 'no package'}
                    </div>
                  </div>
                  <StatusPill status={client.status} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section style={cardStyle}>
          <SectionHeader title="Intake System" meta={`${forms.length} templates`} />
          <div style={{ display: 'grid', gap: '10px' }}>
            {forms.map(form => (
              <Link
                key={form.id}
                to="/training/forms"
                style={{ ...rowStyle, textDecoration: 'none', alignItems: 'flex-start' }}
              >
                <div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{form.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '3px' }}>
                    {form.fields.length} fields
                  </div>
                </div>
                <SmallPill label={form.status} />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function ClientsView({
  clients,
  filteredClients,
  selectedClient,
  selectedClientId,
  clientSearch,
  onSearch,
  onSelect,
  onUpdate,
  onDelete,
  onAddClient,
}: {
  clients: TrainingClient[]
  filteredClients: TrainingClient[]
  selectedClient?: TrainingClient
  selectedClientId: string | null
  clientSearch: string
  onSearch: (value: string) => void
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: Partial<TrainingClient>) => void
  onDelete: (id: string) => void
  onAddClient: () => void
}) {
  const [activeSection, setActiveSection] = useState<ClientSection>('overview')
  const [clientMenu, setClientMenu] = useState<ContextMenuState | null>(null)
  const [clientPendingDelete, setClientPendingDelete] = useState<TrainingClient | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  const client = selectedClient
  const sessions = client?.sessions || []
  const overloadRecords = client?.overloadRecords || []
  const inbodyScans = [...(client?.inbodyScans || [])].sort((a, b) => b.date.localeCompare(a.date))
  const latestInbodyScan = inbodyScans[0]
  const scanWindow = latestInbodyScan ? inBodyScanWindow(latestInbodyScan.date) : null
  const showClientList = searchOpen || clientSearch.trim().length > 0 || !selectedClient

  function addSession() {
    if (!client) return
    onUpdate(client.id, { sessions: [createSession(), ...sessions] })
  }

  function updateSession(sessionId: string, patch: Partial<TrainingSession>) {
    if (!client) return
    onUpdate(client.id, {
      sessions: sessions.map(session => (session.id === sessionId ? { ...session, ...patch } : session)),
    })
  }

  function removeSession(sessionId: string) {
    if (!client) return
    onUpdate(client.id, { sessions: sessions.filter(session => session.id !== sessionId) })
  }

  function addOverloadRecord() {
    if (!client) return
    onUpdate(client.id, { overloadRecords: [createOverloadRecord(), ...overloadRecords] })
  }

  function updateOverloadRecord(recordId: string, patch: Partial<ProgressiveOverloadRecord>) {
    if (!client) return
    onUpdate(client.id, {
      overloadRecords: overloadRecords.map(record => (record.id === recordId ? { ...record, ...patch } : record)),
    })
  }

  function removeOverloadRecord(recordId: string) {
    if (!client) return
    onUpdate(client.id, { overloadRecords: overloadRecords.filter(record => record.id !== recordId) })
  }

  function addInBodyScan(patch: Partial<InBodyScan> = {}) {
    if (!client) return
    const scan = createInBodyScan(patch)
    const scans = [scan, ...inbodyScans]
    onUpdate(client.id, {
      ...latestInBodyPatch(scans, client),
      inbodyScans: scans,
    })
    setActiveSection('metrics')
  }

  function updateInBodyScan(scanId: string, patch: Partial<InBodyScan>) {
    if (!client) return
    const scans = inbodyScans.map(scan => (scan.id === scanId ? { ...scan, ...patch } : scan))
    onUpdate(client.id, { ...latestInBodyPatch(scans, client), inbodyScans: scans })
  }

  function removeInBodyScan(scanId: string) {
    if (!client) return
    const scans = inbodyScans.filter(scan => scan.id !== scanId)
    onUpdate(client.id, { ...latestInBodyPatch(scans, client), inbodyScans: scans })
  }

  function openClientMenu(event: React.MouseEvent, menuClient: TrainingClient) {
    event.preventDefault()
    event.stopPropagation()
    setClientMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: 'Edit profile',
          icon: PencilSimple,
          onClick: () => {
            onSelect(menuClient.id)
            setActiveSection('overview')
          },
        },
        {
          label: 'Delete client',
          icon: Trash,
          danger: true,
          onClick: () => setClientPendingDelete(menuClient),
        },
      ],
    })
  }

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <section
        className="client-profile-card"
        style={{ ...cardStyle, display: 'grid', gap: '12px' }}
        onContextMenu={event => selectedClient && openClientMenu(event, selectedClient)}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'center',
          }}
        >
          <label
            style={{
              flex: '1 1 340px',
              border: '1px solid var(--border-hover)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)',
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr) auto',
              alignItems: 'center',
              gap: '10px',
              minWidth: 0,
              padding: '0 12px',
            }}
          >
            <MagnifyingGlass size={18} color="var(--text-muted)" />
            <input
              value={clientSearch}
              onChange={event => onSearch(event.currentTarget.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
              placeholder="Search clients by name, phone, language, package..."
              aria-label="Search clients"
              style={{
                ...fieldStyle,
                border: 0,
                background: 'transparent',
                padding: '13px 0',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
              {filteredClients.length}/{clients.length}
            </span>
          </label>
          <Button onClick={onAddClient} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} />
            Client
          </Button>
        </div>

        {showClientList && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-white-02)',
              padding: '10px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
              gap: '8px',
              maxHeight: selectedClient ? '280px' : 'none',
              overflow: selectedClient ? 'auto' : 'visible',
            }}
          >
            {filteredClients.map(client => (
              <div key={client.id} className="client-roster-row" style={{ position: 'relative', minWidth: 0 }}>
                <button
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => {
                    onSelect(client.id)
                    setSearchOpen(false)
                  }}
                  onContextMenu={event => openClientMenu(event, client)}
                  aria-expanded={client.id === selectedClientId}
                  style={{
                    ...rowStyle,
                    width: '100%',
                    minHeight: '78px',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: client.id === selectedClientId ? 'var(--active-bg)' : 'var(--bg-card)',
                    paddingRight: '48px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: 'var(--text-primary)',
                        fontWeight: 800,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {client.name}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                      {client.packageName || 'No package'} · {client.primaryLanguage || 'language not set'}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '3px' }}>
                      Next {client.nextSession || 'unset'} · Check-in {client.nextCheckIn || 'unset'}
                    </div>
                  </div>
                  <StatusPill status={client.status} />
                </button>
                <button
                  type="button"
                  className="client-row-menu-button"
                  aria-label={`Actions for ${client.name}`}
                  onMouseDown={event => event.preventDefault()}
                  onClick={event => openClientMenu(event, client)}
                  onContextMenu={event => openClientMenu(event, client)}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    right: '10px',
                    width: '28px',
                    height: '28px',
                    transform: 'translateY(-50%)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                    padding: 0,
                    boxShadow: '0 8px 20px var(--overlay)',
                  }}
                >
                  <DotsThree size={18} weight="bold" />
                </button>
              </div>
            ))}
            {filteredClients.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '10px' }}>No matching clients.</div>
            )}
          </div>
        )}

        {clients.length === 0 && (
          <EmptyPanel
            title="No clients yet"
            body="Create a client profile first. Their intake, assessments, split, supplements, injuries, and notes all live there."
            actionLabel="Add client"
            onAction={onAddClient}
          />
        )}

        {selectedClient && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-white-03)',
              padding: '14px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '14px',
              alignItems: 'center',
            }}
          >
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '24px', lineHeight: 1.1 }}>
                  {selectedClient.name}
                </h2>
                <StatusPill status={selectedClient.status} />
                <SmallPill label={selectedClient.paymentStatus || 'payment untracked'} color="var(--cyan)" />
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>
                {selectedClient.age ? `${selectedClient.age} yrs` : 'Age not set'} ·{' '}
                {selectedClient.primaryLanguage || 'Language not set'} · {selectedClient.packageName || 'No package'}
              </div>
            </div>
            <div
              style={{
                flex: '1 1 340px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))',
                gap: '10px',
                minWidth: 0,
              }}
            >
              <MiniMetric label="Next session" value={selectedClient.nextSession || 'Unset'} />
              <MiniMetric label="Check-in" value={selectedClient.nextCheckIn || 'Unset'} />
              <MiniMetric label="Next InBody" value={scanWindow ? scanWindow.target : 'Unset'} />
            </div>
            <button
              type="button"
              className="client-profile-actions"
              aria-label={`Actions for ${selectedClient.name}`}
              onClick={event => openClientMenu(event, selectedClient)}
              onContextMenu={event => openClientMenu(event, selectedClient)}
              style={{
                width: '32px',
                height: '32px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <DotsThree size={20} weight="bold" />
            </button>
          </div>
        )}
      </section>

      {selectedClient && (
        <>
          <ClientSectionBar
            active={activeSection}
            onChange={setActiveSection}
            sessionCount={sessions.length}
            overloadCount={overloadRecords.length}
          />

          {activeSection === 'overview' && (
            <SectionPanel title="Overview & Admin" meta="identity, contact, package, schedule">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
                  gap: '12px',
                }}
              >
                <EditableField
                  label="Name"
                  value={selectedClient.name}
                  onChange={value => onUpdate(selectedClient.id, { name: value })}
                />
                <SelectField
                  label="Status"
                  value={selectedClient.status}
                  options={['active', 'onboarding', 'paused']}
                  onChange={value => onUpdate(selectedClient.id, { status: value as ClientStatus })}
                />
                <EditableField
                  label="Age"
                  value={selectedClient.age}
                  onChange={value => onUpdate(selectedClient.id, { age: value })}
                />
                <EditableField
                  label="Primary language"
                  value={selectedClient.primaryLanguage}
                  onChange={value => onUpdate(selectedClient.id, { primaryLanguage: value })}
                />
                <EditableField
                  label="Preferred contact"
                  value={selectedClient.preferredContact}
                  onChange={value => onUpdate(selectedClient.id, { preferredContact: value })}
                />
                <EditableField
                  label="Package"
                  value={selectedClient.packageName}
                  onChange={value => onUpdate(selectedClient.id, { packageName: value })}
                />
                <EditableField
                  label="Payment status"
                  value={selectedClient.paymentStatus}
                  onChange={value => onUpdate(selectedClient.id, { paymentStatus: value })}
                />
                <EditableField
                  label="Onboarding stage"
                  value={selectedClient.onboardingStage}
                  onChange={value => onUpdate(selectedClient.id, { onboardingStage: value })}
                />
                <EditableField
                  label="Goal"
                  value={selectedClient.goal}
                  onChange={value => onUpdate(selectedClient.id, { goal: value })}
                />
                <EditableField
                  label="Phone"
                  value={selectedClient.phone}
                  onChange={value => onUpdate(selectedClient.id, { phone: value })}
                />
                <EditableField
                  label="Email"
                  value={selectedClient.email}
                  onChange={value => onUpdate(selectedClient.id, { email: value })}
                />
                <EditableField
                  label="Emergency contact"
                  value={selectedClient.emergencyContact}
                  onChange={value => onUpdate(selectedClient.id, { emergencyContact: value })}
                />
                <EditableField
                  label="Occupation"
                  value={selectedClient.occupation}
                  onChange={value => onUpdate(selectedClient.id, { occupation: value })}
                />
                <EditableField
                  label="Session cadence"
                  value={selectedClient.sessionCadence}
                  onChange={value => onUpdate(selectedClient.id, { sessionCadence: value })}
                />
                <DateField
                  label="Start date"
                  value={selectedClient.startDate}
                  onChange={value => onUpdate(selectedClient.id, { startDate: value })}
                />
                <DateField
                  label="Next session"
                  value={selectedClient.nextSession}
                  onChange={value => onUpdate(selectedClient.id, { nextSession: value })}
                />
                <DateField
                  label="Latest InBody"
                  value={selectedClient.latestInbodyDate}
                  onChange={value => onUpdate(selectedClient.id, { latestInbodyDate: value })}
                />
                <DateField
                  label="Next check-in"
                  value={selectedClient.nextCheckIn}
                  onChange={value => onUpdate(selectedClient.id, { nextCheckIn: value })}
                />
              </div>
            </SectionPanel>
          )}

          {activeSection === 'sessions' && (
            <SectionPanel title="Session History" meta={`${sessions.length} logged`}>
              <SessionHistory
                sessions={sessions}
                onAdd={addSession}
                onUpdate={updateSession}
                onRemove={removeSession}
              />
            </SectionPanel>
          )}

          {activeSection === 'overload' && (
            <SectionPanel title="Progressive Overload" meta={`${overloadRecords.length} exercises`}>
              <ProgressiveOverloadBoard
                records={overloadRecords}
                onAdd={addOverloadRecord}
                onUpdate={updateOverloadRecord}
                onRemove={removeOverloadRecord}
              />
            </SectionPanel>
          )}

          {activeSection === 'metrics' && (
            <SectionPanel title="Body Metrics & Assessments" meta="InBody, vitals, adherence">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))',
                  gap: '12px',
                }}
              >
                <DataTile
                  label="Weight"
                  value={selectedClient.latestWeight || '--'}
                  suffix="lb"
                  icon={<TrendUp size={17} />}
                />
                <DataTile
                  label="Body fat"
                  value={selectedClient.bodyFat || '--'}
                  suffix="%"
                  icon={<Pulse size={17} />}
                />
                <DataTile
                  label="Fat mass"
                  value={latestInbodyScan?.bodyFatMass || '--'}
                  suffix="lb"
                  icon={<Pulse size={17} />}
                />
                <DataTile label="BMI" value={latestInbodyScan?.bmi || '--'} suffix="" icon={<TrendUp size={17} />} />
                <DataTile
                  label="Lean mass"
                  value={selectedClient.leanMass || '--'}
                  suffix="lb"
                  icon={<Barbell size={17} />}
                />
                <DataTile
                  label="SMM"
                  value={latestInbodyScan?.skeletalMuscleMass || '--'}
                  suffix="lb"
                  icon={<Barbell size={17} />}
                />
                <DataTile
                  label="Visceral fat"
                  value={latestInbodyScan?.visceralFatLevel || '--'}
                  suffix=""
                  icon={<Pulse size={17} />}
                />
                <DataTile
                  label="Resting HR"
                  value={selectedClient.restingHeartRate || '--'}
                  suffix="bpm"
                  icon={<Pulse size={17} />}
                />
                <DataTile
                  label="Sleep avg"
                  value={selectedClient.sleepAverage || '--'}
                  suffix="hrs"
                  icon={<ChatCircle size={17} />}
                />
                <DataTile
                  label="Steps avg"
                  value={selectedClient.stepsAverage || '--'}
                  suffix="steps"
                  icon={<TrendUp size={17} />}
                />
              </div>
              <InBodyScanPanel
                scans={inbodyScans}
                scanWindow={scanWindow}
                onAdd={addInBodyScan}
                onUpdate={updateInBodyScan}
                onRemove={removeInBodyScan}
              />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
                  gap: '12px',
                }}
              >
                <EditableField
                  label="Latest weight"
                  value={selectedClient.latestWeight}
                  onChange={value => onUpdate(selectedClient.id, { latestWeight: value })}
                />
                <EditableField
                  label="Body fat %"
                  value={selectedClient.bodyFat}
                  onChange={value => onUpdate(selectedClient.id, { bodyFat: value })}
                />
                <EditableField
                  label="Lean mass"
                  value={selectedClient.leanMass}
                  onChange={value => onUpdate(selectedClient.id, { leanMass: value })}
                />
                <EditableField
                  label="Resting HR"
                  value={selectedClient.restingHeartRate}
                  onChange={value => onUpdate(selectedClient.id, { restingHeartRate: value })}
                />
                <EditableField
                  label="Sleep average"
                  value={selectedClient.sleepAverage}
                  onChange={value => onUpdate(selectedClient.id, { sleepAverage: value })}
                />
                <EditableField
                  label="Steps average"
                  value={selectedClient.stepsAverage}
                  onChange={value => onUpdate(selectedClient.id, { stepsAverage: value })}
                />
                <EditableField
                  label="Program phase"
                  value={selectedClient.programPhase}
                  onChange={value => onUpdate(selectedClient.id, { programPhase: value })}
                />
                <EditableField
                  label="Adherence"
                  value={selectedClient.adherence}
                  onChange={value => onUpdate(selectedClient.id, { adherence: value })}
                />
              </div>
              <TextAreaCard
                label="Assessment Notes"
                value={selectedClient.assessmentNotes}
                onChange={value => onUpdate(selectedClient.id, { assessmentNotes: value })}
                minHeight={90}
                inset
              />
            </SectionPanel>
          )}

          {activeSection === 'program' && (
            <SectionPanel title="Program, Nutrition & Health" meta="split, supplements, injuries, habits">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
                  gap: '16px',
                }}
              >
                <TextAreaCard
                  label="Current Workout Split"
                  value={selectedClient.currentSplit}
                  onChange={value => onUpdate(selectedClient.id, { currentSplit: value })}
                />
                <TextAreaCard
                  label="Supplements"
                  value={selectedClient.supplements}
                  onChange={value => onUpdate(selectedClient.id, { supplements: value })}
                />
                <TextAreaCard
                  label="Injuries / Limitations"
                  value={selectedClient.injuries}
                  onChange={value => onUpdate(selectedClient.id, { injuries: value })}
                />
                <TextAreaCard
                  label="Nutrition Notes"
                  value={selectedClient.nutritionNotes}
                  onChange={value => onUpdate(selectedClient.id, { nutritionNotes: value })}
                />
                <TextAreaCard
                  label="Habit Coaching"
                  value={selectedClient.habitNotes}
                  onChange={value => onUpdate(selectedClient.id, { habitNotes: value })}
                />
              </div>
            </SectionPanel>
          )}

          {activeSection === 'notes' && (
            <SectionPanel title="Notes & Communication" meta="intake, coach notes, language, admin">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
                  gap: '16px',
                }}
              >
                <TextAreaCard
                  label="Communication Notes"
                  value={selectedClient.communicationNotes}
                  onChange={value => onUpdate(selectedClient.id, { communicationNotes: value })}
                />
                <TextAreaCard
                  label="Admin / Billing Notes"
                  value={selectedClient.adminNotes}
                  onChange={value => onUpdate(selectedClient.id, { adminNotes: value })}
                />
                <TextAreaCard
                  label="Intake Notes"
                  value={selectedClient.intakeNotes}
                  onChange={value => onUpdate(selectedClient.id, { intakeNotes: value })}
                />
                <TextAreaCard
                  label="Coach Notes"
                  value={selectedClient.coachNotes}
                  onChange={value => onUpdate(selectedClient.id, { coachNotes: value })}
                  minHeight={130}
                />
              </div>
            </SectionPanel>
          )}
        </>
      )}

      {clientMenu && <ContextMenu {...clientMenu} onClose={() => setClientMenu(null)} />}
      {clientPendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10001,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(0, 0, 0, 0.42)',
            padding: '24px',
          }}
        >
          <div style={{ ...cardStyle, width: 'min(420px, 100%)', background: 'var(--bg-panel)' }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '16px' }}>
              Delete {clientPendingDelete.name}?
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5, marginTop: '8px' }}>
              This removes the client profile from this device.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <Button variant="secondary" onClick={() => setClientPendingDelete(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onDelete(clientPendingDelete.id)
                  setClientPendingDelete(null)
                }}
                style={{ background: 'var(--red)', color: '#fff' }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CalendarView({
  events,
  calendarNames,
  selectedCalendarName,
  loading,
  fetching,
  errorMessage,
  onSelectCalendar,
  onRefresh,
}: {
  events: CalendarEvent[]
  calendarNames: string[]
  selectedCalendarName: string
  loading: boolean
  fetching: boolean
  errorMessage: string | null
  onSelectCalendar: (calendarName: string) => void
  onRefresh: () => void
}) {
  const currentDay = new Date()
  currentDay.setHours(0, 0, 0, 0)
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState<Date>(() => weekStart(currentDay))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hourHeight, setHourHeight] = useState(56)

  useEffect(() => {
    function resize() {
      if (!containerRef.current) return
      const top = containerRef.current.getBoundingClientRect().top
      const available = window.innerHeight - top - 16
      const gridAvailable = available - 52
      const computed = Math.max(Math.floor(gridAvailable / (GRID_END - GRID_START)), 28)
      setHourHeight(Math.min(computed, 56))
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [loading, calendarView])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - GRID_START) * hourHeight - 8
    }
  }, [calendarView, hourHeight])

  const todayKey = toDateKey(currentDay.toISOString())
  const eventsByDate: Record<string, CalendarEvent[]> = {}
  for (const event of events) {
    const key = toDateKey(event.start)
    if (!eventsByDate[key]) eventsByDate[key] = []
    eventsByDate[key].push(event)
  }

  function headerLabel(): string {
    if (calendarView === 'week') {
      const start = anchor
      const end = calendarAddDays(anchor, 6)
      if (start.getMonth() === end.getMonth()) {
        return `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
      }
      return `${MONTH_NAMES[start.getMonth()]} – ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`
    }
    return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`
  }

  function goToday() {
    if (calendarView === 'week') setAnchor(weekStart(currentDay))
    else setAnchor(new Date(currentDay.getFullYear(), currentDay.getMonth(), 1))
  }

  function goPrev() {
    if (calendarView === 'week') setAnchor(date => calendarAddDays(date, -7))
    else setAnchor(date => addMonths(date, -1))
  }

  function goNext() {
    if (calendarView === 'week') setAnchor(date => calendarAddDays(date, 7))
    else setAnchor(date => addMonths(date, 1))
  }

  function switchToWeek(dateKey?: string) {
    const base = dateKey ? parseLocalDate(dateKey) : anchor
    setAnchor(weekStart(base))
    setCalendarView('week')
    setSelectedDate(null)
  }

  const btnStyle: CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '5px 10px',
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    gap: '4px',
    transition: 'border-color 0.15s, color 0.15s',
  }

  const activeTabStyle: CSSProperties = {
    ...btnStyle,
    background: 'var(--purple-a15)',
    border: '1px solid var(--purple-a40)',
    color: 'var(--accent-bright)',
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 148px)', minHeight: '560px', gap: 0 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '16px',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={goPrev} aria-label="Previous" style={btnStyle}>
            <CaretLeft size={14} />
          </button>
          <button onClick={goNext} aria-label="Next" style={btnStyle}>
            <CaretRight size={14} />
          </button>
          <button onClick={goToday} style={{ ...btnStyle, marginLeft: '4px', padding: '5px 12px' }}>
            Today
          </button>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', minWidth: '180px' }}>
            {headerLabel()}
          </span>
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}
        >
          <select
            value={selectedCalendarName}
            onChange={event => onSelectCalendar(event.currentTarget.value)}
            disabled={calendarNames.length === 0}
            style={{ ...fieldStyle, width: '180px', padding: '6px 9px', fontSize: '12px' }}
            aria-label="Training calendar"
          >
            {calendarNames.length === 0 ? (
              <option value="">No training calendars</option>
            ) : (
              calendarNames.map(calendarName => (
                <option key={calendarName} value={calendarName}>
                  {calendarName}
                </option>
              ))
            )}
          </select>
          <button onClick={onRefresh} style={btnStyle}>
            <ArrowsClockwise size={13} style={{ animation: fetching ? 'spin 0.8s linear infinite' : 'none' }} />
            Refresh
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', margin: '0 4px' }}>
            {events.length} events
          </span>
          <button
            onClick={() => {
              setCalendarView('week')
              setAnchor(weekStart(anchor))
            }}
            style={calendarView === 'week' ? activeTabStyle : btnStyle}
          >
            Week
          </button>
          <button
            onClick={() => {
              setCalendarView('month')
              setSelectedDate(null)
            }}
            style={calendarView === 'month' ? activeTabStyle : btnStyle}
          >
            Month
          </button>
        </div>
      </div>

      <div style={{ flexShrink: 0 }}>
        {errorMessage && (
          <div
            style={{
              marginBottom: '14px',
              border: '1px solid var(--red-a40)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--red-a10)',
              color: 'var(--red)',
              padding: '10px',
              fontSize: '12px',
              lineHeight: 1.45,
            }}
          >
            {errorMessage}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)', fontSize: '13px' }}>
          Loading iCloud calendar...
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{ flex: 1, minHeight: 0, overflow: calendarView === 'week' ? 'hidden' : 'auto' }}
        >
          {calendarView === 'week' ? (
            <WeekView
              anchor={anchor}
              events={events}
              todayKey={todayKey}
              hourHeight={hourHeight}
              scrollRef={scrollRef}
              onEventSelect={setSelectedEvent}
            />
          ) : (
            <MonthView
              anchor={anchor}
              events={events}
              eventsByDate={eventsByDate}
              todayKey={todayKey}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onSwitchToWeek={switchToWeek}
              onEventSelect={setSelectedEvent}
            />
          )}
        </div>
      )}
      <EventDetails event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  parsed.setDate(parsed.getDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function inBodyScanWindow(date: string): { earliest: string; target: string } {
  return {
    earliest: addDays(date, 28),
    target: addDays(date, 56),
  }
}

function latestInBodyPatch(scans: InBodyScan[], client: TrainingClient): Partial<TrainingClient> {
  const latest = [...scans].sort((a, b) => b.date.localeCompare(a.date))[0]
  return {
    latestInbodyDate: latest?.date || '',
    latestWeight: latest?.weight || '',
    bodyFat: latest?.bodyFat || '',
    leanMass: latest?.leanMass || '',
    restingHeartRate: client.restingHeartRate,
    sleepAverage: client.sleepAverage,
    stepsAverage: client.stepsAverage,
    programPhase: client.programPhase,
    adherence: client.adherence,
  }
}

function parseInBodySheetText(text: string): Partial<InBodyScan> {
  const sourceText = text.trim()
  const date = parseSheetDate(sourceText)
  return {
    ...(date ? { date } : {}),
    totalBodyWater: findMetric(sourceText, ['Total Body Water', 'TBW']) || '',
    dryLeanMass: findMetric(sourceText, ['Dry Lean Mass']) || '',
    weight: findMetric(sourceText, ['Weight', 'Total Body Weight']) || '',
    bodyFatMass: findMetric(sourceText, ['Body Fat Mass']) || '',
    bodyFat: findMetric(sourceText, ['Percent Body Fat', 'PBF', 'Body Fat %']) || '',
    bmi: findMetric(sourceText, ['Body Mass Index', 'BMI']) || '',
    leanMass: findMetric(sourceText, ['Lean Body Mass', 'Fat Free Mass']) || '',
    skeletalMuscleMass: findMetric(sourceText, ['Skeletal Muscle Mass', 'SMM']) || '',
    basalMetabolicRate: findMetric(sourceText, ['Basal Metabolic Rate', 'BMR']) || '',
    visceralFatLevel: findMetric(sourceText, ['Visceral Fat Level', 'VFL']) || '',
    bodyFatControl: findControlMetric(sourceText, 'Body Fat Mass') || '',
    leanBodyMassControl: findControlMetric(sourceText, 'Lean Body Mass') || '',
    leftArmLean: findSegmentMetric(sourceText, 'Left Arm', 'lb') || '',
    leftArmPercent: findSegmentMetric(sourceText, 'Left Arm', '%') || '',
    rightArmLean: findSegmentMetric(sourceText, 'Right Arm', 'lb') || '',
    rightArmPercent: findSegmentMetric(sourceText, 'Right Arm', '%') || '',
    trunkLean: findSegmentMetric(sourceText, 'Trunk', 'lb') || '',
    trunkPercent: findSegmentMetric(sourceText, 'Trunk', '%') || '',
    leftLegLean: findSegmentMetric(sourceText, 'Left Leg', 'lb') || '',
    leftLegPercent: findSegmentMetric(sourceText, 'Left Leg', '%') || '',
    rightLegLean: findSegmentMetric(sourceText, 'Right Leg', 'lb') || '',
    rightLegPercent: findSegmentMetric(sourceText, 'Right Leg', '%') || '',
    notes: sourceText ? 'Autofilled from InBody sheet text. Review values before coaching decisions.' : '',
    sourceText,
  }
}

function parseSheetDate(text: string): string {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const us = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/)
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
  return ''
}

function findMetric(text: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = text.match(new RegExp(`${escaped}[^0-9-]{0,40}(-?\\d+(?:\\.\\d+)?)`, 'i'))
    if (match?.[1]) return match[1]
  }
  return ''
}

function findControlMetric(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(new RegExp(`${escaped}\\s*([-+])\\s*(\\d+(?:\\.\\d+)?)`, 'i'))
  if (!match) return ''
  return `${match[1]}${match[2]}`
}

function findSegmentMetric(text: string, segment: string, unit: 'lb' | '%'): string {
  const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(
    new RegExp(`${escaped}[\\s\\S]{0,80}?(\\d+(?:\\.\\d+)?)\\s*lb[\\s\\S]{0,40}?(\\d+(?:\\.\\d+)?)\\s*%`, 'i'),
  )
  if (!match) return ''
  return unit === 'lb' ? match[1] : match[2]
}

function InBodyScanPanel({
  scans,
  scanWindow,
  onAdd,
  onUpdate,
  onRemove,
}: {
  scans: InBodyScan[]
  scanWindow: { earliest: string; target: string } | null
  onAdd: (patch?: Partial<InBodyScan>) => void
  onUpdate: (id: string, patch: Partial<InBodyScan>) => void
  onRemove: (id: string) => void
}) {
  const [sheetText, setSheetText] = useState('')
  const [importMessage, setImportMessage] = useState('')

  function addFromText(text: string) {
    const parsed = parseInBodySheetText(text)
    onAdd(parsed)
    setSheetText('')
    setImportMessage('Scan added. Review autofilled numbers.')
  }

  async function importTextFile(file?: File) {
    if (!file) return
    if (!file.type.startsWith('text/') && !file.name.match(/\.(csv|txt)$/i)) {
      setImportMessage('Use OCR/text export for now; image OCR is not built in yet.')
      return
    }
    addFromText(await file.text())
  }

  return (
    <section
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '12px',
        background: 'var(--bg-white-02)',
        display: 'grid',
        gap: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 850 }}>InBody scans</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '3px' }}>
            {scanWindow
              ? `Next window ${scanWindow.earliest} to ${scanWindow.target}`
              : 'Add first scan, then repeat every 4-8 weeks'}
          </div>
        </div>
        <Button
          onClick={() => onAdd()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 12px' }}
        >
          <Plus size={15} />
          Add scan
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '10px', alignItems: 'end' }}>
        <TextAreaCard label="Sheet text / OCR paste" value={sheetText} onChange={setSheetText} minHeight={82} inset />
        <div style={{ display: 'grid', gap: '8px' }}>
          <Button
            variant="secondary"
            onClick={() => sheetText.trim() && addFromText(sheetText)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '8px 12px',
            }}
          >
            <ClipboardText size={15} />
            Autofill
          </Button>
          <label
            style={{
              ...fieldStyle,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <UploadSimple size={15} />
            Import text
            <input
              type="file"
              accept=".txt,.csv,text/*"
              onChange={event => importTextFile(event.currentTarget.files?.[0])}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>
      {importMessage && <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{importMessage}</div>}

      {scans.length === 0 ? (
        <div
          style={{
            border: '1px dashed var(--border-hover)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            color: 'var(--text-secondary)',
            fontSize: '13px',
          }}
        >
          No InBody scans logged yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {scans.map(scan => (
            <div
              key={scan.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px',
                display: 'grid',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{scan.date || 'Undated scan'}</div>
                <button type="button" onClick={() => onRemove(scan.id)} style={textButtonStyle}>
                  Remove
                </button>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
                  gap: '10px',
                }}
              >
                <DateField label="Scan date" value={scan.date} onChange={value => onUpdate(scan.id, { date: value })} />
                <EditableField
                  label="Total body water"
                  value={scan.totalBodyWater}
                  onChange={value => onUpdate(scan.id, { totalBodyWater: value })}
                />
                <EditableField
                  label="Dry lean mass"
                  value={scan.dryLeanMass}
                  onChange={value => onUpdate(scan.id, { dryLeanMass: value })}
                />
                <EditableField
                  label="Weight"
                  value={scan.weight}
                  onChange={value => onUpdate(scan.id, { weight: value })}
                />
                <EditableField
                  label="Body fat mass"
                  value={scan.bodyFatMass}
                  onChange={value => onUpdate(scan.id, { bodyFatMass: value })}
                />
                <EditableField
                  label="PBF %"
                  value={scan.bodyFat}
                  onChange={value => onUpdate(scan.id, { bodyFat: value })}
                />
                <EditableField label="BMI" value={scan.bmi} onChange={value => onUpdate(scan.id, { bmi: value })} />
                <EditableField
                  label="Lean mass"
                  value={scan.leanMass}
                  onChange={value => onUpdate(scan.id, { leanMass: value })}
                />
                <EditableField
                  label="SMM"
                  value={scan.skeletalMuscleMass}
                  onChange={value => onUpdate(scan.id, { skeletalMuscleMass: value })}
                />
                <EditableField
                  label="BMR"
                  value={scan.basalMetabolicRate}
                  onChange={value => onUpdate(scan.id, { basalMetabolicRate: value })}
                />
                <EditableField
                  label="Visceral fat"
                  value={scan.visceralFatLevel}
                  onChange={value => onUpdate(scan.id, { visceralFatLevel: value })}
                />
                <EditableField
                  label="Fat control"
                  value={scan.bodyFatControl}
                  onChange={value => onUpdate(scan.id, { bodyFatControl: value })}
                />
                <EditableField
                  label="Lean control"
                  value={scan.leanBodyMassControl}
                  onChange={value => onUpdate(scan.id, { leanBodyMassControl: value })}
                />
                <EditableField
                  label="Left arm lb"
                  value={scan.leftArmLean}
                  onChange={value => onUpdate(scan.id, { leftArmLean: value })}
                />
                <EditableField
                  label="Left arm %"
                  value={scan.leftArmPercent}
                  onChange={value => onUpdate(scan.id, { leftArmPercent: value })}
                />
                <EditableField
                  label="Right arm lb"
                  value={scan.rightArmLean}
                  onChange={value => onUpdate(scan.id, { rightArmLean: value })}
                />
                <EditableField
                  label="Right arm %"
                  value={scan.rightArmPercent}
                  onChange={value => onUpdate(scan.id, { rightArmPercent: value })}
                />
                <EditableField
                  label="Trunk lb"
                  value={scan.trunkLean}
                  onChange={value => onUpdate(scan.id, { trunkLean: value })}
                />
                <EditableField
                  label="Trunk %"
                  value={scan.trunkPercent}
                  onChange={value => onUpdate(scan.id, { trunkPercent: value })}
                />
                <EditableField
                  label="Left leg lb"
                  value={scan.leftLegLean}
                  onChange={value => onUpdate(scan.id, { leftLegLean: value })}
                />
                <EditableField
                  label="Left leg %"
                  value={scan.leftLegPercent}
                  onChange={value => onUpdate(scan.id, { leftLegPercent: value })}
                />
                <EditableField
                  label="Right leg lb"
                  value={scan.rightLegLean}
                  onChange={value => onUpdate(scan.id, { rightLegLean: value })}
                />
                <EditableField
                  label="Right leg %"
                  value={scan.rightLegPercent}
                  onChange={value => onUpdate(scan.id, { rightLegPercent: value })}
                />
              </div>
              <TextAreaCard
                label="Scan notes"
                value={scan.notes}
                onChange={value => onUpdate(scan.id, { notes: value })}
                minHeight={70}
                inset
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function SessionHistory({
  sessions,
  onAdd,
  onUpdate,
  onRemove,
}: {
  sessions: TrainingSession[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<TrainingSession>) => void
  onRemove: (id: string) => void
}) {
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <Button
          onClick={onAdd}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 12px' }}
        >
          <Plus size={15} />
          Log session
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div
          style={{
            border: '1px dashed var(--border-hover)',
            borderRadius: 'var(--radius-md)',
            padding: '18px',
            color: 'var(--text-secondary)',
            fontSize: '13px',
          }}
        >
          No sessions logged yet. Add each training session here with attendance, focus, readiness, performance, notes,
          and next action.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {sessions.map(session => (
            <div
              key={session.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                background: 'var(--bg-white-02)',
                display: 'grid',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{session.date || 'Undated session'}</div>
                <button type="button" onClick={() => onRemove(session.id)} style={textButtonStyle}>
                  Remove
                </button>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))',
                  gap: '10px',
                }}
              >
                <DateField
                  label="Date"
                  value={session.date}
                  onChange={value => onUpdate(session.id, { date: value })}
                />
                <EditableField
                  label="Session type"
                  value={session.sessionType}
                  onChange={value => onUpdate(session.id, { sessionType: value })}
                />
                <EditableField
                  label="Duration"
                  value={session.duration}
                  onChange={value => onUpdate(session.id, { duration: value })}
                />
                <EditableField
                  label="Attendance"
                  value={session.attendance}
                  onChange={value => onUpdate(session.id, { attendance: value })}
                />
                <EditableField
                  label="Focus"
                  value={session.focus}
                  onChange={value => onUpdate(session.id, { focus: value })}
                />
                <EditableField
                  label="Readiness"
                  value={session.readiness}
                  onChange={value => onUpdate(session.id, { readiness: value })}
                />
                <EditableField
                  label="Performance"
                  value={session.performance}
                  onChange={value => onUpdate(session.id, { performance: value })}
                />
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                  gap: '12px',
                }}
              >
                <TextAreaCard
                  label="Session notes"
                  value={session.notes}
                  onChange={value => onUpdate(session.id, { notes: value })}
                  minHeight={86}
                  inset
                />
                <TextAreaCard
                  label="Next action"
                  value={session.nextAction}
                  onChange={value => onUpdate(session.id, { nextAction: value })}
                  minHeight={86}
                  inset
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProgressiveOverloadBoard({
  records,
  onAdd,
  onUpdate,
  onRemove,
}: {
  records: ProgressiveOverloadRecord[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<ProgressiveOverloadRecord>) => void
  onRemove: (id: string) => void
}) {
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <Button
          onClick={onAdd}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 12px' }}
        >
          <Plus size={15} />
          Track exercise
        </Button>
      </div>

      {records.length === 0 ? (
        <div
          style={{
            border: '1px dashed var(--border-hover)',
            borderRadius: 'var(--radius-md)',
            padding: '18px',
            color: 'var(--text-secondary)',
            fontSize: '13px',
          }}
        >
          No overload records yet. Track the main lifts and accessories here with current work, next targets, and
          progression rules.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {records.map(record => (
            <div
              key={record.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                background: 'var(--bg-white-02)',
                display: 'grid',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{record.exercise || 'New exercise'}</div>
                <button type="button" onClick={() => onRemove(record.id)} style={textButtonStyle}>
                  Remove
                </button>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
                  gap: '10px',
                }}
              >
                <EditableField
                  label="Exercise"
                  value={record.exercise}
                  onChange={value => onUpdate(record.id, { exercise: value })}
                />
                <EditableField
                  label="Pattern"
                  value={record.movementPattern}
                  onChange={value => onUpdate(record.id, { movementPattern: value })}
                />
                <DateField
                  label="Last trained"
                  value={record.lastSessionDate}
                  onChange={value => onUpdate(record.id, { lastSessionDate: value })}
                />
                <EditableField
                  label="Current load"
                  value={record.currentLoad}
                  onChange={value => onUpdate(record.id, { currentLoad: value })}
                />
                <EditableField
                  label="Current sets"
                  value={record.currentSets}
                  onChange={value => onUpdate(record.id, { currentSets: value })}
                />
                <EditableField
                  label="Current reps"
                  value={record.currentReps}
                  onChange={value => onUpdate(record.id, { currentReps: value })}
                />
                <EditableField
                  label="Target load"
                  value={record.targetLoad}
                  onChange={value => onUpdate(record.id, { targetLoad: value })}
                />
                <EditableField
                  label="Target sets"
                  value={record.targetSets}
                  onChange={value => onUpdate(record.id, { targetSets: value })}
                />
                <EditableField
                  label="Target reps"
                  value={record.targetReps}
                  onChange={value => onUpdate(record.id, { targetReps: value })}
                />
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                  gap: '12px',
                }}
              >
                <TextAreaCard
                  label="Progression rule"
                  value={record.progressionRule}
                  onChange={value => onUpdate(record.id, { progressionRule: value })}
                  minHeight={86}
                  inset
                />
                <TextAreaCard
                  label="Technique / pain / setup notes"
                  value={record.notes}
                  onChange={value => onUpdate(record.id, { notes: value })}
                  minHeight={86}
                  inset
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FormsView({
  forms,
  clients,
  onUpdate,
  onAddForm,
  onApplyAnswers,
}: {
  forms: TrainingFormTemplate[]
  clients: TrainingClient[]
  onUpdate: (id: string, patch: Partial<TrainingFormTemplate>) => void
  onAddForm: () => void
  onApplyAnswers: (answers: Record<string, string>, clientId?: string, fallbackClientName?: string) => void
}) {
  const [links, setLinks] = useState<IntakeLink[]>([])
  const [submissions, setSubmissions] = useState<IntakeSubmission[]>([])
  const [linkClientIds, setLinkClientIds] = useState<Record<string, string>>({})
  const [linkLanguages, setLinkLanguages] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formSearch, setFormSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FormStatus | 'all'>('active')
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
  const formCounts = useMemo(
    () => ({
      active: forms.filter(form => form.status === 'active').length,
      draft: forms.filter(form => form.status === 'draft').length,
      all: forms.length,
    }),
    [forms],
  )
  const visibleForms = useMemo(() => {
    const query = formSearch.toLowerCase().trim()
    return forms.filter(form => {
      const statusMatches = statusFilter === 'all' || form.status === statusFilter
      if (!statusMatches) return false
      if (!query) return true
      return [form.title, form.purpose, form.status, ...form.fields].some(value => value.toLowerCase().includes(query))
    })
  }, [formSearch, forms, statusFilter])
  const selectedForm =
    forms.find(form => form.id === selectedFormId && visibleForms.some(visible => visible.id === form.id)) ||
    visibleForms[0] ||
    null

  useEffect(() => {
    if (selectedForm?.id && selectedForm.id !== selectedFormId) {
      setSelectedFormId(selectedForm.id)
    } else if (!selectedForm && selectedFormId) {
      setSelectedFormId(null)
    }
  }, [selectedForm, selectedFormId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [linkResponse, submissionResponse] = await Promise.all([
          api.get<{ data: { links: IntakeLink[] } }>('/api/training/intake-links'),
          api.get<{ data: { submissions: IntakeSubmission[] } }>('/api/training/intake-submissions'),
        ])
        if (!cancelled) {
          setLinks(linkResponse.data.links)
          setSubmissions(submissionResponse.data.submissions)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load intake links')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function createShareLink(form: TrainingFormTemplate) {
    setError('')
    try {
      const selectedClient = clients.find(client => client.id === linkClientIds[form.id])
      const language = linkLanguages[form.id] || selectedClient?.primaryLanguage || 'en'
      const response = await api.post<{ data: { link: IntakeLink } }>('/api/training/intake-links', {
        title: form.title,
        fields: selectedClient ? form.fields.filter(field => field !== 'Client name') : form.fields,
        client_id: selectedClient?.id || '',
        client_name: selectedClient?.name || '',
        language,
        expires_in_days: 14,
      })
      setLinks(current => [response.data.link, ...current])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create intake link')
    }
  }

  async function applySubmission(submission: IntakeSubmission) {
    onApplyAnswers(submission.answers, submission.clientId, submission.clientName)
    setSubmissions(current =>
      current.map(item => (item.id === submission.id ? { ...item, appliedAt: new Date().toISOString() } : item)),
    )
    try {
      await api.post(`/api/training/intake-submissions/${submission.id}/applied`)
    } catch {
      // Local apply already happened; backend marker can be retried by refreshing.
    }
  }

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <section className="client-profile-card" style={{ ...cardStyle, display: 'grid', gap: '12px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'center',
          }}
        >
          <label
            style={{
              flex: '1 1 340px',
              border: '1px solid var(--border-hover)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)',
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr) auto',
              alignItems: 'center',
              gap: '10px',
              minWidth: 0,
              padding: '0 12px',
            }}
          >
            <MagnifyingGlass size={18} color="var(--text-muted)" />
            <input
              value={formSearch}
              onChange={event => setFormSearch(event.currentTarget.value)}
              placeholder="Find forms by title, purpose, or field..."
              aria-label="Search forms"
              style={{
                ...fieldStyle,
                border: 0,
                background: 'transparent',
                padding: '13px 0',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
              {visibleForms.length}/{forms.length}
            </span>
          </label>

          <div
            aria-label="Form status filter"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '4px',
              display: 'flex',
              gap: '4px',
              background: 'var(--bg-white-02)',
            }}
          >
            {(['active', 'draft', 'all'] as const).map(status => {
              const selected = statusFilter === status
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  style={{
                    border: '1px solid transparent',
                    borderRadius: 'var(--radius-sm)',
                    background: selected ? 'var(--active-bg)' : 'transparent',
                    color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    font: 'inherit',
                    fontSize: '12px',
                    fontWeight: 800,
                    padding: '7px 10px',
                    whiteSpace: 'nowrap',
                    textTransform: 'capitalize',
                  }}
                >
                  {status} {formCounts[status]}
                </button>
              )
            })}
          </div>

          <Button onClick={onAddForm} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} />
            Form
          </Button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
            gap: '12px',
          }}
        >
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-white-02)',
              padding: '10px',
              display: 'grid',
              gap: '8px',
              alignContent: 'start',
              minHeight: '260px',
            }}
          >
            {visibleForms.length === 0 ? (
              <div
                style={{
                  border: '1px dashed var(--border-hover)',
                  borderRadius: 'var(--radius-md)',
                  padding: '18px',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                }}
              >
                No forms match this view.
              </div>
            ) : (
              visibleForms.map(form => {
                const selected = selectedForm?.id === form.id
                return (
                  <button
                    key={form.id}
                    type="button"
                    onClick={() => setSelectedFormId(form.id)}
                    aria-expanded={selected}
                    style={{
                      ...rowStyle,
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: selected ? 'var(--active-bg)' : 'var(--bg-white-02)',
                      borderColor: selected ? 'var(--border-hover)' : 'var(--border)',
                      font: 'inherit',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: 'var(--text-primary)',
                          fontWeight: 850,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {form.title}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '3px' }}>
                        {form.fields.length} fields · Updated {form.updatedAt}
                      </div>
                    </div>
                    <SmallPill
                      label={form.status}
                      color={form.status === 'active' ? 'var(--green)' : 'var(--text-muted)'}
                    />
                  </button>
                )
              })
            )}
          </div>

          <section style={{ ...cardStyle, display: 'grid', gap: '14px', alignContent: 'start' }}>
            {selectedForm ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: 850 }}>
                      {selectedForm.title}
                    </div>
                    <div
                      style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '5px', lineHeight: 1.45 }}
                    >
                      {selectedForm.purpose || 'No purpose set'}
                    </div>
                  </div>
                  <SmallPill
                    label={selectedForm.status}
                    color={selectedForm.status === 'active' ? 'var(--green)' : 'var(--text-muted)'}
                  />
                </div>

                {selectedForm.id === 'member-follow-up' && (
                  <div
                    style={{
                      border: '1px solid var(--cyan)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '9px 10px',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                      background: 'var(--bg-white-03)',
                    }}
                  >
                    Use for known club clients. Skips repeated profile questions.
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
                    gap: '10px',
                  }}
                >
                  <label style={{ display: 'grid', gap: '6px', minWidth: 0 }}>
                    <span style={labelStyle}>Send to</span>
                    <select
                      value={linkClientIds[selectedForm.id] || ''}
                      onChange={event =>
                        setLinkClientIds(current => ({ ...current, [selectedForm.id]: event.currentTarget.value }))
                      }
                      style={fieldStyle}
                    >
                      <option value="">Unassigned public link</option>
                      {clients.map(client => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SelectField
                    label="Language"
                    value={
                      linkLanguages[selectedForm.id] ||
                      clients.find(client => client.id === linkClientIds[selectedForm.id])?.primaryLanguage ||
                      'en'
                    }
                    options={['en', 'es']}
                    onChange={value => setLinkLanguages(current => ({ ...current, [selectedForm.id]: value }))}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    {selectedForm.fields.length} fields · Updated {selectedForm.updatedAt}
                  </div>
                  <Button onClick={() => createShareLink(selectedForm)} style={{ padding: '7px 10px' }}>
                    Create share link
                  </Button>
                </div>

                <details style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <summary
                    style={{ color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: 800 }}
                  >
                    Edit template
                  </summary>
                  <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(min(100%, 220px), 1fr) minmax(min(100%, 140px), 0.45fr)',
                        gap: '10px',
                      }}
                    >
                      <EditableField
                        label="Form title"
                        value={selectedForm.title}
                        onChange={value => onUpdate(selectedForm.id, { title: value })}
                      />
                      <SelectField
                        label="Status"
                        value={selectedForm.status}
                        options={['active', 'draft']}
                        onChange={value => onUpdate(selectedForm.id, { status: value as FormStatus })}
                      />
                    </div>
                    <TextAreaCard
                      label="Purpose"
                      value={selectedForm.purpose}
                      onChange={value => onUpdate(selectedForm.id, { purpose: value })}
                      minHeight={72}
                      inset
                    />
                    <TextAreaCard
                      label="Fields"
                      value={selectedForm.fields.join('\n')}
                      onChange={value =>
                        onUpdate(selectedForm.id, {
                          fields: value
                            .split('\n')
                            .map(field => field.trim())
                            .filter(Boolean),
                        })
                      }
                      minHeight={132}
                      inset
                    />
                  </div>
                </details>
              </>
            ) : (
              <EmptyPanel
                title="No form selected"
                body="Switch filters or add a form to create intake links."
                actionLabel="Add form"
                onAction={onAddForm}
              />
            )}
          </section>
        </div>
      </section>

      <section style={cardStyle}>
        <SectionHeader title="Public Intake Links" meta={loading ? 'loading' : `${links.length} active links`} />
        {error && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '9px 10px',
              color: 'var(--text-secondary)',
              background: 'var(--bg-white-03)',
              fontSize: '12px',
              marginBottom: '10px',
            }}
          >
            Intake link sync unavailable: {error}
          </div>
        )}
        <div style={{ display: 'grid', gap: '10px' }}>
          {links.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              Create a share link from a form template below. Send that URL to a client; their submission appears here
              for review.
            </div>
          ) : (
            links.map(link => {
              const url = publicFormUrl(link.token)
              return (
                <div key={link.id} style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{link.title}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '3px' }}>
                      {link.clientId ? `Linked to ${link.clientName || 'client record'}` : 'Unassigned public link'} ·{' '}
                      {link.language === 'es' ? 'Spanish' : 'English'} ·{' '}
                      {link.expired
                        ? 'Expired'
                        : link.expiresAt
                          ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}`
                          : 'No expiry'}
                    </div>
                    <div
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: '12px',
                        marginTop: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {url}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => navigator.clipboard.writeText(url)}
                    style={{ padding: '7px 10px' }}
                  >
                    Copy
                  </Button>
                </div>
              )
            })
          )}
        </div>
      </section>

      <section style={cardStyle}>
        <SectionHeader title="Submissions" meta={`${submissions.filter(item => !item.appliedAt).length} unapplied`} />
        <div style={{ display: 'grid', gap: '10px' }}>
          {submissions.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No client submissions yet.</div>
          ) : (
            submissions.map(submission => (
              <div
                key={submission.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px',
                  background: 'var(--bg-white-02)',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 850 }}>
                      {submission.clientName || 'Unnamed client'}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '3px' }}>
                      {submission.title} · {submission.clientId ? 'Linked client' : 'Unassigned'} ·{' '}
                      {new Date(submission.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    variant={submission.appliedAt ? 'secondary' : 'primary'}
                    onClick={() => applySubmission(submission)}
                    disabled={Boolean(submission.appliedAt)}
                    style={{ padding: '7px 10px' }}
                  >
                    {submission.appliedAt ? 'Applied' : 'Apply to client'}
                  </Button>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                    gap: '8px',
                  }}
                >
                  {Object.entries(submission.answers).map(([key, value]) => (
                    <div
                      key={key}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px',
                        minWidth: 0,
                      }}
                    >
                      <div style={labelStyle}>{key}</div>
                      <div
                        style={{
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          marginTop: '4px',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {String(value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '11px 12px',
  background: 'var(--bg-white-02)',
  color: 'inherit',
}

const textButtonStyle: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '12px',
  padding: '5px 8px',
}

function MetricCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone: string
}) {
  return (
    <section
      style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}
    >
      <div>
        <div style={labelStyle}>{label}</div>
        <div style={{ color: 'var(--text-primary)', fontSize: '28px', fontWeight: 800, marginTop: '6px' }}>{value}</div>
      </div>
      <div
        style={{
          color: tone,
          background: 'var(--bg-white-04)',
          borderRadius: 'var(--radius-md)',
          padding: '10px',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {icon}
      </div>
    </section>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '10px',
        background: 'var(--bg-white-03)',
        minWidth: 0,
      }}
    >
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          color: 'var(--text-primary)',
          fontWeight: 800,
          marginTop: '6px',
          fontSize: '13px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function DataTile({
  label,
  value,
  suffix,
  icon,
}: {
  label: string
  value: string
  suffix: string
  icon: React.ReactNode
}) {
  return (
    <section
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-white-02)',
        padding: '13px',
        display: 'grid',
        gap: '8px',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}
      >
        <span style={labelStyle}>{label}</span>
        {icon}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', minWidth: 0 }}>
        <span
          style={{
            color: 'var(--text-primary)',
            fontWeight: 850,
            fontSize: '24px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {value}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{suffix}</span>
      </div>
    </section>
  )
}

const clientSectionDefs: Array<{ key: ClientSection; label: string; meta: string }> = [
  { key: 'overview', label: 'Overview', meta: 'contact + admin' },
  { key: 'sessions', label: 'Sessions', meta: 'workout log' },
  { key: 'overload', label: 'Overload', meta: 'lifts + targets' },
  { key: 'metrics', label: 'Metrics', meta: 'InBody + vitals' },
  { key: 'program', label: 'Program', meta: 'split + health' },
  { key: 'notes', label: 'Notes', meta: 'coach + comms' },
]

function ClientSectionBar({
  active,
  onChange,
  sessionCount,
  overloadCount,
}: {
  active: ClientSection
  onChange: (section: ClientSection) => void
  sessionCount: number
  overloadCount: number
}) {
  return (
    <div
      style={{
        ...cardStyle,
        padding: '8px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '6px',
        position: 'sticky',
        top: '10px',
        zIndex: 2,
      }}
    >
      {clientSectionDefs.map(section => {
        const selected = section.key === active
        const count = section.key === 'sessions' ? sessionCount : section.key === 'overload' ? overloadCount : null
        return (
          <button
            key={section.key}
            type="button"
            onClick={() => onChange(section.key)}
            style={{
              border: `1px solid ${selected ? 'var(--border-hover)' : 'transparent'}`,
              borderRadius: 'var(--radius-sm)',
              background: selected ? 'var(--active-bg)' : 'transparent',
              color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              font: 'inherit',
              padding: '10px',
              textAlign: 'left',
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 850,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {section.label}
              </span>
              {count !== null && (
                <SmallPill label={String(count)} color={selected ? 'var(--accent)' : 'var(--text-muted)'} />
              )}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '3px' }}>{section.meta}</div>
          </button>
        )
      })}
    </div>
  )
}

function SectionPanel({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  return (
    <section style={{ ...cardStyle, display: 'grid', gap: '14px' }}>
      <SectionHeader title={title} meta={meta} />
      {children}
    </section>
  )
}

function SectionHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '12px',
      }}
    >
      <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px' }}>{title}</h2>
      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{meta}</span>
    </div>
  )
}

function EmptyPanel({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string
  body: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div
      style={{
        border: '1px dashed var(--border-hover)',
        borderRadius: 'var(--radius-md)',
        padding: '24px',
        display: 'grid',
        gap: '10px',
      }}
    >
      <div style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{title}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5, maxWidth: '560px' }}>{body}</div>
      <Button onClick={onAction} style={{ width: 'fit-content' }}>
        {actionLabel}
      </Button>
    </div>
  )
}

function EditableField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label style={{ display: 'grid', gap: '6px', minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <input value={value} onChange={event => onChange(event.currentTarget.value)} style={fieldStyle} />
    </label>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ display: 'grid', gap: '6px', minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <input type="date" value={value} onChange={event => onChange(event.currentTarget.value)} style={fieldStyle} />
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label style={{ display: 'grid', gap: '6px', minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <select value={value} onChange={event => onChange(event.currentTarget.value)} style={fieldStyle}>
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function TextAreaCard({
  label,
  value,
  onChange,
  minHeight = 110,
  inset = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  minHeight?: number
  inset?: boolean
}) {
  return (
    <label style={{ ...(inset ? {} : cardStyle), display: 'grid', gap: '8px', minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <textarea
        value={value}
        onChange={event => onChange(event.currentTarget.value)}
        style={{ ...fieldStyle, minHeight, resize: 'vertical', lineHeight: 1.45 }}
      />
    </label>
  )
}

function StatusPill({ status }: { status: ClientStatus }) {
  const color = status === 'active' ? 'var(--green)' : status === 'paused' ? 'var(--amber)' : 'var(--accent)'
  return <SmallPill label={status} color={color} />
}

function SmallPill({ label, color = 'var(--text-secondary)' }: { label: string; color?: string }) {
  return (
    <span
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-full)',
        padding: '4px 8px',
        color,
        fontSize: '11px',
        fontWeight: 800,
        whiteSpace: 'nowrap',
        textTransform: 'capitalize',
      }}
    >
      {label}
    </span>
  )
}
