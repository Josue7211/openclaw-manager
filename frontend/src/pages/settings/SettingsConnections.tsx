import { useState, useEffect, useCallback, lazy, Suspense, useMemo, useRef } from 'react'
import { Warning } from '@phosphor-icons/react'
import {
  api,
  CONFIGURED_BACKEND_BASE_CHANGED_EVENT,
  getConfiguredBackendBase,
  setApiBase,
  setApiKey,
  setConfiguredBackendBase,
} from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import { getSetupStatus, normalizeBackendUrl, pairWithBackend } from '@/lib/setup'
import { useSaveSecret } from '@/hooks/useUserSecrets'
import { resetWizard as resetSetupWizard } from '@/lib/wizard-store'
import { Button } from '@/components/ui/Button'
import {
  CONNECTION_SETTINGS,
  SERVICE_GROUPS,
  buildCredentialMap,
  type ConnectionSettingId,
  type FieldDef,
  keychainKeyToCredKey,
} from '@/lib/service-registry'
import type { ApiSuccess, HomelabConfigData, PortainerConfigInfo } from '@/pages/homelab/types'
import { row, rowLast, val, inputStyle, sectionLabel } from '@/features/settings/shared'

const OnboardingWelcome = lazy(() => import('@/components/OnboardingWelcome'))

type CredentialMap = Record<string, string>

interface HomelabConfigForm {
  proxmoxHost: string
  proxmoxTokenId: string
  proxmoxTokenSecret: string
  opnsenseHost: string
  opnsenseKey: string
  opnsenseSecret: string
  portainerInstances: Array<PortainerConfigInfo & { token: string }>
}

interface SyncedSecret {
  credentials?: Record<string, string>
}

type SecretResponse =
  | {
      ok?: boolean
      data?: {
        credentials?: Record<string, unknown>
      }
      credentials?: Record<string, unknown>
    }
  | Record<string, unknown>
  | null

interface ServiceSetupTarget {
  id: string
  label: string
  groupTitle: string
  fields: FieldDef[]
}

function emptyConnectionRecord(): Record<ConnectionSettingId, CredentialMap> {
  return Object.fromEntries(
    CONNECTION_SETTINGS.map(setting => [setting.id, {}])
  ) as Record<ConnectionSettingId, CredentialMap>
}

const emptyHomelabForm: HomelabConfigForm = {
  proxmoxHost: '',
  proxmoxTokenId: '',
  proxmoxTokenSecret: '',
  opnsenseHost: '',
  opnsenseKey: '',
  opnsenseSecret: '',
  portainerInstances: [],
}

function parseSyncedPortainerInstances(value: string | undefined): Array<PortainerConfigInfo & { token: string }> {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as Array<Partial<PortainerConfigInfo> & { token?: string }>
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item, index) => ({
        id: item.id || `portainer-${index + 1}`,
        name: item.name || `Portainer ${index + 1}`,
        url: item.url || '',
        token_set: !!item.token,
        token: item.token || '',
      }))
      .filter(item => item.url || item.name)
  } catch {
    return []
  }
}

function extractCredentials(response: SecretResponse): CredentialMap {
  const source =
    response &&
    typeof response === 'object' &&
    'data' in response &&
    response.data &&
    typeof response.data === 'object' &&
    'credentials' in response.data &&
    response.data.credentials &&
    typeof response.data.credentials === 'object'
      ? response.data.credentials
      : response &&
        typeof response === 'object' &&
        'credentials' in response &&
        response.credentials &&
        typeof response.credentials === 'object'
        ? response.credentials
        : response && typeof response === 'object'
          ? response
          : {}

  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

function envNameForKeychainKey(keychainKey: string): string {
  return keychainKey.replace(/\./g, '_').replace(/-/g, '_').toUpperCase()
}

function labelFromServiceId(serviceId: string): string {
  return serviceId
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function fieldFromKey(serviceId: string, key: string): FieldDef {
  const envPrefix = `${serviceId.replace(/-/g, '_').toUpperCase()}_`
  const keySuffix = key.startsWith(envPrefix) ? key.slice(envPrefix.length) : key
  const normalized = key.includes('.') ? key : `${serviceId}.${keySuffix.toLowerCase().replace(/_/g, '-')}`
  const suffix = normalized.split('.').slice(1).join(' ') || normalized
  const label = `${labelFromServiceId(serviceId)} ${suffix.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}`
  return {
    label,
    keychainKey: normalized,
    placeholder: suffix.includes('url') || suffix.includes('host') ? `http://100.x.x.x` : label,
    secret: /key|token|password|secret/i.test(suffix),
  }
}

function findServiceSetupTarget(serviceId: string, requestedKeys: string[]): ServiceSetupTarget | null {
  if (!serviceId) return null
  const normalizedService = serviceId.toLowerCase()
  const group = SERVICE_GROUPS.find(item => item.services.some(service => service.name === normalizedService))
  const service = group?.services.find(item => item.name === normalizedService)
  const keys = service?.fieldKeys.length ? service.fieldKeys : requestedKeys
  const fields = keys.map(key => {
    const matchingField = group?.fields.find(field =>
      field.keychainKey === key
      || envNameForKeychainKey(field.keychainKey) === key
      || keychainKeyToCredKey(field.keychainKey) === key
    )
    return matchingField ?? fieldFromKey(normalizedService, key)
  })
  const uniqueFields = fields.filter((field, index, all) =>
    all.findIndex(candidate => candidate.keychainKey === field.keychainKey) === index
  )
  if (uniqueFields.length === 0) return null
  return {
    id: normalizedService,
    label: labelFromServiceId(normalizedService),
    groupTitle: group?.title ?? 'Service',
    fields: uniqueFields,
  }
}

export default function SettingsConnections() {
  const suppressNextBackendRefreshRef = useRef(false)
  const setupParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const serviceSetupTarget = useMemo(() => {
    const serviceId = setupParams.get('service')?.trim() ?? ''
    const requestedKeys = (setupParams.get('keys') ?? '')
      .split(',')
      .map(key => key.trim())
      .filter(Boolean)
    return findServiceSetupTarget(serviceId, requestedKeys)
  }, [setupParams])
  const [connectionUrls, setConnectionUrls] = useState<Record<ConnectionSettingId, string>>({
    bluebubbles: '',
    harness: '',
    sunshine: '',
    vnc: '',
    agentsecrets: '',
    agentshell: '',
  })
  const [connectionCredentials, setConnectionCredentials] = useState<Record<ConnectionSettingId, CredentialMap>>(emptyConnectionRecord)
  const [savedCredentials, setSavedCredentials] = useState<Record<ConnectionSettingId, CredentialMap>>(emptyConnectionRecord)
  const [expectedHosts, setExpectedHosts] = useState<Record<ConnectionSettingId, string>>({
    bluebubbles: '',
    harness: '',
    sunshine: '',
    vnc: '',
    agentsecrets: '',
    agentshell: '',
  })
  const [bindHost, setBindHost] = useState('')
  const [agentKey, setAgentKey] = useState('')
  const [connSaving, setConnSaving] = useState(false)
  const [connSaveStatus, setConnSaveStatus] = useState<string | null>(null)
  const [connTesting, setConnTesting] = useState(false)
  const [connResults, setConnResults] = useState<Record<string, { status: string; latency_ms?: number; error?: string; peer_hostname?: string; peer_verified?: boolean }> | null>(null)
  const [homelabForm, setHomelabForm] = useState<HomelabConfigForm>(emptyHomelabForm)
  const [homelabConfig, setHomelabConfig] = useState<HomelabConfigData | null>(null)
  const [homelabSaving, setHomelabSaving] = useState(false)
  const [homelabStatus, setHomelabStatus] = useState<string | null>(null)
  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [backendUrl, setBackendUrl] = useState(getConfiguredBackendBase())
  const [pairingToken, setPairingToken] = useState('')
  const [backendChecking, setBackendChecking] = useState(false)
  const [backendSaving, setBackendSaving] = useState(false)
  const [backendPairing, setBackendPairing] = useState(false)
  const [backendStatus, setBackendStatus] = useState<null | {
    backend_public_base_url: string
    pairing_required: boolean
    services: {
      supabase: { configured: boolean; reachable: boolean }
      harness?: {
        configured: boolean
        reachable: boolean
        status?: string
        auth_valid?: boolean
        checked_path?: string | null
        message?: string | null
      }
      memd: { configured: boolean; reachable: boolean }
      agentsecrets: { configured: boolean; reachable: boolean }
    }
    missing: string[]
  }>(null)
  const [backendStatusMessage, setBackendStatusMessage] = useState<string | null>(null)
  const [serviceSetupValues, setServiceSetupValues] = useState<CredentialMap>({})
  const [serviceSetupSaving, setServiceSetupSaving] = useState(false)
  const [serviceSetupStatus, setServiceSetupStatus] = useState<string | null>(null)

  const saveSecretMutation = useSaveSecret()

  const updateConnectionUrl = useCallback((id: ConnectionSettingId, value: string) => {
    setConnectionUrls(prev => ({ ...prev, [id]: value }))
  }, [])

  const updateExpectedHost = useCallback((id: ConnectionSettingId, value: string) => {
    setExpectedHosts(prev => ({ ...prev, [id]: value }))
  }, [])

  const updateConnectionCredential = useCallback((id: ConnectionSettingId, keychainKey: string, value: string) => {
    setConnectionCredentials(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [keychainKey]: value,
      },
    }))
  }, [])

  const updateHomelabForm = useCallback((key: keyof HomelabConfigForm, value: string) => {
    setHomelabForm(prev => ({ ...prev, [key]: value }))
    setHomelabStatus(null)
  }, [])

  const updatePortainerInstance = useCallback((
    index: number,
    key: keyof (PortainerConfigInfo & { token: string }),
    value: string,
  ) => {
    setHomelabForm(prev => ({
      ...prev,
      portainerInstances: prev.portainerInstances.map((item, i) => i === index ? { ...item, [key]: value } : item),
    }))
    setHomelabStatus(null)
  }, [])

  const updateServiceSetupValue = useCallback((keychainKey: string, value: string) => {
    setServiceSetupValues(prev => ({ ...prev, [keychainKey]: value }))
    setServiceSetupStatus(null)
  }, [])

  useEffect(() => {
    if (!serviceSetupTarget) return
    api.get<SecretResponse>(`/api/secrets/${serviceSetupTarget.id}`).then(response => {
      const credentials = extractCredentials(response)
      const loadedValues = Object.fromEntries(
        serviceSetupTarget.fields.map(field => {
          const credKey = keychainKeyToCredKey(field.keychainKey)
          return [field.keychainKey, field.secret ? '' : credentials[credKey] || '']
        })
      )
      setServiceSetupValues(loadedValues)
    }).catch(() => {})
  }, [serviceSetupTarget])

  const saveServiceSetup = useCallback(async () => {
    if (!serviceSetupTarget) return
    const credentials = buildCredentialMap(
      serviceSetupTarget.fields.map(field => [field.keychainKey, serviceSetupValues[field.keychainKey]])
    )
    if (Object.keys(credentials).length === 0) {
      setServiceSetupStatus('Add at least one value first.')
      return
    }

    setServiceSetupSaving(true)
    setServiceSetupStatus(null)
    try {
      const existing = extractCredentials(await api.get<SecretResponse>(`/api/secrets/${serviceSetupTarget.id}`).catch(() => null))
      await api.put(`/api/secrets/${serviceSetupTarget.id}`, { credentials: { ...existing, ...credentials } })
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        await Promise.all(
          serviceSetupTarget.fields
            .map(field => ({ key: field.keychainKey, value: serviceSetupValues[field.keychainKey]?.trim() ?? '' }))
            .filter(item => item.value)
            .map(item => invoke('set_secret', item))
        ).catch(() => {})
      }
      setServiceSetupStatus('Saved. Restart to apply changes.')
    } catch (e: unknown) {
      setServiceSetupStatus(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setServiceSetupSaving(false)
    }
  }, [serviceSetupTarget, serviceSetupValues])

  const addPortainerInstance = useCallback(() => {
    setHomelabForm(prev => ({
      ...prev,
      portainerInstances: [
        ...prev.portainerInstances,
        { id: `portainer-${Date.now()}`, name: 'Portainer', url: '', token: '', token_set: false },
      ],
    }))
    setHomelabStatus(null)
  }, [])

  const removePortainerInstance = useCallback((index: number) => {
    setHomelabForm(prev => ({
      ...prev,
      portainerInstances: prev.portainerInstances.filter((_, i) => i !== index),
    }))
    setHomelabStatus(null)
  }, [])

  const applyHomelabConfig = useCallback((config: HomelabConfigData | null) => {
    if (!config) return
    setHomelabConfig(config)
    setHomelabForm(prev => ({
      ...prev,
      proxmoxHost: prev.proxmoxHost || config.local.proxmox_host || '',
      proxmoxTokenId: prev.proxmoxTokenId || config.local.proxmox_token_id || '',
      opnsenseHost: prev.opnsenseHost || config.local.opnsense_host || '',
      portainerInstances: prev.portainerInstances.length
        ? prev.portainerInstances
        : (config.local.portainer_instances ?? []).map(item => ({ ...item, token: '' })),
    }))
  }, [])

  const loadSyncedHomelabCredentials = useCallback(async (service: 'proxmox' | 'opnsense' | 'portainer') => {
    const response = await api.get<ApiSuccess<SyncedSecret>>(`/api/secrets/${service}`).catch(() => null)
    return response?.data?.credentials ?? null
  }, [])

  // Load saved connection URLs from the backend API first (Supabase-encrypted),
  // falling back to OS keychain, then to the backend's active config (which
  // includes .env.local values merged at startup).
  useEffect(() => {
    let keychainBindHost: string | null = null
    let keychainAgentKey: string | null = null
    let keychainBackendBase: string | null = null

    const loadKeychain = window.__TAURI_INTERNALS__
      ? import('@tauri-apps/api/core').then(({ invoke }) =>
          Promise.all([
            ...CONNECTION_SETTINGS.map(setting =>
              invoke<string | null>('get_secret', { key: setting.urlKeychainKey }).then(v => {
                setConnectionUrls(prev => ({ ...prev, [setting.id]: v || prev[setting.id] }))
              })
            ),
            invoke<string | null>('get_secret', { key: 'mc-bind.host' }).then(v => { keychainBindHost = v }),
            invoke<string | null>('get_secret', { key: 'mc-agent.key' }).then(v => { keychainAgentKey = v }),
            invoke<string | null>('get_secret', { key: 'backend.public-base-url' }).then(v => { keychainBackendBase = v }),
          ])
        ).catch(() => {})
      : Promise.resolve()

    const loadFromApi = Promise.all(
      CONNECTION_SETTINGS.map(setting =>
        api.get<SecretResponse>(`/api/secrets/${setting.apiSecretService}`).catch(() => null)
      )
    )

    const loadActiveConfig = api.get<{
      bluebubbles_url?: string
      harness_url?: string
      sunshine_url?: string
      vnc_url?: string
      agentsecrets_url?: string
      agentshell_url?: string
    }>('/api/status/active-config').catch(() => null)

    Promise.all([loadKeychain, loadFromApi, loadActiveConfig]).then(([, apiSecrets, activeConfig]) => {
      const activeConfigMap: Record<ConnectionSettingId, string> = {
        bluebubbles: activeConfig?.bluebubbles_url || '',
        harness: activeConfig?.harness_url || '',
        sunshine: activeConfig?.sunshine_url || '',
        vnc: activeConfig?.vnc_url || '',
        agentsecrets: activeConfig?.agentsecrets_url || '',
        agentshell: activeConfig?.agentshell_url || '',
      }

      const loadedUrls: Partial<Record<ConnectionSettingId, string>> = {}
      const loadedCredentials: Partial<Record<ConnectionSettingId, CredentialMap>> = {}
      const loadedFieldValues: Partial<Record<ConnectionSettingId, CredentialMap>> = {}
      CONNECTION_SETTINGS.forEach((setting, index) => {
        const credentials = extractCredentials(apiSecrets?.[index] ?? null)
        const apiUrl = credentials.url
        loadedUrls[setting.id] = apiUrl || activeConfigMap[setting.id] || ''
        loadedCredentials[setting.id] = credentials
        loadedFieldValues[setting.id] = Object.fromEntries(
          (setting.credentialFields ?? []).map(field => {
            const credKey = keychainKeyToCredKey(field.keychainKey)
            return [field.keychainKey, field.secret ? '' : credentials[credKey] || '']
          })
        )
      })
      setConnectionUrls(prev => ({ ...prev, ...loadedUrls }))
      setSavedCredentials(prev => ({ ...prev, ...loadedCredentials }))
      setConnectionCredentials(prev => ({ ...prev, ...loadedFieldValues }))

      if (keychainBindHost) setBindHost(keychainBindHost)
      if (keychainAgentKey) setAgentKey(keychainAgentKey)
      if (keychainBackendBase) setBackendUrl(keychainBackendBase)
    }).catch(() => {})

    // Load expected hostnames from user preferences
    api.get<{ ok: boolean; data: Record<string, unknown> }>('/api/user-preferences').then(resp => {
      const prefs = resp?.data ?? resp
      CONNECTION_SETTINGS.forEach(setting => {
        const value = prefs?.[setting.expectedHostPreferenceKey]
        if (value) {
          updateExpectedHost(setting.id, String(value))
        }
      })
    }).catch(() => {})
  }, [updateExpectedHost])

  useEffect(() => {
    let cancelled = false

    async function loadHomelabConfig() {
      const localResponse = await api.get<ApiSuccess<HomelabConfigData>>('/api/homelab/config').catch(() => null)
      if (!cancelled) applyHomelabConfig(localResponse?.data ?? null)

      const [syncedProxmox, syncedOPNsense, syncedPortainer] = await Promise.all([
        loadSyncedHomelabCredentials('proxmox'),
        loadSyncedHomelabCredentials('opnsense'),
        loadSyncedHomelabCredentials('portainer'),
      ])

      if (cancelled) return
      setHomelabForm(prev => ({
        ...prev,
        proxmoxHost: syncedProxmox?.host || prev.proxmoxHost,
        proxmoxTokenId: syncedProxmox?.token_id || prev.proxmoxTokenId,
        proxmoxTokenSecret: syncedProxmox?.token_secret || prev.proxmoxTokenSecret,
        opnsenseHost: syncedOPNsense?.host || prev.opnsenseHost,
        opnsenseKey: syncedOPNsense?.key || prev.opnsenseKey,
        opnsenseSecret: syncedOPNsense?.secret || prev.opnsenseSecret,
        portainerInstances: parseSyncedPortainerInstances(syncedPortainer?.instances).length
          ? parseSyncedPortainerInstances(syncedPortainer?.instances)
          : prev.portainerInstances,
      }))
    }

    void loadHomelabConfig()
    return () => {
      cancelled = true
    }
  }, [applyHomelabConfig, loadSyncedHomelabCredentials])

  const refreshBackendStatus = useCallback(async (targetBase = backendUrl, announce = true) => {
    setBackendChecking(true)
    if (announce) setBackendStatusMessage(null)
    try {
      const status = await getSetupStatus(targetBase)
      setBackendStatus(status)
      if (announce) setBackendStatusMessage('Backend reachable')
      return status
    } catch (e: unknown) {
      setBackendStatus(null)
      setBackendStatusMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
      return null
    } finally {
      setBackendChecking(false)
    }
  }, [backendUrl])

  useEffect(() => {
    void refreshBackendStatus(getConfiguredBackendBase(), false)
  }, [refreshBackendStatus])

  useEffect(() => {
    const onBackendChanged = () => {
      if (suppressNextBackendRefreshRef.current) {
        suppressNextBackendRefreshRef.current = false
        return
      }
      const nextBase = getConfiguredBackendBase()
      setBackendUrl(nextBase)
      void refreshBackendStatus(nextBase, false)
    }

    window.addEventListener(CONFIGURED_BACKEND_BASE_CHANGED_EVENT, onBackendChanged)
    return () => window.removeEventListener(CONFIGURED_BACKEND_BASE_CHANGED_EVENT, onBackendChanged)
  }, [refreshBackendStatus])

  const saveBackendTarget = useCallback(async () => {
    const normalized = normalizeBackendUrl(backendUrl)
    if (!normalized) {
      setBackendStatusMessage('Error: backend URL is required')
      return
    }

    setBackendSaving(true)
    setBackendStatusMessage(null)
    try {
      await getSetupStatus(normalized)
      let deviceApiKey: string | null = null
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        deviceApiKey = await invoke<string | null>('get_secret', { key: 'backend.device-api-key' }).catch(() => null)
        await invoke('set_secret', { key: 'backend.public-base-url', value: normalized })
      }
      suppressNextBackendRefreshRef.current = true
      setConfiguredBackendBase(normalized)
      if (deviceApiKey?.trim()) {
        setApiBase(normalized)
        setApiKey(deviceApiKey)
        const { setChatSocketApiKey } = await import('@/lib/hooks/useChatSocket')
        setChatSocketApiKey(deviceApiKey)
      }
      setBackendUrl(normalized)
      await refreshBackendStatus(normalized, false)
      setBackendStatusMessage('Backend target saved')
    } catch (e: unknown) {
      setBackendStatusMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBackendSaving(false)
    }
  }, [backendUrl, refreshBackendStatus])

  const handlePairBackend = useCallback(async () => {
    const normalized = normalizeBackendUrl(backendUrl)
    if (!normalized) {
      setBackendStatusMessage('Error: backend URL is required')
      return
    }
    if (!pairingToken.trim()) {
      setBackendStatusMessage('Error: pairing token is required')
      return
    }

    setBackendPairing(true)
    setBackendStatusMessage(null)
    try {
      const pairResult = await pairWithBackend(pairingToken.trim(), 'clawctrl Desktop', normalized)
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_secret', { key: 'backend.public-base-url', value: normalized })
        if (pairResult.device_api_key) {
          await invoke('set_secret', { key: 'backend.device-api-key', value: pairResult.device_api_key })
        }
      }
      suppressNextBackendRefreshRef.current = true
      setConfiguredBackendBase(normalized)
      setApiBase(normalized)
      if (pairResult.device_api_key?.trim()) {
        setApiKey(pairResult.device_api_key)
        const { setChatSocketApiKey } = await import('@/lib/hooks/useChatSocket')
        setChatSocketApiKey(pairResult.device_api_key)
      }
      setBackendUrl(normalized)
      setPairingToken('')
      await refreshBackendStatus(normalized, false)
      setBackendStatusMessage('Backend paired')
    } catch (e: unknown) {
      setBackendStatusMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBackendPairing(false)
    }
  }, [backendUrl, pairingToken, refreshBackendStatus])

  const saveConnections = useCallback(async () => {
    setConnSaving(true)
    setConnSaveStatus(null)
    try {
      // Save to Supabase (encrypted) via backend API
      await Promise.all([
        ...CONNECTION_SETTINGS.map(setting => {
          const credentials: Record<string, string> = {
            ...(savedCredentials[setting.id] ?? {}),
            url: connectionUrls[setting.id],
          }

          for (const field of setting.credentialFields ?? []) {
            const credKey = keychainKeyToCredKey(field.keychainKey)
            const value = connectionCredentials[setting.id]?.[field.keychainKey]?.trim() ?? ''
            if (value) {
              credentials[credKey] = value
            } else if (!field.secret) {
              delete credentials[credKey]
            }
          }

          return saveSecretMutation.mutateAsync({
            service: setting.apiSecretService,
            credentials,
          })
        }),
      ])

      // Also save to OS keychain as local cache/fallback (for startup before login)
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        await Promise.all([
          ...CONNECTION_SETTINGS.map(setting =>
            invoke('set_secret', { key: setting.urlKeychainKey, value: connectionUrls[setting.id] })
          ),
          ...CONNECTION_SETTINGS.flatMap(setting =>
            (setting.credentialFields ?? [])
              .map(field => ({ field, value: connectionCredentials[setting.id]?.[field.keychainKey]?.trim() ?? '' }))
              .filter(({ field, value }) => value || !field.secret)
              .map(({ field, value }) => invoke('set_secret', { key: field.keychainKey, value }))
          ),
          bindHost ? invoke('set_secret', { key: 'mc-bind.host', value: bindHost }) : Promise.resolve(),
          agentKey ? invoke('set_secret', { key: 'mc-agent.key', value: agentKey }) : Promise.resolve(),
        ]).catch(() => {
          // Keychain save is best-effort — API save is the source of truth
        })
      }

      // Save expected hostnames to user preferences
      const nextPreferences = Object.fromEntries(
        CONNECTION_SETTINGS.map(setting => [setting.expectedHostPreferenceKey, expectedHosts[setting.id]])
      )
      await api.patch('/api/user-preferences', {
        preferences: nextPreferences,
      }).catch(() => {})

      setConnSaveStatus('Saved & encrypted. Restart to apply changes.')
    } catch (e: unknown) {
      setConnSaveStatus(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setConnSaving(false)
    }
  }, [agentKey, bindHost, connectionCredentials, connectionUrls, expectedHosts, saveSecretMutation, savedCredentials])

  const saveHomelabConfig = useCallback(async () => {
    setHomelabSaving(true)
    setHomelabStatus(null)
    try {
      const localPayload: Record<string, unknown> = {
        proxmox_host: homelabForm.proxmoxHost,
        proxmox_token_id: homelabForm.proxmoxTokenId,
        opnsense_host: homelabForm.opnsenseHost,
        portainer_instances: homelabForm.portainerInstances.map(item => ({
          id: item.id,
          name: item.name,
          url: item.url,
          token: item.token.trim(),
        })),
      }
      if (homelabForm.proxmoxTokenSecret.trim()) localPayload.proxmox_token_secret = homelabForm.proxmoxTokenSecret
      if (homelabForm.opnsenseKey.trim()) localPayload.opnsense_key = homelabForm.opnsenseKey
      if (homelabForm.opnsenseSecret.trim()) localPayload.opnsense_secret = homelabForm.opnsenseSecret

      const localResponse = await api.put<ApiSuccess<HomelabConfigData>>('/api/homelab/config', localPayload)
      applyHomelabConfig(localResponse.data)

      const localSync = await api.post<ApiSuccess<{ synced: string[]; skipped: string[] }>>('/api/homelab/sync')
        .catch(() => null)
      const localSyncComplete = !!localSync
        && localSync.data.synced.includes('proxmox')
        && localSync.data.synced.includes('opnsense')
        && (homelabForm.portainerInstances.length === 0 || localSync.data.synced.includes('portainer'))

      const [existingProxmox, existingOPNsense, existingPortainer] = localSync ? [null, null, null] : await Promise.all([
        loadSyncedHomelabCredentials('proxmox').catch(() => null),
        loadSyncedHomelabCredentials('opnsense').catch(() => null),
        loadSyncedHomelabCredentials('portainer').catch(() => null),
      ])

      const proxmoxCredentials: Record<string, string> = {
        ...(existingProxmox ?? {}),
        host: homelabForm.proxmoxHost.trim(),
        token_id: homelabForm.proxmoxTokenId.trim(),
      }
      if (homelabForm.proxmoxTokenSecret.trim()) proxmoxCredentials.token_secret = homelabForm.proxmoxTokenSecret.trim()

      const opnsenseCredentials: Record<string, string> = {
        ...(existingOPNsense ?? {}),
        host: homelabForm.opnsenseHost.trim(),
      }
      if (homelabForm.opnsenseKey.trim()) opnsenseCredentials.key = homelabForm.opnsenseKey.trim()
      if (homelabForm.opnsenseSecret.trim()) opnsenseCredentials.secret = homelabForm.opnsenseSecret.trim()
      const existingPortainerInstances = parseSyncedPortainerInstances(existingPortainer?.instances)
      const portainerCredentials = {
        instances: JSON.stringify(homelabForm.portainerInstances.map(item => {
          const existing = existingPortainerInstances.find(saved => saved.id === item.id)
          return {
            id: item.id,
            name: item.name.trim(),
            url: item.url.trim(),
            token: item.token.trim() || existing?.token || '',
          }
        }).filter(item => item.name && item.url)),
      }

      const directSyncAllowed = !localSync
        && !!(proxmoxCredentials.token_secret || homelabForm.proxmoxTokenSecret.trim())
        && !!(opnsenseCredentials.key || homelabForm.opnsenseKey.trim())
        && !!(opnsenseCredentials.secret || homelabForm.opnsenseSecret.trim())
      const syncResults = directSyncAllowed
        ? await Promise.allSettled([
            api.put('/api/secrets/proxmox', { credentials: proxmoxCredentials }),
            api.put('/api/secrets/opnsense', { credentials: opnsenseCredentials }),
            api.put('/api/secrets/portainer', { credentials: portainerCredentials }),
          ])
        : []
      const syncOk = localSyncComplete || (directSyncAllowed && syncResults.every(result => result.status === 'fulfilled'))

      setHomelabForm(prev => ({
        ...prev,
        proxmoxTokenSecret: '',
        opnsenseKey: '',
        opnsenseSecret: '',
        portainerInstances: prev.portainerInstances.map(item => ({ ...item, token: '', token_set: item.token_set || !!item.token.trim() })),
      }))
      setHomelabStatus(syncOk
        ? 'Saved locally and synced.'
        : 'Saved locally. Sign in to sync encrypted secrets.')
    } catch (e: unknown) {
      setHomelabStatus(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setHomelabSaving(false)
    }
  }, [applyHomelabConfig, homelabForm, loadSyncedHomelabCredentials])

  const testConnections = useCallback(async () => {
    setConnTesting(true)
    setConnResults(null)
    try {
      const data = await api.get<Record<string, { status: string; latency_ms?: number; error?: string }>>('/api/status/connections')
      setConnResults(data)
    } catch {
      setConnResults({ _error: { status: 'error', error: 'Could not reach backend' } })
    } finally {
      setConnTesting(false)
    }
  }, [])

  const statusDot = (s?: string) => ({
    display: 'inline-block' as const, width: '8px', height: '8px', borderRadius: '50%', marginRight: '6px',
    background: s === 'ok' ? 'var(--secondary)' : s === 'not_configured' ? 'var(--text-muted)' : 'var(--red)',
  })
  const statusLabel = (r?: { status: string; latency_ms?: number; error?: string; peer_hostname?: string; peer_verified?: boolean }) => {
    if (!r) return null
    const parts: React.ReactNode[] = []
    if (r.status === 'ok') parts.push(<span key="s" style={{ fontSize: '11px', color: 'var(--secondary)', fontFamily: 'monospace' }}><span style={statusDot('ok')} />OK ({r.latency_ms}ms)</span>)
    else if (r.status === 'not_configured') parts.push(<span key="s" style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}><span style={statusDot('not_configured')} />Not configured</span>)
    else parts.push(<span key="s" style={{ fontSize: '11px', color: 'var(--red)', fontFamily: 'monospace' }}><span style={statusDot('error')} />{r.error || r.status}</span>)
    // Peer verification badge
    if (r.peer_verified === true) {
      parts.push(<span key="pv" style={{ fontSize: '10px', color: 'var(--secondary)', fontFamily: 'monospace', marginLeft: '8px' }} title={`Peer: ${r.peer_hostname}`}>peer ok</span>)
    } else if (r.peer_verified === false) {
      parts.push(<span key="pv" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--gold)', fontFamily: 'monospace', marginLeft: '8px' }} title={`Peer hostname "${r.peer_hostname}" does not match expected`}><Warning size={11} />peer mismatch</span>)
    } else if (r.peer_hostname) {
      parts.push(<span key="pv" style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', marginLeft: '8px' }} title="No expected hostname configured">peer: {r.peer_hostname}</span>)
    }
    return <>{parts}</>
  }
  const hostInputStyle: React.CSSProperties = { ...inputStyle, width: '140px', fontSize: '11px' }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '(not set)'
  const normalizedBackendUrl = backendUrl.trim().replace(/\/+$/, '')
  const activeBackendUrl = backendStatus?.backend_public_base_url || normalizedBackendUrl
  const harnessStatus = backendStatus?.services.harness
  const agentSecretsStatus = backendStatus?.services.agentsecrets
  const backendReady = !!backendStatus?.services.supabase.reachable && harnessStatus?.reachable === true && agentSecretsStatus?.reachable === true
  const backendNeedsPairing = backendStatus?.pairing_required === true
  const backendSummary = backendStatus
    ? backendNeedsPairing
      ? 'Backend reachable, pairing required'
      : backendReady
        ? 'Backend ready'
        : 'Backend reachable, some core services still need work'
    : backendChecking
      ? 'Checking backend...'
      : 'No backend status yet'
  const harnessDetail = harnessStatus?.message
    ? ` (${harnessStatus.message})`
    : harnessStatus?.status
      ? ` (${harnessStatus.status})`
      : ''
  const backendDetails = backendStatus
    ? `Supabase ${backendStatus.services.supabase.reachable ? 'online' : backendStatus.services.supabase.configured ? 'configured but offline' : 'not configured'} • Harness ${harnessStatus?.reachable ? 'online' : harnessStatus?.configured ? 'configured but offline' : 'not configured'}${harnessDetail} • Agent Secrets ${agentSecretsStatus?.reachable ? 'online' : agentSecretsStatus?.configured ? 'configured but offline' : 'not configured'} • MemD ${backendStatus.services.memd.reachable ? 'online' : backendStatus.services.memd.configured ? 'configured but offline' : 'offline'}`
    : 'Run a backend check to validate the selected server.'
  const missingLabels: Record<string, string> = {
    harness: 'Harness',
    harness_auth: 'Harness auth',
    agentsecrets: 'Agent Secrets',
    supabase: 'Supabase',
    memd: 'memd',
  }

  return (
    <div>
      {isDemoMode() && (<div style={{ background: 'var(--warning-a08)', border: '1px solid var(--warning-a25)', borderRadius: 'var(--radius-md)', padding: '16px 20px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Warning size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} /><span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--warning)' }}>You're in demo mode</span></div><p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>No services are connected. The app is showing sample data so you can explore the interface. To use real data, set the following environment variables and restart:</p><div style={{ background: 'var(--overlay-light)', borderRadius: '6px', padding: '10px 14px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.8 }}><div><span style={{ color: 'var(--accent)' }}>VITE_SUPABASE_URL</span>=https://your-project.supabase.co</div><div><span style={{ color: 'var(--accent)' }}>VITE_SUPABASE_ANON_KEY</span>=your-anon-key</div></div><p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>Then configure BlueBubbles and Harness below (saved to OS keychain).</p></div>)}
      <div style={sectionLabel}>Service Connections</div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Configure URLs for external services. Credentials are encrypted and stored in Supabase with a local keychain fallback.
        Set expected Tailscale hostnames to verify peer identity.
      </p>

      {serviceSetupTarget && (
        <div style={{ border: '1px solid rgba(255,182,87,0.35)', background: 'rgba(255,182,87,0.06)', borderRadius: '8px', padding: '12px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#ffb657' }}>
                {serviceSetupTarget.groupTitle}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 850, color: 'var(--text-primary)', marginTop: '3px' }}>
                {serviceSetupTarget.label} setup
              </div>
            </div>
            <Button variant="primary" onClick={() => void saveServiceSetup()} disabled={serviceSetupSaving} style={{ fontSize: '12px', padding: '7px 12px' }}>
              {serviceSetupSaving ? 'Saving...' : `Save ${serviceSetupTarget.label}`}
            </Button>
          </div>
          <div style={{ display: 'grid', gap: '6px' }}>
            {serviceSetupTarget.fields.map(field => {
              return (
                <div key={field.keychainKey} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(220px, 280px)', alignItems: 'center', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{field.label}</span>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                      {field.keychainKey}
                    </div>
                  </div>
                  <input
                    type={field.secret ? 'password' : field.type || 'text'}
                    style={{ ...inputStyle, width: '100%', fontFamily: field.secret ? 'monospace' : inputStyle.fontFamily, fontSize: '11px' }}
                    value={serviceSetupValues[field.keychainKey] ?? ''}
                    onChange={e => updateServiceSetupValue(field.keychainKey, e.target.value)}
                    placeholder={field.placeholder}
                    aria-label={field.label}
                  />
                </div>
              )
            })}
          </div>
          {serviceSetupStatus && (
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: serviceSetupStatus.startsWith('Error') ? 'var(--red)' : 'var(--secondary)', marginTop: '10px' }}>
              {serviceSetupStatus}
            </div>
          )}
        </div>
      )}

      <div style={{ ...sectionLabel, marginTop: '0' }}>Backend Server</div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Choose which server this desktop app should use for auth, setup, and data. Check it first, then save or pair it.
      </p>

      <div style={row}>
        <div style={{ flex: 1 }}>
          <span>Backend URL</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>The server clawctrl will talk to.</div>
        </div>
        <input
          style={inputStyle}
          value={backendUrl}
          onChange={e => setBackendUrl(e.target.value)}
          placeholder="https://your-backend.example.com"
          aria-label="Backend URL"
        />
      </div>

      <div style={row}>
        <div style={{ flex: 1 }}>
          <span>Pairing Token</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Only needed if this server requires device pairing.</div>
        </div>
        <input
          type="password"
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px' }}
          value={pairingToken}
          onChange={e => setPairingToken(e.target.value)}
          placeholder="Paste pairing token"
          aria-label="Pairing token"
        />
      </div>

      <div style={rowLast}>
        <div style={{ flex: 1 }}>
          <span>Backend Status</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {backendSummary}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {backendDetails}
          </div>
          {backendStatus?.missing?.length ? (
            <div style={{ fontSize: '11px', color: 'var(--gold)', marginTop: '4px' }}>
              Missing: {backendStatus.missing.map(key => missingLabels[key] ?? key).join(', ')}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span style={{ ...val, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeBackendUrl}
          </span>
          {backendStatusMessage && (
            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: backendStatusMessage.startsWith('Error') ? 'var(--red)' : 'var(--secondary)' }}>
              {backendStatusMessage}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="secondary" onClick={() => void refreshBackendStatus()} disabled={backendChecking} style={{ fontSize: '12px', padding: '8px 16px' }}>
          {backendChecking ? 'Checking...' : 'Check Server'}
        </Button>
        <Button variant="primary" onClick={() => void saveBackendTarget()} disabled={backendSaving} style={{ fontSize: '12px', padding: '8px 16px' }}>
          {backendSaving ? 'Saving...' : 'Save Server'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => void handlePairBackend()}
          disabled={backendPairing || backendStatus?.pairing_required !== true}
          style={{ fontSize: '12px', padding: '8px 16px', color: 'var(--text-secondary)' }}
        >
          {backendPairing ? 'Pairing...' : 'Pair Device'}
        </Button>
      </div>

      {CONNECTION_SETTINGS.map(setting => (
        <div key={setting.id} style={row}>
          <div style={{ flex: 1 }}>
            <span>{setting.label}</span>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{setting.description}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <input
              style={inputStyle}
              value={connectionUrls[setting.id]}
              onChange={e => updateConnectionUrl(setting.id, e.target.value)}
              placeholder={setting.urlPlaceholder}
              aria-label={`${setting.label} URL`}
            />
            {(setting.credentialFields ?? []).map(field => {
              const credKey = keychainKeyToCredKey(field.keychainKey)
              const hasSavedSecret = field.secret && !!savedCredentials[setting.id]?.[credKey]
              return (
                <input
                  key={field.keychainKey}
                  type={field.secret ? 'password' : field.type || 'text'}
                  style={{ ...inputStyle, fontFamily: field.secret ? 'monospace' : inputStyle.fontFamily, fontSize: '11px' }}
                  value={connectionCredentials[setting.id]?.[field.keychainKey] ?? ''}
                  onChange={e => updateConnectionCredential(setting.id, field.keychainKey, e.target.value)}
                  placeholder={hasSavedSecret ? `${field.label} saved; paste new value to replace` : field.placeholder}
                  aria-label={`${setting.label} ${field.label}`}
                />
              )
            })}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Expected host:</span>
              <input
                style={hostInputStyle}
                value={expectedHosts[setting.id]}
                onChange={e => updateExpectedHost(setting.id, e.target.value)}
                placeholder={setting.expectedHostPlaceholder}
                aria-label={`${setting.label} expected Tailscale hostname`}
              />
            </div>
            {connResults?.[setting.id] && statusLabel(connResults[setting.id])}
          </div>
        </div>
      ))}

      <div style={{ ...sectionLabel, marginTop: '24px' }}>Home Lab</div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Proxmox and OPNsense credentials for Home Lab Vitals. Secrets are stored locally and synced encrypted when auth is unlocked.
      </p>

      <div style={row}>
        <div style={{ flex: 1 }}>
          <span>Proxmox</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {homelabConfig?.api_configured.proxmox ? 'Ready' : 'Needs host, token ID, and token secret'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <input
            style={inputStyle}
            value={homelabForm.proxmoxHost}
            onChange={e => updateHomelabForm('proxmoxHost', e.target.value)}
            placeholder="https://100.x.x.x:8006"
            aria-label="Proxmox Host URL"
          />
          <input
            style={inputStyle}
            value={homelabForm.proxmoxTokenId}
            onChange={e => updateHomelabForm('proxmoxTokenId', e.target.value)}
            placeholder="user@pam!token-name"
            aria-label="Proxmox Token ID"
          />
          <input
            type="password"
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px' }}
            value={homelabForm.proxmoxTokenSecret}
            onChange={e => updateHomelabForm('proxmoxTokenSecret', e.target.value)}
            placeholder={homelabConfig?.local.proxmox_token_secret_set ? 'Token secret saved; paste new value to replace' : 'Token secret'}
            aria-label="Proxmox Token Secret"
          />
        </div>
      </div>

      <div style={rowLast}>
        <div style={{ flex: 1 }}>
          <span>OPNsense</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {homelabConfig?.api_configured.opnsense ? 'Ready' : 'Needs host, API key, and API secret'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <input
            style={inputStyle}
            value={homelabForm.opnsenseHost}
            onChange={e => updateHomelabForm('opnsenseHost', e.target.value)}
            placeholder="https://100.x.x.x"
            aria-label="OPNsense Host URL"
          />
          <input
            type="password"
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px' }}
            value={homelabForm.opnsenseKey}
            onChange={e => updateHomelabForm('opnsenseKey', e.target.value)}
            placeholder={homelabConfig?.local.opnsense_key_set ? 'API key saved; paste new value to replace' : 'API key'}
            aria-label="OPNsense API Key"
          />
          <input
            type="password"
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px' }}
            value={homelabForm.opnsenseSecret}
            onChange={e => updateHomelabForm('opnsenseSecret', e.target.value)}
            placeholder={homelabConfig?.local.opnsense_secret_set ? 'API secret saved; paste new value to replace' : 'API secret'}
            aria-label="OPNsense API Secret"
          />
        </div>
      </div>

      <div style={rowLast}>
        <div style={{ flex: 1 }}>
          <span>Portainer Instances</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {homelabConfig?.api_configured.portainer ? 'Ready' : 'Add one or more Portainer URLs and API tokens'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', minWidth: '320px' }}>
          {homelabForm.portainerInstances.map((instance, index) => (
            <div key={instance.id || index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', width: '100%' }}>
              <input
                style={{ ...inputStyle, width: '100%' }}
                value={instance.name}
                onChange={e => updatePortainerInstance(index, 'name', e.target.value)}
                placeholder="Primary Portainer"
                aria-label={`Portainer ${index + 1} name`}
              />
              <input
                style={{ ...inputStyle, width: '100%' }}
                value={instance.url}
                onChange={e => updatePortainerInstance(index, 'url', e.target.value)}
                placeholder="https://100.x.x.x:9443"
                aria-label={`Portainer ${index + 1} URL`}
              />
              <input
                type="password"
                style={{ ...inputStyle, width: '100%', fontFamily: 'monospace', fontSize: '11px' }}
                value={instance.token}
                onChange={e => updatePortainerInstance(index, 'token', e.target.value)}
                placeholder={instance.token_set ? 'API token saved; paste to replace' : 'API token'}
                aria-label={`Portainer ${index + 1} API token`}
              />
              <Button variant="ghost" onClick={() => removePortainerInstance(index)} style={{ fontSize: '11px', padding: '6px 8px' }}>
                Remove
              </Button>
            </div>
          ))}
          <Button variant="secondary" onClick={addPortainerInstance} style={{ fontSize: '12px', padding: '7px 12px' }}>
            Add Portainer
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="primary" onClick={() => void saveHomelabConfig()} disabled={homelabSaving} style={{ fontSize: '12px', padding: '8px 16px' }}>
          {homelabSaving ? 'Saving...' : 'Save Home Lab'}
        </Button>
        {homelabStatus && (
          <span style={{ fontSize: '12px', fontFamily: 'monospace', color: homelabStatus.startsWith('Error') ? 'var(--red)' : 'var(--secondary)' }}>
            {homelabStatus}
          </span>
        )}
      </div>

      <div style={rowLast}>
        <div style={{ flex: 1 }}>
          <span>Supabase</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Database backend (read-only, from env)</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span style={{ ...val, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{supabaseUrl}</span>
          {connResults?.supabase && statusLabel(connResults.supabase)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="primary" onClick={saveConnections} disabled={connSaving} style={{ fontSize: '12px', padding: '8px 16px' }}>
          {connSaving ? 'Saving...' : 'Save'}
        </Button>
        <Button variant="secondary" onClick={testConnections} disabled={connTesting} style={{ fontSize: '12px', padding: '8px 16px' }}>
          {connTesting ? 'Testing...' : 'Test All'}
        </Button>
        {connSaveStatus && (
          <span style={{ fontSize: '12px', fontFamily: 'monospace', color: connSaveStatus.startsWith('Error') ? 'var(--red)' : 'var(--secondary)' }}>
            {connSaveStatus}
          </span>
        )}
      </div>

      <div style={{ ...sectionLabel, marginTop: '24px' }}>Server Access</div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Allow external agents to reach the clawctrl API over Tailscale. Requires restart.
      </p>

      <div style={row}>
        <div style={{ flex: 1 }}>
          <span>Bind Address</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Default: 127.0.0.1 (localhost only). Set to 0.0.0.0 for Tailscale access.</div>
        </div>
        <input
          style={inputStyle}
          value={bindHost}
          onChange={e => setBindHost(e.target.value)}
          placeholder="127.0.0.1"
          aria-label="Server bind address"
        />
      </div>

      <div style={rowLast}>
        <div style={{ flex: 1 }}>
          <span>Agent API Key</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Stable key for external agents. Does not rotate on restart.</div>
        </div>
        <input
          type="password"
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px' }}
          value={agentKey}
          onChange={e => setAgentKey(e.target.value)}
          placeholder="Generate or paste a key"
          aria-label="Agent API key"
        />
      </div>

      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Setup Wizard</span>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Re-run the first-time setup wizard to reconfigure all connections
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="ghost"
              onClick={() => {
                // Re-run walkthrough/tour without resetting setup
                localStorage.removeItem('tour-progress')
                // Tour feature will be added in a later plan
              }}
              style={{ fontSize: '12px', padding: '8px 16px', color: 'var(--text-secondary)' }}
            >
              Re-run Walkthrough
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowResetConfirm(true)}
              style={{ fontSize: '12px', padding: '8px 16px' }}
            >
              Re-run Setup
            </Button>
          </div>
        </div>
        {/* Confirmation dialog for re-run setup */}
        {showResetConfirm && (
          <div style={{
            marginTop: '12px',
            padding: '12px 16px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
          }}>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
              This will restart the setup wizard. Your current services and modules won't change.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                variant="ghost"
                onClick={() => setShowResetConfirm(false)}
                style={{ fontSize: '12px', padding: '6px 14px' }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setShowResetConfirm(false)
                  resetSetupWizard()
                  window.location.reload()
                }}
                style={{ fontSize: '12px', padding: '6px 14px' }}
              >
                Restart
              </Button>
            </div>
          </div>
        )}
      </div>
      {showSetupWizard && (
        <Suspense fallback={null}>
          <OnboardingWelcome forceOpen onClose={() => setShowSetupWizard(false)} />
        </Suspense>
      )}
    </div>
  )
}
