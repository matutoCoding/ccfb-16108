// 排线引擎内部共享的小工具，避免循环依赖

import type { LineworkParams } from './types'

export function layerOffsetOf(layer: number, params: LineworkParams): number {
  if (layer === 0) return 0
  return params.crossAngles[Math.min(layer, params.crossAngles.length - 1)] ?? 0
}
