import { describe, expect, it } from 'vitest'
import {
  CONNECTION_SETTINGS,
  SERVICE_GROUPS,
  buildServiceCredentialMap,
} from '../service-registry'

describe('service-registry Hermes Agent contract', () => {
  it('stores new Hermes Agent connection settings under hermes secrets, not legacy harness secrets', () => {
    const setting = CONNECTION_SETTINGS.find((candidate) => candidate.id === 'harness')

    expect(setting).toMatchObject({
      label: 'Hermes Agent API',
      apiSecretService: 'hermes',
      urlKeychainKey: 'hermes.api-url',
    })
    expect(setting?.credentialFields?.map((field) => field.keychainKey)).toEqual([
      'hermes.api-key',
      'hermes.password',
      'hermes.ws',
    ])
  })

  it('builds wizard/service credentials for HERMES_* mappings', () => {
    expect(buildServiceCredentialMap([
      { service: 'hermes', keychainKey: 'hermes.api-url', value: ' http://agent.local ' },
      { service: 'hermes', keychainKey: 'hermes.api-key', value: 'key' },
      { service: 'hermes', keychainKey: 'hermes.ws', value: 'ws://agent.local/ws' },
      { service: 'hermes', keychainKey: 'hermes.password', value: 'password' },
      { service: 'hermes-dashboard', keychainKey: 'hermes.dashboard-api-url', value: ' http://usage.local ' },
      { service: 'hermes-dashboard', keychainKey: 'hermes.dashboard-password', value: 'dashboard-password' },
      { service: 'harness', keychainKey: 'harness.api-url', value: ' ' },
    ])).toEqual({
      hermes: {
        api_url: 'http://agent.local',
        api_key: 'key',
        ws: 'ws://agent.local/ws',
        password: 'password',
      },
      'hermes-dashboard': {
        dashboard_api_url: 'http://usage.local',
        dashboard_password: 'dashboard-password',
      },
    })
  })

  it('shows Hermes Agent setup fields wired to hermes keychain keys', () => {
    const group = SERVICE_GROUPS.find((candidate) => candidate.id === 'harness')

    expect(group).toMatchObject({
      title: 'Hermes Agent',
      description: 'Hermes Agent runtime for chat, agents, usage, tools, and approvals.',
    })
    expect(group?.fields.map((field) => field.keychainKey)).toEqual([
      'hermes.api-url',
      'hermes.api-key',
      'hermes.ws',
      'hermes.password',
    ])
    expect(group?.services).toEqual([
      { name: 'hermes', fieldKeys: ['hermes.api-url', 'hermes.api-key', 'hermes.ws', 'hermes.password'] },
    ])
  })

  it('labels the legacy dashboard connection as Hermes Agent Dashboard in the UI', () => {
    const setting = CONNECTION_SETTINGS.find((candidate) => candidate.id === 'codex-lb')
    const group = SERVICE_GROUPS.find((candidate) => candidate.id === 'codex-lb')

    expect(setting).toMatchObject({
      label: 'Hermes Agent Dashboard',
      description: 'Hermes Agent dashboard API and password for in-app usage, accounts, keys, and logs',
      urlKeychainKey: 'hermes.dashboard-api-url',
      expectedHostPlaceholder: 'e.g. hermes-dashboard',
      apiSecretService: 'hermes-dashboard',
    })
    expect(group).toMatchObject({
      title: 'Hermes Agent Dashboard',
      description: 'Dashboard API connection for Hermes Agent accounts, API keys, request logs, and usage limits.',
    })
    expect(group?.fields.map((field) => field.label)).toEqual([
      'Hermes Agent Dashboard API URL',
      'Hermes Agent Dashboard Password',
    ])
    expect(group?.fields.map((field) => field.keychainKey)).toEqual([
      'hermes.dashboard-api-url',
      'hermes.dashboard-password',
    ])
    expect(group?.services).toEqual([
      { name: 'hermes-dashboard', fieldKeys: ['hermes.dashboard-api-url', 'hermes.dashboard-password'] },
    ])
  })
})
