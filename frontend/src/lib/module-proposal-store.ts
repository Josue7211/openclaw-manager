import { api } from '@/lib/api'
import type { ModuleProposal } from './module-proposals'

export type ModuleProposalStatus = 'draft' | 'approved' | 'rejected' | 'installed'

export interface StoredModuleProposal {
  id: string
  userId: string
  title: string
  description: string
  userIntent: string
  targetType: string
  installTarget: string
  category: string
  status: ModuleProposalStatus
  proposal: ModuleProposal
  sourceModel?: string | null
  generator?: string | null
  installedModuleId?: string | null
  createdAt: string
  updatedAt: string
}

export async function createModuleProposal(
  proposal: ModuleProposal,
  status: ModuleProposalStatus = 'draft',
): Promise<StoredModuleProposal> {
  const result = await api.post<{ ok: true; data: { proposal: StoredModuleProposal } }>(
    '/api/module-proposals',
    { proposal, status },
  )
  return result.data.proposal
}

export async function listModuleProposals(): Promise<StoredModuleProposal[]> {
  const result = await api.get<{ ok: true; data: { proposals: StoredModuleProposal[] } }>(
    '/api/module-proposals',
  )
  return result.data.proposals
}

export async function updateModuleProposalStatus(
  id: string,
  status: ModuleProposalStatus,
  installedModuleId?: string,
): Promise<StoredModuleProposal> {
  const result = await api.patch<{ ok: true; data: { proposal: StoredModuleProposal } }>(
    `/api/module-proposals/${id}/status`,
    { status, installedModuleId },
  )
  return result.data.proposal
}
