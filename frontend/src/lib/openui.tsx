import React from 'react'
import {
  Renderer,
  createLibrary,
  defineComponent,
  type ActionEvent,
  type ComponentRenderProps,
  type OpenUIError,
} from '@openuidev/react-lang'
import { z } from 'zod/v4'
import { PRIMITIVE_COMPONENTS } from '@/components/primitives/register'

type PrimitiveName = keyof typeof PRIMITIVE_COMPONENTS

const colorSchema = z.enum(['accent', 'secondary', 'tertiary', 'red', 'amber']).optional()
const looseRecord = z.record(z.string(), z.unknown())
const childrenSchema = z.array(z.unknown()).optional()

function accentColor(color?: z.infer<typeof colorSchema>) {
  switch (color) {
    case 'red':
      return 'var(--red)'
    case 'amber':
      return 'var(--amber)'
    case 'secondary':
    case 'tertiary':
    default:
      return 'var(--accent)'
  }
}

function primitiveComponent<T extends z.ZodObject>(name: PrimitiveName, props: T, description: string) {
  const Primitive = PRIMITIVE_COMPONENTS[name]
  return defineComponent({
    name,
    description,
    props,
    component: ({ props: componentProps }: ComponentRenderProps<z.infer<T>>) => (
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
  root: 'Stack',
  components: [
    defineComponent({
      name: 'Stack',
      description: 'Flexible vertical or horizontal layout container for composing generated UI.',
      props: z.object({
        children: childrenSchema.describe('Child components to render inside the stack.'),
        direction: z.enum(['column', 'row']).optional(),
        gap: z.number().optional(),
        padding: z.number().optional(),
        align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
        justify: z.enum(['start', 'center', 'end', 'between']).optional(),
        wrap: z.boolean().optional(),
      }),
      component: ({ props, renderNode }: ComponentRenderProps<{
        children?: unknown[]
        direction?: 'column' | 'row'
        gap?: number
        padding?: number
        align?: 'start' | 'center' | 'end' | 'stretch'
        justify?: 'start' | 'center' | 'end' | 'between'
        wrap?: boolean
      }>) => (
        <div
          style={{
            display: 'flex',
            flexDirection: props.direction || 'column',
            flexWrap: (props.wrap ?? props.direction === 'row') ? 'wrap' : 'nowrap',
            gap: props.gap ?? 10,
            padding: props.padding ?? 0,
            alignItems: props.align === 'start' ? 'flex-start' : props.align === 'end' ? 'flex-end' : props.align || 'stretch',
            justifyContent: props.justify === 'between' ? 'space-between' : props.justify === 'start' ? 'flex-start' : props.justify === 'end' ? 'flex-end' : props.justify || 'flex-start',
            width: '100%',
            minWidth: 0,
          }}
        >
          {renderNode(props.children || [])}
        </div>
      ),
    }),
    defineComponent({
      name: 'Card',
      description: 'Polished generated UI card with optional title, subtitle, icon, body, child layout, and accent rail.',
      props: z.object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        icon: z.string().optional(),
        body: z.string().optional(),
        color: colorSchema,
        children: childrenSchema,
      }),
      component: ({ props, renderNode }: ComponentRenderProps<{
        title?: string
        subtitle?: string
        icon?: string
        body?: string
        color?: z.infer<typeof colorSchema>
        children?: unknown[]
      }>) => {
        const iconText = props.icon?.trim()
        const compactIcon = iconText && (iconText.length <= 2 || /\p{Extended_Pictographic}/u.test(iconText))
          ? iconText
          : ''
        return (
          <section
            style={{
              width: '100%',
              minWidth: 0,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-card-solid)',
              overflow: 'hidden',
              wordBreak: 'normal',
              overflowWrap: 'normal',
            }}
          >
            <div style={{ height: 3, background: accentColor(props.color) }} />
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(props.title || props.subtitle || compactIcon) && (
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', minWidth: 0 }}>
                  {compactIcon && (
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                        background: 'var(--bg-white-08)',
                        color: accentColor(props.color),
                        fontSize: compactIcon.length > 1 ? 10 : 16,
                        lineHeight: 1,
                        fontWeight: 900,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {compactIcon}
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {props.title && <div style={{ fontSize: 15, lineHeight: 1.25, fontWeight: 800, color: 'var(--text-primary)', wordBreak: 'normal', overflowWrap: 'break-word', hyphens: 'none' }}>{props.title}</div>}
                    {props.subtitle && <div style={{ fontSize: 12, lineHeight: 1.35, color: 'var(--text-muted)', marginTop: 3, wordBreak: 'normal', overflowWrap: 'break-word', hyphens: 'none' }}>{props.subtitle}</div>}
                  </div>
                </div>
              )}
              {props.body && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--text-secondary)', wordBreak: 'normal', overflowWrap: 'break-word', hyphens: 'none' }}>{props.body}</p>}
              {renderNode(props.children || [])}
            </div>
          </section>
        )
      },
    }),
    defineComponent({
      name: 'Text',
      description: 'Short generated UI text, heading, label, or muted helper copy.',
      props: z.object({
        content: z.string().describe('Text to display.'),
        variant: z.enum(['title', 'subtitle', 'body', 'label', 'muted']).optional(),
      }),
      component: ({ props }: ComponentRenderProps<{ content: string; variant?: 'title' | 'subtitle' | 'body' | 'label' | 'muted' }>) => {
        const variant = props.variant || 'body'
        const styleByVariant: Record<string, React.CSSProperties> = {
          title: { fontSize: 18, fontWeight: 850, color: 'var(--text-primary)', lineHeight: 1.15 },
          subtitle: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 },
          body: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 },
          label: { fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0 },
          muted: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 },
        }
        return <div style={{ margin: 0, minWidth: 0, wordBreak: 'normal', overflowWrap: 'break-word', hyphens: 'none', ...styleByVariant[variant] }}>{props.content}</div>
      },
    }),
    defineComponent({
      name: 'Badge',
      description: 'Small status badge or tag.',
      props: z.object({
        label: z.string(),
        color: colorSchema,
      }),
      component: ({ props }: ComponentRenderProps<{ label: string; color?: z.infer<typeof colorSchema> }>) => (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 22,
            padding: '0 8px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--bg-white-04)',
            color: accentColor(props.color),
            fontSize: 11,
            fontWeight: 800,
            width: 'fit-content',
          }}
        >
          {props.label}
        </span>
      ),
    }),
    defineComponent({
      name: 'Checklist',
      description: 'Compact checklist for generated plans, tasks, rules, and next steps.',
      props: z.object({
        title: z.string().optional(),
        items: z.array(z.object({
          label: z.string(),
          done: z.boolean().optional(),
          detail: z.string().optional(),
        })),
      }),
      component: ({ props }: ComponentRenderProps<{ title?: string; items: Array<{ label: string; done?: boolean; detail?: string }> }>) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          {props.title && <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0 }}>{props.title}</div>}
          {props.items.map((item, index) => (
            <div key={`${item.label}-${index}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--text-secondary)' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: item.done ? 'var(--green)' : 'var(--accent)',
                  marginTop: 6,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: 1.35, color: 'var(--text-primary)' }}>{item.label}</div>
                {item.detail && <div style={{ fontSize: 12, lineHeight: 1.35, color: 'var(--text-muted)', marginTop: 2 }}>{item.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      ),
    }),
    defineComponent({
      name: 'Metric',
      description: 'A compact labeled metric for dashboard-style generated UI.',
      props: z.object({
        label: z.string(),
        value: z.string(),
        detail: z.string().optional(),
        color: colorSchema,
      }),
      component: ({ props }: ComponentRenderProps<{ label: string; value: string; detail?: string; color?: z.infer<typeof colorSchema> }>) => (
        <div style={{ minWidth: 0, border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--bg-panel)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0 }}>{props.label}</div>
          <div style={{ fontSize: 22, lineHeight: 1.1, color: accentColor(props.color), fontWeight: 850, marginTop: 5 }}>{props.value}</div>
          {props.detail && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{props.detail}</div>}
        </div>
      ),
    }),
    defineComponent({
      name: 'Progress',
      description: 'Small progress bar for generated UI.',
      props: z.object({
        label: z.string().optional(),
        value: z.number(),
        max: z.number().optional(),
        color: colorSchema,
      }),
      component: ({ props }: ComponentRenderProps<{ label?: string; value: number; max?: number; color?: z.infer<typeof colorSchema> }>) => {
        const max = props.max && props.max > 0 ? props.max : 100
        const pct = Math.max(0, Math.min(100, (props.value / max) * 100))
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            {props.label && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{props.label}</div>}
            <div style={{ height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--bg-white-04)', border: '1px solid var(--border)' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: accentColor(props.color) }} />
            </div>
          </div>
        )
      },
    }),
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
        items: z
          .array(
            z.object({
              id: z.string(),
              label: z.string(),
              value: z.string().optional(),
              icon: z.string().optional(),
            }),
          )
          .optional(),
      }),
      'Sortable, searchable list of labeled items.',
    ),
    primitiveComponent(
      'DataTable',
      z.object({
        title: z.string().optional(),
        pageSize: z.number().optional(),
        striped: z.boolean().optional(),
        columns: z.array(
          z.object({
            key: z.string(),
            label: z.string(),
            sortable: z.boolean().optional(),
          }),
        ),
        rows: z.array(looseRecord),
      }),
      'Data table with sortable columns and pagination.',
    ),
    primitiveComponent(
      'FormWidget',
      z.object({
        title: z.string().optional(),
        submitLabel: z.string().optional(),
        fields: z
          .array(
            z.object({
              key: z.string(),
              label: z.string(),
              type: z.enum(['text', 'number', 'select', 'toggle', 'date']),
              default: z.unknown().optional(),
              options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
              required: z.boolean().optional(),
            }),
          )
          .optional(),
      }),
      'Schema-driven form for lightweight input capture.',
    ),
    primitiveComponent(
      'KanbanBoard',
      z.object({
        title: z.string().optional(),
        columns: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            color: z.string().optional(),
            items: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                description: z.string().optional(),
              }),
            ),
          }),
        ),
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
        images: z
          .array(
            z.object({
              src: z.string(),
              alt: z.string().optional(),
            }),
          )
          .optional(),
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
      'Prefer composed generated UI using Stack, Card, Text, Badge, Checklist, Metric, and Progress.',
      'Use MarkdownDisplay only for markdown-heavy prose; do not use MarkdownDisplay as the default for visual UI.',
      'Prefer compact dashboard-safe layouts that fit a right-side assistant drawer.',
      'Use the app accent by default. Use red or amber only for warnings/errors; do not use secondary or tertiary as decorative color themes.',
      'For Card icons, pass only a short symbol or leave icon empty. Do not pass words like Calendar or Target as icons.',
      'Do not render Save, Apply, Install, or Undo buttons inside generated UI; the host app controls preview persistence.',
      'Do not use Query(), Mutation(), @Run, or external tools in this phase.',
      'When embedding inside ModuleProposal JSON, put the complete OpenUI Lang snippet in the openUiLang string field.',
    ],
    examples: [
      'root = Stack([Card("Today", "Focus plan", "Focus", "Ship one meaningful task", "accent", [Metric("Time block", "90m", "Deep work", "accent"), Checklist("Rules", [{"label":"No context switching"},{"label":"Review before done"}])])])',
      'root = Stack([Text("Launch plan", "title"), Card("Next steps", "Keep it tight", "Done", "", "accent", [Checklist("Plan", [{"label":"Draft"},{"label":"Review"},{"label":"Ship"}])])])',
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
  wordBreak: 'normal',
  overflowWrap: 'normal',
}

const openUiPrimitiveFrameStyle: React.CSSProperties = {
  minHeight: '140px',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  background: 'var(--bg-card)',
  overflow: 'hidden',
}
