// 选题表单弹层：票幅/齿孔校验，图序格式提示

import type { PresetKind, StampProject } from '@/types'
import { h } from '@/ui/dom'

export function projectForm(
  draft: StampProject,
  onSubmit: (project: StampProject) => void,
): void {
  const mask = h('div', { class: 'modal-mask' })
  const setNo = h('input', { class: 'input', value: draft.setNo, placeholder: '如 2026-12' }) as HTMLInputElement
  const figureNo = h('input', { class: 'input', value: draft.figureNo, placeholder: '如 (3-2)' }) as HTMLInputElement
  const title = h('input', { class: 'input', value: draft.title, placeholder: '邮票名称' }) as HTMLInputElement
  const widthMm = h('input', { class: 'input', type: 'number', min: '20', max: '120', value: draft.widthMm }) as HTMLInputElement
  const heightMm = h('input', { class: 'input', type: 'number', min: '20', max: '120', value: draft.heightMm }) as HTMLInputElement
  const margin = h('input', {
    class: 'input',
    type: 'number',
    min: '2',
    max: '10',
    step: '0.5',
    value: draft.perforation.marginMm,
  }) as HTMLInputElement
  const pitch = h('input', {
    class: 'input',
    type: 'number',
    min: '1.5',
    max: '5',
    step: '0.1',
    value: draft.perforation.pitchMm,
  }) as HTMLInputElement
  const holeR = h('input', {
    class: 'input',
    type: 'number',
    min: '0.3',
    max: '1.5',
    step: '0.05',
    value: draft.perforation.holeRadiusMm,
  }) as HTMLInputElement
  const preset = h(
    'select',
    { class: 'select' },
    h('option', { value: 'portrait' }, '人物（头像类主图）'),
    h('option', { value: 'architecture' }, '建筑（古塔类主图）'),
  ) as HTMLSelectElement
  preset.value = draft.preset

  const errorBox = h('div', { class: 'banner banner-danger', hidden: true })

  function close(): void {
    mask.remove()
  }

  function submit(): void {
    const errors: string[] = []
    if (!setNo.value.trim()) errors.push('套号不能为空')
    if (!figureNo.value.trim()) errors.push('图序不能为空')
    if (!title.value.trim()) errors.push('选题名称不能为空')
    const w = Number(widthMm.value)
    const hgt = Number(heightMm.value)
    if (!(w >= 20 && w <= 120) || !(hgt >= 20 && hgt <= 120)) errors.push('票幅边长需在 20~120mm 之间')
    const m = Number(margin.value)
    if (m * 2 >= Math.min(w, hgt)) errors.push('齿孔边距过大，安全区会吞掉整张票幅')

    if (errors.length) {
      errorBox.hidden = false
      errorBox.textContent = errors.join('；')
      return
    }

    const saved: StampProject = {
      ...draft,
      setNo: setNo.value.trim(),
      figureNo: figureNo.value.trim(),
      title: title.value.trim(),
      widthMm: w,
      heightMm: hgt,
      preset: preset.value as PresetKind,
      perforation: {
        marginMm: Number(margin.value),
        pitchMm: Number(pitch.value),
        holeRadiusMm: Number(holeR.value),
      },
      updatedAt: Date.now(),
    }
    onSubmit(saved)
    close()
  }

  const panel = h(
    'div',
    { class: 'card modal-panel' },
    h('h2', {}, draft.setNo ? '编辑选题' : '新建选题'),
    errorBox,
    h(
      'div',
      { class: 'form-grid' },
      field('套号', setNo),
      field('图序', figureNo),
      h('div', { class: 'field full' }, h('label', {}, '选题名称'), title),
      field('票幅宽 (mm)', widthMm),
      field('票幅高 (mm)', heightMm),
      field('齿孔边距 (mm)', margin),
      field('齿孔节距 (mm)', pitch),
      field('齿孔半径 (mm)', holeR),
      h('div', { class: 'field full' }, h('label', {}, '处理预设'), preset),
    ),
    h(
      'div',
      { class: 'toolbar modal-actions' },
      h('button', { class: 'btn btn-ghost', onclick: close }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: submit }, '保存'),
    ),
  )

  mask.append(panel)
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close()
  })
  document.body.append(mask)
}

function field(label: string, input: HTMLElement): HTMLElement {
  return h('div', { class: 'field' }, h('label', {}, label), input)
}
