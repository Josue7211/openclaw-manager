import { useEffect } from 'react'
import { useHarnessModels } from '@/hooks/useHarnessModels'
import { Star } from '@phosphor-icons/react'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import { ModelSelector } from '@/components/ModelSelector'
import { api } from '@/lib/api'
import { resolveStoredModelId } from '@/lib/model-resolver'
import {
  CHAT_DEFAULT_FAVORITE_MODELS,
  CHAT_FAVORITE_MODELS_STORAGE_KEY,
  CHAT_FAVORITE_MODELS_VERSION,
  CHAT_FAVORITE_MODELS_VERSION_STORAGE_KEY,
  CHAT_PRIMARY_MODEL_STORAGE_KEY,
  HARNESS_HEARTBEAT_MODEL_STORAGE_KEY,
  getHarnessModelList,
  isFavoriteModel,
  mergeDefaultFavoriteModelIds,
  resolvePreferredModelId,
  sanitizeFavoriteModelIds,
} from '@/lib/model-favorites'
import type { HarnessHealthStatus } from '../Harness'

function OfflineState({ status, noun }: { status: HarnessHealthStatus; noun: string }) {
  const title = status === 'not_configured' ? 'Hermes Agent not configured' : 'Hermes Agent offline'
  const detail = status === 'not_configured'
    ? `Set HERMES_API_URL in Settings > Connections to view ${noun}.`
    : `clawctrl cannot reach Hermes Agent right now. Check the upstream service and try again.`

  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
        {title}
      </p>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
        {detail}
      </p>
    </div>
  )
}

export default function ModelsTab({ healthy, status = 'unknown' }: { healthy: boolean; status?: HarnessHealthStatus }) {
  if (!healthy) {
    return <OfflineState status={status} noun="available models" />
  }

  return <ModelsContent />
}

function ModelsContent() {
  const { models, loading } = useHarnessModels()
  const [primaryModel, setPrimaryModel] = useLocalStorageState(CHAT_PRIMARY_MODEL_STORAGE_KEY, '')
  const [heartbeatModel, setHeartbeatModel] = useLocalStorageState(HARNESS_HEARTBEAT_MODEL_STORAGE_KEY, '')
  const [favoriteModelIds, setFavoriteModelIds] = useLocalStorageState<string[]>(CHAT_FAVORITE_MODELS_STORAGE_KEY, [])
  const [favoriteModelsVersion, setFavoriteModelsVersion] = useLocalStorageState<number>(CHAT_FAVORITE_MODELS_VERSION_STORAGE_KEY, 0)
  const modelList = getHarnessModelList(models)
  const sanitizedFavoriteIds = sanitizeFavoriteModelIds(favoriteModelIds)
  const favoriteIds = sanitizedFavoriteIds.length === favoriteModelIds.length
    ? favoriteModelIds
    : sanitizedFavoriteIds
  const normalizedPrimaryModel = resolveStoredModelId(resolvePreferredModelId(primaryModel, modelList) || primaryModel, modelList)
  const normalizedHeartbeatModel = resolveStoredModelId(resolvePreferredModelId(heartbeatModel, modelList) || heartbeatModel, modelList)

  useEffect(() => {
    let cancelled = false
    void api.get<{
      chatPrimaryModel?: string | null
      heartbeatModel?: string | null
      favoriteModels?: string[]
    }>('/api/hermes/runtime-config').then((config) => {
      if (cancelled) return
      if (typeof config.chatPrimaryModel === 'string') {
        const nextPrimaryModel = resolveStoredModelId(config.chatPrimaryModel, modelList)
        if (nextPrimaryModel && nextPrimaryModel !== primaryModel) setPrimaryModel(nextPrimaryModel)
      }
      if (typeof config.heartbeatModel === 'string') {
        const nextHeartbeatModel = resolveStoredModelId(config.heartbeatModel, modelList)
        if (nextHeartbeatModel && nextHeartbeatModel !== heartbeatModel) setHeartbeatModel(nextHeartbeatModel)
      }
      if (Array.isArray(config.favoriteModels)) {
        setFavoriteModelIds(config.favoriteModels)
      }
    }).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [heartbeatModel, modelList, primaryModel, setFavoriteModelIds, setHeartbeatModel, setPrimaryModel])

  const persistRuntimeConfig = async (next: {
    chatPrimaryModel?: string
    heartbeatModel?: string
    favoriteModels?: string[]
  }) => {
    try {
      await api.patch('/api/hermes/runtime-config', next)
    } catch {
      // Local preferences remain authoritative while the backend is offline.
    }
  }

  const handlePrimaryModelChange = async (nextModel: string) => {
    const storedModel = resolveStoredModelId(nextModel, modelList)
    if (!storedModel) return
    setPrimaryModel(storedModel)
    await persistRuntimeConfig({ chatPrimaryModel: storedModel })
  }

  const handleHeartbeatModelChange = async (nextModel: string) => {
    const storedModel = resolveStoredModelId(nextModel, modelList)
    if (!storedModel) return
    setHeartbeatModel(storedModel)
    await persistRuntimeConfig({ heartbeatModel: storedModel })
  }

  const toggleFavoriteModel = async (modelId: string) => {
    const nextFavorites = favoriteIds.includes(modelId)
      ? favoriteIds.filter((id) => id !== modelId)
      : [...favoriteIds, modelId]
    setFavoriteModelIds(nextFavorites)
    await persistRuntimeConfig({ favoriteModels: nextFavorites })
  }

  useEffect(() => {
    if (modelList.length === 0) return
    if (favoriteModelsVersion < CHAT_FAVORITE_MODELS_VERSION) {
      const mergedFavorites = mergeDefaultFavoriteModelIds(
        favoriteModelIds,
        CHAT_DEFAULT_FAVORITE_MODELS,
        modelList,
      )
      setFavoriteModelIds(mergedFavorites)
      setFavoriteModelsVersion(CHAT_FAVORITE_MODELS_VERSION)
      void persistRuntimeConfig({ favoriteModels: mergedFavorites })
      return
    }
    if (favoriteIds !== favoriteModelIds) {
      setFavoriteModelIds(favoriteIds)
    }
    if (primaryModel !== normalizedPrimaryModel) {
      setPrimaryModel(normalizedPrimaryModel)
    }
    if (heartbeatModel !== normalizedHeartbeatModel) {
      setHeartbeatModel(normalizedHeartbeatModel)
    }
  }, [
    favoriteIds,
    favoriteModelIds,
    favoriteModelsVersion,
    heartbeatModel,
    modelList,
    normalizedHeartbeatModel,
    normalizedPrimaryModel,
    primaryModel,
    setFavoriteModelIds,
    setFavoriteModelsVersion,
    setHeartbeatModel,
    setPrimaryModel,
  ])

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</span>
      </div>
    )
  }

  if (modelList.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No models available</span>
      </div>
    )
  }

  return (
    <div style={{ overflow: 'auto', height: '100%', padding: '20px' }}>
      <div style={{
        marginBottom: '16px',
        padding: '12px 14px',
        borderRadius: '10px',
        border: '1px solid var(--hover-bg-bright)',
        background: 'var(--bg-white-03)',
        color: 'var(--text-secondary)',
        fontSize: '12px',
      }}>
        Configure the Hermes Agent model policy here instead of relying on hidden app defaults.
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '12px',
        marginBottom: '16px',
      }}>
        <div style={{
          background: 'var(--bg-white-03)',
          border: '1px solid var(--hover-bg-bright)',
          borderRadius: '10px',
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Primary chat model
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Used when chat has no active model pinned yet or the saved model is unavailable.
          </div>
          <ModelSelector
            value={primaryModel}
            onChange={(value) => { void handlePrimaryModelChange(value) }}
            placeholder="Pick the default Hermes Agent chat model"
          />
        </div>
        <div style={{
          background: 'var(--bg-white-03)',
          border: '1px solid var(--hover-bg-bright)',
          borderRadius: '10px',
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Heartbeat model preference
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Your selected lightweight model for heartbeat and background Hermes Agent work.
          </div>
          <ModelSelector
            value={heartbeatModel}
            onChange={(value) => { void handleHeartbeatModelChange(value) }}
            placeholder="Pick the preferred heartbeat model"
          />
        </div>
      </div>
      <div style={{
        marginBottom: '16px',
        padding: '12px 14px',
        borderRadius: '10px',
        border: '1px solid var(--hover-bg-bright)',
        background: 'var(--bg-white-03)',
        color: 'var(--text-secondary)',
        fontSize: '12px',
      }}>
        Star the models you want in the chat switcher. Only starred models show up there.
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '12px',
      }}>
        {modelList.map((model) => (
          <div key={model.id} style={{
            background: 'var(--bg-white-03)',
            border: '1px solid var(--hover-bg-bright)',
            borderRadius: '10px',
            padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            {/* Model name */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {model.name ?? model.id}
                </div>

            {/* Model ID (if different from name) */}
                {model.name && model.name !== model.id && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                    {model.id}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label={isFavoriteModel(model.id, favoriteIds) ? 'Remove model from chat favorites' : 'Add model to chat favorites'}
                title={isFavoriteModel(model.id, favoriteIds) ? 'Remove from chat favorites' : 'Add to chat favorites'}
                onClick={() => { void toggleFavoriteModel(model.id) }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  border: '1px solid var(--hover-bg-bright)',
                  background: isFavoriteModel(model.id, favoriteIds) ? 'var(--amber-a15, rgba(245, 158, 11, 0.12))' : 'transparent',
                  color: isFavoriteModel(model.id, favoriteIds) ? 'var(--amber, #f59e0b)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <Star size={16} weight={isFavoriteModel(model.id, favoriteIds) ? 'fill' : 'regular'} />
              </button>
            </div>

            {/* Provider badge + max tokens row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '999px',
                background: 'var(--purple-a15)',
                color: 'var(--accent-bright)',
                fontWeight: 600,
              }}>
                {model.provider ?? 'Unknown'}
              </span>
              {model.max_tokens != null && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {model.max_tokens.toLocaleString()} max tokens
                </span>
              )}
            </div>

            {/* Cost info */}
            {(model.input_cost_per_token != null || model.output_cost_per_token != null) && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                {model.input_cost_per_token != null && (
                  <span>Input: ${model.input_cost_per_token.toFixed(8)}/token</span>
                )}
                {model.input_cost_per_token != null && model.output_cost_per_token != null && (
                  <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>|</span>
                )}
                {model.output_cost_per_token != null && (
                  <span>Output: ${model.output_cost_per_token.toFixed(8)}/token</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
