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

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake-blob-url')
const mockRevokeObjectURL = vi.fn()
globalThis.URL.createObjectURL = mockCreateObjectURL
globalThis.URL.revokeObjectURL = mockRevokeObjectURL

import { api } from '@/lib/api'
import { registerWidget } from '@/lib/widget-registry'
import {
  wrapAsESModule,
  registerBjornModule,
  unregisterBjornModule,
  loadBjornModules,
  saveBjornModule,
  updateBjornModule,
  deleteBjornModule,
  toggleBjornModule,
  rollbackBjornModule,
  getBjornVersions,
  exposePrimitivesAPI,
  _resetForTesting,
} from '../bjorn-store'

import type { BjornModule } from '../bjorn-types'

const mockModule: BjornModule = {
  id: 'test-mod-1',
  userId: 'user-1',
  name: 'Test Module',
  description: 'A test module',
  icon: 'Cube',
  source: 'function BjornWidget(props) { return null }',
  configSchema: { fields: [] },
  defaultSize: { w: 3, h: 3 },
  version: 1,
  enabled: true,
  createdAt: '2026-03-21T00:00:00Z',
  updatedAt: '2026-03-21T00:00:00Z',
  deletedAt: null,
}

describe('bjorn-store', () => {
  beforeEach(() => {
    _resetForTesting()
    vi.clearAllMocks()
    mockCreateObjectURL.mockReturnValue('blob:http://localhost/fake-blob-url')
  })

  describe('wrapAsESModule', () => {
    it('appends export default BjornWidget statement', () => {
      const source = 'function BjornWidget(props) { return null }'
      const result = wrapAsESModule(source)
      expect(result).toContain(source)
      expect(result).toContain('export default BjornWidget;')
    })

    it('preserves original source code', () => {
      const source = 'const x = 1;\nfunction BjornWidget() { return x }'
      const result = wrapAsESModule(source)
      expect(result.startsWith(source)).toBe(true)
    })
  })

  describe('registerBjornModule', () => {
    it('calls registerWidget with correct tier, category, and id', () => {
      registerBjornModule(mockModule)

      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'bjorn-test-mod-1',
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
      registerBjornModule(mockModule)

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1)
      const blobArg = mockCreateObjectURL.mock.calls[0][0]
      expect(blobArg).toBeInstanceOf(Blob)
      expect(blobArg.type).toBe('application/javascript')
    })

    it('revokes old blob URL on re-register', () => {
      mockCreateObjectURL.mockReturnValueOnce('blob:old-url')
      registerBjornModule(mockModule)
      expect(mockRevokeObjectURL).not.toHaveBeenCalled()

      mockCreateObjectURL.mockReturnValueOnce('blob:new-url')
      registerBjornModule(mockModule)
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:old-url')
    })

    it('includes metadata with author and version', () => {
      registerBjornModule(mockModule)

      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { author: 'Bjorn', version: '1' },
        })
      )
    })

    it('provides a component function for lazy loading', () => {
      registerBjornModule(mockModule)

      const call = vi.mocked(registerWidget).mock.calls[0][0]
      expect(typeof call.component).toBe('function')
    })
  })

  describe('unregisterBjornModule', () => {
    it('revokes blob URL if module was registered', () => {
      mockCreateObjectURL.mockReturnValueOnce('blob:to-revoke')
      registerBjornModule(mockModule)
      unregisterBjornModule(mockModule.id)
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:to-revoke')
    })

    it('does nothing if module was not registered', () => {
      unregisterBjornModule('nonexistent')
      expect(mockRevokeObjectURL).not.toHaveBeenCalled()
    })
  })

  describe('loadBjornModules', () => {
    it('fetches modules from /api/bjorn/modules and registers enabled ones', async () => {
      const disabledModule = { ...mockModule, id: 'disabled-1', enabled: false }
      vi.mocked(api.get).mockResolvedValueOnce({
        modules: [mockModule, disabledModule],
      })

      await loadBjornModules()

      expect(api.get).toHaveBeenCalledWith('/api/bjorn/modules')
      expect(registerWidget).toHaveBeenCalledTimes(1)
      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'bjorn-test-mod-1' })
      )
    })

    it('skips disabled modules', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        modules: [{ ...mockModule, enabled: false }],
      })

      await loadBjornModules()

      expect(registerWidget).not.toHaveBeenCalled()
    })

    it('does not throw on fetch failure', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'))

      await expect(loadBjornModules()).resolves.not.toThrow()
    })
  })

  describe('saveBjornModule', () => {
    it('calls POST /api/bjorn/modules and registers the module', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ module: mockModule })

      const data = {
        name: 'Test Module',
        description: 'A test module',
        icon: 'Cube',
        source: mockModule.source,
        configSchema: mockModule.configSchema,
        defaultSize: mockModule.defaultSize,
      }

      const result = await saveBjornModule(data)

      expect(api.post).toHaveBeenCalledWith('/api/bjorn/modules', data)
      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'bjorn-test-mod-1' })
      )
      expect(result).toEqual(mockModule)
    })
  })

  describe('updateBjornModule', () => {
    it('calls PUT /api/bjorn/modules/:id and re-registers', async () => {
      const updated = { ...mockModule, version: 2, source: 'function BjornWidget() { return "v2" }' }
      vi.mocked(api.put).mockResolvedValueOnce({ module: updated })

      const data = { source: updated.source }
      const result = await updateBjornModule('test-mod-1', data)

      expect(api.put).toHaveBeenCalledWith('/api/bjorn/modules/test-mod-1', data)
      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'bjorn-test-mod-1',
          metadata: { author: 'Bjorn', version: '2' },
        })
      )
      expect(result).toEqual(updated)
    })
  })

  describe('deleteBjornModule', () => {
    it('calls DELETE /api/bjorn/modules/:id and unregisters', async () => {
      mockCreateObjectURL.mockReturnValueOnce('blob:delete-me')
      registerBjornModule(mockModule)
      vi.clearAllMocks()

      vi.mocked(api.del).mockResolvedValueOnce(undefined)

      await deleteBjornModule('test-mod-1')

      expect(api.del).toHaveBeenCalledWith('/api/bjorn/modules/test-mod-1')
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:delete-me')
    })
  })

  describe('toggleBjornModule', () => {
    it('registers module when enabled=true', async () => {
      vi.mocked(api.patch).mockResolvedValueOnce({ module: mockModule })

      const result = await toggleBjornModule('test-mod-1', true)

      expect(api.patch).toHaveBeenCalledWith('/api/bjorn/modules/test-mod-1/toggle', { enabled: true })
      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'bjorn-test-mod-1' })
      )
      expect(result).toEqual(mockModule)
    })

    it('unregisters module when enabled=false', async () => {
      mockCreateObjectURL.mockReturnValueOnce('blob:toggle-off')
      registerBjornModule(mockModule)
      vi.clearAllMocks()

      const disabledMod = { ...mockModule, enabled: false }
      vi.mocked(api.patch).mockResolvedValueOnce({ module: disabledMod })

      const result = await toggleBjornModule('test-mod-1', false)

      expect(api.patch).toHaveBeenCalledWith('/api/bjorn/modules/test-mod-1/toggle', { enabled: false })
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:toggle-off')
      expect(result).toEqual(disabledMod)
    })
  })

  describe('rollbackBjornModule', () => {
    it('calls POST /api/bjorn/modules/:id/rollback and re-registers', async () => {
      const rolledBack = { ...mockModule, version: 1, source: 'function BjornWidget() { return "v1" }' }
      vi.mocked(api.post).mockResolvedValueOnce({ module: rolledBack })

      const result = await rollbackBjornModule('test-mod-1', 1)

      expect(api.post).toHaveBeenCalledWith('/api/bjorn/modules/test-mod-1/rollback', { version: 1 })
      expect(registerWidget).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'bjorn-test-mod-1' })
      )
      expect(result).toEqual(rolledBack)
    })
  })

  describe('getBjornVersions', () => {
    it('calls GET /api/bjorn/modules/:id/versions', async () => {
      const versions = [
        { id: 'v1', moduleId: 'test-mod-1', version: 1, source: 'v1', configSchema: { fields: [] }, createdAt: '' },
      ]
      vi.mocked(api.get).mockResolvedValueOnce({ versions })

      const result = await getBjornVersions('test-mod-1')

      expect(api.get).toHaveBeenCalledWith('/api/bjorn/modules/test-mod-1/versions')
      expect(result).toEqual(versions)
    })
  })

  describe('exposePrimitivesAPI', () => {
    it('sets window.__bjornAPI global', () => {
      exposePrimitivesAPI()

      expect((window as any).__bjornAPI).toBeDefined()
      expect(typeof (window as any).__bjornAPI).toBe('object')
    })
  })
})
