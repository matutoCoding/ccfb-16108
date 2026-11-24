// 完整流线：正向 + 反向积分后拼接，两端收尖

import type { LinePoint, Polyline } from './types'
import { sampleFields, traceDirection, type TraceContext } from './hatch'
import { layerOffsetOf } from './hatch-common'

export function traceStreamline(ctx: TraceContext, sx: number, sy: number): Polyline | null {
  const forward = traceDirection(ctx, sx, sy, false)
  const backward = traceDirection(ctx, sx, sy, true)
  if (forward.length + backward.length < 4) return null

  backward.reverse()
  const points: LinePoint[] = [...backward.slice(0, -1), ...forward]
  applyTaper(points, ctx.params.taperLength)

  const technique = sampleFields(
    ctx.buf,
    ctx.region,
    ctx.params,
    sx,
    sy,
    layerOffsetOf(ctx.layer, ctx.params),
  ).technique

  return {
    points,
    layer: ctx.layer,
    technique: technique === 'stipple' ? 'short' : technique,
  }
}

// 两端收尖：宽度线性收到 0，杜绝线头毛刺与半截短线
function applyTaper(points: LinePoint[], taper: number): void {
  if (points.length < 3 || taper <= 0) return
  const n = points.length
  const anchorW = points[Math.min(n - 1, 2)].width
  const anchorWR = points[Math.max(0, n - 3)].width

  // 头端
  let acc = 0
  for (let i = 0; i < n && acc < taper; i++) {
    if (i > 0) acc += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    const k = Math.min(1, acc / taper)
    points[i].width = Math.min(points[i].width, anchorW * k)
  }
  // 尾端
  acc = 0
  for (let i = n - 1; i >= 0 && acc < taper; i--) {
    if (i < n - 1) {
      acc += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
    }
    const k = Math.min(1, acc / taper)
    points[i].width = Math.min(points[i].width, anchorWR * k)
  }
  points[0].width = 0
  points[n - 1].width = 0
}
