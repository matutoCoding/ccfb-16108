// 素材导入页：glTF/OBJ/照片上传 + 内置头像/古塔测试模型

import { assetRepo, projectRepo } from '@/db/idb'
import type { AssetRecord, StampProject } from '@/types'
import { formatBytes, formatTime, h, toast, uid } from '@/ui/dom'
import { icons } from '@/ui/icons'
import { navigate, type RouteParams } from '@/router'
import { getSession, setSession } from '@/state/session'

const MODEL_EXT = ['.gltf', '.glb', '.obj']
const PHOTO_EXT = ['.png', '.jpg', '.jpeg', '.webp']

export async function render(params: RouteParams): Promise<HTMLElement> {
  const projectId = params.projectId ?? getSession().projectId
  const project = projectId ? await projectRepo.get(projectId) : undefined
  if (!project) {
    return h(
      'div',
      { class: 'card empty-state' },
      h('div', { class: 'empty-icon', innerHTML: icons.alert }),
      h('h3', {}, '还没有选择选题'),
      h('p', {}, '先在选题档案里建一套邮票规格，再往里面导入素材。'),
      h('button', { class: 'btn btn-primary', onclick: () => navigate('/projects') }, '去选题档案'),
    )
  }
  setSession({ project, projectId: project.id })
  localStorage.setItem('session.projectId', project.id)

  const assets = await assetRepo.listByProject(project.id)
  assets.sort((a, b) => b.createdAt - a.createdAt)

  const head = h(
    'div',
    { class: 'page-head' },
    h(
      'div',
      {},
      h('h1', {}, `素材导入 · ${project.title}`),
      h('p', {}, `票幅 ${project.widthMm}×${project.heightMm}mm，预设：${project.preset === 'portrait' ? '人物' : '建筑'}。三维支持 glTF/GLB/OBJ，照片支持 PNG/JPEG/WebP。`),
    ),
    h('button', { class: 'btn btn-ghost', onclick: () => navigate('/projects') }, '返回选题'),
  )

  const upload = buildUploadZone(project)
  const testZone = h(
    'div',
    { class: 'toolbar' },
    h(
      'button',
      { class: 'btn btn-ghost', onclick: () => addGenerated(project, 'head') },
      '生成测试头像模型',
    ),
    h(
      'button',
      { class: 'btn btn-ghost', onclick: () => addGenerated(project, 'pagoda') },
      '生成测试古塔模型',
    ),
  )

  const list = h('div', { class: 'grid-cards' })
  if (assets.length === 0) {
    list.append(
      h(
        'div',
        { class: 'card empty-state' },
        h('div', { class: 'empty-icon', innerHTML: icons.import }),
        h('h3', {}, '素材库是空的'),
        h('p', {}, '上传三维模型或照片，也可以先生成内置测试模型跑通整条流程。'),
      ),
    )
  } else {
    for (const asset of assets) list.append(assetCard(asset, project))
  }

  return h('div', { class: 'page' }, head, h('div', { class: 'card panel' }, h('h3', {}, '上传素材'), upload, testZone), h('h2', {}, '已导入素材'), list)
}

function buildUploadZone(project: StampProject): HTMLElement {
  const fileInput = h('input', {
    type: 'file',
    accept: '.gltf,.glb,.obj,.png,.jpg,.jpeg,.webp',
    multiple: true,
    hidden: true,
  }) as HTMLInputElement
  fileInput.addEventListener('change', () => {
    if (fileInput.files) void ingestFiles(project, fileInput.files)
    fileInput.value = ''
  })

  const zone = h(
    'div',
    { class: 'upload-zone', role: 'button', tabindex: '0' },
    h('div', { class: 'upload-icon', innerHTML: icons.import }),
    h('strong', {}, '点击选择或拖拽文件到这里'),
    h('span', { class: 'muted' }, '三维模型按表面主曲率排线，照片按亮度场加手绘方向场出线'),
    fileInput,
  )
  zone.addEventListener('click', () => fileInput.click())
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click()
  })
  zone.addEventListener('dragover', (e) => {
    e.preventDefault()
    zone.classList.add('dragover')
  })
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'))
  zone.addEventListener('drop', (e) => {
    e.preventDefault()
    zone.classList.remove('dragover')
    void ingestFiles(project, e.dataTransfer.files)
  })
  return zone
}

async function ingestFiles(project: StampProject, files: FileList): Promise<void> {
  for (const file of Array.from(files)) {
    const lower = file.name.toLowerCase()
    const isModel = MODEL_EXT.some((ext) => lower.endsWith(ext))
    const isPhoto = PHOTO_EXT.some((ext) => lower.endsWith(ext))
    if (!isModel && !isPhoto) {
      toast(`跳过不支持的文件：${file.name}`, 'danger')
      continue
    }
    const record: AssetRecord = {
      id: uid('asset'),
      projectId: project.id,
      name: file.name,
      kind: isModel ? 'model' : 'photo',
      mime: file.type || 'application/octet-stream',
      blob: file,
      status: 'ready',
      createdAt: Date.now(),
    }
    await assetRepo.put(record)
    toast(`已导入：${file.name}`)
  }
  refresh()
}

async function addGenerated(project: StampProject, kind: 'head' | 'pagoda'): Promise<void> {
  const record: AssetRecord = {
    id: uid('asset'),
    projectId: project.id,
    name: kind === 'head' ? '测试人物头像（程序化）' : '测试古塔（程序化）',
    kind: 'model',
    mime: 'application/x-procedural',
    generated: kind,
    status: 'ready',
    createdAt: Date.now(),
  }
  await assetRepo.put(record)
  toast('测试模型已加入素材库')
  refresh()
}

function assetCard(asset: AssetRecord, project: StampProject): HTMLElement {
  return h(
    'article',
    { class: 'card panel' },
    h('div', { class: 'asset-meta' }, h('span', { class: 'tag' }, asset.kind === 'model' ? '三维模型' : '照片'), h('span', { class: 'tag' }, asset.generated ? '内置测试' : '外部文件')),
    h('h3', {}, asset.name),
    h(
      'div',
      { class: 'check-list' },
      checkRow(asset.status === 'ready', `状态：${asset.status === 'ready' ? '可用' : '损坏'}`),
      checkRow(true, asset.blob ? `体积：${formatBytes(asset.blob.size)}` : '体积：程序化生成，无外部文件'),
      checkRow(true, `导入时间：${formatTime(asset.createdAt)}`),
    ),
    h(
      'div',
      { class: 'toolbar' },
      h(
        'button',
        {
          class: 'btn btn-primary btn-sm',
          onclick: () => {
            setSession({ asset, assetId: asset.id })
            localStorage.setItem('session.assetId', asset.id)
            navigate(`/generate/${project.id}`)
          },
        },
        '去生成线稿',
      ),
      h(
        'button',
        {
          class: 'btn btn-danger-ghost btn-sm',
          onclick: async () => {
            if (!window.confirm(`删除素材「${asset.name}」？`)) return
            await assetRepo.remove(asset.id)
            toast('素材已删除')
            refresh()
          },
        },
        h('span', { innerHTML: icons.trash }),
      ),
    ),
  )
}

function checkRow(ok: boolean, text: string): HTMLElement {
  return h('div', { class: 'check-item' }, h('span', { class: `dot ${ok ? 'ok' : 'bad'}` }), h('span', {}, text))
}

function refresh(): void {
  const outlet = document.querySelector('#outlet')
  if (outlet) void render(getSession().projectId ? { projectId: getSession().projectId ?? '' } : {}).then((node) => outlet.replaceChildren(node))
}
