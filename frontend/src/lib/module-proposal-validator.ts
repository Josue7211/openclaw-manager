import { PRIMITIVE_DEFINITIONS } from '@/components/primitives/register'
import type {
  ModuleActionType,
  ModuleCapability,
  ModuleProposal,
  PrimitiveNode,
} from './module-proposals'

const ALLOWED_PHASE1_CAPABILITIES = new Set<ModuleCapability>([
  'read.todos',
  'read.missions',
  'read.memory',
  'read.knowledge',
  'read.pipeline',
])

const ALLOWED_ACTIONS = new Set<ModuleActionType>(['navigate', 'refresh', 'open'])
const ALLOWED_PRIMITIVES = new Set<string>(PRIMITIVE_DEFINITIONS.map(item => item.name))

export interface ModuleProposalValidationResult {
  ok: boolean
  errors: string[]
  normalized?: ModuleProposal
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function validatePrimitiveTree(node: PrimitiveNode, errors: string[], path = 'tree'): void {
  if (!node.primitive || !ALLOWED_PRIMITIVES.has(node.primitive)) {
    errors.push(`${path}.primitive must be one of the registered primitives`)
  }
  if (!isObject(node.props)) {
    errors.push(`${path}.props must be an object`)
  }
  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) {
      errors.push(`${path}.children must be an array`)
      return
    }
    node.children.forEach((child, index) => validatePrimitiveTree(child, errors, `${path}.children[${index}]`))
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function validateModuleProposal(input: unknown): ModuleProposalValidationResult {
  const errors: string[] = []
  if (!isObject(input)) {
    return { ok: false, errors: ['proposal must be an object'] }
  }

  const proposal = input as unknown as ModuleProposal

  if (proposal.targetType !== 'widget' && proposal.targetType !== 'module' && proposal.targetType !== 'panel' && proposal.targetType !== 'page') {
    errors.push('targetType must be widget, module, panel, or page')
  }
  if (
    proposal.installTarget !== 'dashboard' &&
    proposal.installTarget !== 'module-studio' &&
    proposal.installTarget !== 'category' &&
    proposal.installTarget !== 'app-shell'
  ) {
    errors.push('installTarget must be dashboard, module-studio, category, or app-shell')
  }
  if (!proposal.title?.trim()) {
    errors.push('title is required')
  }
  if (!proposal.description?.trim()) {
    errors.push('description is required')
  }
  if (!proposal.userIntent?.trim()) {
    errors.push('userIntent is required')
  }
  if (!proposal.category?.trim()) {
    errors.push('category is required')
  }

  if (!Array.isArray(proposal.capabilities)) {
    errors.push('capabilities must be an array')
  } else {
    for (const capability of proposal.capabilities) {
      if (!ALLOWED_PHASE1_CAPABILITIES.has(capability)) {
        errors.push(`capability not allowed in phase 1: ${capability}`)
      }
    }
  }

  if (!Array.isArray(proposal.actions)) {
    errors.push('actions must be an array')
  } else {
    for (const action of proposal.actions) {
      if (!ALLOWED_ACTIONS.has(action.type)) {
        errors.push(`action type not allowed in phase 1: ${action.type}`)
      }
      if (action.capability && !ALLOWED_PHASE1_CAPABILITIES.has(action.capability)) {
        errors.push(`action capability not allowed in phase 1: ${action.capability}`)
      }
    }
  }

  if (!proposal.layout || typeof proposal.layout !== 'object') {
    errors.push('layout is required')
  }

  if (proposal.backendContract !== undefined) {
    if (!isObject(proposal.backendContract)) {
      errors.push('backendContract must be an object when present')
    } else {
      if (typeof proposal.backendContract.requested !== 'boolean') {
        errors.push('backendContract.requested must be a boolean')
      }
      if (!isNonEmptyString(proposal.backendContract.summary)) {
        errors.push('backendContract.summary is required when backendContract is present')
      }
      if (proposal.backendContract.models !== undefined && !Array.isArray(proposal.backendContract.models)) {
        errors.push('backendContract.models must be an array when present')
      }
      if (proposal.backendContract.queries !== undefined && !Array.isArray(proposal.backendContract.queries)) {
        errors.push('backendContract.queries must be an array when present')
      }
      if (proposal.backendContract.mutations !== undefined && !Array.isArray(proposal.backendContract.mutations)) {
        errors.push('backendContract.mutations must be an array when present')
      }
    }
  }

  if (!proposal.tree || typeof proposal.tree !== 'object') {
    errors.push('tree is required')
  } else {
    validatePrimitiveTree(proposal.tree, errors)
  }

  if (errors.length > 0) return { ok: false, errors }

  const normalized: ModuleProposal = {
    ...proposal,
    layout: {
      ...proposal.layout,
      w: Math.max(2, Math.min(6, Number(proposal.layout.w) || 3)),
      h: Math.max(2, Math.min(6, Number(proposal.layout.h) || 3)),
      minW: proposal.layout.minW ? Math.max(1, proposal.layout.minW) : undefined,
      minH: proposal.layout.minH ? Math.max(1, proposal.layout.minH) : undefined,
    },
    capabilities: proposal.capabilities ?? [],
    dataRequirements: proposal.dataRequirements ?? [],
    actions: proposal.actions ?? [],
  }

  return { ok: true, errors: [], normalized }
}
