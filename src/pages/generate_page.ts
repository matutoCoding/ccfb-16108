// 线稿生成页：三维取景或照片解码 -> 场捕获 -> 齿孔拦截 -> 流水线生成

import * as THREE from 'three'
import { assetRepo, projectRepo } from '@/db/idb'
import type { AssetRecord, StampProject } from '@/types'
import type { ModelFields } from '@/engine/surface_builder'
import type { PhotoFields } from '@/engine/photo'
import { h, toast } from '@/ui/dom'
import { icons } from '@/ui/icons'
import { navigate, type RouteParams } from '@/router'
import { getSession, setSession } from '@/state/session'
import { ModelView } from '@/engine/model_view'
import { captureModelFields } from '@/engine/surface_builder'
import { createHeadModel, createPagodaModel } from '@/engine/test_models'
import { loadModelAsset } from '@/engine/model_loader'
import { decodePhoto, photoToSurface } from '@/engine/photo'
import { buildPixelFrame, clampMaskToSafeArea, drawPerforation, measurePerforationViolation } from '@/ui/perforation'
import { generateLinework, summarizeLinework } from '@/engine/pipeline'
import { validateLinework } from '@/engine/validate'
import { createVariant, saveVariant } from '@/state/variants'
import { createLineworkCanvas, type LineworkCanvasHandle } from '@/ui/linework_canvas'

type Fields = ModelFields | PhotoFields

export async function render(params: RouteParams): Promise<HTMLElement> {
  const session = getSession()
  const projectId = params.projectId ?? session.projectId
  const project = projectId ? await projectRepo.get(projectId) : undefined
  if (!project) return missingProject()
  setSession({ project, projectId: project.id })

  const assets = await assetRepo.listByProject(project.id)
  const select = h(
    'select',
    { class: 'select' },
    ...assets.map((a) => h('option', { value: a.id, selected: session.assetId === a.id ? true : false }, a.name)),
  ) as HTMLSelectElement

  const frame = buildPixelFrame(project, 720)
  const canvas3d = h('canvas', { class: 'source-canvas', width: frame.widthPx, height: frame.heightPx }) as HTMLCanvasElement
  const resultCanvas = h('canvas', { class: 'source-canvas' }) as HTMLCanvasElement
  const frameEl = h('div', { class: 'canvas-frame frame-canvas' }, canvas3d)

  const statusBox = h('div', { class: 'banner banner-info' }, '选择素材后开始准备三维场…')
  const perfBox = h('div', { class: 'banner banner-warning', hidden: true })
  const stats = h('div', { class: 'stat-row' })
  let view: ModelView | null = null
  let fields: Fields | null = null
  let handle: LineworkCanvasHandle | null = null

  async function prepare(asset: AssetRecord): Promise<void> {
    statusBox.className = 'banner banner-info'
    statusBox.textContent = '正在准备素材场…'
    try {
      if (asset.kind === 'model') {
        if (!view) view = new ModelView(canvas3d, frame.widthPx, frame.heightPx)
        const obj = await loadObject(asset)
        view.setObject(obj)
        view.resize(frame.widthPx, frame.heightPx)
        view.renderToCanvas()
        drawPerfOverlay(canvas3d, frame)
        fields = captureModelFields(view, project.preset === 'architecture' ? 0 : Math.PI / 2)
      } else {
        if (view) {
          view.dispose()
          view = null
        }
        if (!asset.blob) throw new Error('照片文件丢失')
        const bitmap = await decodePhoto(asset.blob, 720)
        fields = photoToSurface(
          bitmap,
          project.preset,
          project.preset === 'architecture' ? 0 : Math.PI / 2,
          { width: frame.widthPx, height: frame.heightPx },
        )
        drawPhotoToCanvas(canvas3d, bitmap, frame)
        bitmap.close()
      }

      const violation = measurePerforationViolation(fields.surface.mask, fields.surface.width, fields.surface.height, frame)
      if (violation.count > 0) {
        perfBox.hidden = false
        perfBox.textContent = `主图有 ${violation.count} 个像素压到齿孔安全区（${(violation.ratio * 100).toFixed(2)}%），生成时将自动裁进安全区。`
        clampMaskToSafeArea(fields.surface.mask, fields.surface.width, fields.surface.height, frame)
      } else {
        perfBox.hidden = true
      }
      statusBox.className = 'banner banner-info'
      statusBox.textContent = '场准备完成，可以生成线稿。旋转模型后重新生成会按当前视角重新捕获。'
    } catch (err) {
      statusBox.className = 'banner banner-danger'
      statusBox.textContent = `素材准备失败：${(err as Error).message}`
    }
  }

  if (assets.length === 0) {
    return h(
      'div',
      { class: 'page' },
      pageHead(project),
      h('div', { class: 'card empty-state' }, h('div', { class: 'empty-icon', innerHTML: icons.alert }), h('h3', {}, '这个选题还没有素材'), h('p', {}, '先去素材导入页上传模型或照片，或生成内置测试模型。'), h('button', { class: 'btn btn-primary', onclick: () => navigate(`/assets/${project.id}`) }, '去素材导入')),
    )
  }

  select.value = session.assetId && assets.some((a) => a.id === session.assetId) ? session.assetId : assets[0].id
  const initial = assets.find((a) => a.id === select.value) ?? assets[0]
  setSession({ asset: initial, assetId: initial.id })
  void prepare(initial)
  select.addEventListener('change', () => {
    const asset = assets.find((a) => a.id === select.value)
    if (!asset) return
    setSession({ asset, assetId: asset.id })
    localStorage.setItem('session.assetId', asset.id)
    void prepare(asset)
  })

  const nameInput = h('input', { class: 'input', value: `版本 ${new Date().toLocaleDateString('zh-CN')}` }) as HTMLInputElement
  const generateBtn = h('button', { class: 'btn btn-primary' }, h('span', { innerHTML: icons.generate }), '生成线稿')
  generateBtn.addEventListener('click', () => void runGenerate())

  async function runGenerate(): Promise<void> {
    if (!fields) {
      toast('素材场还没准备好', 'danger')
      return
    }
    generateBtn.disabled = true
    statusBox.className = 'banner banner-info'
    statusBox.textContent = '正在追踪流线，目标 3 秒内刷新…'
    // 让浏览器先把状态文字刷出来，再进入同步计算
    await new Promise((r) => setTimeout(r, 30))

    const t0 = performance.now()
    const variant = createVariant(project.id, initial.id, nameInput.value || '未命名版本', project.preset)
    // 用角度副本，避免 applyFieldOverride 污染缓存场，保证连续多次生成结果一致
    const sourceSurface = fields.surface
    const surfaceForRun: typeof sourceSurface = {
      width: sourceSurface.width,
      height: sourceSurface.height,
      mask: sourceSurface.mask,
      depth: sourceSurface.depth,
      luminance: sourceSurface.luminance,
      angle: new Float32Array(sourceSurface.angle),
      confidence: sourceSurface.confidence,
    }
    const linework = generateLinework({
      surface: surfaceForRun,
      params: variant.params,
      fieldOverride: variant.fieldOverride,
      regionMap: variant.regionMap,
      grad: fields.grad,
    })
    const validation = validateLinework(linework)
    variant.linework = linework
    variant.validation = validation
    await saveVariant(variant)
    setSession({ variant, variantId: variant.id })
    localStorage.setItem('session.variantId', variant.id)

    if (!handle) handle = createLineworkCanvas(resultCanvas)
    handle.setLinework(linework)
    handle.setViolations(validation.violations)

    const summary = summarizeLinework(linework)
    stats.replaceChildren(
      statCard(summary.lineCount, '矢量线条'),
      statCard(summary.dotCount, '点刻数'),
      statCard(`${linework.elapsedMs.toFixed(0)} ms`, '生成耗时'),
      statCard(validation.violations.length, '约束违规'),
    )
    statusBox.className = validation.violations.length ? 'banner banner-danger' : 'banner banner-info'
    statusBox.textContent = validation.violations.length
      ? `完成，发现 ${validation.violations.length} 处间距/刀口违规，已在图中红圈标注。`
      : `完成，所有线条满足最小间距与刀口约束，总耗时 ${linework.elapsedMs.toFixed(0)}ms。`
    generateBtn.disabled = false
    toast(`线稿已生成：${summary.lineCount} 根线，耗时 ${(performance.now() - t0).toFixed(0)}ms`)
  }

  const side = h(
    'aside',
    { class: 'card panel' },
    h('h3', {}, '生成设置'),
    h('div', { class: 'field' }, h('label', {}, '选择素材'), select),
    h('div', { class: 'field' }, h('label', {}, '版本名称'), nameInput),
    statusBox,
    perfBox,
    generateBtn,
    h(
      'div',
      { class: 'toolbar' },
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => navigate(`/tune/${project.id}`) }, '去刀法调校'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => navigate(`/preview/${project.id}`) }, '去印样预览'),
    ),
  )

  const resultWrap = h('div', { class: 'canvas-frame frame-canvas' }, resultCanvas, h('div', { class: 'canvas-badge' }, '滚轮缩放 / 拖拽平移，最高 12 倍'))

  return h(
    'div',
    { class: 'page' },
    pageHead(project),
    h('div', { class: 'work-grid' }, h('div', { class: 'card panel' }, h('h3', {}, '主图取景（含齿孔安全区）'), frameEl, h('p', { class: 'muted' }, '三维模型可拖动旋转、滚轮缩放；照片按原比例显示。橙色虚线为齿孔安全区。'), stats, h('h3', {}, '生成结果'), resultWrap), side),
  )
}

async function loadObject(asset: AssetRecord): Promise<THREE.Object3D> {
  if (asset.generated === 'head') return createHeadModel()
  if (asset.generated === 'pagoda') return createPagodaModel()
  if (!asset.blob) throw new Error('模型文件丢失')
  return loadModelAsset(asset.blob, asset.name)
}

function drawPhotoToCanvas(canvas: HTMLCanvasElement, bitmap: ImageBitmap, frame: ReturnType<typeof buildPixelFrame>): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = frame.widthPx
  canvas.height = frame.heightPx
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height) * 0.92
  const w = bitmap.width * scale
  const h = bitmap.height * scale
  ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
  drawPerfOverlay(canvas, frame)
}

function drawPerfOverlay(canvas: HTMLCanvasElement, frame: ReturnType<typeof buildPixelFrame>): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  drawPerforation(ctx, frame)
}

function pageHead(project: StampProject): HTMLElement {
  return h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, '线稿生成'), h('p', {}, `选题 ${project.setNo} ${project.figureNo}，排线沿表面主曲率，宽度随明暗连续变化。`)), h('button', { class: 'btn btn-ghost', onclick: () => navigate(`/assets/${project.id}`) }, '返回素材'))
}

function statCard(value: string | number, label: string): HTMLElement {
  return h('div', { class: 'stat' }, h('strong', {}, String(value)), h('span', {}, label))
}

function missingProject(): HTMLElement {
  return h('div', { class: 'card empty-state' }, h('div', { class: 'empty-icon', innerHTML: icons.alert }), h('h3', {}, '缺少选题上下文'), h('p', {}, '请先从选题档案进入。'), h('button', { class: 'btn btn-primary', onclick: () => navigate('/projects') }, '去选题档案'))
}
