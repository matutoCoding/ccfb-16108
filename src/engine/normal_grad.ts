// 法线梯度：两个法线分量各自的 dx/dy（Sobel），供曲率结构张量与折边检测

export interface NormalGradientSet {
  nxX: Float32Array // d(nx)/dx
  nxY: Float32Array // d(nx)/dy
  nyX: Float32Array // d(ny)/dx
  nyY: Float32Array // d(ny)/dy
  // 梯度幅值，折边检测直接用
  magnitude: Float32Array
}

export function normalGradient(
  normalsX: Float32Array,
  normalsY: Float32Array,
  w: number,
  h: number,
): NormalGradientSet {
  const n = w * h
  const nxX = new Float32Array(n)
  const nxY = new Float32Array(n)
  const nyX = new Float32Array(n)
  const nyY = new Float32Array(n)
  const magnitude = new Float32Array(n)

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const l = i - 1
      const r = i + 1
      const t = i - w
      const b = i + w
      nxX[i] = sobelX(normalsX, l, r, t, b, t - 1, t + 1, b - 1, b + 1)
      nxY[i] = sobelY(normalsX, l, r, t, b, t - 1, t + 1, b - 1, b + 1)
      nyX[i] = sobelX(normalsY, l, r, t, b, t - 1, t + 1, b - 1, b + 1)
      nyY[i] = sobelY(normalsY, l, r, t, b, t - 1, t + 1, b - 1, b + 1)
      magnitude[i] = Math.hypot(nxX[i], nxY[i], nyX[i], nyY[i])
    }
  }

  return { nxX, nxY, nyX, nyY, magnitude }
}

function sobelX(
  f: Float32Array,
  l: number,
  r: number,
  t: number,
  b: number,
  tl: number,
  tr: number,
  bl: number,
  br: number,
): number {
  return -f[tl] - 2 * f[l] - f[bl] + f[tr] + 2 * f[r] + f[br]
}

function sobelY(
  f: Float32Array,
  l: number,
  r: number,
  t: number,
  b: number,
  tl: number,
  tr: number,
  bl: number,
  br: number,
): number {
  return -f[tl] - 2 * f[t] - f[tr] + f[bl] + 2 * f[b] + f[br]
}
