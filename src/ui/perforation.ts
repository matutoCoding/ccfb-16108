// 票幅与齿孔：毫米/像素换算、安全区计算、主图压齿孔拦截

import type { PerforationSpec, StampProject } from '@/types'

export interface PixelFrame {
  widthPx: number
  heightPx: number
  // 每毫米像素数
  pxPerMm: number
  // 齿孔安全区（像素）
  safe: {
    left: number
    top: number
    right: number
    bottom: number
  }
  holes: { x: number; y: number; r: number }[]
}

export function buildPixelFrame(
  project: StampProject,
  targetMaxSize = 900,
): PixelFrame {
  const pxPerMm = targetMaxSize / Math.max(project.widthMm, project.heightMm)
  const widthPx = Math.round(project.widthMm * pxPerMm)
  const heightPx = Math.round(project.heightMm * pxPerMm)
  const perf = project.perforation
  const left = Math.round(perf.marginMm * pxPerMm)
  const top = Math.round(perf.marginMm * pxPerMm)
  const right = widthPx - left
  const bottom = heightPx - top

  return {
    widthPx,
    heightPx,
    pxPerMm,
    safe: { left, top, right, bottom },
    holes: buildPerforationHoles(perf, widthPx, heightPx, pxPerMm),
  }
}

// 沿四边按齿孔节距布孔
function buildPerforationHoles(
  perf: PerforationSpec,
  w: number,
  h: number,
  pxPerMm: number,
): { x: number; y: number; r: number }[] {
  const r = perf.holeRadiusMm * pxPerMm
  const pitch = perf.pitchMm * pxPerMm
  const inset = perf.marginMm * pxPerMm
  const holes: { x: number; y: number; r: number }[] = []

  const placeEdge = (count: number, fn: (i: number) => { x: number; y: number }) => {
    for (let i = 0; i < count; i++) {
      const p = fn(i)
      holes.push({ x: p.x, y: p.y, r })
    }
  }

  const cols = Math.max(2, Math.round(w / pitch))
  const rows = Math.max(2, Math.round(h / pitch))
  placeEdge(cols, (i) => ({ x: ((i + 0.5) / cols) * w, y: inset }))
  placeEdge(cols, (i) => ({ x: ((i + 0.5) / cols) * w, y: h - inset }))
  placeEdge(rows, (i) => ({ x: inset, y: ((i + 0.5) / rows) * h }))
  placeEdge(rows, (i) => ({ x: w - inset, y: ((i + 0.5) / rows) * h }))
  return holes
}

// 主图遮罩是否侵入齿孔安全区：返回违规像素比例
export function measurePerforationViolation(
  mask: Uint8Array,
  w: number,
  h: number,
  frame: PixelFrame,
): { ratio: number; count: number } {
  let count = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      if (
        x < frame.safe.left ||
        x > frame.safe.right ||
        y < frame.safe.top ||
        y > frame.safe.bottom
      ) {
        count++
      }
    }
  }
  return { ratio: count / mask.length, count }
}

// 把遮罩裁进安全区，用于强制修正
export function clampMaskToSafeArea(
  mask: Uint8Array,
  w: number,
  h: number,
  frame: PixelFrame,
): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (
        x < frame.safe.left ||
        x > frame.safe.right ||
        y < frame.safe.top ||
        y > frame.safe.bottom
      ) {
        mask[y * w + x] = 0
      }
    }
  }
}

// 画齿孔与安全区参考线
export function drawPerforation(
  ctx: CanvasRenderingContext2D,
  frame: PixelFrame,
): void {
  ctx.save()
  ctx.strokeStyle = '#b45309'
  ctx.lineWidth = 1
  ctx.setLineDash([6, 4])
  const { safe } = frame
  ctx.strokeRect(safe.left, safe.top, safe.right - safe.left, safe.bottom - safe.top)
  ctx.setLineDash([])

  ctx.fillStyle = 'rgba(180, 83, 9, 0.18)'
  for (const hole of frame.holes) {
    ctx.beginPath()
    ctx.arc(hole.x, hole.y, hole.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export function defaultPerforation(): PerforationSpec {
  return {
    marginMm: 4,
    holeRadiusMm: 0.6,
    pitchMm: 2.5,
  }
}
