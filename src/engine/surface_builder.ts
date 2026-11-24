// 三维场组装：ModelView 抓 G-buffer 后计算法线梯度与曲率方向场

import { computeCurvatureField } from './field'
import { normalGradient, type NormalGradientSet } from './normal_grad'
import type { ModelView } from './model_view'
import type { SurfaceBuffer } from './types'

export interface ModelFields {
  surface: SurfaceBuffer
  grad: NormalGradientSet
}

export function captureModelFields(
  view: ModelView,
  fallbackAngle: number,
): ModelFields {
  const { surface, normalsX, normalsY } = view.captureFields()
  const grad = normalGradient(normalsX, normalsY, surface.width, surface.height)
  computeCurvatureField(surface, grad, fallbackAngle)
  return { surface, grad }
}
