import { describe, expect, it } from 'vitest'
import { hermesChatErrorMessage } from '../hermesErrors'

describe('hermesChatErrorMessage', () => {
  it('normalizes stale provider errors to Hermes Agent copy', () => {
    expect(hermesChatErrorMessage('codex-cli: unsupported provider')).toBe(
      'Hermes Agent is the active agent right now.',
    )
    expect(hermesChatErrorMessage('codex-lb: unsupported provider')).toBe(
      'Hermes Agent is the active agent right now.',
    )
    expect(hermesChatErrorMessage('Claude Code is not installed')).toBe(
      'Hermes Agent is the active agent right now.',
    )
  })

  it('normalizes local-provider cwd errors to project-folder guidance', () => {
    expect(hermesChatErrorMessage('codex-cli: provider cwd is required')).toBe(
      'Hermes Agent needs a project folder. Select or add a project before sending.',
    )
    expect(hermesChatErrorMessage('provider cwd does not exist or cannot be read: No such file or directory')).toBe(
      'Hermes Agent needs a project folder. Select or add a project before sending.',
    )
  })

  it('normalizes provider scope errors to Hermes Agent copy', () => {
    expect(hermesChatErrorMessage('unsupported chat provider')).toBe(
      'Hermes Agent is the active agent right now.',
    )
  })

  it('normalizes legacy setup errors to Hermes Agent configuration guidance', () => {
    expect(hermesChatErrorMessage('harness_not_configured')).toBe(
      'Hermes Agent is not configured. Open Settings > Connections to connect it.',
    )
    expect(hermesChatErrorMessage('hermes_not_configured')).toBe(
      'Hermes Agent is not configured. Open Settings > Connections to connect it.',
    )
    expect(hermesChatErrorMessage('Harness not configured')).toBe(
      'Hermes Agent is not configured. Open Settings > Connections to connect it.',
    )
    expect(hermesChatErrorMessage('Harness Agent URL is not configured')).toBe(
      'Hermes Agent is not configured. Open Settings > Connections to connect it.',
    )
  })
})
