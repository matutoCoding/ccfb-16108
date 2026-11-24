// 刀法调校页：方向场手刷、刀法分区、参数滑块，防抖 3 秒内重算

import { projectRepo, variantRepo } from '@/db/idb'
import type { LineworkParams, LineworkVariant, StampProject, Technique } from '@/types'
import { h, toast } from '@/ui/dom'
import { icons } from '@/ui/icons'
import { navigate, type RouteParams } from '@/router'
import { getSession, setSession } from '@/state/session'
import { ensureAsset, getCachedFields } from '@/state/field_service'
import { createLineworkCanvas } from '@/ui/linework_canvas'
import { attachFieldBrush, type FieldBrushHandle } from '@/ui/field_brush'
import { attachRegionBrush } from '@/ui/region_brush'
import { createFieldOverride, createRegionMap } from '@/engine/override'
import { generateLinework, summarizeLinework } from '@/engine/pipeline'
import { validateLinework } from '@/engine/validate'
import { saveVariant } from '@/state/variants'
import { buildPixelFrame, drawPerforation } from '@/ui/perforation'

type Tab = 'field' | 'region' | 'params'

export async function render(params: RouteParams): Promise<HTMLElement> {
  const projectId = params.projectId ?? getSession().projectId
  const project = projectId ? await projectRepo.get(projectId) : undefined
  if (!project) return missing('缺少选题上下文', '/projects')
  setSession({ project, projectId: project.id })

  const variants = await variantRepo.listByProject(project.id)
  if (variants.length === 0) {
    return h(
      'div',
      { class: 'page' },
      head(project),
      h('div', { class: 'card empty-state' }, h('div', { class: 'empty-icon', innerHTML: icons.tune }), h('h3', {}, '还没有可调校的线稿版本'), h('p', {}, '先在线稿生成页跑出第一版，再来这里刷方向场、分刀法区。'), h('button', { class: 'btn btn-primary', onclick: () => navigate(`/generate/${project.id}`) }, '去线稿生成')),
    )
  }

  const session = getSession()
  let variant = session.variant && variants.some((v) => v.id === session.variant.id) ? session.variant : variants[0]
  setSession({ variant, variantId: variant.id })
  const asset = await ensureAsset(variant.assetId)
  const cached = getCachedFields(asset.id)
  if (!cached) {
    return h(
      'div',
      { class: 'page' },
      head(project),
      h('div', { class: 'card empty-state' }, h('div', { class: 'empty-icon', innerHTML: icons.alert }), h('h3', {}, '曲面场已失效'), h('p', {}, '刷新页面后内存场被清空，请回生成页重新捕获素材。'), h('button', { class: 'btn btn-primary', onclick: () => navigate(`/generate/${project.id}`) }, '回生成页')),
    )
  }

  const frame = buildPixelFrame(project, cached.surface.width)
  const fieldCanvas = h('canvas', {}) as HTMLCanvasElement
  const regionCanvas = h('canvas', {}) as HTMLCanvasElement
  const resultCanvas = h('canvas', {}) as HTMLCanvasElement

  const resultHandle = createLineworkCanvas(resultCanvas)
  if (variant.linework) {
    resultHandle.setLinework(variant.linework)
    resultHandle.setViolations(variant.validation?.violations ?? [])
  }

  // 历史数据兜底：老版本方案可能没有手刷/分区网格
  if (!variant.fieldOverride) variant.fieldOverride = createFieldOverride()
  if (!variant.regionMap) variant.regionMap = createRegionMap()
  const fieldHandle: FieldBrushHandle = attachFieldBrush(fieldCanvas, cached.surface, variant.fieldOverride, scheduleRegenerate)
  const regionHandle = attachRegionBrush(regionCanvas, cached.surface, variant.regionMap, scheduleRegenerate)
  drawFrameGuides(fieldCanvas, frame)
  drawFrameGuides(regionCanvas, frame)

  let tab: Tab = 'field'
  const tabPanels: Record<Tab, HTMLElement> = {
    field: h('div', { class: 'field-canvas-wrap canvas-frame' }, fieldCanvas),
    region: h('div', { class: 'field-canvas-wrap canvas-frame' }, regionCanvas),
    params: h('div', {}),
  }
  tabPanels.params.append(buildParamsPanel(variant, scheduleRegenerate))

  const seg = h(
    'div',
    { class: 'segmented' },
    tabBtn('field', '方向场手刷'),
    tabBtn('region', '刀法分区'),
    tabBtn('params', '刀口与间距'),
  )

  function tabBtn(name: Tab, label: string): HTMLElement {
    return h(
      'button',
      {
        class: tab === name ? 'active' : '',
        onclick: () => {
          tab = name
          for (const [key, btn] of Array.from(seg.querySelectorAll('button')).entries()) {
            btn.classList.toggle('active', ['field', 'region', 'params'][key] === name)
          }
          for (const [key, panel] of Object.entries(tabPanels)) {
            panel.hidden = key !== name
          }
          fieldTools.hidden = name !== 'field'
          regionTools.hidden = name !== 'region'
        },
      },
      label,
    )
  }

  let timer = 0
  let running = false
  let pending = false
  function scheduleRegenerate(): void {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void regenerate(), 220)
  }

  async function regenerate(): Promise<void> {
    if (running) {
      pending = true
      return
    }
    running = true
    statusEl.className = 'banner banner-info'
    statusEl.textContent = '方向场已变更，正在重算流线…'
    await new Promise((r) => setTimeout(r, 20))
    const t0 = performance.now()
    // 每次重算用缓存场的独立副本，避免手刷融合反复叠加污染原始角度
    const fresh = getCachedFields(asset.id)
    if (!fresh) {
      running = false
      return
    }
    const surfaceCopy: typeof fresh.surface = {
      width: fresh.surface.width,
      height: fresh.surface.height,
      mask: fresh.surface.mask,
      depth: fresh.surface.depth,
      luminance: fresh.surface.luminance,
      angle: new Float32Array(fresh.surface.angle),
      confidence: fresh.surface.confidence,
    }
    const linework = generateLinework({
      surface: surfaceCopy,
      params: variant.params,
      fieldOverride: variant.fieldOverride,
      regionMap: variant.regionMap,
      grad: fresh.grad,
    })
    const validation = validateLinework(linework)
    variant.linework = linework
    variant.validation = validation
    await saveVariant(variant)
    resultHandle.setLinework(linework)
    resultHandle.setViolations(validation.violations)
    const summary = summarizeLinework(linework)
    statusEl.className = validation.violations.length ? 'banner banner-danger' : 'banner banner-info'
    statusEl.textContent = `重算 ${linework.elapsedMs.toFixed(0)}ms（总交互 ${(performance.now() - t0).toFixed(0)}ms），${summary.lineCount} 根线，${validation.violations.length} 处违规。`
    running = false
    if (pending) {
      pending = false
      void regenerate()
    }
  }

  const statusEl = h('div', { class: 'banner banner-info' }, '在左侧刷方向场或画分区，停笔后自动重算。')

  const variantSelect = h(
    'select',
    {
      class: 'select',
      onchange: (e: Event) => {
        const id = (e.target as HTMLSelectElement).value
        const next = variants.find((v) => v.id === id)
        if (next) {
          variant = next
          setSession({ variant, variantId: variant.id })
          localStorage.setItem('session.variantId', variant.id)
          toast(`已切换到版本：${variant.name}`)
          resultHandle.setLinework(variant.linework)
          resultHandle.setViolations(variant.validation?.violations ?? [])
        }
      },
    },
    ...variants.map((v) => h('option', { value: v.id, selected: v.id === variant.id ? true : false }, v.name)),
  ) as HTMLSelectElement

  const side = h(
    'aside',
    { class: 'card panel' },
    h('h3', {}, '调校工具'),
    h('div', { class: 'field' }, h('label', {}, '线稿版本'), variantSelect),
    statusEl,
    h(
      'div',
      { class: 'toolbar' },
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => navigate(`/generate/${project.id}`) }, '回生成页'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => navigate(`/preview/${project.id}`) }, '去印样预览'),
    ),
  )

  const fieldTools = h(
    'div',
    { class: 'toolbar', id: 'field-tools' },
    h('span', { class: 'muted' }, '笔刷半径'),
    radiusInput(fieldHandle),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => fieldHandle.undo() }, '撤销一笔'),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => fieldHandle.clear() }, '清空手刷'),
  )

  const regionTools = h(
    'div',
    { class: 'toolbar', id: 'region-tools', hidden: true },
    techniqueBtn('stipple', '点刻'),
    techniqueBtn('short', '短线'),
    techniqueBtn('long', '长线'),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => regionHandle.clear('long') }, '重置为长线'),
  )
  function techniqueBtn(t: Technique, label: string): HTMLElement {
    return h('button', { class: 'btn btn-ghost btn-sm', onclick: () => regionHandle.setTechnique(t) }, label)
  }

  // 三类编辑面板在主区切换，参数面板不需要画布
  tabPanels.region.hidden = true
  tabPanels.params.classList.add('card', 'panel')
  tabPanels.params.style.maxHeight = '560px'
  tabPanels.params.style.overflow = 'auto'

  return h(
    'div',
    { class: 'page' },
    head(project),
    h(
      'div',
      { class: 'work-grid tune-grid' },
      h(
        'div',
        { style: 'display:flex;flex-direction:column;gap:var(--sp-4);min-width:0' },
        h('div', { class: 'card panel' }, h('h3', {}, '调校画布'), seg, fieldTools, regionTools, tabPanels.field, tabPanels.region, tabPanels.params),
        h('div', { class: 'card panel' }, h('h3', {}, '实时线稿'), h('div', { class: 'canvas-frame frame-canvas tall' }, resultCanvas, h('div', { class: 'canvas-badge' }, '滚轮放大至 10 倍检查单线，停笔 220ms 自动重算'))),
      ),
      side,
    ),
  )

  function radiusInput(handle: FieldBrushHandle): HTMLElement {
    const input = h('input', { type: 'range', min: '2', max: '10', step: '1', value: '4' }) as HTMLInputElement
    input.addEventListener('input', () => handle.setBrushRadius(Number(input.value)))
    return input
  }
}

function buildParamsPanel(variant: LineworkVariant, onChange: () => void): HTMLElement {
  const p = variant.params
  const panel = h('div', { class: 'param-group' })
  const defs: { key: keyof LineworkParams; label: string; min: number; max: number; step: number; unit?: string }[] = [
    { key: 'minWidth', label: '最小刀口', min: 0.3, max: 2, step: 0.05, unit: 'px' },
    { key: 'maxWidth', label: '最大刀口', min: 1, max: 4, step: 0.05, unit: 'px' },
    { key: 'minSpacing', label: '最小线距', min: 1, max: 4, step: 0.1, unit: 'px' },
    { key: 'maxSpacing', label: '最大线距', min: 3, max: 10, step: 0.1, unit: 'px' },
    { key: 'crossThreshold', label: '交叉触发暗度', min: 0.3, max: 0.9, step: 0.02 },
    { key: 'densityGain', label: '暗部密度增益', min: 0.6, max: 2, step: 0.05 },
    { key: 'widthExponent', label: '线宽明暗指数', min: 0.6, max: 2, step: 0.05 },
    { key: 'outlineBaseWidth', label: '轮廓基础线宽', min: 0.5, max: 3, step: 0.1, unit: 'px' },
  ]
  for (const def of defs) {
    const value = h('span', { class: 'range-value' }, `${p[def.key]}${def.unit ?? ''}`)
    const input = h('input', { type: 'range', min: def.min, max: def.max, step: def.step, value: p[def.key] }) as HTMLInputElement
    input.addEventListener('input', () => {
      ;(p[def.key] as number) = Number(input.value)
      value.textContent = `${input.value}${def.unit ?? ''}`
      onChange()
    })
    panel.append(h('div', { class: 'range-row' }, h('span', {}, def.label), input, value))
  }

  const layerSelect = h(
    'select',
    {
      class: 'select',
      onchange: (e: Event) => {
        p.crossLayerCount = Number((e.target as HTMLSelectElement).value)
        onChange()
      },
    },
    h('option', { value: '1', selected: p.crossLayerCount === 1 ? true : false }, '不交叉（单层）'),
    h('option', { value: '2', selected: p.crossLayerCount === 2 ? true : false }, '两层交叉'),
    h('option', { value: '3', selected: p.crossLayerCount === 3 ? true : false }, '三层交叉'),
  )
  panel.append(h('div', { class: 'field' }, h('label', {}, '交叉线层数'), layerSelect))
  return panel
}

function drawFrameGuides(canvas: HTMLCanvasElement, frame: ReturnType<typeof buildPixelFrame>): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  // 画刷组件已在自身尺寸上绘制，这里追加安全区参考线
  requestAnimationFrame(() => drawPerforation(ctx, frame))
}

function head(project: StampProject): HTMLElement {
  return h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, '刀法调校'), h('p', {}, `手刷方向场、圈定刀法分区，停笔即重算，目标每笔 3 秒内刷新。`)), h('button', { class: 'btn btn-ghost', onclick: () => navigate(`/generate/${project.id}`) }, '回生成页'))
}

function missing(text: string, path: string): HTMLElement {
  return h('div', { class: 'card empty-state' }, h('div', { class: 'empty-icon', innerHTML: icons.alert }), h('h3', {}, text), h('button', { class: 'btn btn-primary', onclick: () => navigate(path) }, '前往'))
}
