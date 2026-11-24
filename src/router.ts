// hash 路由：六个页面 + 参数透传，动态 import 做代码分割

export type RouteName =
  | 'projects'
  | 'assets'
  | 'generate'
  | 'tune'
  | 'preview'
  | 'export'

interface RouteDef {
  name: RouteName
  pattern: RegExp
  loader: () => Promise<{ render: (params: RouteParams) => Promise<HTMLElement> | HTMLElement }>
}

export interface RouteParams {
  projectId?: string
  assetId?: string
  variantId?: string
}

const routes: RouteDef[] = [
  {
    name: 'projects',
    pattern: /^#?\/projects\/?$/,
    loader: () => import('@/pages/projects_page'),
  },
  {
    name: 'assets',
    pattern: /^#?\/assets(?:\/([\w-]+))?\/?$/,
    loader: () => import('@/pages/assets_page'),
  },
  {
    name: 'generate',
    pattern: /^#?\/generate(?:\/([\w-]+))?\/?$/,
    loader: () => import('@/pages/generate_page'),
  },
  {
    name: 'tune',
    pattern: /^#?\/tune(?:\/([\w-]+))?\/?$/,
    loader: () => import('@/pages/tune_page'),
  },
  {
    name: 'preview',
    pattern: /^#?\/preview(?:\/([\w-]+))?\/?$/,
    loader: () => import('@/pages/preview_page'),
  },
  {
    name: 'export',
    pattern: /^#?\/export(?:\/([\w-]+))?\/?$/,
    loader: () => import('@/pages/export_page'),
  },
]

export function navigate(path: string): void {
  location.hash = path
}

function parseHash(): { def: RouteDef; params: RouteParams } | null {
  const hash = location.hash || '#/projects'
  for (const def of routes) {
    const match = hash.match(def.pattern)
    if (!match) continue
    const id = match[1]
    return {
      def,
      params: {
        projectId: id,
      },
    }
  }
  return null
}

export async function resolveRoute(outlet: HTMLElement): Promise<RouteName | null> {
  const parsed = parseHash()
  if (!parsed) {
    navigate('/projects')
    return null
  }
  const module = await parsed.def.loader()
  const node = await module.render(parsed.params)
  outlet.replaceChildren(node)
  return parsed.def.name
}
