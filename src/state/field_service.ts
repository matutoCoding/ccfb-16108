// 曲面场缓存：同素材在生成页/调校页/预览页之间复用，避免重复离屏渲染

import * as THREE from 'three'
import { assetRepo } from '@/db/idb'
import type { AssetRecord, PresetKind, StampProject } from '@/types'
import { ModelView } from '@/engine/model_view'
import { captureModelFields, type ModelFields } from '@/engine/surface_builder'
import { createHeadModel, createPagodaModel } from '@/engine/test_models'
import { loadModelAsset } from '@/engine/model_loader'
import { decodePhoto, photoToSurface, type PhotoFields } from '@/engine/photo'
import { buildPixelFrame } from '@/ui/perforation'

export type CachedFields = ModelFields | PhotoFields

interface CacheEntry {
  fields: CachedFields
  view: ModelView | null
  canvas: HTMLCanvasElement | null
}

const cache = new Map<string, CacheEntry>()

export async function buildAssetFields(
  asset: AssetRecord,
  project: StampProject,
  canvas?: HTMLCanvasElement,
  size = 720,
): Promise<CachedFields> {
  const hit = cache.get(asset.id)
  if (hit) return hit.fields

  const frame = buildPixelFrame(project, size)
  const fallbackAngle = project.preset === 'architecture' ? 0 : Math.PI / 2
  let entry: CacheEntry

  if (asset.kind === 'model') {
    if (!canvas) throw new Error('三维素材需要传入画布')
    const view = new ModelView(canvas, frame.widthPx, frame.heightPx)
    const obj = await loadObject(asset)
    view.setObject(obj)
    view.resize(frame.widthPx, frame.heightPx)
    view.renderToCanvas()
    const fields = captureModelFields(view, fallbackAngle)
    entry = { fields, view, canvas }
  } else {
    if (!asset.blob) throw new Error('照片文件丢失')
    const bitmap = await decodePhoto(asset.blob, size)
    const fields = photoToSurface(bitmap, project.preset, fallbackAngle, {
      width: frame.widthPx,
      height: frame.heightPx,
    })
    entry = { fields, view: null, canvas: null }
    bitmap.close()
  }

  cache.set(asset.id, entry)
  return entry.fields
}

export function getCachedFields(assetId: string): CachedFields | null {
  return cache.get(assetId)?.fields ?? null
}

export function getCachedView(assetId: string): ModelView | null {
  return cache.get(assetId)?.view ?? null
}

export function invalidateFields(assetId: string): void {
  const entry = cache.get(assetId)
  if (entry?.view) entry.view.dispose()
  cache.delete(assetId)
}

async function loadObject(asset: AssetRecord): Promise<THREE.Object3D> {
  if (asset.generated === 'head') return createHeadModel()
  if (asset.generated === 'pagoda') return createPagodaModel()
  if (!asset.blob) throw new Error('模型文件丢失')
  return loadModelAsset(asset.blob, asset.name)
}

// 重新捕获当前三维视角（用户旋转模型后调用）
export function recaptureModel(assetId: string, preset: PresetKind): CachedFields | null {
  const entry = cache.get(assetId)
  if (!entry?.view) return null
  const fallbackAngle = preset === 'architecture' ? 0 : Math.PI / 2
  const fields = captureModelFields(entry.view, fallbackAngle)
  entry.fields = fields
  return fields
}
export async function ensureAsset(assetId: string): Promise<AssetRecord> {
  const asset = await assetRepo.get(assetId)
  if (!asset) throw new Error('素材不存在或已被删除')
  return asset
}
