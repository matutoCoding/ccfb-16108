// 播种与分层编排：抖动扫描播种、点刻刀法、暗部交叉层触发

import type { Dot, LineworkParams, Polyline, RegionMap, SurfaceBuffer } from './types'
import { clamp, makeValueNoise, sampleMask } from './grid'
import { OccupancyGrid } from './raster'
import { sampleFields, type HatchResult, type TraceContext } from './hatch'
import { sampleRegion } from './override'
import { traceStreamline } from './hatch-stream'
import { layerOffsetOf } from './hatch-common'

export function hatchSurface(
  buf: SurfaceBuffer,
  region: RegionMap | null,
  params: LineworkParams,
): HatchResult {
  const occ = new OccupancyGrid(buf.width, buf.height)
  const polylines: Polyline[] = []
  const dots: Dot[] = []
  const noise = makeValueNoise(params.seed ^ 0x9e3779b9)

  // 第 0 层：点刻 + 主排线；之后按暗度阈值追加交叉层
  const layerCount = clamp(params.crossLayerCount, 1, 3)
  for (let layer = 0; layer < layerCount; layer++) {
    const ctx: TraceContext = {
      buf,
      region,
      params,
      occ,
      layer,
      // 交叉层间距放宽，避免叠层后过密
      layerSpacingScale: layer === 0 ? 1 : 1.15,
    }
    if (layer === 0) runStipple(ctx, dots, noise)
    runSeeding(ctx, polylines, noise)
  }

  return { polylines, dots, occupancy: occ }
}

function runStipple(
  ctx: TraceContext,
  dots: Dot[],
  noise: (x: number, y: number) => number,
): void {
  const { buf, params, occ } = ctx
  const spacing = params.stippleSpacing
  const jitter = spacing * 0.45
  // 错行网格播种 + 值噪声抖动，模拟手工点刻的不规则感
  let row = 0
  for (let gy = spacing / 2; gy < buf.height; gy += spacing, row++) {
    const offset = row % 2 === 0 ? 0 : spacing / 2
    for (let gx = spacing / 2 + offset; gx < buf.width; gx += spacing) {
      const x = gx + (noise(gx * 0.3, gy * 0.3) - 0.5) * jitter
      const y = gy + (noise(gx * 0.3 + 99, gy * 0.3 + 99) - 0.5) * jitter
      if (!sampleMask(buf.mask, buf.width, buf.height, x, y)) continue
      const tech = ctx.region
        ? sampleRegion(ctx.region, (x / buf.width) * ctx.region.cols, (y / buf.height) * ctx.region.rows)
        : 'long'
      if (tech !== 'stipple') continue

      const f = sampleFields(buf, ctx.region, params, x, y, 0)
      const diameter = Math.max(params.minWidth, f.width * 0.9)
      const gap = Math.max(0, spacing - diameter / 2)
      if (!occ.isClear(x, y, gap)) continue
      occ.stampDot(x, y, diameter, gap)
      dots.push({ x, y, diameter, layer: 0 })
    }
  }
}

function runSeeding(
  ctx: TraceContext,
  polylines: Polyline[],
  noise: (x: number, y: number) => number,
): void {
  const { buf, params, occ, layer } = ctx
  // 扫描步长取最小间距一半，保证暗部最密处也能找到种子
  const scanStep = Math.max(1, params.minSpacing * 0.5)
  const phases = layer === 0 ? [0, 0.5] : [0.25, 0.75]
  const offset = layerOffsetOf(layer, params)

  for (const phase of phases) {
    let rowIndex = 0
    for (let gy = scanStep * (0.5 + phase); gy < buf.height; gy += scanStep, rowIndex++) {
      const rowShift = (rowIndex % 2) * scanStep * 0.5
      for (let gx = scanStep * 0.5 + rowShift; gx < buf.width; gx += scanStep) {
        const x = gx + (noise(gx * 0.21 + layer * 17, gy * 0.21) - 0.5) * scanStep
        const y = gy + (noise(gx * 0.21, gy * 0.21 + layer * 31) - 0.5) * scanStep
        if (!sampleMask(buf.mask, buf.width, buf.height, x, y)) continue

        const f = sampleFields(buf, ctx.region, params, x, y, offset)
        if (f.technique === 'stipple') continue
        // 交叉层只在足够暗的区域触发
        if (layer > 0 && f.darkness < params.crossThreshold) continue

        const gap = Math.max(0, f.spacing * ctx.layerSpacingScale - f.width / 2)
        if (!occ.isClear(x, y, gap)) continue

        const line = traceStreamline(ctx, x, y)
        if (line && line.points.length >= 4) polylines.push(line)
      }
    }
  }
}
