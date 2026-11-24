// DOM 构造小工具：保持页面代码声明式、避免散落的 innerHTML 拼接

type AttrValue = string | boolean | number | EventListener | Record<string, string>

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, AttrValue> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue
    if (key === 'class') el.className = String(value)
    else if (key === 'dataset') {
      Object.assign(el.dataset, value)
    } else if (key === 'innerHTML') {
      el.innerHTML = String(value)
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
    } else {
      el.setAttribute(key, String(value))
    }
  }
  for (const child of children) {
    if (child === false || child == null) continue
    el.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return el
}

export function clear(el: HTMLElement): void {
  el.replaceChildren()
}

export function mount(host: HTMLElement, node: Node): void {
  host.replaceChildren(node)
}

// 简易全局 toast
export function toast(message: string, kind: 'info' | 'danger' = 'info'): void {
  let host = document.querySelector<HTMLDivElement>('#toast-host')
  if (!host) {
    host = h('div', { id: 'toast-host' })
    document.body.append(host)
  }
  const el = h('div', { class: `toast ${kind === 'danger' ? 'toast-danger' : ''}` }, message)
  host.append(el)
  window.setTimeout(() => {
    el.remove()
  }, 3200)
}

// 格式化文件体积
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (v: number): string => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
