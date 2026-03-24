/** Usage data from GET /api/openclaw/usage */
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

/** Model info from GET /api/openclaw/models */
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
  data?: ModelInfo[] // LiteLLM uses "data" key
  [key: string]: unknown
}

/** Tool info from GET /api/openclaw/tools */
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

/** Tool invocation request */
export interface ToolInvokeRequest {
  tool: string
  args?: Record<string, unknown>
  dryRun?: boolean
}

/** Skill info from GET /api/openclaw/skills */
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
