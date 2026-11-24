// Marching Squares：从二值遮罩提取轮廓边段（像素坐标）

export interface EdgeSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

// 16 种格子情况的边表，每条边用两个交点编号表示（交点 0~3 顺时针）
// 交点：0=上 1=右 2=下 3=左
const CASES: number[][][] = [
  [], // 0
  [[3, 0]], // 1
  [[0, 1]], // 2
  [[3, 1]], // 3
  [[1, 2]], // 4
  [[3, 0], [1, 2]], // 5 鞍点
  [[0, 2]], // 6
  [[3, 2]], // 7
  [[2, 3]], // 8
  [[2, 0]], // 9
  [[0, 1], [2, 3]], // 10 鞍点
  [[2, 1]], // 11
  [[1, 3]], // 12
  [[1, 0]], // 13
  [[0, 3]], // 14
  [], // 15
]

export function marchingSquares(mask: Uint8Array, w: number, h: number): EdgeSegment[] {
  const segs: EdgeSegment[] = []
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const tl = mask[y * w + x]
      const tr = mask[y * w + x + 1]
      const br = mask[(y + 1) * w + x + 1]
      const bl = mask[(y + 1) * w + x]
      const code = (tl ? 1 : 0) | (tr ? 2 : 0) | (br ? 4 : 0) | (bl ? 8 : 0)
      if (code === 0 || code === 15) continue

      // 四个边交点（格子局部坐标，0.5 为边中点）
      const points = [
        { x: x + 0.5, y }, // 0 上
        { x: x + 1, y: y + 0.5 }, // 1 右
        { x: x + 0.5, y: y + 1 }, // 2 下
        { x, y: y + 0.5 }, // 3 左
      ]
      for (const [a, b] of CASES[code]) {
        segs.push({
          x1: points[a].x,
          y1: points[a].y,
          x2: points[b].x,
          y2: points[b].y,
        })
      }
    }
  }
  return segs
}

// 把散乱边段按端点就近串成折线（容差 1 像素）
export function chainSegments(segs: EdgeSegment[], tolerance = 1.2): {
  chains: { x: number; y: number }[][]
} {
  const remaining = segs.map((s) => ({ ...s, used: false }))
  const chains: { x: number; y: number }[][] = []
  const tol2 = tolerance * tolerance

  for (let i = 0; i < remaining.length; i++) {
    const start = remaining[i]
    if (start.used) continue
    start.used = true
    const chain = [
      { x: start.x1, y: start.y1 },
      { x: start.x2, y: start.y2 },
    ]

    // 向后接
    let extended = true
    while (extended) {
      extended = false
      const tail = chain[chain.length - 1]
      for (const seg of remaining) {
        if (seg.used) continue
        if (dist2(tail, { x: seg.x1, y: seg.y1 }) <= tol2) {
          chain.push({ x: seg.x2, y: seg.y2 })
          seg.used = true
          extended = true
          break
        }
        if (dist2(tail, { x: seg.x2, y: seg.y2 }) <= tol2) {
          chain.push({ x: seg.x1, y: seg.y1 })
          seg.used = true
          extended = true
          break
        }
      }
    }
    // 向前接
    extended = true
    while (extended) {
      extended = false
      const head = chain[0]
      for (const seg of remaining) {
        if (seg.used) continue
        if (dist2(head, { x: seg.x2, y: seg.y2 }) <= tol2) {
          chain.unshift({ x: seg.x1, y: seg.y1 })
          seg.used = true
          extended = true
          break
        }
        if (dist2(head, { x: seg.x1, y: seg.y1 }) <= tol2) {
          chain.unshift({ x: seg.x2, y: seg.y2 })
          seg.used = true
          extended = true
          break
        }
      }
    }

    if (chain.length >= 3) chains.push(chain)
  }
  return { chains }
}

function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}
