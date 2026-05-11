import { SquaresFour, Brain, ChatCircle, Gear, CalendarDots, Robot, Target, House, CheckSquare, Bell, Timer, Envelope, GitBranch, Desktop, FilmStrip, BookOpen, DeviceMobile, FileText, Monitor, ShieldCheck, Pulse, MagnifyingGlass, Barbell, UsersThree, ClipboardText } from '@phosphor-icons/react'

export interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  moduleId?: string
}

export const personalDashboardItems: NavItem[] = [
  { href: '/', label: 'Home', icon: House },
  { href: '/chat', label: 'Chat', icon: ChatCircle, moduleId: 'chat' },
  { href: '/todos', label: 'Todos', icon: CheckSquare, moduleId: 'todos' },
  { href: '/calendar', label: 'Calendar', icon: CalendarDots, moduleId: 'calendar' },
  { href: '/reminders', label: 'Reminders', icon: Bell, moduleId: 'reminders' },
  { href: '/messages', label: 'Messages', icon: DeviceMobile, moduleId: 'messages' },
  { href: '/pomodoro', label: 'Pomodoro', icon: Timer, moduleId: 'pomodoro' },
  { href: '/email', label: 'Email', icon: Envelope, moduleId: 'email' },
  { href: '/jobs', label: 'Career Ops', icon: MagnifyingGlass, moduleId: 'job-hunter' },
  { href: '/homelab', label: 'Home Lab', icon: Desktop, moduleId: 'homelab' },
  { href: '/media', label: 'Media Radar', icon: FilmStrip, moduleId: 'media' },
  { href: '/notes', label: 'Notes', icon: FileText, moduleId: 'notes' },
]

export const trainingItems: NavItem[] = [
  { href: '/training', label: 'Training Dashboard', icon: Barbell, moduleId: 'training' },
  { href: '/training/clients', label: 'Clients', icon: UsersThree, moduleId: 'training-clients' },
  { href: '/training/calendar', label: 'Calendar', icon: CalendarDots, moduleId: 'training-calendar' },
  { href: '/training/forms', label: 'Forms', icon: ClipboardText, moduleId: 'training-forms' },
]

export const agentDashboardItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: SquaresFour, moduleId: 'dashboard' },
  { href: '/missions', label: 'Missions', icon: Target, moduleId: 'missions' },
  { href: '/harness', label: 'Harness', icon: Robot, moduleId: 'harness' },
  { href: '/memory', label: 'Memory', icon: Brain, moduleId: 'memory' },
  { href: '/pipeline', label: 'Pipeline', icon: GitBranch, moduleId: 'pipeline' },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen, moduleId: 'knowledge' },
  { href: '/remote', label: 'Remote Viewer', icon: Monitor, moduleId: 'remote-viewer' },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck, moduleId: 'approvals' },
  { href: '/activity', label: 'Activity', icon: Pulse, moduleId: 'activity' },
]

export const allNavItems: NavItem[] = [
  ...personalDashboardItems,
  ...trainingItems,
  ...agentDashboardItems,
  { href: '/settings', label: 'Settings', icon: Gear },
]

/** Lookup any nav item by its href */
export const navItemsByHref = new Map<string, NavItem>(
  allNavItems.map(item => [item.href, item])
)
