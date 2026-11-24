// 栅格数学：索引、双线性采样、角度空间插值、可复现随机

import type { SurfaceBuffer, Vec2 } from './types'

export const idx = (w: number, x: number, y: number): number => y * w + x

export function inside(w: number, h: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < w && y < h
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// 角度按 [0, PI) 处理：排线没有方向正负之分
export function normalizeAngle(a: number): number {
  const pi = Math.PI
  let r = a % pi
  if (r < 0) r += pi
  return r
}

/**
 * 无方向角度插值：把 b 折到 a 所在的半平面再线性插值。
 * 避免 179° 与 1° 之间插出 90° 的伪跳变。
 */
export function lerpAngle(a: number, b: number, t: number): number {
  let diff = normalizeAngle(b - a)
  if (diff > Math.PI / 2) diff -= Math.PI
  return normalizeAngle(a + diff * t)
}

export function sampleBilinear(
  grid: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number,
): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const tx = x - x0
  const ty = y - y0
  const a = grid[idx(w, x0, y0)]
  const b = grid[idx(w, x1, y0)]
  const c = grid[idx(w, x0, y1)]
  const d = grid[idx(w, x1, y1)]
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty)
}

export function sampleAngle(
  grid: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number,
): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const tx = x - x0
  const ty = y - y0
  const top = lerpAngle(grid[idx(w, x0, y0)], grid[idx(w, x1, y0)], tx)
  const bot = lerpAngle(grid[idx(w, x0, y1)], grid[idx(w, x1, y1)], tx)
  return lerpAngle(top, bot, ty)
}

export function sampleMask(mask: Uint8Array, w: number, h: number, x: number, y: number): number {
  if (!inside(w, h, x, y)) return 0
  return mask[idx(w, Math.round(x), Math.round(y))]
}

// 可复现的 hash 随机（mulberry32）
export function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 二维值噪声，用于抖动种子点与点刻分布
export function makeValueNoise(seed: number) {
  const rng = makeRng(seed)
  const size = 256
  const table = new Float32Array(size * size)
  for (let i = 0; i < table.length; i++) table[i] = rng()
  const hash = (ix: number, iy: number): number => {
    const h = (ix * 73856093) ^ (iy * 19349663)
    return table[((h % (size * size)) + size * size) % (size * size)]
  }
  const smooth = (t: number): number => t * t * (3 - 2 * t)
  return (x: number, y: number): number => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const tx = smooth(x - x0)
    const ty = smooth(y - y0)
    const a = hash(x0, y0)
    const b = hash(x0 + 1, y0)
    const c = hash(x0, y0 + 1)
    const d = hash(x0 + 1, y0 + 1)
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty)
  }
}

// 沿角度取单位方向，flip 用于反方向积分
export function dirOf(angle: number, flip: boolean): Vec2 {
  const a = flip ? angle + Math.PI : angle
  return { x: Math.cos(a), y: Math.sin(a) }
}

// 空 SurfaceBuffer 工厂
export function createSurfaceBuffer(width: number, height: number): SurfaceBuffer {
  const n = width * height
  return {
    width,
    height,
    mask: new Uint8Array(n),
    depth: new Float32Array(n),
    luminance: new Float32Array(n),
    angle: new Float32Array(n),
    confidence: new Float32Array(n),
  }
}
