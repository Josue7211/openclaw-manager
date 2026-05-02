/**
 * Shared types for generated module building and runtime.
 */

import type { WidgetConfigSchema } from './widget-registry'

// ---------------------------------------------------------------------------
// Module data model
// ---------------------------------------------------------------------------

export interface WidgetModule {
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

export type GeneratedModule = WidgetModule

export interface WidgetModuleVersion {
  id: string
  moduleId: string
  version: number
  source: string
  configSchema: WidgetConfigSchema
  createdAt: string
}

export type GeneratedModuleVersion = WidgetModuleVersion

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
// Generation state machine
// ---------------------------------------------------------------------------

export type ModuleGenerationState =
  | 'idle'
  | 'generating'
  | 'analyzing'
  | 'previewing'
  | 'approved'
  | 'rejected'

export type GenerationState = ModuleGenerationState
