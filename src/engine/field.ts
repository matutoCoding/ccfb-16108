// 方向场：由法线梯度的结构张量估计主曲率方向，融合手刷角度网格

import type { FieldOverride, SurfaceBuffer } from './types'
import type { NormalGradientSet } from './normal_grad'
import { clamp, idx, inside, normalizeAngle, sampleAngle } from './grid'

/**
 * 法线梯度的结构张量（2x2，屏幕空间）：
 * T00 = Σ(dnx/dx)² + (dny/dx)²
 * T01 = Σ(dnx/dx)(dnx/dy) + (dny/dx)(dny/dy)
 * T11 = Σ(dnx/dy)² + (dny/dy)²
 * 最小特征向量 = 法线变化最弱的方向，即曲面最直的走向，
 * 排线沿此方向（圆柱顺轴向、脸颊顺弧、平墙收敛到透视方向）。
 */
export function computeCurvatureField(
  buf: SurfaceBuffer,
  grad: NormalGradientSet,
  fallbackAngle: number,
): void {
  const { width: w, height: h, mask, angle, confidence } = buf
  const flatEps = 1e-6

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = idx(w, x, y)
      if (!mask[i]) continue

      let t00 = 0
      let t01 = 0
      let t11 = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = idx(w, x + dx, y + dy)
          if (!mask[j]) continue
          const dnxX = grad.nxX[j]
          const dnxY = grad.nxY[j]
          const dnyX = grad.nyX[j]
          const dnyY = grad.nyY[j]
          t00 += dnxX * dnxX + dnyX * dnyX
          t01 += dnxX * dnxY + dnyX * dnyY
          t11 += dnxY * dnxY + dnyY * dnyY
        }
      }

      // 平坦区：低置信，交给透视/手绘兜底角
      if (t00 + t11 < flatEps) {
        angle[i] = normalizeAngle(fallbackAngle)
        confidence[i] = 0.08
        continue
      }

      if (Math.abs(t01) < 1e-9) {
        angle[i] = normalizeAngle(t00 <= t11 ? 0 : Math.PI / 2)
      } else {
        const tr = t00 + t11
        const disc = Math.sqrt(Math.max(0, (t00 - t11) ** 2 + 4 * t01 * t01))
        const lambdaMin = (tr - disc) / 2
        angle[i] = normalizeAngle(Math.atan2(-(t00 - lambdaMin), t01))
      }

      const tr = t00 + t11
      const disc = Math.sqrt(Math.max(0, (t00 - t11) ** 2 + 4 * t01 * t01))
      confidence[i] = clamp(disc / (tr + 1e-9), 0, 1)
    }
  }

  // 边缘一圈像素用兜底角，避免窗函数越界
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      if (mask[i] && confidence[i] === 0) {
        angle[i] = normalizeAngle(fallbackAngle)
        confidence[i] = 0.05
      }
    }
  }
}

/**
 * 融合手刷方向场。手绘网格分辨率低，双线性采样后按权重与自动场混合；
 * 权重再乘参数 strength，一笔刷下去可控而不是硬覆盖。
 */
export function applyFieldOverride(
  buf: SurfaceBuffer,
  override: FieldOverride | null,
  strength: number,
): void {
  if (!override) return
  const { width: w, height: h, mask, angle } = buf
  const sx = override.cols / w
  const sy = override.rows / h

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      if (!mask[i]) continue
      const gx = x * sx
      const gy = y * sy
      if (!inside(override.cols, override.rows, gx, gy)) continue
      const wgt = sampleScalar(override.weight, override.cols, override.rows, gx, gy) * strength
      if (wgt <= 0.01) continue
      const hand = sampleAngle(override.angle, override.cols, override.rows, gx, gy)
      angle[i] = blendAngle(angle[i], hand, wgt)
    }
  }
}

function sampleScalar(grid: Float32Array, w: number, h: number, x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const tx = x - x0
  const ty = y - y0
  const a = grid[y0 * w + x0]
  const b = grid[y0 * w + x1]
  const c = grid[y1 * w + x0]
  const d = grid[y1 * w + x1]
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
}

// 权重空间的角度混合：手绘角折到自动角半平面，保证不跨 PI/0 跳变
function blendAngle(auto: number, hand: number, t: number): number {
  let diff = normalizeAngle(hand - auto)
  if (diff > Math.PI / 2) diff -= Math.PI
  return normalizeAngle(auto + diff * t)
}
