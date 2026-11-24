// 轮廓描边：剪影 + 法线折边，线宽随深度距离与法线转折变化

import type { LineworkParams, Polyline, SurfaceBuffer } from './types'
import { idx, sampleBilinear } from './grid'
import type { NormalGradientSet } from './normal_grad'
import { chainSegments, marchingSquares } from './marching'

export interface OutlineOptions {
  grad: NormalGradientSet
}

export function extractOutline(
  buf: SurfaceBuffer,
  params: LineworkParams,
  opts: OutlineOptions,
): Polyline[] {
  if (!params.outlineEnabled) return []
  const result: Polyline[] = []

  // 1. 剪影：遮罩边界
  const silhouetteSegs = marchingSquares(buf.mask, buf.width, buf.height)
  const { chains } = chainSegments(silhouetteSegs)
  for (const chain of chains) {
    const poly = toWidthPolyline(chain, buf, params, opts, true)
    if (poly) result.push(poly)
  }

  // 2. 折边：法线梯度幅值超过阈值的内部边
  const crease = detectCreases(buf, opts.grad, params.creaseThreshold)
  if (crease) {
    const creaseSegs = marchingSquares(crease, buf.width, buf.height)
    const { chains: creaseChains } = chainSegments(creaseSegs, 1.5)
    for (const chain of creaseChains) {
      const poly = toWidthPolyline(chain, buf, params, opts, false)
      if (poly) result.push(poly)
    }
  }

  return result
}

// 法线幅值超过阈值即视为折边候选，再腐蚀掉贴剪影的一圈避免重复描
function detectCreases(
  buf: SurfaceBuffer,
  grad: NormalGradientSet,
  threshold: number,
): Uint8Array | null {
  const { width: w, height: h, mask } = buf
  const out = new Uint8Array(w * h)
  let any = false

  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = idx(w, x, y)
      if (!mask[i]) continue
      if (grad.magnitude[i] < threshold) continue
      // 内缩两像素，剪影已经描过的边不再出折线段
      if (!mask[i - 2] || !mask[i + 2] || !mask[i - 2 * w] || !mask[i + 2 * w]) continue
      out[i] = 1
      any = true
    }
  }
  return any ? out : null
}

function toWidthPolyline(
  chain: { x: number; y: number }[],
  buf: SurfaceBuffer,
  params: LineworkParams,
  opts: OutlineOptions,
  isSilhouette: boolean,
): Polyline | null {
  if (chain.length < 3) return null
  const w = buf.width
  const h = buf.height
  const base = params.outlineBaseWidth

  const points = chain.map((p, i) => {
    const cx = Math.max(0, Math.min(w - 1, p.x))
    const cy = Math.max(0, Math.min(h - 1, p.y))
    // 深度越近（depth 越小）线越粗；远景建筑自然收细
    const depth = sampleBilinear(buf.depth, w, h, cx, cy)
    const depthFactor = 1.35 - depth * 0.7

    // 法线转折：相邻链段方向变化越大，折边越粗
    let turnFactor = 1
    if (i > 0 && i < chain.length - 1) {
      const a = chain[i - 1]
      const b = chain[i + 1]
      const turn = Math.abs(
        Math.atan2(b.y - p.y, b.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x),
      )
      turnFactor = 1 + Math.min(0.5, turn / Math.PI)
    }

    const silhouetteBoost = isSilhouette ? 1.15 : 0.8
    let width = base * depthFactor * turnFactor * silhouetteBoost
    width = Math.max(params.minWidth, Math.min(params.maxWidth, width))
    return { x: p.x, y: p.y, width }
  })

  return { points, layer: 9, technique: 'long' }
}
