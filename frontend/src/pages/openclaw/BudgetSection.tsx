import { useState, useCallback } from 'react'
import { useBudgetAlerts } from '@/hooks/useBudgetAlerts'
import type { BudgetConfig } from '@/hooks/useBudgetAlerts'

export default function BudgetSection() {
  const { budget, setBudget } = useBudgetAlerts(null)
  const [dailyInput, setDailyInput] = useState(budget.dailyLimit?.toString() ?? '')
  const [monthlyInput, setMonthlyInput] = useState(budget.monthlyLimit?.toString() ?? '')

  const handleSave = useCallback(() => {
    const next: BudgetConfig = {
      dailyLimit: dailyInput ? parseFloat(dailyInput) || null : null,
      monthlyLimit: monthlyInput ? parseFloat(monthlyInput) || null : null,
    }
    setBudget(next)
  }, [dailyInput, monthlyInput, setBudget])

  const handleClear = useCallback(() => {
    setDailyInput('')
    setMonthlyInput('')
    setBudget({ dailyLimit: null, monthlyLimit: null })
  }, [setBudget])

  return (
    <div style={{ marginTop: '8px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', marginTop: 0 }}>
        Budget
      </h3>
      <div style={{
        background: 'var(--bg-white-03)',
        border: '1px solid var(--hover-bg-bright)',
        borderRadius: '10px',
        padding: '16px',
      }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {/* Daily limit */}
          <div style={{ flex: '1 1 180px' }}>
            <label
              htmlFor="budget-daily"
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '6px',
              }}
            >
              Daily Limit ($)
            </label>
            <input
              id="budget-daily"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 5.00"
              value={dailyInput}
              onChange={(e) => setDailyInput(e.target.value)}
              aria-label="Daily budget limit in dollars"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--hover-bg-bright)',
                borderRadius: '8px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Monthly limit */}
          <div style={{ flex: '1 1 180px' }}>
            <label
              htmlFor="budget-monthly"
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '6px',
              }}
            >
              Monthly Limit ($)
            </label>
            <input
              id="budget-monthly"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 50.00"
              value={monthlyInput}
              onChange={(e) => setMonthlyInput(e.target.value)}
              aria-label="Monthly budget limit in dollars"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--hover-bg-bright)',
                borderRadius: '8px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'var(--accent)',
              color: 'var(--text-on-accent)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Save Budget
          </button>
          <button
            onClick={handleClear}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'var(--hover-bg)',
              color: 'var(--text-secondary)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>

        {/* Current budget display */}
        {(budget.dailyLimit != null || budget.monthlyLimit != null) && (
          <div style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid var(--hover-bg)',
            fontSize: '12px',
            color: 'var(--text-muted)',
            display: 'flex',
            gap: '16px',
          }}>
            {budget.dailyLimit != null && (
              <span>Daily: ${budget.dailyLimit.toFixed(2)}</span>
            )}
            {budget.monthlyLimit != null && (
              <span>Monthly: ${budget.monthlyLimit.toFixed(2)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
