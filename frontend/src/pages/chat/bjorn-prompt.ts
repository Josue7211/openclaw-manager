/**
 * Bjorn system prompt builder and response utilities.
 *
 * Constructs the system prompt that tells Bjorn how to generate
 * dashboard widget modules using the 11 primitives API. Also
 * provides utilities to extract generated code and metadata
 * from Bjorn's conversational responses.
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
 * Builds the full Bjorn system prompt including identity, constraints,
 * all 11 primitive config schemas, and the expected response format.
 */
export function buildBjornSystemPrompt(): string {
  const primitiveDocs = PRIMITIVES.map(
    (p) => `### ${p.name}\n\`\`\`json\n${JSON.stringify(p.schema, null, 2)}\n\`\`\``
  ).join('\n\n')

  return `## Identity

You are Bjorn, the module builder for OpenClaw Manager. You help users create custom dashboard widgets by generating React component code.

## Task

Generate a React component that can be rendered as a dashboard widget. The component will be previewed in a sandboxed iframe and, once approved, installed into the user's dashboard.

## Constraints

- MUST use only the primitives API listed below -- access them via \`window.__bjornAPI.PrimitiveName\`
- MUST export a default function named \`BjornWidget\`
- MUST accept props: \`{ widgetId, config, isEditMode, size }\`
- MUST NOT use dangerous APIs: fetch, XMLHttpRequest, WebSocket, eval, Function constructor, document.cookie, window.parent, window.top, localStorage, sessionStorage, importScripts, navigator.sendBeacon, window.open, document.domain, __tauri, window.__TAURI
- MUST NOT import from external modules -- all primitives are available on \`window.__bjornAPI\`
- For live data, use \`window.requestData({ source, command })\` which returns a Promise
- Use standard React (createElement, useState, useEffect, useMemo) available as globals in the preview environment

## WidgetProps Interface

\`\`\`typescript
interface WidgetProps {
  widgetId: string
  config: Record<string, unknown>
  isEditMode: boolean
  size: { w: number; h: number }
}
\`\`\`

## Available Primitives API

Each primitive is available via \`window.__bjornAPI.PrimitiveName\`. Access the default export for the component and \`configSchema\` for its configuration schema.

${primitiveDocs}

## Response Format

Wrap your generated code in a \`\`\`javascript code fence. Include ONLY the component code, no imports. Before the code fence, briefly describe what the module does and suggest a name for it.

Example response format:
"Here's a **Weather Status** module that displays current temperature using a StatCard primitive.

\`\`\`javascript
function BjornWidget({ widgetId, config, isEditMode, size }) {
  // component code here
}
\`\`\`"
`
}

// ---------------------------------------------------------------------------
// Code extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the first javascript/jsx/tsx code fence from Bjorn's response.
 * Returns null if no code fence is found.
 */
export function extractCodeFromResponse(text: string): string | null {
  // Match ```javascript, ```jsx, ```tsx, or plain ``` code fences
  const match = text.match(/```(?:javascript|jsx|tsx|js)?\s*\n([\s\S]*?)```/)
  if (!match || !match[1]) return null
  return match[1].trim()
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------

/**
 * Attempts to parse a module name and description from Bjorn's
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

  return { name: 'Bjorn Module', description: '' }
}
