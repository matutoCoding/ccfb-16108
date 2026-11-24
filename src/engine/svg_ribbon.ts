// 变宽折线 -> 闭合 ribbon 轮廓：逐点法线偏移，前后链首尾相接
// 这是「每根线是宽度连续变化的闭合轮廓」要求的几何实现

import type { LinePoint } from './types'

export interface Ribbon {
  // 闭合轮廓点：左链从头到尾 + 右链从尾到头
  outline: { x: number; y: number }[]
}

export function buildRibbon(points: LinePoint[]): Ribbon | null {
  if (points.length < 2) return null

  const n = points.length
  const normals: { x: number; y: number }[] = new Array(n)

  for (let i = 0; i < n; i++) {
    let tx: number
    let ty: number
    if (i === 0) {
      tx = points[1].x - points[0].x
      ty = points[1].y - points[0].y
    } else if (i === n - 1) {
      tx = points[n - 1].x - points[n - 2].x
      ty = points[n - 1].y - points[n - 2].y
    } else {
      tx = points[i + 1].x - points[i - 1].x
      ty = points[i + 1].y - points[i - 1].y
    }
    const len = Math.hypot(tx, ty) || 1
    // 单位法线
    normals[i] = { x: -ty / len, y: tx / len }
  }

  // 左右两条偏移链；miter 过长时截断，防尖角处爆出毛刺
  const left: { x: number; y: number }[] = []
  const right: { x: number; y: number }[] = []
  const maxMiter = 2.5

  for (let i = 0; i < n; i++) {
    const half = points[i].width / 2
    let nx = normals[i].x
    let ny = normals[i].y

    if (i > 0 && i < n - 1) {
      const prev = points[i - 1]
      const next = points[i + 1]
      const a = Math.atan2(points[i].y - prev.y, points[i].x - prev.x)
      const b = Math.atan2(next.y - points[i].y, next.x - points[i].x)
      const halfTurn = (b - a) / 2
      const miter = 1 / Math.max(0.25, Math.abs(Math.cos(halfTurn)))
      const scale = Math.min(miter, maxMiter)
      nx *= scale
      ny *= scale
    }

    left.push({ x: points[i].x + nx * half, y: points[i].y + ny * half })
    right.push({ x: points[i].x - nx * half, y: points[i].y - ny * half })
  }

  // 零宽收尖点左右重合，闭合后天然是尖的，不会出现半截线帽
  const outline = [...left, ...right.reverse()]
  return { outline }
}

// 轮廓点链转 SVG path 字符串（绝对坐标，L 折线，首尾 Z 闭合）
export function ribbonToPath(ribbon: Ribbon, scale: number): string {
  const pts = ribbon.outline
  if (pts.length < 3) return ''
  let d = `M${fmt(pts[0].x * scale)} ${fmt(pts[0].y * scale)}`
  for (let i = 1; i < pts.length; i++) {
    d += `L${fmt(pts[i].x * scale)} ${fmt(pts[i].y * scale)}`
  }
  return `${d}Z`
}

// 输出坐标保留 2 位小数，控制 SVG 体积；几万根线也不会膨胀失控
function fmt(v: number): string {
  return Math.round(v * 100) / 100 + ''
}
