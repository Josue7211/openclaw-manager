import type { GeneratedModule } from './generated-module-types'

export type ProposalTarget = 'widget' | 'module' | 'panel' | 'page'
export type InstallTarget = 'dashboard' | 'module-studio' | 'category' | 'app-shell'

export type ModuleCapability =
  | 'read.todos'
  | 'read.missions'
  | 'read.memory'
  | 'read.knowledge'
  | 'read.pipeline'
  | 'write.todos'
  | 'write.missions'
  | 'write.memory'
  | 'open.chat'
  | 'open.notes'
  | 'open.module'
  | 'refresh.data'

export type DataShape =
  | 'scalar'
  | 'list'
  | 'table'
  | 'timeseries'
  | 'markdown'
  | 'kanban'

export interface DataRequirement {
  key: string
  source: string
  query?: string
  shape: DataShape
  required: boolean
  description?: string
}

export type ModuleActionType = 'navigate' | 'refresh' | 'mutation' | 'open'

export interface ModuleAction {
  id: string
  type: ModuleActionType
  label: string
  target?: string
  command?: string
  capability?: ModuleCapability
  description?: string
}

export interface PrimitiveNode {
  primitive: string
  props: Record<string, unknown>
  children?: PrimitiveNode[]
}

export type OpenUiNode = PrimitiveNode

export interface BackendContractField {
  name: string
  type: string
  required?: boolean
}

export interface BackendContractModel {
  name: string
  fields: BackendContractField[]
}

export interface BackendContractQuery {
  name: string
  input?: Record<string, string>
  output: string
  description?: string
}

export interface BackendContractMutation {
  name: string
  input?: Record<string, string>
  effect: string
  description?: string
}

export interface BackendContract {
  requested: boolean
  summary: string
  models?: BackendContractModel[]
  queries?: BackendContractQuery[]
  mutations?: BackendContractMutation[]
}

export interface ModuleLayoutHint {
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

export interface ModuleProposal {
  id: string
  version: number
  title: string
  description: string
  userIntent: string
  targetType: ProposalTarget
  installTarget: InstallTarget
  category: string
  capabilities: ModuleCapability[]
  dataRequirements: DataRequirement[]
  actions: ModuleAction[]
  layout: ModuleLayoutHint
  tree: PrimitiveNode
  backendContract?: BackendContract
  fallbackMessage?: string
  sourceModel?: string
  generator?: string
  createdAt: string
}

export function isInstallableModuleProposal(proposal: ModuleProposal): boolean {
  return (
    proposal.targetType === 'widget' &&
    proposal.installTarget === 'dashboard' &&
    !proposal.backendContract?.requested
  )
}

function toSourceLiteral(value: unknown): string {
  if (value === undefined) return 'undefined'
  return JSON.stringify(value, null, 2)
}

function compilePrimitiveNode(node: PrimitiveNode): string {
  const children = Array.isArray(node.children) ? node.children : []
  const childSource = children.map(compilePrimitiveNode).join(', ')
  return `renderPrimitive(${toSourceLiteral(node.primitive)}, ${toSourceLiteral(node.props || {})}${childSource ? `, ${childSource}` : ''})`
}

export function compileOpenUiProposalSource(proposal: ModuleProposal): string {
  const rootTree = compilePrimitiveNode(proposal.tree)
  return `function GeneratedWidget({ widgetId, config, isEditMode, size }) {
  const runtime = window.__generatedModuleAPI || {}
  const React = runtime.React

  function renderPrimitive(name, props, ...children) {
    if (!React || typeof React.createElement !== 'function') {
      return null
    }

    const Primitive = runtime[name]
    if (!Primitive) {
      return React.createElement(
        'div',
        {
          style: {
            padding: 12,
            borderRadius: 12,
            border: '1px solid var(--border, rgba(255,255,255,0.12))',
            background: 'var(--bg-card, rgba(255,255,255,0.04))',
            color: 'var(--text-primary, #fff)',
            fontSize: 12,
            fontFamily: 'monospace'
          }
        },
        'Unknown primitive: ' + name
      )
    }

    return React.createElement(Primitive, props || {}, ...(children || []))
  }

  return ${rootTree}
}
`
}

export const compileOpenUiWidgetSource = compileOpenUiProposalSource
export const compileProposalToWidgetSource = compileOpenUiProposalSource

export function proposalToGeneratedModule(
  proposal: ModuleProposal,
): Pick<GeneratedModule, 'name' | 'description' | 'source' | 'configSchema' | 'defaultSize'> {
  return {
    name: proposal.title,
    description: proposal.description,
    source: compileOpenUiProposalSource(proposal),
    configSchema: { fields: [] },
    defaultSize: {
      w: proposal.layout.w,
      h: proposal.layout.h,
    },
  }
}

function tryParseJsonObject(raw: string): ModuleProposal | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as ModuleProposal
  } catch {
    return null
  }
}

function proposalsFromParsed(parsed: unknown): ModuleProposal[] {
  if (Array.isArray(parsed)) return parsed.filter(item => item && typeof item === 'object') as ModuleProposal[]
  if (parsed && typeof parsed === 'object') {
    const maybeWrapper = parsed as { proposals?: unknown }
    if (Array.isArray(maybeWrapper.proposals)) {
      return maybeWrapper.proposals.filter(item => item && typeof item === 'object') as ModuleProposal[]
    }
    return [parsed as ModuleProposal]
  }
  return []
}

function tryParseProposals(raw: string): ModuleProposal[] {
  try {
    return proposalsFromParsed(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

export function extractProposalsFromResponse(text: string): ModuleProposal[] {
  const proposals: ModuleProposal[] = []
  const fencedMatches = Array.from(text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi))

  for (const match of fencedMatches) {
    const candidate = match?.[1]?.trim()
    if (!candidate) continue
    proposals.push(...tryParseProposals(candidate))
  }
  if (proposals.length > 0) return proposals

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    proposals.push(...tryParseProposals(text.slice(start, end + 1)))
  }

  return proposals
}

export function extractProposalFromResponse(text: string): ModuleProposal | null {
  const proposals = extractProposalsFromResponse(text)
  if (proposals[0]) return proposals[0]

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    const parsed = tryParseJsonObject(text.slice(start, end + 1))
    if (parsed) return parsed
  }

  return null
}

export function createFallbackProposal(message: string): ModuleProposal {
  const createdAt = new Date().toISOString()
  return {
    id: `proposal-${Date.now()}`,
    version: 1,
    title: 'Untitled Module',
    description: 'Fallback proposal generated from raw model output.',
    userIntent: '',
    targetType: 'widget',
    installTarget: 'dashboard',
    category: 'custom',
    capabilities: [],
    dataRequirements: [],
    actions: [],
    layout: { w: 3, h: 3 },
    tree: {
      primitive: 'MarkdownDisplay',
      props: {
        content: message,
      },
    },
    fallbackMessage: message,
    createdAt,
  }
}
