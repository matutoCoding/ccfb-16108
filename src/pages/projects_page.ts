// 选题档案页：套号/图序管理、票幅与齿孔参数

import { projectRepo, variantRepo } from '@/db/idb'
import type { StampProject } from '@/types'
import { defaultPerforation } from '@/ui/perforation'
import { clear, formatTime, h, toast, uid } from '@/ui/dom'
import { icons } from '@/ui/icons'
import { navigate } from '@/router'
import { setSession } from '@/state/session'
import { projectForm } from './project_form'

export async function render(): Promise<HTMLElement> {
  const projects = await projectRepo.list()
  projects.sort((a, b) => b.updatedAt - a.updatedAt)

  const head = h(
    'div',
    { class: 'page-head' },
    h('div', {}, h('h1', {}, '选题档案'), h('p', {}, '按套号与图序管理邮票选题，票幅尺寸和齿孔位置在此锁定。')),
    h(
      'button',
      {
        class: 'btn btn-primary',
        onclick: () => openCreateForm(),
      },
      h('span', { innerHTML: icons.plus }),
      '新建选题',
    ),
  )

  const list = h('div', { class: 'grid-cards', id: 'project-grid' })
  if (projects.length === 0) {
    list.append(
      h(
        'div',
        { class: 'card empty-state' },
        h('div', { class: 'empty-icon', innerHTML: icons.archive }),
        h('h3', {}, '还没有选题档案'),
        h('p', {}, '新建第一个选题，定义票幅与齿孔安全区，后面的线稿都会约束在这套规格里。'),
      ),
    )
  } else {
    for (const project of projects) list.append(await projectCard(project))
  }

  const host = h('div', { class: 'page' }, head, list)
  return host
}

async function projectCard(project: StampProject): Promise<HTMLElement> {
  const variantCount = (await variantRepo.listByProject(project.id)).length
  return h(
    'article',
    { class: 'card panel project-card' },
    h(
      'div',
      { class: 'project-card-head' },
      h('div', {}, h('span', { class: 'tag' }, project.setNo), h('span', { class: 'tag' }, project.figureNo)),
      h('span', { class: 'tag' }, project.preset === 'portrait' ? '人物' : '建筑'),
    ),
    h('h3', {}, project.title),
    h(
      'dl',
      { class: 'spec-list' },
      specRow('票幅', `${project.widthMm} × ${project.heightMm} mm`),
      specRow('齿孔边距', `${project.perforation.marginMm} mm`),
      specRow('齿孔节距', `${project.perforation.pitchMm} mm`),
      specRow('线稿版本', `${variantCount} 版`),
      specRow('更新时间', formatTime(project.updatedAt)),
    ),
    h(
      'div',
      { class: 'toolbar' },
      h(
        'button',
        {
          class: 'btn btn-primary btn-sm',
          onclick: () => enterProject(project),
        },
        '进入素材',
      ),
      h(
        'button',
        {
          class: 'btn btn-ghost btn-sm',
          onclick: () => openEditForm(project),
        },
        '编辑',
      ),
      h(
        'button',
        {
          class: 'btn btn-danger-ghost btn-sm',
          onclick: () => removeProject(project),
        },
        h('span', { innerHTML: icons.trash }),
        '删除',
      ),
    ),
  )
}

function specRow(label: string, value: string): HTMLElement {
  return h('div', { class: 'spec-row' }, h('dt', {}, label), h('dd', {}, value))
}

function enterProject(project: StampProject): void {
  setSession({ project, projectId: project.id, asset: null, assetId: null, variant: null, variantId: null })
  localStorage.setItem('session.projectId', project.id)
  navigate(`/assets/${project.id}`)
}

async function openCreateForm(): Promise<void> {
  const draft: StampProject = {
    id: uid('proj'),
    setNo: '',
    figureNo: '',
    title: '',
    widthMm: 40,
    heightMm: 30,
    perforation: defaultPerforation(),
    preset: 'portrait',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  projectForm(draft, async (saved) => {
    await projectRepo.put(saved)
    toast('选题已建档')
    const grid = document.querySelector('#project-grid')
    if (grid) clear(grid)
    const fresh = await render()
    const outlet = document.querySelector('#outlet')
    if (outlet) outlet.replaceChildren(fresh)
  })
}

async function openEditForm(project: StampProject): Promise<void> {
  projectForm({ ...project }, async (saved) => {
    saved.updatedAt = Date.now()
    await projectRepo.put(saved)
    toast('选题已更新')
    const outlet = document.querySelector('#outlet')
    if (outlet) outlet.replaceChildren(await render())
  })
}

async function removeProject(project: StampProject): Promise<void> {
  const ok = window.confirm(`删除选题「${project.title}」？其下素材与线稿版本不会自动删除，但将失去关联。`)
  if (!ok) return
  await projectRepo.remove(project.id)
  toast('选题已删除')
  const outlet = document.querySelector('#outlet')
  if (outlet) outlet.replaceChildren(await render())
}
