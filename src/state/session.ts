// 全局会话状态：当前选题、素材与方案在页面间传递，刷新后从 IDB 恢复

import { assetRepo, projectRepo, variantRepo } from '@/db/idb'
import type { AssetRecord, LineworkVariant, StampProject } from '@/types'

interface SessionState {
  projectId: string | null
  assetId: string | null
  variantId: string | null
  project: StampProject | null
  asset: AssetRecord | null
  variant: LineworkVariant | null
}

const state: SessionState = {
  projectId: null,
  assetId: null,
  variantId: null,
  project: null,
  asset: null,
  variant: null,
}

export function setSession(partial: Partial<SessionState>): void {
  Object.assign(state, partial)
}

export function getSession(): SessionState {
  return state
}

export async function restoreSession(): Promise<void> {
  const projectId = localStorage.getItem('session.projectId')
  const assetId = localStorage.getItem('session.assetId')
  const variantId = localStorage.getItem('session.variantId')
  if (projectId) {
    state.project = await projectRepo.get(projectId)
    state.projectId = state.project ? projectId : null
  }
  if (assetId) {
    state.asset = await assetRepo.get(assetId)
    state.assetId = state.asset ? assetId : null
  }
  if (variantId) {
    state.variant = await variantRepo.get(variantId)
    state.variantId = state.variant ? variantId : null
  }
}

export function persistSession(): void {
  if (state.projectId) localStorage.setItem('session.projectId', state.projectId)
  else localStorage.removeItem('session.projectId')
  if (state.assetId) localStorage.setItem('session.assetId', state.assetId)
  else localStorage.removeItem('session.assetId')
  if (state.variantId) localStorage.setItem('session.variantId', state.variantId)
  else localStorage.removeItem('session.variantId')
}
