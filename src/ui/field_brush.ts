// 方向场手绘画布：自动场短线 + 手刷权重叠加，涂抹/擦除/撤销

import type { FieldOverride, SurfaceBuffer } from '@/engine/types'
import { OVERRIDE_COLS, OVERRIDE_ROWS, paintStroke } from '@/engine/override'

export interface FieldBrushHandle {
  setBrushRadius: (r: number) => void
  setErase: (erase: boolean) => void
  undo: () => void
  clear: () => void
  getChangeCount: () => number
}

export function attachFieldBrush(
  canvas: HTMLCanvasElement,
  surface: SurfaceBuffer,
  override: FieldOverride,
  onChange: () => void,
): FieldBrushHandle {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('方向场画布初始化失败')
  canvas.width = surface.width
  canvas.height = surface.height

  let erase = false
  let painting = false
  let last: { x: number; y: number } | null = null
  let changes = 0
  let drawQueued = false
  const undoStack: { angle: Float32Array; weight: Float32Array }[] = []

  // rAF 合帧：pointermove 高频触发时每帧最多重画一次
  function scheduleDraw(): void {
    if (drawQueued) return
    drawQueued = true
    requestAnimationFrame(() => {
      drawQueued = false
      draw()
    })
  }

  function toGrid(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * OVERRIDE_COLS
    const y = ((e.clientY - rect.top) / rect.height) * OVERRIDE_ROWS
    return { x, y }
  }

  function snapshot(): void {
    undoStack.push({
      angle: new Float32Array(override.angle),
      weight: new Float32Array(override.weight),
    })
    if (undoStack.length > 20) undoStack.shift()
  }

  function draw(): void {
    const w = surface.width
    const h = surface.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(248, 250, 252, 0.55)'
    ctx.fillRect(0, 0, w, h)

    // 自动方向场：每个抽样格画一条短线
    const step = Math.max(6, Math.floor(w / 110))
    ctx.lineWidth = 1
    for (let gy = step / 2; gy < h; gy += step) {
      for (let gx = step / 2; gx < w; gx += step) {
        const ix = Math.min(w - 1, Math.floor(gx))
        const iy = Math.min(h - 1, Math.floor(gy))
        const i = iy * w + ix
        if (!surface.mask[i]) continue
        const a = surface.angle[i]
        const len = step * 0.7
        ctx.strokeStyle = 'rgba(67, 56, 202, 0.55)'
        ctx.beginPath()
        ctx.moveTo(gx - Math.cos(a) * len, gy - Math.sin(a) * len)
        ctx.lineTo(gx + Math.cos(a) * len, gy + Math.sin(a) * len)
        ctx.stroke()
      }
    }

    // 手刷覆盖区：暖色半透明块 + 角度线
    const cellW = w / OVERRIDE_COLS
    const cellH = h / OVERRIDE_ROWS
    for (let y = 0; y < OVERRIDE_ROWS; y++) {
      for (let x = 0; x < OVERRIDE_COLS; x++) {
        const gi = y * OVERRIDE_COLS + x
        const weight = override.weight[gi]
        if (weight < 0.05) continue
        ctx.fillStyle = `rgba(217, 119, 6, ${0.12 + weight * 0.25})`
        ctx.fillRect(x * cellW, y * cellH, cellW + 1, cellH + 1)
        const cx = (x + 0.5) * cellW
        const cy = (y + 0.5) * cellH
        const a = override.angle[gi]
        const len = Math.min(cellW, cellH) * 0.9
        ctx.strokeStyle = `rgba(180, 83, 9, ${0.4 + weight * 0.5})`
        ctx.beginPath()
        ctx.moveTo(cx - Math.cos(a) * len, cy - Math.sin(a) * len)
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len)
        ctx.stroke()
      }
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    painting = true
    canvas.setPointerCapture(e.pointerId)
    last = toGrid(e)
    snapshot()
    handlePointer(e)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!painting) return
    handlePointer(e)
  })
  const stop = (): void => {
    if (painting) {
      painting = false
      last = null
      changes++
      onChange()
    }
  }
  canvas.addEventListener('pointerup', stop)
  canvas.addEventListener('pointercancel', stop)

  function handlePointer(e: PointerEvent): void {
    if (!last) return
    const p = toGrid(e)
    // 笔刷角度取涂抹方向；起笔几乎没移动时沿用该点自动场角度
    const dx = p.x - last.x
    const dy = p.y - last.y
    const angle = Math.hypot(dx, dy) < 0.4 ? autoAngleAt(p.x, p.y) : Math.atan2(dy, dx)
    paintStroke(override, last, p, angle, erase)
    last = p
    scheduleDraw()
  }

  function autoAngleAt(gx: number, gy: number): number {
    const px = Math.min(surface.width - 1, Math.floor((gx / OVERRIDE_COLS) * surface.width))
    const py = Math.min(surface.height - 1, Math.floor((gy / OVERRIDE_ROWS) * surface.height))
    return surface.angle[py * surface.width + px]
  }

  draw()

  return {
    setBrushRadius(r) {
      override.brushRadius = r
    },
    setErase(v) {
      erase = v
      canvas.style.cursor = v ? 'cell' : 'crosshair'
    },
    undo() {
      const snap = undoStack.pop()
      if (!snap) return
      override.angle.set(snap.angle)
      override.weight.set(snap.weight)
      draw()
      onChange()
    },
    clear() {
      snapshot()
      override.weight.fill(0)
      draw()
      onChange()
    },
    getChangeCount: () => changes,
  }
}
