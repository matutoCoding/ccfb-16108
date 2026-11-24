// SVG 出图：整幅线稿序列化为矢量文件，支持 1:1 与 5x 两档

import type { ExportScale, Linework } from '@/types'
import { buildRibbon, ribbonToPath } from './svg_ribbon'

export interface SvgExportOptions {
  scale: ExportScale
  // 票幅物理尺寸（毫米），写入 viewBox 与 width/height 保证 1:1 物理输出
  widthMm: number
  heightMm: number
  inkColor?: string
}

export function exportSvg(linework: Linework, opts: SvgExportOptions): string {
  const factor = opts.scale === '5x' ? 5 : 1
  const ink = opts.inkColor ?? '#111111'
  const vw = linework.width
  const vh = linework.height
  const physW = opts.widthMm * factor
  const physH = opts.heightMm * factor

  const head = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${physW}mm" height="${physH}mm"`,
    ` viewBox="0 0 ${vw} ${vh}" version="1.1">`,
    `<rect x="0" y="0" width="${vw}" height="${vh}" fill="#ffffff"/>`,
    `<g fill="${ink}" stroke="none">`,
  ]

  const body: string[] = []
  let skipped = 0

  for (const line of linework.polylines) {
    const ribbon = buildRibbon(line.points)
    if (!ribbon) {
      skipped++
      continue
    }
    const d = ribbonToPath(ribbon, 1)
    if (d) body.push(`<path d="${d}"/>`)
  }

  // 点刻：同样输出为闭合圆轮廓，保持全文件图元类型统一
  for (const dot of linework.dots) {
    const r = dot.diameter / 2
    body.push(
      `<circle cx="${round2(dot.x)}" cy="${round2(dot.y)}" r="${round2(r)}"/>`,
    )
  }

  const tail = ['</g>', '</svg>']
  if (skipped > 0) {
    body.unshift(`<!-- skipped ${skipped} degenerate lines -->`)
  }
  return [...head, ...body, ...tail].join('\n')
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

// SVG 体积估算，出图页给雕刻师提示文件量级
export function estimateSvgSize(linework: Linework): number {
  let bytes = 400
  for (const line of linework.polylines) {
    bytes += line.points.length * 2 * 12 + 40
  }
  bytes += linework.dots.length * 48
  return bytes
}
