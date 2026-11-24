// 引擎冒烟测试（Node 环境，不依赖 three.js）：
// 构造合成曲面场，验证流线追踪、间距约束、ribbon 与 SVG 全链路
// 运行：npx tsx scripts/smoke_engine.ts

import { createSurfaceBuffer } from '../src/engine/grid'
import { computeCurvatureField } from '../src/engine/field'
import type { NormalGradientSet } from '../src/engine/normal_grad'
import { createDefaultParams } from '../src/types'
import { generateLinework } from '../src/engine/pipeline'
import { validateLinework } from '../src/engine/validate'
import { exportSvg } from '../src/engine/svg'
import { buildRibbon } from '../src/engine/svg_ribbon'

const W = 360
const H = 280

function syntheticSurface() {
  const buf = createSurfaceBuffer(W, H)
  const grad: NormalGradientSet = {
    nxX: new Float32Array(W * H),
    nxY: new Float32Array(W * H),
    nyX: new Float32Array(W * H),
    nyY: new Float32Array(W * H),
    magnitude: new Float32Array(W * H),
  }

  // 圆形主图，内部造一个斜向亮度渐变 + 圆柱状法线梯度
  const cx = W / 2
  const cy = H / 2
  const radius = Math.min(W, H) * 0.42
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const d = Math.hypot(x - cx, y - cy)
      if (d > radius) continue
      buf.mask[i] = 1
      // 亮度从左上到右下由亮变暗，暗部在右下角
      buf.luminance[i] = 0.85 - 0.55 * ((x + y) / (W + H))
      buf.depth[i] = d / radius

      // 合成一个垂直走向的圆柱梯度（nx 随 x 变化），主方向应接近垂直
      const nx = Math.sin((x - cx) / radius)
      grad.nxX[i] = Math.cos((x - cx) / radius) / radius
      grad.nxY[i] = 0
      grad.nyX[i] = 0
      grad.nyY[i] = 0.02
      grad.magnitude[i] = Math.hypot(grad.nxX[i], grad.nyY[i])
      void nx
    }
  }

  computeCurvatureField(buf, grad, Math.PI / 2)
  return { buf, grad }
}

function main(): void {
  const { buf, grad } = syntheticSurface()
  const params = createDefaultParams('portrait')
  const t0 = performance.now()
  const linework = generateLinework({
    surface: buf,
    params,
    fieldOverride: null,
    regionMap: null,
    grad,
  })
  const elapsed = performance.now() - t0

  const report = validateLinework(linework)
  let ribbonFail = 0
  for (const line of linework.polylines) {
    if (!buildRibbon(line.points)) ribbonFail++
  }
  const svg = exportSvg(linework, { scale: '1x', widthMm: 40, heightMm: 30 })

  console.log('--- 引擎冒烟测试 ---')
  console.log(`折线数: ${linework.polylines.length}`)
  console.log(`点刻数: ${linework.dots.length}`)
  console.log(`生成耗时: ${linework.elapsedMs.toFixed(1)}ms（墙钟 ${elapsed.toFixed(1)}ms）`)
  console.log(`违规数: ${report.violations.length}，最小墨隙: ${report.minGap.toFixed(2)}px`)
  console.log(`ribbon 失败: ${ribbonFail}`)
  console.log(`SVG 长度: ${svg.length} 字符，闭合 path 数: ${(svg.match(/<path /g) ?? []).length}`)
  console.log(`SVG 头部: ${svg.split('\n').slice(0, 4).join(' | ')}`)

  const fail =
    linework.polylines.length < 50 ||
    ribbonFail > 0 ||
    !svg.includes('viewBox') ||
    !svg.includes('<path')
  if (fail) {
    console.error('冒烟测试失败')
    process.exit(1)
  }
  console.log('冒烟测试通过')
}

main()
