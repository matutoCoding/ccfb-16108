// 照片管线：解码图片 -> 亮度场 -> 亮度高度场伪法线 -> 曲率方向场
// 照片没有真实几何，明暗梯度就是最可靠的走向线索；平坦处交给手刷方向场

import type { PresetKind, SurfaceBuffer } from './types'
import { createSurfaceBuffer, idx, normalizeAngle } from './grid'
import { normalGradient, type NormalGradientSet } from './normal_grad'
import { computeCurvatureField } from './field'

export interface PhotoFields {
  surface: SurfaceBuffer
  grad: NormalGradientSet
}

export async function decodePhoto(file: Blob, maxSize = 900): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  if (scale >= 1) return bitmap
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建照片解码画布')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.transferToImageBitmap()
}

export function photoToSurface(
  bitmap: ImageBitmap,
  preset: PresetKind,
  fallbackAngle: number,
  targetSize?: { width: number; height: number },
): PhotoFields {
  const w = targetSize?.width ?? bitmap.width
  const h = targetSize?.height ?? bitmap.height
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('照片画布初始化失败')
  // 等比缩放居中铺进票幅，留 8% 边距避免贴齿孔
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(0, 0, w, h)
  const scale = Math.min(w / bitmap.width, h / bitmap.height) * 0.92
  const dw = bitmap.width * scale
  const dh = bitmap.height * scale
  ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh)
  const pixels = ctx.getImageData(0, 0, w, h).data

  const surface = createSurfaceBuffer(w, h)
  const heightField = new Float32Array(w * h)
  const normalsX = new Float32Array(w * h)
  const normalsY = new Float32Array(w * h)
  // 亮度提取（Rec. 601），照片默认整幅都是主图区域
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      const p = i * 4
      const lum = (0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2]) / 255
      surface.mask[i] = 1
      surface.luminance[i] = lum
      // 亮度当高度：越亮越高，再由高度梯度伪造法线
      heightField[i] = lum
    }
  }

  // 伪法线：由高度场中心差分得到
  const strength = preset === 'portrait' ? 2.2 : 1.6
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = idx(w, x, y)
      const dhdx = (heightField[i + 1] - heightField[i - 1]) * strength
      const dhdy = (heightField[i + w] - heightField[i - w]) * strength
      const inv = 1 / Math.sqrt(dhdx * dhdx + dhdy * dhdy + 1)
      normalsX[i] = -dhdx * inv
      normalsY[i] = -dhdy * inv
      // 伪深度：与亮度挂钩，供轮廓线远景收细使用
      surface.depth[i] = 1 - surface.luminance[i]
    }
  }

  const grad = normalGradient(normalsX, normalsY, w, h)
  computeCurvatureField(surface, grad, normalizeAngle(fallbackAngle))
  return { surface, grad }
}
