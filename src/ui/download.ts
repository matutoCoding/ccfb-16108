// 浏览器下载辅助

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  // 延迟回收，保证下载已经开始
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_').slice(0, 80)
}
