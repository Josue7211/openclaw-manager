/**
 * Shared types for the Bjorn Module Builder.
 *
 * Used across: static analysis, sandbox builder, bjorn-store, preview, and chat tab.
 */

import type { WidgetConfigSchema } from './widget-registry'

// ---------------------------------------------------------------------------
// Module data model
// ---------------------------------------------------------------------------

export interface BjornModule {
  id: string
  userId: string
  name: string
  description: string
  icon: string
  source: string
  configSchema: WidgetConfigSchema
  defaultSize: { w: number; h: number }
  version: number
  enabled: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface BjornModuleVersion {
  id: string
  moduleId: string
  version: number
  source: string
  configSchema: WidgetConfigSchema
  createdAt: string
}

// ---------------------------------------------------------------------------
// Static analysis
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  safe: boolean
  violations: Array<{
    pattern: string
    line: number
    snippet: string
  }>
}

// ---------------------------------------------------------------------------
// Data bridge (postMessage protocol)
// ---------------------------------------------------------------------------

export interface BridgeRequest {
  type: 'data-request'
  requestId: string
  source: string
  command: string
  args?: Record<string, unknown>
}

export interface BridgeResponse {
  type: 'data-response' | 'data-error'
  requestId: string
  data?: unknown
  error?: string
}

// ---------------------------------------------------------------------------
// Generation state machine
// ---------------------------------------------------------------------------

export type BjornGenerationState =
  | 'idle'
  | 'generating'
  | 'analyzing'
  | 'previewing'
  | 'approved'
  | 'rejected'
