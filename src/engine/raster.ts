// 墨栅：把已生成的线按真实刀口宽度栅格化，追踪新线时做硬间距约束

import { idx, inside } from './grid'

export class OccupancyGrid {
  readonly w: number
  readonly h: number
  // ink=1 表示该像素被墨覆盖；clearing 存每个墨像素需要让出的净距
  readonly ink: Uint8Array
  readonly clearing: Float32Array

  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.ink = new Uint8Array(w * h)
    this.clearing = new Float32Array(w * h)
  }

  // 候选线段中心是否与既有墨保持净距 gap（像素）
  isClear(cx: number, cy: number, gap: number): boolean {
    const r = Math.ceil(gap)
    const x0 = Math.max(0, Math.floor(cx - r))
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r))
    const y0 = Math.max(0, Math.floor(cy - r))
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r))
    for (let y = y0; y <= y1; y++) {
      const row = y * this.w
      for (let x = x0; x <= x1; x++) {
        const i = row + x
        if (!this.ink[i]) continue
        const d = Math.hypot(x - cx, y - cy)
        if (d < this.clearing[i] + gap) return false
      }
    }
    return true
  }

  // 落一根有宽度的线段（胶囊形：两圆夹一矩形）
  stampCapsule(x0: number, y0: number, x1: number, y1: number, width: number, gap: number): void {
    const r = Math.ceil(Math.max(width, gap))
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - r))
    const maxX = Math.min(this.w - 1, Math.ceil(Math.max(x0, x1) + r))
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - r))
    const maxY = Math.min(this.h - 1, Math.ceil(Math.max(y0, y1) + r))
    const halfW = width / 2
    const len2 = (x1 - x0) ** 2 + (y1 - y0) ** 2

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d = pointSegmentDistance(x + 0.5, y + 0.5, x0, y0, x1, y1, len2)
        if (d > r) continue
        const i = idx(this.w, x, y)
        if (d <= halfW) this.ink[i] = 1
        // 该墨点对外需要的净距按自身半宽折算
        const need = Math.max(0, gap - Math.max(0, d - halfW))
        if (need > this.clearing[i]) this.clearing[i] = need
      }
    }
  }

  // 点刻落点
  stampDot(cx: number, cy: number, diameter: number, gap: number): void {
    this.stampCapsule(cx, cy, cx + 0.01, cy, diameter, gap)
  }

  hasInk(cx: number, cy: number): boolean {
    if (!inside(this.w, this.h, cx, cy)) return false
    return this.ink[idx(this.w, Math.round(cx), Math.round(cy))] === 1
  }
}

function pointSegmentDistance(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  len2: number,
): number {
  if (len2 < 1e-9) return Math.hypot(px - x0, py - y0)
  let t = ((px - x0) * (x1 - x0) + (py - y0) * (y1 - y0)) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x0 + (x1 - x0) * t), py - (y0 + (y1 - y0) * t))
}
