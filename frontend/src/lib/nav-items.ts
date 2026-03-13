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
}

export const personalDashboardItems: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/chat', label: 'Chat', icon: MessageCircle },
  { href: '/todos', label: 'Todos', icon: CheckSquare },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/messages', label: 'Messages', icon: Smartphone },
  { href: '/pomodoro', label: 'Pomodoro', icon: Timer },
  { href: '/email', label: 'Email', icon: Mail },
  { href: '/homelab', label: 'Home Lab', icon: Server },
  { href: '/media', label: 'Media Radar', icon: Film },
]

export const agentDashboardItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/missions', label: 'Missions', icon: Target },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/memory', label: 'Memory', icon: Brain },
  { href: '/crons', label: 'Cron Jobs', icon: CalendarDays },
  { href: '/pipeline', label: 'Pipeline', icon: GitBranch },
  { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
]

export const settingsItem: NavItem = { href: '/settings', label: 'Settings', icon: Settings }

export const allNavItems: NavItem[] = [
  ...personalDashboardItems,
  ...agentDashboardItems,
  settingsItem,
]
