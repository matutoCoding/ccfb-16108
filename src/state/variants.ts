// 线稿方案的存取辅助：变体创建、重算、列表查询

import { variantRepo } from '@/db/idb'
import type { LineworkVariant } from '@/types'
import { createDefaultParams } from '@/types'
import { createFieldOverride, createRegionMap } from '@/engine/override'
import { uid } from '@/ui/dom'

export function createVariant(
  projectId: string,
  assetId: string,
  name: string,
  preset: 'portrait' | 'architecture',
): LineworkVariant {
  const now = Date.now()
  return {
    id: uid('variant'),
    projectId,
    assetId,
    name,
    params: createDefaultParams(preset),
    fieldOverride: createFieldOverride(),
    // 全幅默认长线，脸部点刻/短线由调校页分区画笔圈定
    regionMap: createRegionMap('long'),
    linework: null,
    validation: null,
    createdAt: now,
    updatedAt: now,
  }
}

export async function saveVariant(variant: LineworkVariant): Promise<void> {
  variant.updatedAt = Date.now()
  await variantRepo.put(variant)
}

export async function listProjectVariants(projectId: string): Promise<LineworkVariant[]> {
  const list = await variantRepo.listByProject(projectId)
  return list.sort((a, b) => b.updatedAt - a.updatedAt)
}
