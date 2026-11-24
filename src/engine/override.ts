// 手刷方向场与刀法分区的低分网格，画笔涂抹在此层完成

import type { FieldOverride, RegionMap, Technique, Vec2 } from './types'
import { clamp } from './grid'

export const OVERRIDE_COLS = 96
export const OVERRIDE_ROWS = 96
export const REGION_COLS = 48
export const REGION_ROWS = 48

export function createFieldOverride(): FieldOverride {
  return {
    cols: OVERRIDE_COLS,
    rows: OVERRIDE_ROWS,
    angle: new Float32Array(OVERRIDE_COLS * OVERRIDE_ROWS),
    weight: new Float32Array(OVERRIDE_COLS * OVERRIDE_ROWS),
    brushRadius: 4,
  }
}

export function createRegionMap(defaultTechnique: Technique = 'long'): RegionMap {
  const cells = new Uint8Array(REGION_COLS * REGION_ROWS)
  cells.fill(techniqueIndex(defaultTechnique))
  return { cols: REGION_COLS, rows: REGION_ROWS, cells }
}

export function techniqueIndex(t: Technique): number {
  return t === 'stipple' ? 0 : t === 'short' ? 1 : 2
}

export function indexTechnique(i: number): Technique {
  return i === 0 ? 'stipple' : i === 1 ? 'short' : 'long'
}

/**
 * 画笔涂抹一笔：沿线段经过的网格点按距离衰减写入角度与权重。
 * angle 为画布坐标下的笔刷角度；erase 为真时只清权重。
 */
export function paintStroke(
  override: FieldOverride,
  from: Vec2,
  to: Vec2,
  angle: number,
  erase: boolean,
): void {
  const { cols, rows } = override
  const r = override.brushRadius
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const steps = Math.max(1, Math.ceil(dist / (r * 0.4)))

  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const cx = from.x + (to.x - from.x) * t
    const cy = from.y + (to.y - from.y) * t
    const x0 = Math.max(0, Math.floor(cx - r))
    const x1 = Math.min(cols - 1, Math.ceil(cx + r))
    const y0 = Math.max(0, Math.floor(cy - r))
    const y1 = Math.min(rows - 1, Math.ceil(cy + r))

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        if (d > r) continue
        // 平滑衰减：笔刷中心最强
        const falloff = 0.5 * (1 + Math.cos((Math.min(1, d / r) * Math.PI)))
        const i = y * cols + x
        if (erase) {
          override.weight[i] = clamp(override.weight[i] - falloff, 0, 1)
          continue
        }
        override.angle[i] = angle
        override.weight[i] = clamp(Math.max(override.weight[i], falloff), 0, 1)
      }
    }
  }
}

// 矩形区域填刀法，供分区画笔使用
export function paintRegion(
  region: RegionMap,
  from: Vec2,
  to: Vec2,
  technique: Technique,
): void {
  const x0 = clamp(Math.min(from.x, to.x), 0, region.cols - 1)
  const x1 = clamp(Math.max(from.x, to.x), 0, region.cols - 1)
  const y0 = clamp(Math.min(from.y, to.y), 0, region.rows - 1)
  const y1 = clamp(Math.max(from.y, to.y), 0, region.rows - 1)
  const v = techniqueIndex(technique)
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      region.cells[y * region.cols + x] = v
    }
  }
}

export function sampleRegion(region: RegionMap, gx: number, gy: number): Technique {
  const x = clamp(Math.round(gx), 0, region.cols - 1)
  const y = clamp(Math.round(gy), 0, region.rows - 1)
  return indexTechnique(region.cells[y * region.cols + x])
}
