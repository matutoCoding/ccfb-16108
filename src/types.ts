// 应用层数据契约：选题档案、素材、线稿方案与 IndexedDB 记录

import type {
  FieldOverride,
  Linework,
  LineworkParams,
  PresetKind,
  RegionMap,
  SourceKind,
  ValidationReport,
} from '@/engine/types'

// 齿孔：距票幅四边的安全边距（毫米）与齿孔半径
export interface PerforationSpec {
  marginMm: number
  holeRadiusMm: number
  pitchMm: number
}

export interface StampProject {
  id: string
  // 套号，如 2026-12
  setNo: string
  // 图序，如 (3-2)
  figureNo: string
  title: string
  widthMm: number
  heightMm: number
  perforation: PerforationSpec
  preset: PresetKind
  createdAt: number
  updatedAt: number
}

export type AssetStatus = 'ready' | 'broken'

export interface AssetRecord {
  id: string
  projectId: string
  name: string
  kind: SourceKind
  // gltf/obj/png/jpeg
  mime: string
  // 原始文件存 Blob；测试模型无 Blob，用 kind 标记生成
  blob?: Blob
  generated?: 'head' | 'pagoda'
  status: AssetStatus
  createdAt: number
}

// 一版线稿（同一主图可并排多版，疏密参数不同）
export interface LineworkVariant {
  id: string
  projectId: string
  assetId: string
  name: string
  params: LineworkParams
  // 方向场手刷与刀法分区，可能为空（全默认）
  fieldOverride: FieldOverride | null
  regionMap: RegionMap | null
  // 生成结果（追踪完成后写入），持久化时转 JSON
  linework: Linework | null
  validation: ValidationReport | null
  createdAt: number
  updatedAt: number
}

export interface DBSchemaMap {
  projects: StampProject
  assets: AssetRecord
  variants: LineworkVariant
}

export type StoreName = keyof DBSchemaMap

// 线稿导出档位
export type ExportScale = '1x' | '5x'

// 默认参数工厂集中在这里，页面新建方案时调用
export function createDefaultParams(preset: PresetKind): LineworkParams {
  const portrait = preset === 'portrait'
  return {
    minWidth: portrait ? 0.6 : 0.5,
    maxWidth: portrait ? 2.2 : 2.6,
    minSpacing: portrait ? 1.6 : 1.4,
    maxSpacing: portrait ? 5.5 : 6.5,
    stepLength: 1.1,
    maxLineLength: 420,
    shortLineLength: 26,
    stippleDiameter: 1.4,
    stippleSpacing: 3.2,
    crossLayerCount: 2,
    crossAngles: [0, Math.PI / 3, -Math.PI / 3],
    crossThreshold: 0.62,
    outlineEnabled: true,
    outlineBaseWidth: 1.6,
    creaseThreshold: 0.9,
    overrideStrength: 0.85,
    densityGain: 1.25,
    widthExponent: 1.15,
    taperLength: 4,
    seed: 20261124,
  }
}
