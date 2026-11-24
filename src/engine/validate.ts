// 合规校验：把成品线稿按真实宽度重新栅格化，EDT 量测墨隙，逐条检查刀口

import type { Linework, ValidationReport, Violation } from './types'
import { edt } from './distance'

const MAX_VIOLATIONS = 2000

export function validateLinework(linework: Linework): ValidationReport {
  const { width: w, height: h, params, polylines, dots } = linework
  const ink = new Uint8Array(w * h)
  const violations: Violation[] = []
  let minGap = Infinity
  let maxInkWidth = 0

  // 1. 所有折线按相邻点平均宽度落墨
  for (const line of polylines) {
    const pts = line.points
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const segW = (a.width + b.width) / 2
      maxInkWidth = Math.max(maxInkWidth, segW)
      if (segW > params.maxWidth + 0.01) {
        pushViolation(violations, {
          x: b.x,
          y: b.y,
          kind: 'width',
          gap: segW,
          limit: params.maxWidth,
        })
      }
      stampInk(ink, w, h, a.x, a.y, b.x, b.y, segW)
    }
  }

  // 2. 点刻
  for (const dot of dots) {
    maxInkWidth = Math.max(maxInkWidth, dot.diameter)
    if (dot.diameter > params.maxWidth + 0.01) {
      pushViolation(violations, {
        x: dot.x,
        y: dot.y,
        kind: 'width',
        gap: dot.diameter,
        limit: params.maxWidth,
      })
    }
    stampInk(ink, w, h, dot.x, dot.y, dot.x + 0.01, dot.y, dot.diameter)
  }

  // 3. EDT：空白像素到最近墨的距离即局部墨隙
  const dist = edt(ink, w, h)
  // 间距是中心距，墨隙需加两侧半宽；用最小刀口近似折算保守值
  const minClearance = params.minSpacing - params.maxWidth / 2
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (ink[i]) continue
      const d = dist[i]
      // 只统计夹在两块墨之间的像素（四邻有墨才可能是墨隙内部）
      if (!isGapInterior(ink, w, h, x, y)) continue
      minGap = Math.min(minGap, d)
      if (d + params.maxWidth / 2 < params.minSpacing - 0.01 && violations.length < MAX_VIOLATIONS) {
        violations.push({ x, y, kind: 'spacing', gap: d + params.maxWidth / 2, limit: params.minSpacing })
      }
    }
  }

  if (!Number.isFinite(minGap)) minGap = 0
  return {
    violations,
    minGap,
    maxInkWidth,
    lineCount: polylines.length,
    dotCount: dots.length,
  }
}

function pushViolation(list: Violation[], v: Violation): void {
  if (list.length < MAX_VIOLATIONS) list.push(v)
}

// 夹在墨之间：水平或垂直方向两侧两像素内都能遇到墨
function isGapInterior(
  ink: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
): boolean {
  const probe = 3
  let left = false
  let right = false
  let up = false
  let down = false
  for (let k = 1; k <= probe; k++) {
    if (x - k >= 0 && ink[y * w + x - k]) left = true
    if (x + k < w && ink[y * w + x + k]) right = true
    if (y - k >= 0 && ink[(y - k) * w + x]) up = true
    if (y + k < h && ink[(y + k) * w + x]) down = true
  }
  return (left && right) || (up && down)
}

function stampInk(
  ink: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
): void {
  const r = Math.ceil(width / 2)
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - r))
  const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + r))
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - r))
  const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + r))
  const halfW = width / 2
  const len2 = (x1 - x0) ** 2 + (y1 - y0) ** 2

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let t = 0
      if (len2 > 1e-9) {
        t = ((x + 0.5 - x0) * (x1 - x0) + (y + 0.5 - y0) * (y1 - y0)) / len2
        t = Math.max(0, Math.min(1, t))
      }
      const px = x0 + (x1 - x0) * t
      const py = y0 + (y1 - y0) * t
      if (Math.hypot(x + 0.5 - px, y + 0.5 - py) <= halfW) ink[y * w + x] = 1
    }
  }
}
