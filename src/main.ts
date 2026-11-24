import './styles/tokens.css'
import './styles/global.css'
import './styles/app.css'
import './styles/components.css'
import { h } from './ui/dom'
import { icons, type IconName } from './ui/icons'
import { navigate, resolveRoute, type RouteName } from './router'
import { getSession, persistSession, restoreSession } from './state/session'

interface NavItem {
  route: RouteName
  label: string
  icon: IconName
  path: () => string
}

const navItems: NavItem[] = [
  { route: 'projects', label: '选题档案', icon: 'archive', path: () => '#/projects' },
  {
    route: 'assets',
    label: '素材导入',
    icon: 'import',
    path: () => `#/assets/${getSession().projectId ?? ''}`,
  },
  {
    route: 'generate',
    label: '线稿生成',
    icon: 'generate',
    path: () => `#/generate/${getSession().projectId ?? ''}`,
  },
  {
    route: 'tune',
    label: '刀法调校',
    icon: 'tune',
    path: () => `#/tune/${getSession().projectId ?? ''}`,
  },
  {
    route: 'preview',
    label: '印样预览',
    icon: 'preview',
    path: () => `#/preview/${getSession().projectId ?? ''}`,
  },
  {
    route: 'export',
    label: '线稿出图',
    icon: 'export',
    path: () => `#/export/${getSession().projectId ?? ''}`,
  },
]

function currentRoute(): RouteName {
  const hash = location.hash
  if (hash.includes('assets')) return 'assets'
  if (hash.includes('generate')) return 'generate'
  if (hash.includes('tune')) return 'tune'
  if (hash.includes('preview')) return 'preview'
  if (hash.includes('export')) return 'export'
  return 'projects'
}

function updateNavActive(): void {
  const current = currentRoute()
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-route') === current)
  })
}

function renderShell(): void {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) return

  const nav = h(
    'nav',
    { class: 'sidebar' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, '凹'), h('div', { class: 'brand-text' }, h('strong', {}, '凹版线稿工作台'), h('small', { class: 'faint' }, 'Intaglio Linework Studio'))),
    h(
      'div',
      { class: 'nav-list' },
      ...navItems.map((item) =>
        h(
          'a',
          {
            class: `nav-item ${currentRoute() === item.route ? 'active' : ''}`,
            href: item.path(),
            dataset: { route: item.route },
          },
          h('span', { class: 'nav-icon', innerHTML: icons[item.icon] }),
          h('span', {}, item.label),
        ),
      ),
    ),
  )

  const breadcrumb = h('div', { class: 'breadcrumb', id: 'breadcrumb' })
  const outlet = h('main', { class: 'outlet', id: 'outlet' })
  const main = h('div', { class: 'main-col' }, h('header', { class: 'topbar' }, breadcrumb), outlet)
  app.replaceChildren(nav, main)
}

function renderBreadcrumb(): void {
  const el = document.querySelector<HTMLDivElement>('#breadcrumb')
  if (!el) return
  const session = getSession()
  const parts = ['工作台']
  if (session.project) parts.push(`${session.project.setNo} ${session.project.figureNo} ${session.project.title}`)
  if (session.asset) parts.push(session.asset.name)
  if (session.variant) parts.push(session.variant.name)
  el.textContent = parts.join(' / ')
}

async function boot(): Promise<void> {
  await restoreSession()
  renderShell()
  const outlet = document.querySelector<HTMLElement>('#outlet')
  if (outlet) await resolveRoute(outlet)
  renderBreadcrumb()
  persistSession()
}

window.addEventListener('hashchange', async () => {
  // shell 只建一次，路由切换只换 outlet 内容并更新导航高亮
  updateNavActive()
  const outlet = document.querySelector<HTMLElement>('#outlet')
  if (outlet) await resolveRoute(outlet)
  renderBreadcrumb()
})

void boot()
