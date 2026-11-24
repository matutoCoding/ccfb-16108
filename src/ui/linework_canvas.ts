// 线稿矢量画布：缩放/平移查看，支持十倍放大逐线检查

import type { Linework, Violation } from '@/engine/types'

export interface LineworkCanvasHandle {
  setLinework: (linework: Linework | null) => void
  setViolations: (violations: Violation[]) => void
  setZoom: (zoom: number) => void
  getZoom: () => number
  reset: () => void
  dispose: () => void
}

export function createLineworkCanvas(canvas: HTMLCanvasElement): LineworkCanvasHandle {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画布 2D 上下文初始化失败')

  let linework: Linework | null = null
  let violations: Violation[] = []
  let zoom = 1
  let panX = 0
  let panY = 0
  let dragging = false
  let lastX = 0
  let lastY = 0

  function render(): void {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    if (!linework) {
      drawPlaceholder(ctx, w, h)
      return
    }

    // 等比适配后再乘缩放
    const fit = Math.min(
      (w - 32) / linework.width,
      (h - 32) / linework.height,
    )
    const scale = fit * zoom
    const ox = (w - linework.width * scale) / 2 + panX
    const oy = (h - linework.height * scale) / 2 + panY

    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(scale, scale)
    ctx.strokeStyle = '#111111'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // 票幅白底
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, linework.width, linework.height)

    // 按 0.25px 宽度分桶后批量描边，把 stroke 调用从「每段一次」降到「每桶一次」
    const buckets = new Map<number, Path2D>()
    for (const line of linework.polylines) {
      const pts = line.points
      for (let i = 1; i < pts.length; i++) {
        const segW = Math.max(0.2, (pts[i - 1].width + pts[i].width) / 2)
        const key = Math.round(segW * 4)
        let path = buckets.get(key)
        if (!path) {
          path = new Path2D()
          buckets.set(key, path)
        }
        path.moveTo(pts[i - 1].x, pts[i - 1].y)
        path.lineTo(pts[i].x, pts[i].y)
      }
    }
    ctx.strokeStyle = '#111111'
    for (const [key, path] of buckets) {
      ctx.lineWidth = key / 4
      ctx.stroke(path)
    }

    ctx.fillStyle = '#111111'
    for (const dot of linework.dots) {
      ctx.beginPath()
      ctx.arc(dot.x, dot.y, dot.diameter / 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    // 违规高亮：红圈标注，最严重的 300 个避免遮挡
    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(scale, scale)
    const shown = violations.slice(0, 300)
    ctx.strokeStyle = '#dc2626'
    ctx.fillStyle = 'rgba(220, 38, 38, 0.18)'
    ctx.lineWidth = Math.max(0.6, 1 / scale)
    for (const v of shown) {
      const r = v.kind === 'spacing' ? 2.2 : 3
      ctx.beginPath()
      ctx.arc(v.x, v.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return
    panX += e.clientX - lastX
    panY += e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    render()
  })
  canvas.addEventListener('pointerup', () => {
    dragging = false
  })
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      zoom = Math.max(0.5, Math.min(12, zoom * factor))
      render()
    },
    { passive: false },
  )

  const ro = new ResizeObserver(() => render())
  ro.observe(canvas)

  return {
    setLinework(value) {
      linework = value
      render()
    },
    setViolations(value) {
      violations = value
      render()
    },
    setZoom(value) {
      zoom = value
      render()
    },
    getZoom: () => zoom,
    reset() {
      zoom = 1
      panX = 0
      panY = 0
      render()
    },
    dispose() {
      ro.disconnect()
    },
  }
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '14px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('暂无线稿，先生成一版再看', w / 2, h / 2)
}
