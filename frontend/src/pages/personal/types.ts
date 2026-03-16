export interface ProxmoxVM {
  vmid: number
  name: string
  status: string
  cpuPercent: number
  memUsedGB: number
  memTotalGB: number
  node: string
}

export interface ProxmoxNodeStat {
  node: string
  cpuPercent: number
  memUsedGB: number
  memTotalGB: number
  memPercent: number
}

export interface OPNsenseData {
  wanIn: string
  wanOut: string
  updateAvailable: boolean
  version: string
}

export interface DailyReviewRecord {
  id: string
  date: string
  accomplishments: string
  priorities: string
  notes: string
  created_at: string
}

export const MOTIVATIONS = [
  'Ship something today. Momentum compounds.',
  'The best time to start was yesterday. The second best time is now.',
  'Focus is a force multiplier. Pick one thing.',
  'Progress, not perfection.',
  'Systems beat goals. Build the habit.',
  'Do the hard thing first. The rest gets easier.',
  'Every expert was once a beginner who didn\'t quit.',
]
