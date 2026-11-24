// 线稿持久化序列化：Float32Array 等类型数组转普通数组，控制结构化克隆体积

import type { FieldOverride, Linework, RegionMap } from '@/engine/types'

interface WireFieldOverride {
  cols: number
  rows: number
  angle: number[]
  weight: number[]
  brushRadius: number
}

interface WireRegionMap {
  cols: number
  rows: number
  cells: number[]
}

// 结构化克隆本身支持 TypedArray，但为了导出/迁移与体积可控，统一转紧凑 JSON 友好结构
export function serializeFieldOverride(value: FieldOverride | null): WireFieldOverride | null {
  if (!value) return null
  return {
    cols: value.cols,
    rows: value.rows,
    angle: Array.from(value.angle),
    weight: Array.from(value.weight),
    brushRadius: value.brushRadius,
  }
}

export function deserializeFieldOverride(value: WireFieldOverride | null): FieldOverride | null {
  if (!value) return null
  return {
    cols: value.cols,
    rows: value.rows,
    angle: new Float32Array(value.angle),
    weight: new Float32Array(value.weight),
    brushRadius: value.brushRadius,
  }
}

export function serializeRegionMap(value: RegionMap | null): WireRegionMap | null {
  if (!value) return null
  return { cols: value.cols, rows: value.rows, cells: Array.from(value.cells) }
}

export function deserializeRegionMap(value: WireRegionMap | null): RegionMap | null {
  if (!value) return null
  return { cols: value.cols, rows: value.rows, cells: new Uint8Array(value.cells) }
}

// 线稿结果单独估算大小，给 UI 展示占用
export function lineworkByteSize(linework: Linework): number {
  let bytes = 64
  for (const line of linework.polylines) {
    bytes += line.points.length * 12 + 32
  }
  bytes += linework.dots.length * 20
  return bytes
}
