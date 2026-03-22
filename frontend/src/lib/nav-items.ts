import { SquaresFour, Brain, ChatCircle, Gear, CalendarDots, Robot, Target, House, CheckSquare, Bell, Timer, Envelope, GitBranch, Desktop, FilmStrip, BookOpen, DeviceMobile, FileText } from '@phosphor-icons/react'

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
  { href: '/homelab', label: 'Home Lab', icon: Desktop, moduleId: 'homelab' },
  { href: '/media', label: 'Media Radar', icon: FilmStrip, moduleId: 'media' },
  { href: '/notes', label: 'Notes', icon: FileText, moduleId: 'notes' },
]

export const agentDashboardItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: SquaresFour, moduleId: 'dashboard' },
  { href: '/missions', label: 'Missions', icon: Target, moduleId: 'missions' },
  { href: '/openclaw', label: 'OpenClaw', icon: Robot, moduleId: 'openclaw' },
  { href: '/memory', label: 'Memory', icon: Brain, moduleId: 'memory' },
  { href: '/pipeline', label: 'Pipeline', icon: GitBranch, moduleId: 'pipeline' },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen, moduleId: 'knowledge' },
]

export const allNavItems: NavItem[] = [
  ...personalDashboardItems,
  ...agentDashboardItems,
  { href: '/settings', label: 'Settings', icon: Gear },
]

/** Lookup any nav item by its href */
export const navItemsByHref = new Map<string, NavItem>(
  allNavItems.map(item => [item.href, item])
)
