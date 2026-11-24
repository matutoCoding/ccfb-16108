// 刀法分区画布：点刻/短线/长线三色分区，矩形拖拽绘制

import type { RegionMap, SurfaceBuffer, Technique } from '@/engine/types'
import { REGION_COLS, REGION_ROWS, paintRegion, techniqueIndex } from '@/engine/override'

const COLORS: Record<Technique, string> = {
  stipple: 'rgba(180, 83, 9, 0.35)',
  short: 'rgba(67, 56, 202, 0.30)',
  long: 'rgba(21, 128, 61, 0.22)',
}

export function attachRegionBrush(
  canvas: HTMLCanvasElement,
  surface: SurfaceBuffer,
  region: RegionMap,
  onChange: () => void,
): { setTechnique: (t: Technique) => void; clear: (t: Technique) => void } {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('分区画布初始化失败')
  canvas.width = surface.width
  canvas.height = surface.height

  let technique: Technique = 'short'
  let start: { x: number; y: number } | null = null

  function toGrid(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * REGION_COLS,
      y: ((e.clientY - rect.top) / rect.height) * REGION_ROWS,
    }
  }

  function draw(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const cellW = canvas.width / REGION_COLS
    const cellH = canvas.height / REGION_ROWS
    for (let y = 0; y < REGION_ROWS; y++) {
      for (let x = 0; x < REGION_COLS; x++) {
        const v = region.cells[y * REGION_COLS + x]
        const tech: Technique = v === 0 ? 'stipple' : v === 1 ? 'short' : 'long'
        if (!surface.mask[Math.min(surface.height - 1, Math.floor((y + 0.5) * cellH)) * surface.width + Math.min(surface.width - 1, Math.floor((x + 0.5) * cellW))]) continue
        ctx.fillStyle = COLORS[tech]
        ctx.fillRect(x * cellW, y * cellH, cellW + 1, cellH + 1)
      }
    }
    // 网格线
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= REGION_COLS; x += 4) {
      ctx.beginPath()
      ctx.moveTo(x * cellW, 0)
      ctx.lineTo(x * cellW, canvas.height)
      ctx.stroke()
    }
    for (let y = 0; y <= REGION_ROWS; y += 4) {
      ctx.beginPath()
      ctx.moveTo(0, y * cellH)
      ctx.lineTo(canvas.width, y * cellH)
      ctx.stroke()
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId)
    start = toGrid(e)
  })
  canvas.addEventListener('pointerup', (e) => {
    if (!start) return
    const end = toGrid(e)
    paintRegion(region, start, end, technique)
    start = null
    draw()
    onChange()
  })

  draw()
  return {
    setTechnique(t) {
      technique = t
    },
    clear(t) {
      region.cells.fill(techniqueIndex(t))
      draw()
      onChange()
    },
  }
}
