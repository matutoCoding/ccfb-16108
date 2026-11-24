// 排线引擎：沿方向场做流线积分，墨栅强制最小间距，宽度随明暗连续变化

import type {
  LinePoint,
  LineworkParams,
  Polyline,
  RegionMap,
  SurfaceBuffer,
  Technique,
} from './types'
import { clamp, inside, sampleAngle, sampleBilinear, sampleMask } from './grid'
import { sampleRegion } from './override'
import { OccupancyGrid } from './raster'
import { layerOffsetOf } from './hatch-common'

export interface HatchResult {
  polylines: Polyline[]
  dots: import('./types').Dot[]
  occupancy: OccupancyGrid
}

interface LocalFields {
  darkness: number
  spacing: number
  width: number
  angle: number
  technique: Technique
}

// 暗度：1 为最暗。照片/渲染亮度都已归一化
export function sampleFields(
  buf: SurfaceBuffer,
  region: RegionMap | null,
  params: LineworkParams,
  x: number,
  y: number,
  layerAngleOffset: number,
): LocalFields {
  const lum = sampleBilinear(buf.luminance, buf.width, buf.height, x, y)
  const darkness = clamp(1 - lum, 0, 1)
  const t = Math.pow(darkness, params.widthExponent)
  const width = params.minWidth + (params.maxWidth - params.minWidth) * t
  // 越暗越密：spacing 随暗度线性收缩，densityGain 控制收缩强度
  const span = params.maxSpacing - params.minSpacing
  const shrink = clamp(darkness * params.densityGain, 0, 1)
  const spacing = params.maxSpacing - span * shrink
  const base = sampleAngle(buf.angle, buf.width, buf.height, x, y)
  const angle = base + layerAngleOffset
  const technique: Technique = region
    ? sampleRegion(region, (x / buf.width) * region.cols, (y / buf.height) * region.rows)
    : 'long'
  return { darkness, spacing, width, angle, technique }
}

export interface TraceContext {
  buf: SurfaceBuffer
  region: RegionMap | null
  params: LineworkParams
  occ: OccupancyGrid
  layer: number
  layerSpacingScale: number
}

// 单向积分，返回带连续宽度的折线点
export function traceDirection(ctx: TraceContext, sx: number, sy: number, flip: boolean): LinePoint[] {
  const { buf, params, occ, layer } = ctx
  const w = buf.width
  const h = buf.height
  const offset = layerOffsetOf(layer, params)
  const pts: LinePoint[] = []
  let x = sx
  let y = sy
  let walked = 0
  let blocked = false

  while (walked < params.maxLineLength) {
    if (!inside(w, h, x, y) || !sampleMask(buf.mask, w, h, x, y)) {
      blocked = true
      break
    }
    const f = sampleFields(buf, ctx.region, params, x, y, offset)

    // 短线刀法：走到长度上限即自然收笔
    const lengthCap = f.technique === 'short' ? params.shortLineLength : params.maxLineLength
    if (f.technique !== 'stipple' && walked >= lengthCap) {
      blocked = true
      break
    }

    // 间距硬约束（起点由播种阶段保证，其后逐点检查）
    if (pts.length > 1) {
      const gap = f.spacing * ctx.layerSpacingScale - f.width / 2
      if (!occ.isClear(x, y, Math.max(0, gap))) {
        blocked = true
        break
      }
    }

    pts.push({ x, y, width: f.width })
    const dir = f.angle
    const nx = x + Math.cos(flip ? dir + Math.PI : dir) * params.stepLength
    const ny = y + Math.sin(flip ? dir + Math.PI : dir) * params.stepLength

    // 落墨：用相邻点平均宽度，宽度逐点连续，不会出台阶
    if (pts.length >= 2) {
      const prev = pts[pts.length - 2]
      const segW = (prev.width + f.width) / 2
      occ.stampCapsule(prev.x, prev.y, x, y, segW, Math.max(0, f.spacing - segW / 2))
    }

    x = nx
    y = ny
    walked += params.stepLength
  }

  // 末端被挡住时补一个零宽收尖点，避免半截硬断
  if (blocked && pts.length > 0) pts.push({ x, y, width: 0 })
  return pts
}
