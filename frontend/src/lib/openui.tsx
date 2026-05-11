import React from 'react'
import {
  Renderer,
  createLibrary,
  defineComponent,
  type ActionEvent,
  type OpenUIError,
} from '@openuidev/react-lang'
import { z } from 'zod/v4'
import { PRIMITIVE_COMPONENTS } from '@/components/primitives/register'

type PrimitiveName = keyof typeof PRIMITIVE_COMPONENTS

const colorSchema = z.enum(['accent', 'secondary', 'tertiary', 'red', 'amber']).optional()
const looseRecord = z.record(z.string(), z.unknown())

function primitiveComponent<T extends z.ZodObject>(
  name: PrimitiveName,
  props: T,
  description: string,
) {
  const Primitive = PRIMITIVE_COMPONENTS[name]
  return defineComponent({
    name,
    description,
    props,
    component: (componentProps: z.infer<T>) => (
      <div style={openUiPrimitiveFrameStyle}>
        <Primitive
          widgetId={`openui-${name}`}
          config={componentProps as Record<string, unknown>}
          isEditMode={false}
          size={{ w: 4, h: 3 }}
        />
      </div>
    ),
  })
}

export const clawOpenUiLibrary = createLibrary({
  root: 'MarkdownDisplay',
  components: [
    primitiveComponent(
      'StatCard',
      z.object({
        title: z.string().optional().describe('Short metric label'),
        value: z.string().optional().describe('Primary metric value'),
        unit: z.string().optional(),
        trend: z.enum(['up', 'down', 'flat']).optional(),
        color: colorSchema,
        data: z.array(z.number()).optional().describe('Optional sparkline values'),
      }),
      'Compact metric card with value, trend, and optional sparkline.',
    ),
    primitiveComponent(
      'ProgressGauge',
      z.object({
        label: z.string().optional(),
        value: z.number().optional(),
        max: z.number().optional(),
        variant: z.enum(['bar', 'circular']).optional(),
        color: colorSchema,
      }),
      'Progress indicator as a bar or circular gauge.',
    ),
    primitiveComponent(
      'MarkdownDisplay',
      z.object({
        content: z.string().describe('Markdown content to display'),
        maxHeight: z.number().optional(),
      }),
      'Sanitized markdown text panel.',
    ),
    primitiveComponent(
      'LineChart',
      z.object({
        title: z.string().optional(),
        data: z.array(z.number()).describe('At least two numeric data points'),
        labels: z.array(z.string()).optional(),
        lineColor: colorSchema,
        showGrid: z.boolean().optional(),
        showDots: z.boolean().optional(),
      }),
      'Line chart for a numeric series.',
    ),
    primitiveComponent(
      'BarChart',
      z.object({
        title: z.string().optional(),
        data: z.union([z.array(z.number()), z.array(z.array(z.number()))]).describe('Single or multi-series values'),
        labels: z.array(z.string()).optional(),
        orientation: z.enum(['vertical', 'horizontal']).optional(),
        stacked: z.boolean().optional(),
        barColor: colorSchema,
        colors: z.array(z.string()).optional(),
      }),
      'Bar chart for single or multi-series categorical data.',
    ),
    primitiveComponent(
      'ListView',
      z.object({
        title: z.string().optional(),
        pageSize: z.number().optional(),
        searchable: z.boolean().optional(),
        items: z.array(z.object({
          id: z.string(),
          label: z.string(),
          value: z.string().optional(),
          icon: z.string().optional(),
        })).optional(),
      }),
      'Sortable, searchable list of labeled items.',
    ),
    primitiveComponent(
      'DataTable',
      z.object({
        title: z.string().optional(),
        pageSize: z.number().optional(),
        striped: z.boolean().optional(),
        columns: z.array(z.object({
          key: z.string(),
          label: z.string(),
          sortable: z.boolean().optional(),
        })),
        rows: z.array(looseRecord),
      }),
      'Data table with sortable columns and pagination.',
    ),
    primitiveComponent(
      'FormWidget',
      z.object({
        title: z.string().optional(),
        submitLabel: z.string().optional(),
        fields: z.array(z.object({
          key: z.string(),
          label: z.string(),
          type: z.enum(['text', 'number', 'select', 'toggle', 'date']),
          default: z.unknown().optional(),
          options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
          required: z.boolean().optional(),
        })).optional(),
      }),
      'Schema-driven form for lightweight input capture.',
    ),
    primitiveComponent(
      'KanbanBoard',
      z.object({
        title: z.string().optional(),
        columns: z.array(z.object({
          id: z.string(),
          title: z.string(),
          color: z.string().optional(),
          items: z.array(z.object({
            id: z.string(),
            title: z.string(),
            description: z.string().optional(),
          })),
        })),
      }),
      'Column board with draggable cards.',
    ),
    primitiveComponent(
      'TimerCountdown',
      z.object({
        title: z.string().optional(),
        duration: z.number().optional(),
        direction: z.enum(['down', 'up']).optional(),
        autoStart: z.boolean().optional(),
        showMilliseconds: z.boolean().optional(),
      }),
      'Countdown or count-up timer.',
    ),
    primitiveComponent(
      'ImageGallery',
      z.object({
        columns: z.number().optional(),
        gap: z.number().optional(),
        images: z.array(z.object({
          src: z.string(),
          alt: z.string().optional(),
        })).optional(),
      }),
      'Grid image gallery with lightbox viewing.',
    ),
  ],
})

export function buildOpenUiLangSystemPrompt(): string {
  return clawOpenUiLibrary.prompt({
    preamble: 'You are an OpenUI Lang UI generator for ClawControl.',
    additionalRules: [
      'Only use components from the provided ClawControl library.',
      'Prefer compact dashboard-safe layouts.',
      'Do not use Query(), Mutation(), @Run, or external tools in this phase.',
      'When embedding inside ModuleProposal JSON, put the complete OpenUI Lang snippet in the openUiLang string field.',
    ],
    examples: [
      'root = StatCard("Today", "7", "tasks", "up", "accent")',
      'root = MarkdownDisplay("## Plan\\n- Draft\\n- Review\\n- Ship")',
    ],
  })
}

export function extractFencedOpenUiLangFromResponse(text: string): string | null {
  const fenced = text.match(/```(?:openui|openui-lang|oui)\s*\n([\s\S]*?)```/i)
  if (fenced?.[1]?.trim()) return fenced[1].trim()
  return null
}

export function extractOpenUiLangFromResponse(text: string): string | null {
  const fenced = extractFencedOpenUiLangFromResponse(text)
  if (fenced) return fenced

  const rootProgram = text.match(/(?:^|\n)\s*root\s*=\s*[A-Z][\s\S]*$/)
  if (rootProgram?.[0]?.trim()) return rootProgram[0].trim()

  const xmlish = text.match(/<([A-Z][A-Za-z0-9]*)\b[\s\S]*?\/?>/)
  if (xmlish?.[0]?.trim()) return xmlish[0].trim()

  const callish = text.match(/\b[A-Z][A-Za-z0-9]*\s*\([\s\S]*\)\s*$/)
  if (callish?.[0]?.trim()) return callish[0].trim()

  return null
}

export function compileOpenUiLangWidgetSource(openUiLang: string): string {
  return `function GeneratedWidget() {
  const runtime = window.__generatedModuleAPI || {}
  const React = runtime.React
  const OpenUiSnippet = runtime.OpenUiSnippet

  if (!React || !OpenUiSnippet) {
    return null
  }

  return React.createElement(OpenUiSnippet, { source: ${JSON.stringify(openUiLang)} })
}
`
}

export function OpenUiSnippet({
  source,
  isStreaming = false,
  onAction,
  onError,
}: {
  source: string
  isStreaming?: boolean
  onAction?: (event: ActionEvent) => void
  onError?: (errors: OpenUIError[]) => void
}) {
  if (!source.trim()) return null

  return (
    <div style={openUiSnippetStyle}>
      <Renderer
        response={source}
        library={clawOpenUiLibrary}
        isStreaming={isStreaming}
        onAction={onAction}
        onError={onError}
      />
    </div>
  )
}

const openUiSnippetStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  width: '100%',
}

const openUiPrimitiveFrameStyle: React.CSSProperties = {
  minHeight: '140px',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  background: 'var(--bg-card)',
  overflow: 'hidden',
}
