// 线稿生成主流水线：方向场融合 -> 排线 -> 轮廓 -> 汇总计时

import type {
  FieldOverride,
  Linework,
  LineworkParams,
  Polyline,
  RegionMap,
  SurfaceBuffer,
} from './types'
import type { NormalGradientSet } from './normal_grad'
import { applyFieldOverride } from './field'
import { hatchSurface } from './hatch_seed'
import { extractOutline } from './outline'

export interface PipelineInput {
  surface: SurfaceBuffer
  params: LineworkParams
  fieldOverride: FieldOverride | null
  regionMap: RegionMap | null
  grad: NormalGradientSet
}

export function generateLinework(input: PipelineInput): Linework {
  const start = performance.now()
  const { surface, params, fieldOverride, regionMap } = input

  // 手刷方向场只影响角度网格，追踪阶段全部基于融合后的场
  applyFieldOverride(surface, fieldOverride, params.overrideStrength)

  const hatch = hatchSurface(surface, regionMap, params)
  const outlines = extractOutline(surface, params, {
    grad: input.grad,
  })

  const polylines: Polyline[] = [...hatch.polylines, ...outlines]
  const elapsedMs = performance.now() - start

  return {
    width: surface.width,
    height: surface.height,
    params,
    polylines,
    dots: hatch.dots,
    elapsedMs,
  }
}

// 统计信息，给生成页与并排对比用
export function summarizeLinework(linework: Linework): {
  lineCount: number
  dotCount: number
  totalPointCount: number
  longestLine: number
} {
  let totalPointCount = 0
  let longestLine = 0
  for (const line of linework.polylines) {
    totalPointCount += line.points.length
    let len = 0
    for (let i = 1; i < line.points.length; i++) {
      len += Math.hypot(
        line.points[i].x - line.points[i - 1].x,
        line.points[i].y - line.points[i - 1].y,
      )
    }
    longestLine = Math.max(longestLine, len)
  }
  return {
    lineCount: linework.polylines.length,
    dotCount: linework.dots.length,
    totalPointCount,
    longestLine,
  }
}
