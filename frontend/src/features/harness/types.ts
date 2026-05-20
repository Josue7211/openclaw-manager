export interface UsageData {
  total_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
  total_cost?: number
  models?: ModelUsage[]
  period?: string
  daily?: Array<{ date: string; tokens: number; cost: number }>
  [key: string]: unknown
}

export interface ModelUsage {
  model: string
  tokens?: number
  cost?: number
  requests?: number
}

export interface ModelInfo {
  id: string
  name?: string
  provider?: string
  max_tokens?: number
  input_cost_per_token?: number
  output_cost_per_token?: number
  [key: string]: unknown
}

export interface ModelsResponse {
  models?: ModelInfo[]
  data?: ModelInfo[]
  [key: string]: unknown
}

export interface ToolInfo {
  name: string
  description?: string
  enabled?: boolean
  category?: string
  [key: string]: unknown
}

export interface ToolsResponse {
  tools?: ToolInfo[]
  [key: string]: unknown
}

export interface ToolInvokeRequest {
  tool: string
  args?: Record<string, unknown>
  dryRun?: boolean
}

export interface SkillInfo {
  name: string
  description?: string
  version?: string
  enabled: boolean
  [key: string]: unknown
}

export interface SkillsResponse {
  skills?: SkillInfo[]
  [key: string]: unknown
}
