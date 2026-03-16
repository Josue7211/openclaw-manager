import { describe, it, expect } from 'vitest'
import type { Agent, Process } from '../types'

/* ─── Agent type structural validation ───────────────────────────────── */

describe('Agent type', () => {
  it('is structurally valid with all fields', () => {
    const agent: Agent = {
      id: 'agent-1',
      display_name: 'CodeBot',
      emoji: '🤖',
      role: 'developer',
      status: 'active',
      current_task: 'Refactoring auth module',
      color: '#5865f2',
      model: 'claude-opus-4-6',
    }
    expect(agent.id).toBeTruthy()
    expect(agent.display_name).toBe('CodeBot')
    expect(agent.status).toBe('active')
  })

  it('allows nullable current_task', () => {
    const agent: Agent = {
      id: 'agent-2',
      display_name: 'Idle Agent',
      emoji: '💤',
      role: 'monitor',
      status: 'idle',
      current_task: null,
      color: null,
      model: null,
    }
    expect(agent.current_task).toBeNull()
  })

  it('allows nullable color and model', () => {
    const agent: Agent = {
      id: 'agent-3',
      display_name: 'Basic',
      emoji: '🔧',
      role: 'worker',
      status: 'active',
      current_task: 'task',
      color: null,
      model: null,
    }
    expect(agent.color).toBeNull()
    expect(agent.model).toBeNull()
  })
})

/* ─── Process type structural validation ─────────────────────────────── */

describe('Process type', () => {
  it('is structurally valid with all fields', () => {
    const proc: Process = {
      pid: '12345',
      cmd: 'node agent.js',
      cpu: '2.5%',
      mem: '128MB',
      elapsed: '01:30:00',
      logFile: '/tmp/agent-12345.log',
      agentName: 'CodeBot',
      agentEmoji: '🤖',
      lastLogLine: 'Processing task #42...',
      mission_id: 'mission-1',
      mission_title: 'Refactor auth',
      started_at: '2026-03-15T10:00:00Z',
    }
    expect(proc.pid).toBe('12345')
    expect(proc.cmd).toBe('node agent.js')
    expect(proc.cpu).toBe('2.5%')
  })

  it('allows nullable optional fields', () => {
    const proc: Process = {
      pid: '99999',
      cmd: 'python worker.py',
      cpu: '0.1%',
      mem: '64MB',
      elapsed: '00:05:00',
      logFile: null,
      agentName: null,
      agentEmoji: null,
      lastLogLine: null,
      mission_id: null,
      mission_title: null,
      started_at: null,
    }
    expect(proc.logFile).toBeNull()
    expect(proc.agentName).toBeNull()
    expect(proc.agentEmoji).toBeNull()
    expect(proc.lastLogLine).toBeNull()
    expect(proc.mission_id).toBeNull()
    expect(proc.mission_title).toBeNull()
    expect(proc.started_at).toBeNull()
  })

  it('has required string fields: pid, cmd, cpu, mem, elapsed', () => {
    const proc: Process = {
      pid: '1',
      cmd: 'ls',
      cpu: '0%',
      mem: '1MB',
      elapsed: '00:00:01',
      logFile: null,
      agentName: null,
      agentEmoji: null,
      lastLogLine: null,
      mission_id: null,
      mission_title: null,
      started_at: null,
    }
    expect(typeof proc.pid).toBe('string')
    expect(typeof proc.cmd).toBe('string')
    expect(typeof proc.cpu).toBe('string')
    expect(typeof proc.mem).toBe('string')
    expect(typeof proc.elapsed).toBe('string')
  })
})
