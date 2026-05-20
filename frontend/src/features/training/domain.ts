export type TrainingView = 'dashboard' | 'clients' | 'calendar' | 'forms'
export type ClientStatus = 'active' | 'onboarding' | 'paused'
export type FormStatus = 'active' | 'draft'
export type ClientSection = 'overview' | 'sessions' | 'overload' | 'metrics' | 'program' | 'notes'

export interface TrainingSession {
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

export interface ProgressiveOverloadRecord {
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

export interface InBodyScan {
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

export interface TrainingClient {
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

export interface TrainingFormTemplate {
  id: string
  title: string
  status: FormStatus
  purpose: string
  fields: string[]
  updatedAt: string
}

export interface IntakeLink {
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

export interface IntakeSubmission {
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

export const PUBLIC_FORM_PATH = '/form'

function publicFormBaseUrl(): string {
  const configuredSiteUrl = import.meta.env.VITE_SITE_URL?.trim()
  return (configuredSiteUrl || window.location.origin).replace(/\/+$/, '')
}

export function publicFormUrl(token: string): string {
  return `${publicFormBaseUrl()}${PUBLIC_FORM_PATH}/${token}`
}

export const CLIENTS_STORAGE_KEY = 'training-clients'
export const FORMS_STORAGE_KEY = 'training-forms'
export const TRAINING_CALENDAR_STORAGE_KEY = 'training-calendar-name'

export const NEW_CLIENT_INTAKE_FIELDS = [
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

export const ASSESSMENT_UPDATE_FIELDS = [
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

export const WEEKLY_CHECK_IN_FIELDS = [
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

export const FOLLOW_UP_FIELDS = [
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

export const DEFAULT_FORMS: TrainingFormTemplate[] = [
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

export const DEFAULT_CLIENTS: TrainingClient[] = [RAMON_CLIENT]

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function createId(prefix: string): string {
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

export function isRamonClient(client: Pick<TrainingClient, 'id' | 'name'>): boolean {
  return client.id === RAMON_CLIENT.id || client.name.toLowerCase() === RAMON_CLIENT.name.toLowerCase()
}

export function withRamonWorkImageDefaults(client: TrainingClient): TrainingClient {
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

export function loadClients(): TrainingClient[] {
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

export function loadForms(): TrainingFormTemplate[] {
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

export function createClient(): TrainingClient {
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

export function createSession(): TrainingSession {
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

export function createInBodyScan(patch: Partial<InBodyScan> = {}): InBodyScan {
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

export function createOverloadRecord(): ProgressiveOverloadRecord {
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

export function viewFromPath(pathname: string): TrainingView {
  if (pathname.endsWith('/clients')) return 'clients'
  if (pathname.endsWith('/calendar')) return 'calendar'
  if (pathname.endsWith('/forms')) return 'forms'
  return 'dashboard'
}

export function answerGetter(answers: Record<string, string>): (...keys: string[]) => string {
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

export function compactLines(values: string[]): string {
  return values
    .map(value => value.trim())
    .filter(Boolean)
    .join('\n')
}

export function loadTrainingCalendarName(): string {
  if (typeof window === 'undefined') return ''
  try {
    const stored = localStorage.getItem(TRAINING_CALENDAR_STORAGE_KEY) || ''
    return stored === '__all__' ? '' : stored
  } catch {
    return ''
  }
}

export function resolveTrainingCalendarName(calendarNames: string[], preferred: string): string {
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

export function uniqueCalendarNames(events: Array<{ calendar?: string }>): string[] {
  return Array.from(new Set(events.map(event => event.calendar).filter((name): name is string => Boolean(name)))).sort((a, b) =>
    a.localeCompare(b),
  )
}

export function withoutBlankPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== '')) as Partial<T>
}
