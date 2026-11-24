// 印样预览页：凹版墨层浮雕、侧光、单色/套印、多版并排十倍检查

import { projectRepo, variantRepo } from '@/db/idb'
import type { Linework, StampProject } from '@/types'
import { h } from '@/ui/dom'
import { icons } from '@/ui/icons'
import { navigate, type RouteParams } from '@/router'
import { getSession, setSession } from '@/state/session'
import { applyOverprintTint, renderInkHeight, shadeRelief, type PreviewMode, type PreviewOptions } from '@/engine/preview'

export async function render(params: RouteParams): Promise<HTMLElement> {
  const projectId = params.projectId ?? getSession().projectId
  const project = projectId ? await projectRepo.get(projectId) : undefined
  if (!project) return missing('缺少选题上下文', '/projects')
  setSession({ project, projectId: project.id })

  // 并排比较同一主图（素材）的多版疏密；没有素材上下文时退化为选题内全部版本
  const assetId = getSession().assetId
  const all = await variantRepo.listByProject(project.id)
  const variants = all.filter((v) => v.linework && (!assetId || v.assetId === assetId))
  if (variants.length === 0) {
    return h(
      'div',
      { class: 'page' },
      head(project),
      h('div', { class: 'card empty-state' }, h('div', { class: 'empty-icon', innerHTML: icons.preview }), h('h3', {}, '还没有可预览的线稿'), h('p', {}, '先在生成页或调校页产出至少一版线稿。'), h('button', { class: 'btn btn-primary', onclick: () => navigate(`/generate/${project.id}`) }, '去生成线稿')),
    )
  }

  const opts: PreviewOptions = {
    mode: 'intaglio',
    lightAngle: -Math.PI / 4,
    reliefStrength: 1.4,
    zoom: 1,
  }

  const grid = h('div', { class: 'compare-grid' })
  const canvasByVariant = new Map<string, HTMLCanvasElement>()

  function renderVariant(variantId: string): void {
    const variant = variants.find((v) => v.id === variantId)
    const canvas = canvasByVariant.get(variantId)
    if (!variant?.linework || !canvas) return
    drawPreview(canvas, variant.linework, opts)
  }

  function renderAll(): void {
    for (const v of variants) renderVariant(v.id)
  }

  for (const variant of variants) {
    const canvas = h('canvas', {}) as HTMLCanvasElement
    canvas.style.width = '100%'
    canvas.style.height = '300px'
    canvasByVariant.set(variant.id, canvas)
    const cell = h(
      'div',
      { class: 'compare-cell card panel' },
      h('div', { class: 'toolbar' }, h('strong', {}, variant.name), h('span', { class: 'tag' }, `${variant.linework?.polylines.length ?? 0} 线`)),
      h('div', { class: 'canvas-frame' }, canvas),
      h(
        'div',
        { class: 'toolbar' },
        zoomBtn(canvas, 1, '适屏'),
        zoomBtn(canvas, 5, '5×'),
        zoomBtn(canvas, 10, '10×'),
      ),
    )
    grid.append(cell)
  }

  function zoomBtn(canvas: HTMLCanvasElement, zoom: number, label: string): HTMLElement {
    return h(
      'button',
      {
        class: 'btn btn-ghost btn-sm',
        onclick: () => {
          opts.zoom = zoom
          // 单版放大时滚动定位，并排时仅该版按倍数重绘
          const linework = variants.find((v) => canvasByVariant.get(v.id) === canvas)?.linework
          if (linework) drawPreview(canvas, linework, opts)
        },
      },
      label,
    )
  }

  const modeSeg = h(
    'div',
    { class: 'segmented' },
    modeBtn('intaglio', '单色雕刻'),
    modeBtn('overprint', '雕刻 + 胶印套印'),
  )
  function modeBtn(mode: PreviewMode, label: string): HTMLElement {
    return h(
      'button',
      {
        class: opts.mode === mode ? 'active' : '',
        onclick: () => {
          opts.mode = mode
          modeSeg.querySelectorAll('button').forEach((b) => b.classList.remove('active'))
          modeSeg.querySelector(`button[data-mode="${mode}"]`)?.classList.add('active')
          renderAll()
        },
        dataset: { mode },
      },
      label,
    )
  }

  const lightSlider = slider('侧光角度', -180, 180, -45, (v) => {
    opts.lightAngle = (v * Math.PI) / 180
    renderAll()
  })
  const reliefSlider = slider('浮雕强度', 0, 3, 1.4, (v) => {
    opts.reliefStrength = v
    renderAll()
  }, 0.1)

  const side = h(
    'aside',
    { class: 'card panel' },
    h('h3', {}, '印样控制'),
    modeSeg,
    lightSlider,
    reliefSlider,
    h('div', { class: 'banner banner-info' }, '墨层厚度随刀口宽度变化，侧光下迎光面提亮、背光面压暗，并带轻微纸面投影。'),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => navigate(`/tune/${project.id}`) }, '回刀法调校'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: () => navigate(`/export/${project.id}`) }, '去线稿出图'),
  )

  // 首帧双 rAF 等布局稳定；网格尺寸变化（侧栏折叠、窗口缩放）自动补画
  requestAnimationFrame(() => requestAnimationFrame(() => renderAll()))
  const ro = new ResizeObserver(() => renderAll())
  ro.observe(grid)

  return h('div', { class: 'page' }, head(project), h('div', { class: 'work-grid' }, grid, side))
}

function drawPreview(canvas: HTMLCanvasElement, linework: Linework, opts: PreviewOptions): void {
  const host = canvas.parentElement
  if (!host) return
  const cssW = host.clientWidth - 32
  const cssH = 300
  // 隐藏面板或首帧布局未完成时跳过，等下一帧由 ResizeObserver 再画
  if (cssW <= 10) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  canvas.style.height = `${cssH}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const height = renderInkHeight(linework)
  const img = shadeRelief(height, linework.width, linework.height, opts)
  if (opts.mode === 'overprint') {
    applyOverprintTint(img, [187, 134, 92])
  }

  // 离屏 ImageData 先放到等尺寸画布，再按适框 + 缩放倍率贴到可见画布
  const off = document.createElement('canvas')
  off.width = linework.width
  off.height = linework.height
  off.getContext('2d')?.putImageData(img, 0, 0)

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#eeE9de'
  ctx.fillRect(0, 0, cssW, cssH)
  const fit = Math.min(cssW / linework.width, cssH / linework.height)
  const scale = fit * opts.zoom
  const w = linework.width * scale
  const hgt = linework.height * scale
  ctx.imageSmoothingEnabled = opts.zoom <= 2
  ctx.drawImage(off, (cssW - w) / 2, (cssH - hgt) / 2, w, hgt)
}

function slider(
  label: string,
  min: number,
  max: number,
  initial: number,
  onChange: (v: number) => void,
  step = 1,
): HTMLElement {
  const value = h('span', { class: 'range-value' }, String(initial))
  const input = h('input', { type: 'range', min, max, step, value: initial }) as HTMLInputElement
  input.addEventListener('input', () => {
    value.textContent = input.value
    onChange(Number(input.value))
  })
  return h('div', { class: 'field' }, h('label', {}, label), h('div', { class: 'range-row' }, h('span', { class: 'faint' }, '弱'), input, value))
}

function head(project: StampProject): HTMLElement {
  return h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, '印样预览'), h('p', {}, `并排比较 ${project.title} 的多版疏密，模拟凹版油墨上纸效果。`)), h('button', { class: 'btn btn-ghost', onclick: () => navigate(`/tune/${project.id}`) }, '回调校'))
}

function missing(text: string, path: string): HTMLElement {
  return h('div', { class: 'card empty-state' }, h('div', { class: 'empty-icon', innerHTML: icons.alert }), h('h3', {}, text), h('button', { class: 'btn btn-primary', onclick: () => navigate(path) }, '前往'))
}
