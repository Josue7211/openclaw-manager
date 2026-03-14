import {
  LayoutDashboard,
  Brain,
  MessageCircle,
  Settings,
  CalendarDays,
  Bot,
  Target,
  Home,
  CheckSquare,
  Bell,
  Timer,
  Mail,
  GitBranch,
  Server,
  Film,
  BookOpen,
  Smartphone,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  moduleId?: string
}

export const personalDashboardItems: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/chat', label: 'Chat', icon: MessageCircle, moduleId: 'chat' },
  { href: '/todos', label: 'Todos', icon: CheckSquare, moduleId: 'todos' },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, moduleId: 'calendar' },
  { href: '/reminders', label: 'Reminders', icon: Bell, moduleId: 'reminders' },
  { href: '/messages', label: 'Messages', icon: Smartphone, moduleId: 'messages' },
  { href: '/pomodoro', label: 'Pomodoro', icon: Timer, moduleId: 'pomodoro' },
  { href: '/email', label: 'Email', icon: Mail, moduleId: 'email' },
  { href: '/homelab', label: 'Home Lab', icon: Server, moduleId: 'homelab' },
  { href: '/media', label: 'Media Radar', icon: Film, moduleId: 'media' },
]

export const agentDashboardItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, moduleId: 'dashboard' },
  { href: '/missions', label: 'Missions', icon: Target, moduleId: 'missions' },
  { href: '/agents', label: 'Agents', icon: Bot, moduleId: 'agents' },
  { href: '/memory', label: 'Memory', icon: Brain, moduleId: 'memory' },
  { href: '/crons', label: 'Cron Jobs', icon: CalendarDays, moduleId: 'crons' },
  { href: '/pipeline', label: 'Pipeline', icon: GitBranch, moduleId: 'pipeline' },
  { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen, moduleId: 'knowledge' },
]

export const allNavItems: NavItem[] = [
  ...personalDashboardItems,
  ...agentDashboardItems,
  { href: '/settings', label: 'Settings', icon: Settings },
]
