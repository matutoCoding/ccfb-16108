// 线稿出图页：导出 1:1 / 5x 闭合轮廓 SVG，附合规报告与矢量完整性自检

import { projectRepo, variantRepo } from '@/db/idb'
import type { ExportScale, StampProject } from '@/types'
import { h, formatBytes, toast } from '@/ui/dom'
import { icons } from '@/ui/icons'
import { navigate, type RouteParams } from '@/router'
import { setSession } from '@/state/session'
import { exportSvg, estimateSvgSize } from '@/engine/svg'
import { buildRibbon } from '@/engine/svg_ribbon'
import { summarizeLinework } from '@/engine/pipeline'
import { downloadTextFile, safeFileName } from '@/ui/download'
import type { LineworkVariant } from '@/types'

export async function render(params: RouteParams): Promise<HTMLElement> {
  const projectId = params.projectId ?? localStorage.getItem('session.projectId')
  const project = projectId ? await projectRepo.get(projectId) : undefined
  if (!project) return missing('缺少选题上下文', '/projects')
  setSession({ project, projectId: project.id })

  const variants = (await variantRepo.listByProject(project.id)).filter((v) => v.linework)
  if (variants.length === 0) {
    return h(
      'div',
      { class: 'page' },
      head(project),
      h('div', { class: 'card empty-state' }, h('div', { class: 'empty-icon', innerHTML: icons.export }), h('h3', {}, '还没有可出图的线稿'), h('p', {}, '先在生成页产出线稿，每根线都会导出为宽度连续变化的闭合轮廓。'), h('button', { class: 'btn btn-primary', onclick: () => navigate(`/generate/${project.id}`) }, '去生成线稿')),
    )
  }

  const list = h('div', { class: 'grid-cards' })
  for (const variant of variants) list.append(variantCard(variant, project))

  return h(
    'div',
    { class: 'page' },
    head(project),
    h(
      'div',
      { class: 'banner banner-info' },
      'SVG 中每根线都是填充型闭合 path（无 stroke、无半截线帽），点刻为闭合圆；文件内写入物理毫米尺寸，1:1 档可直接交付雕刻师，5x 档用于放大修版。',
    ),
    list,
  )
}

function variantCard(variant: LineworkVariant, project: StampProject): HTMLElement {
  const linework = variant.linework!
  const summary = summarizeLinework(linework)
  const integrity = checkRibbonIntegrity(linework)
  const size = estimateSvgSize(linework)

  const report = h(
    'div',
    { class: 'check-list' },
    checkRow(integrity.degenerate === 0, `闭合轮廓构建：${linework.polylines.length} 根全部成功${integrity.degenerate ? `，${integrity.degenerate} 根退化` : ''}`),
    checkRow((variant.validation?.violations.length ?? 0) === 0, `间距/刀口合规：${variant.validation?.violations.length ?? 0} 处违规，最小墨隙 ${(variant.validation?.minGap ?? 0).toFixed(2)}px`),
    checkRow(true, `矢量节点：${summary.totalPointCount.toLocaleString()} 个，最长线 ${summary.longestLine.toFixed(0)}px`),
    checkRow(true, `点刻：${linework.dots.length} 个，预计 SVG 体积 ${formatBytes(size)}`),
  )

  return h(
    'article',
    { class: 'card panel' },
    h('div', { class: 'project-card-head' }, h('h3', {}, variant.name), h('span', { class: 'tag' }, project.preset === 'portrait' ? '人物' : '建筑')),
    report,
    h(
      'div',
      { class: 'toolbar' },
      exportBtn(variant, project, '1x'),
      exportBtn(variant, project, '5x'),
    ),
  )
}

function exportBtn(variant: LineworkVariant, project: StampProject, scale: ExportScale): HTMLElement {
  return h(
    'button',
    {
      class: scale === '1x' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm',
      onclick: () => {
        const svg = exportSvg(variant.linework!, {
          scale,
          widthMm: project.widthMm,
          heightMm: project.heightMm,
        })
        const filename = `${safeFileName(project.setNo)}_${safeFileName(project.figureNo)}_${safeFileName(variant.name)}_${scale}.svg`
        downloadTextFile(filename, svg, 'image/svg+xml')
        toast(`已导出 ${scale === '1x' ? '1:1' : '放大五倍'} SVG：${filename}`)
      },
    },
    h('span', { innerHTML: icons.export }),
    scale === '1x' ? '导出 1:1 SVG' : '导出 5× SVG',
  )
}

// 出图前最后一道关：所有折线都必须能构建出至少 3 点的闭合 ribbon
function checkRibbonIntegrity(linework: import('@/engine/types').Linework): { degenerate: number } {
  let degenerate = 0
  for (const line of linework.polylines) {
    const ribbon = buildRibbon(line.points)
    if (!ribbon || ribbon.outline.length < 3) degenerate++
  }
  return { degenerate }
}

function checkRow(ok: boolean, text: string): HTMLElement {
  return h('div', { class: 'check-item' }, h('span', { class: `dot ${ok ? 'ok' : 'bad'}` }), h('span', {}, text))
}

function head(project: StampProject): HTMLElement {
  return h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, '线稿出图'), h('p', {}, `选题 ${project.setNo} ${project.figureNo}，票幅 ${project.widthMm}×${project.heightMm}mm。`)), h('button', { class: 'btn btn-ghost', onclick: () => navigate(`/preview/${project.id}`) }, '回印样预览'))
}

function missing(text: string, path: string): HTMLElement {
  return h('div', { class: 'card empty-state' }, h('div', { class: 'empty-icon', innerHTML: icons.alert }), h('h3', {}, text), h('button', { class: 'btn btn-primary', onclick: () => navigate(path) }, '前往'))
}
