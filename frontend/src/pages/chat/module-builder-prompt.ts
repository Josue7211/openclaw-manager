/**
 * OpenUI-style module builder system prompt and response utilities.
 *
 * Constructs the system prompt that tells the builder how to generate
 * structured dashboard widget proposals using the OpenUI-style primitives API.
 */

import { configSchema as statCardSchema } from '@/components/primitives/StatCard'
import { configSchema as progressGaugeSchema } from '@/components/primitives/ProgressGauge'
import { configSchema as markdownDisplaySchema } from '@/components/primitives/MarkdownDisplay'
import { configSchema as lineChartSchema } from '@/components/primitives/LineChart'
import { configSchema as barChartSchema } from '@/components/primitives/BarChart'
import { configSchema as listViewSchema } from '@/components/primitives/ListView'
import { configSchema as dataTableSchema } from '@/components/primitives/DataTable'
import { configSchema as formWidgetSchema } from '@/components/primitives/FormWidget'
import { configSchema as kanbanBoardSchema } from '@/components/primitives/KanbanBoard'
import { configSchema as timerCountdownSchema } from '@/components/primitives/TimerCountdown'
import { configSchema as imageGallerySchema } from '@/components/primitives/ImageGallery'

import {
  extractProposalFromResponse,
  type ModuleProposal,
} from '@/lib/module-proposals'
import { buildOpenUiLangSystemPrompt } from '@/lib/openui'

// ---------------------------------------------------------------------------
// Primitives registry for prompt
// ---------------------------------------------------------------------------

const PRIMITIVES = [
  { name: 'StatCard', schema: statCardSchema },
  { name: 'ProgressGauge', schema: progressGaugeSchema },
  { name: 'MarkdownDisplay', schema: markdownDisplaySchema },
  { name: 'LineChart', schema: lineChartSchema },
  { name: 'BarChart', schema: barChartSchema },
  { name: 'ListView', schema: listViewSchema },
  { name: 'DataTable', schema: dataTableSchema },
  { name: 'FormWidget', schema: formWidgetSchema },
  { name: 'KanbanBoard', schema: kanbanBoardSchema },
  { name: 'TimerCountdown', schema: timerCountdownSchema },
  { name: 'ImageGallery', schema: imageGallerySchema },
] as const

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds the full module-builder system prompt including identity, constraints,
 * all 11 primitive config schemas, and the expected response format.
 */
export function buildModuleBuilderSystemPrompt(): string {
  const primitiveDocs = PRIMITIVES.map(
    (p) => `### ${p.name}\n\`\`\`json\n${JSON.stringify(p.schema, null, 2)}\n\`\`\``
  ).join('\n\n')

  const openUiLangPrompt = buildOpenUiLangSystemPrompt()

  return `## Identity

You are the OpenUI module builder for clawctrl. You help users create structured module proposals for widgets, modules, panels, and pages.

## Task

Generate valid JSON matching the ModuleProposal shape below. If the user asks for one module, return one ModuleProposal object. If the user asks for multiple modules, return one JSON array of ModuleProposal objects. Each proposal will be previewed and, when installable, compiled into an installed dashboard widget through the OpenUI adapter layer.

## Constraints

- MUST generate valid OpenUI module proposal JSON
- SHOULD include an \`openUiLang\` string when the UI can be represented by OpenUI Lang
- MUST ensure any \`openUiLang\` uses only the OpenUI Lang component library below
- MAY set \`targetType\` to \`widget\`, \`module\`, \`panel\`, or \`page\`
- MAY set \`installTarget\` to \`dashboard\`, \`module-studio\`, \`category\`, or \`app-shell\`
- MUST treat \`widget\` + \`dashboard\` as an installable dashboard widget
- MUST treat \`page\`, \`module\`, or \`panel\` proposals as installable generated app pages in the current runtime
- If the user asks for a whole page, full page, app page, or module instead of a widget, MUST set \`targetType\` to \`page\` and \`installTarget\` to \`app-shell\`
- MUST use only the primitives listed below in \`tree.primitive\`
- MUST keep capabilities read-only in phase 1
- MUST keep actions limited to \`navigate\`, \`refresh\`, or \`open\`
- MUST NOT output executable code unless the user explicitly asks for fallback code
- MUST NOT invent backend endpoints or arbitrary runtime APIs
- MUST set \`backendContract.requested\` to true only when the proposal explicitly needs backend schema or query/mutation work
- MUST keep backend contract summaries concrete and short
- MUST include backend contract models, queries, and mutations only when \`backendContract.requested\` is true

## ModuleProposal Shape

\`\`\`typescript
type ModuleProposal = {
  id: string
  version: number
  title: string
  description: string
  userIntent: string
  targetType: 'widget' | 'module' | 'panel' | 'page'
  installTarget: 'dashboard' | 'module-studio' | 'category' | 'app-shell'
  category: string
  capabilities: string[]
  dataRequirements: Array<{
    key: string
    source: string
    query?: string
    shape: 'scalar' | 'list' | 'table' | 'timeseries' | 'markdown' | 'kanban'
    required: boolean
    description?: string
  }>
  actions: Array<{
    id: string
    type: 'navigate' | 'refresh' | 'open'
    label: string
    target?: string
    capability?: string
    description?: string
  }>
  layout: { w: number; h: number; minW?: number; minH?: number }
  tree: {
    primitive: string
    props: Record<string, unknown>
    children?: Array<...same shape...>
  }
  openUiLang?: string
  backendContract?: {
    requested: boolean
    summary: string
    models?: Array<{
      name: string
      fields: Array<{ name: string; type: string; required?: boolean }>
    }>
    queries?: Array<{
      name: string
      input?: Record<string, string>
      output: string
      description?: string
    }>
    mutations?: Array<{
      name: string
      input?: Record<string, string>
      effect: string
      description?: string
    }>
  }
  fallbackMessage?: string
  sourceModel?: string
  generator?: string
  createdAt: string
}
\`\`\`

## Available Primitives API

Each primitive name below is allowed in \`tree.primitive\`. Use its config schema to shape valid props.

${primitiveDocs}

## OpenUI Lang Component Library

${openUiLangPrompt}

## Response Format

Return only one \`\`\`json code fence containing either a valid \`ModuleProposal\` object or a JSON array of valid \`ModuleProposal\` objects. Do not include commentary before or after the JSON.

Example response format for an installable dashboard widget:
\`\`\`json
{
  "id": "weather-status",
  "version": 1,
  "title": "Weather Status",
  "description": "Compact current weather widget for the dashboard.",
  "userIntent": "Show current weather at a glance.",
  "targetType": "widget",
  "installTarget": "dashboard",
  "category": "status",
  "capabilities": ["read.pipeline"],
  "dataRequirements": [],
  "actions": [],
  "layout": { "w": 3, "h": 2 },
  "tree": {
    "primitive": "StatCard",
    "props": {
      "title": "Weather",
      "value": "72°",
      "subtitle": "Sunny"
    }
  },
  "openUiLang": "root = StatCard(\\"Weather\\", \\"72°\\", \\"Sunny\\", \\"flat\\", \\"accent\\")",
  "createdAt": "2026-04-10T00:00:00.000Z"
}
\`\`\`

Example response format for an installable generated page:
\`\`\`json
{
  "id": "trainer-social-os-page",
  "version": 1,
  "title": "Trainer Social OS",
  "description": "Full page workspace for planning and tracking trainer content.",
  "userIntent": "Create a whole page for trainer social operations.",
  "targetType": "page",
  "installTarget": "app-shell",
  "category": "productivity",
  "capabilities": [],
  "dataRequirements": [],
  "actions": [],
  "layout": { "w": 6, "h": 6 },
  "tree": {
    "primitive": "MarkdownDisplay",
    "props": {
      "title": "Trainer Social OS",
      "content": "## Content Pipeline\\n- Ideas\\n- Drafts\\n- Scheduled posts"
    }
  },
  "openUiLang": "root = MarkdownDisplay(\\"## Content Pipeline\\\\n- Ideas\\\\n- Drafts\\\\n- Scheduled posts\\")",
  "createdAt": "2026-04-10T00:00:00.000Z"
}
\`\`\`
`
}

// ---------------------------------------------------------------------------
// Code extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the first javascript/jsx/tsx code fence from the model response.
 * Returns null if no code fence is found.
 */
export function extractCodeFromResponse(text: string): string | null {
  // Match ```javascript, ```jsx, ```tsx, or plain ``` code fences
  const match = text.match(/```(?:javascript|jsx|tsx|js)?\s*\n([\s\S]*?)```/)
  if (!match || !match[1]) return null
  return match[1].trim()
}

export function extractModuleProposal(text: string): ModuleProposal | null {
  return extractProposalFromResponse(text)
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------

/**
 * Attempts to parse a module name and description from the model's
 * conversational text. Looks for patterns like "Here's a Weather module"
 * or "I've created a Todo Tracker". Falls back to defaults.
 */
export function extractModuleMetadata(text: string): { name: string; description: string } {
  // Try patterns like "Here's a **Name** module" or "Here's a Name module"
  const patterns = [
    /(?:here'?s|i'?ve created|introducing)\s+(?:a|an|the)\s+\*\*([^*]+)\*\*/i,
    /(?:here'?s|i'?ve created|introducing)\s+(?:a|an|the)\s+([A-Z][A-Za-z0-9 ]+?)(?:\s+module|\s+widget|\s+component|\.|\n)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const name = match[1].trim()
      // Extract first sentence before code fence as description
      const descMatch = text.match(/^([^`]+?)(?:\n\n|```)/s)
      const description = descMatch ? descMatch[1].replace(/\*\*/g, '').trim().slice(0, 200) : ''
      return { name, description }
    }
  }

  return { name: 'Generated Module', description: '' }
}
