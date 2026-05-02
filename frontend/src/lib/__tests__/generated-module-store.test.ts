import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock api module
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}))

// Mock widget-registry module
vi.mock('@/lib/widget-registry', () => ({
  registerWidget: vi.fn(),
}))

vi.mock('@/components/primitives/register', () => ({
  PRIMITIVE_COMPONENTS: {
    StatCard: () => null,
    ProgressGauge: () => null,
    MarkdownDisplay: () => null,
    LineChart: () => null,
    BarChart: () => null,
    ListView: () => null,
    DataTable: () => null,
    FormWidget: () => null,
    KanbanBoard: () => null,
    TimerCountdown: () => null,
    ImageGallery: () => null,
  },
}))

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake-blob-url')
const mockRevokeObjectURL = vi.fn()
globalThis.URL.createObjectURL = mockCreateObjectURL
globalThis.URL.revokeObjectURL = mockRevokeObjectURL

import { api } from '@/lib/api'
import { registerWidget } from '@/lib/widget-registry'
import {
  wrapAsESModule,
  registerGeneratedModule,
  unregisterGeneratedModule,
  loadGeneratedModules,
  saveGeneratedModule,
  updateGeneratedModule,
  deleteGeneratedModule,
  toggleGeneratedModule,
  rollbackGeneratedModule,
  getGeneratedModuleVersions,
  exposePrimitivesAPI,
  _resetForTesting,
} from '../generated-module-store'

import type { GeneratedModule } from '../generated-module-types'

const mockModule: GeneratedModule = {
  id: 'test-mod-1',
  userId: 'user-1',
  name: 'Test Module',
  description: 'A test module',
  icon: 'Cube',
  source: 'function GeneratedWidget(props) { return null }',
  configSchema: { fields: [] },
  defaultSize: { w: 3, h: 3 },
  version: 1,
  enabled: true,
  createdAt: '2026-03-21T00:00:00Z',
  updatedAt: '2026-03-21T00:00:00Z',
  deletedAt: null,
}

describe('generated-module-store', () => {
  beforeEach(() => {
    _resetForTesting()
    vi.clearAllMocks()
    mockCreateObjectURL.mockReturnValue('blob:http://localhost/fake-blob-url')
  })

  describe('wrapAsESModule', () => {
    it('appends export default GeneratedWidget statement', () => {
      const source = 'function GeneratedWidget(props) { return null }'
      const result = wrapAsESModule(source)
      expect(result).toContain(source)
      expect(result).toContain('export default GeneratedWidget;')
    })

    it('preserves original source code', () => {
      const source = 'const x = 1;\nfunction GeneratedWidget() { return x }'
      const result = wrapAsESModule(source)
      expect(result.startsWith(source)).toBe(true)
    })
  })

  describe('registerGeneratedModule', () => {
    it('calls registerWidget with correct tier, category, and id', () => {
      registerGeneratedModule(mockModule)

      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'generated-test-mod-1',
          tier: 'ai',
          category: 'custom',
          name: 'Test Module',
          description: 'A test module',
          icon: 'Cube',
          defaultSize: { w: 3, h: 3 },
        })
      )
    })

    it('creates a blob URL from wrapped source', () => {
      registerGeneratedModule(mockModule)

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1)
      const blobArg = mockCreateObjectURL.mock.calls[0][0]
      expect(blobArg).toBeInstanceOf(Blob)
      expect(blobArg.type).toBe('application/javascript')
    })

    it('revokes old blob URL on re-register', () => {
      mockCreateObjectURL.mockReturnValueOnce('blob:old-url')
      registerGeneratedModule(mockModule)
      expect(mockRevokeObjectURL).not.toHaveBeenCalled()

      mockCreateObjectURL.mockReturnValueOnce('blob:new-url')
      registerGeneratedModule(mockModule)
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:old-url')
    })

    it('includes metadata with author and version', () => {
      registerGeneratedModule(mockModule)

      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { author: 'Generated Module', version: '1' },
        })
      )
    })

    it('provides a component function for lazy loading', () => {
      registerGeneratedModule(mockModule)

      const call = vi.mocked(registerWidget).mock.calls[0][0]
      expect(typeof call.component).toBe('function')
    })
  })

  describe('unregisterGeneratedModule', () => {
    it('revokes blob URL if module was registered', () => {
      mockCreateObjectURL.mockReturnValueOnce('blob:to-revoke')
      registerGeneratedModule(mockModule)
      unregisterGeneratedModule(mockModule.id)
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:to-revoke')
    })

    it('does nothing if module was not registered', () => {
      unregisterGeneratedModule('nonexistent')
      expect(mockRevokeObjectURL).not.toHaveBeenCalled()
    })
  })

  describe('loadGeneratedModules', () => {
    it('fetches modules from /api/generated-modules and registers enabled ones', async () => {
      const disabledModule = { ...mockModule, id: 'disabled-1', enabled: false }
      vi.mocked(api.get).mockResolvedValueOnce({
        modules: [mockModule, disabledModule],
      })

      await loadGeneratedModules()

      expect(api.get).toHaveBeenCalledWith('/api/generated-modules')
      expect(registerWidget).toHaveBeenCalledTimes(1)
      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'generated-test-mod-1' })
      )
    })

    it('skips disabled modules', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        modules: [{ ...mockModule, enabled: false }],
      })

      await loadGeneratedModules()

      expect(registerWidget).not.toHaveBeenCalled()
    })

    it('does not throw on fetch failure', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'))

      await expect(loadGeneratedModules()).resolves.not.toThrow()
    })
  })

  describe('saveGeneratedModule', () => {
    it('calls POST /api/generated-modules and registers the module', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ module: mockModule })

      const data = {
        name: 'Test Module',
        description: 'A test module',
        icon: 'Cube',
        source: mockModule.source,
        configSchema: mockModule.configSchema,
        defaultSize: mockModule.defaultSize,
      }

      const result = await saveGeneratedModule(data)

      expect(api.post).toHaveBeenCalledWith('/api/generated-modules', data)
      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'generated-test-mod-1' })
      )
      expect(result).toEqual(mockModule)
    })
  })

  describe('updateGeneratedModule', () => {
    it('calls PUT /api/generated-modules/:id and re-registers', async () => {
      const updated = { ...mockModule, version: 2, source: 'function GeneratedWidget() { return "v2" }' }
      vi.mocked(api.put).mockResolvedValueOnce({ module: updated })

      const data = { source: updated.source }
      const result = await updateGeneratedModule('test-mod-1', data)

      expect(api.put).toHaveBeenCalledWith('/api/generated-modules/test-mod-1', data)
      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'generated-test-mod-1',
          metadata: { author: 'Generated Module', version: '2' },
        })
      )
      expect(result).toEqual(updated)
    })
  })

  describe('deleteGeneratedModule', () => {
    it('calls DELETE /api/generated-modules/:id and unregisters', async () => {
      mockCreateObjectURL.mockReturnValueOnce('blob:delete-me')
      registerGeneratedModule(mockModule)
      vi.clearAllMocks()

      vi.mocked(api.del).mockResolvedValueOnce(undefined)

      await deleteGeneratedModule('test-mod-1')

      expect(api.del).toHaveBeenCalledWith('/api/generated-modules/test-mod-1')
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:delete-me')
    })
  })

  describe('toggleGeneratedModule', () => {
    it('registers module when enabled=true', async () => {
      vi.mocked(api.patch).mockResolvedValueOnce({ module: mockModule })

      const result = await toggleGeneratedModule('test-mod-1', true)

      expect(api.patch).toHaveBeenCalledWith('/api/generated-modules/test-mod-1/toggle', { enabled: true })
      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'generated-test-mod-1' })
      )
      expect(result).toEqual(mockModule)
    })

    it('unregisters module when enabled=false', async () => {
      mockCreateObjectURL.mockReturnValueOnce('blob:toggle-off')
      registerGeneratedModule(mockModule)
      vi.clearAllMocks()

      const disabledMod = { ...mockModule, enabled: false }
      vi.mocked(api.patch).mockResolvedValueOnce({ module: disabledMod })

      const result = await toggleGeneratedModule('test-mod-1', false)

      expect(api.patch).toHaveBeenCalledWith('/api/generated-modules/test-mod-1/toggle', { enabled: false })
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:toggle-off')
      expect(result).toEqual(disabledMod)
    })
  })

  describe('rollbackGeneratedModule', () => {
    it('calls POST /api/generated-modules/:id/rollback and re-registers', async () => {
      const rolledBack = { ...mockModule, version: 1, source: 'function GeneratedWidget() { return "v1" }' }
      vi.mocked(api.post).mockResolvedValueOnce({ module: rolledBack })

      const result = await rollbackGeneratedModule('test-mod-1', 1)

      expect(api.post).toHaveBeenCalledWith('/api/generated-modules/test-mod-1/rollback', { version: 1 })
      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'generated-test-mod-1' })
      )
      expect(result).toEqual(rolledBack)
    })
  })

  describe('getGeneratedModuleVersions', () => {
    it('calls GET /api/generated-modules/:id/versions', async () => {
      const versions = [
        { id: 'v1', moduleId: 'test-mod-1', version: 1, source: 'v1', configSchema: { fields: [] }, createdAt: '' },
      ]
      vi.mocked(api.get).mockResolvedValueOnce({ versions })

      const result = await getGeneratedModuleVersions('test-mod-1')

      expect(api.get).toHaveBeenCalledWith('/api/generated-modules/test-mod-1/versions')
      expect(result).toEqual(versions)
    })
  })

  describe('exposePrimitivesAPI', () => {
    it('sets window.__generatedModuleAPI global', () => {
      exposePrimitivesAPI()

      expect((window as any).__generatedModuleAPI).toBeDefined()
      expect(typeof (window as any).__generatedModuleAPI).toBe('object')
    })

    it('exposes React on the generated module runtime', () => {
      exposePrimitivesAPI()

      expect((window as any).__generatedModuleAPI.React).toBeDefined()
    })
  })
})
