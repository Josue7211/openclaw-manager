import { useMemo } from 'react'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import type { UsageData } from '@/pages/openclaw/types'

export interface BudgetConfig {
  dailyLimit: number | null
  monthlyLimit: number | null
}

export interface BudgetAlert {
  level: 'amber' | 'red'
  message: string
}

const STORAGE_KEY = 'openclaw-budget'

const DEFAULT_BUDGET: BudgetConfig = {
  dailyLimit: null,
  monthlyLimit: null,
}

export function useBudgetAlerts(usage: UsageData | null) {
  const [budget, setBudget] = useLocalStorageState<BudgetConfig>(STORAGE_KEY, DEFAULT_BUDGET)

  const alert = useMemo<BudgetAlert | null>(() => {
    if (!usage || usage.total_cost == null) return null

    const cost = usage.total_cost

    // Check monthly budget first (higher priority)
    if (budget.monthlyLimit != null && budget.monthlyLimit > 0) {
      const pct = cost / budget.monthlyLimit
      if (pct >= 1) {
        return {
          level: 'red',
          message: `Monthly budget exceeded: $${cost.toFixed(2)} / $${budget.monthlyLimit.toFixed(2)} (${(pct * 100).toFixed(0)}%)`,
        }
      }
      if (pct >= 0.8) {
        return {
          level: 'amber',
          message: `Approaching monthly budget: $${cost.toFixed(2)} / $${budget.monthlyLimit.toFixed(2)} (${(pct * 100).toFixed(0)}%)`,
        }
      }
    }

    // Check daily budget
    if (budget.dailyLimit != null && budget.dailyLimit > 0) {
      // Use today's cost from daily data if available, otherwise fall back to total
      const dailyCost = getDailyCost(usage)
      if (dailyCost != null) {
        const pct = dailyCost / budget.dailyLimit
        if (pct >= 1) {
          return {
            level: 'red',
            message: `Daily budget exceeded: $${dailyCost.toFixed(2)} / $${budget.dailyLimit.toFixed(2)} (${(pct * 100).toFixed(0)}%)`,
          }
        }
        if (pct >= 0.8) {
          return {
            level: 'amber',
            message: `Approaching daily budget: $${dailyCost.toFixed(2)} / $${budget.dailyLimit.toFixed(2)} (${(pct * 100).toFixed(0)}%)`,
          }
        }
      }
    }

    return null
  }, [usage, budget])

  return { alert, budget, setBudget }
}

/** Extract today's cost from the daily breakdown, if available. */
function getDailyCost(usage: UsageData): number | null {
  if (!Array.isArray(usage.daily) || usage.daily.length === 0) return null
  const today = new Date().toISOString().slice(0, 10)
  const todayEntry = usage.daily.find(d => d.date === today)
  if (todayEntry) return todayEntry.cost
  // Fall back to last entry (most recent day)
  return usage.daily[usage.daily.length - 1].cost
}
