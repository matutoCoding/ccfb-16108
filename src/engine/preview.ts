// 印样预览：把矢量线稿栅格成墨层，模拟凹版油墨的厚度浮雕与侧光

import type { Linework, LinePoint } from './types'

export type PreviewMode = 'intaglio' | 'overprint'

export interface PreviewOptions {
  mode: PreviewMode
  // 侧光方向（弧度）与仰角强度
  lightAngle: number
  reliefStrength: number
  zoom: number
}

// 墨层高度图：线宽越大压入纸张的墨越厚，高度越高
export function renderInkHeight(linework: Linework): Float32Array {
  const { width: w, height: h } = linework
  const height = new Float32Array(w * h)

  // 按相邻点胶囊光栅化，高度取刀口宽度；与出图 ribbon 共用同一宽度数据源
  for (const line of linework.polylines) {
    const pts = line.points
    for (let i = 1; i < pts.length; i++) {
      stampSegmentHeight(height, w, h, pts[i - 1], pts[i])
    }
  }
  for (const dot of linework.dots) {
    const r = dot.diameter / 2
    const r2 = r * r
    const x0 = Math.max(0, Math.floor(dot.x - r))
    const x1 = Math.min(w - 1, Math.ceil(dot.x + r))
    const y0 = Math.max(0, Math.floor(dot.y - r))
    const y1 = Math.min(h - 1, Math.ceil(dot.y + r))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x + 0.5 - dot.x) ** 2 + (y + 0.5 - dot.y) ** 2
        if (d2 <= r2) height[y * w + x] = Math.max(height[y * w + x], dot.diameter)
      }
    }
  }
  return height
}

// 线段胶囊光栅化到高度图：高度即该段刀口宽度，墨越厚浮雕越高
function stampSegmentHeight(
  height: Float32Array,
  w: number,
  h: number,
  a: { x: number; y: number; width: number },
  b: { x: number; y: number; width: number },
): void {
  const segW = (a.width + b.width) / 2
  const half = segW / 2
  const r = Math.ceil(half)
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x) - r))
  const maxX = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x) + r))
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y) - r))
  const maxY = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y) + r))
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let t = 0
      if (len2 > 1e-9) {
        t = ((x + 0.5 - a.x) * (b.x - a.x) + (y + 0.5 - a.y) * (b.y - a.y)) / len2
        t = Math.max(0, Math.min(1, t))
      }
      const px = a.x + (b.x - a.x) * t
      const py = a.y + (b.y - a.y) * t
      if (Math.hypot(x + 0.5 - px, y + 0.5 - py) > half) continue
      const i = y * w + x
      if (segW > height[i]) height[i] = segW
    }
  }
}

// 高度图 -> 浮雕受光像素：沿侧光方向做差分，迎光面提亮、背光面压暗
export function shadeRelief(
  height: Float32Array,
  w: number,
  h: number,
  opts: PreviewOptions,
): ImageData {
  const img = new ImageData(w, h)
  const lx = Math.cos(opts.lightAngle)
  const ly = Math.sin(opts.lightAngle)
  const paper = [238, 233, 222] // 暖白纸色
  const ink = [26, 24, 22] // 单色雕刻墨

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const p = i * 4
      const hx = height[i + 1] - height[i - 1]
      const hy = height[i + w] - height[i - w]
      const slope = (hx * lx + hy * ly) * opts.reliefStrength

      if (height[i] > 0.01) {
        // 墨层：本体深色，边缘受侧光打出高光
        const highlight = Math.max(0, slope) * 18
        img.data[p] = clamp255(ink[0] + highlight)
        img.data[p + 1] = clamp255(ink[1] + highlight)
        img.data[p + 2] = clamp255(ink[2] + highlight)
      } else {
        // 纸面：墨层外一圈阴影，模拟墨微微凸起的投影
        const shadow = Math.max(0, -slope) * 4
        img.data[p] = clamp255(paper[0] - shadow)
        img.data[p + 1] = clamp255(paper[1] - shadow)
        img.data[p + 2] = clamp255(paper[2] - shadow)
      }
      img.data[p + 3] = 255
    }
  }
  return img
}

// 雕刻 + 胶印套印：在单色浮雕上叠一层半透明伪彩，模拟胶印底色
export function applyOverprintTint(img: ImageData, tint: [number, number, number]): void {
  const alpha = 0.32
  for (let i = 0; i < img.data.length; i += 4) {
    const isPaper = img.data[i] > 180
    if (!isPaper) continue
    img.data[i] = clamp255(img.data[i] * (1 - alpha) + tint[0] * alpha)
    img.data[i + 1] = clamp255(img.data[i + 1] * (1 - alpha) + tint[1] * alpha)
    img.data[i + 2] = clamp255(img.data[i + 2] * (1 - alpha) + tint[2] * alpha)
  }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}
