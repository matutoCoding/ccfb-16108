// Felzenszwalb 二维欧式距离变换：二值图 -> 到最近前景像素的距离
// 排线引擎用它做最小间距约束，校验器用它量测实际墨隙

export function edt(binary: Uint8Array, w: number, h: number): Float32Array {
  const n = w * h
  const dist = new Float32Array(n)
  const f = new Float32Array(n)
  const d = new Float32Array(Math.max(w, h))
  const z = new Float32Array(Math.max(w, h) + 1)
  const v = new Int32Array(Math.max(w, h))

  // 前景距离 0，背景取大值
  const INF = 1e10
  for (let i = 0; i < n; i++) f[i] = binary[i] ? 0 : INF

  const parabola = (len: number, get: (i: number) => number, set: (i: number, v: number) => void) => {
    let k = 0
    v[0] = 0
    z[0] = -INF
    z[1] = INF
    for (let q = 1; q < len; q++) {
      const fq = get(q)
      let s: number
      do {
        const q2 = v[k]
        s = (fq + q * q - (get(q2) + q2 * q2)) / (2 * (q - q2))
        if (s <= z[k]) k--
        else break
      } while (k >= 0)
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++
      const vk = v[k]
      d[q] = (q - vk) * (q - vk) + get(vk)
      set(q, d[q])
    }
  }

  // 沿列
  for (let x = 0; x < w; x++) {
    parabola(
      h,
      (y) => f[y * w + x],
      (y, val) => (dist[y * w + x] = val),
    )
  }
  // 沿行
  for (let y = 0; y < h; y++) {
    const base = y * w
    parabola(
      w,
      (x) => dist[base + x],
      (x, val) => (dist[base + x] = val),
    )
  }

  for (let i = 0; i < n; i++) dist[i] = Math.sqrt(dist[i])
  return dist
}

// Sobel 梯度，返回每个像素的梯度幅值与方向
export function sobel(field: Float32Array, w: number, h: number): {
  magnitude: Float32Array
  angle: Float32Array
} {
  const magnitude = new Float32Array(w * h)
  const angle = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const tl = field[i - w - 1]
      const t = field[i - w]
      const tr = field[i - w + 1]
      const l = field[i - 1]
      const r = field[i + 1]
      const bl = field[i + w - 1]
      const b = field[i + w]
      const br = field[i + w + 1]
      const gx = -tl - 2 * l - bl + tr + 2 * r + br
      const gy = -tl - 2 * t - tr + bl + 2 * b + br
      magnitude[i] = Math.hypot(gx, gy)
      angle[i] = Math.atan2(gy, gx)
    }
  }
  return { magnitude, angle }
}
