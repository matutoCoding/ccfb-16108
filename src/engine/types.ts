// 引擎核心类型：曲面场、线稿参数与矢量图元

export type Vec2 = { x: number; y: number }

// 三种刀法
export type Technique = 'stipple' | 'short' | 'long'

// 源素材类型
export type SourceKind = 'model' | 'photo'

// 人物 / 建筑两套预设处理
export type PresetKind = 'portrait' | 'architecture'

/**
 * 离屏渲染或照片解码后得到的二维场，统一在票幅像素坐标下。
 * 角度单位为弧度，方向约定为「排线走向」。
 */
export interface SurfaceBuffer {
  width: number
  height: number
  mask: Uint8Array // 1 = 主图区域，0 = 票幅空白
  depth: Float32Array // 归一化深度，越近越小
  luminance: Float32Array // 0 黑 ~ 1 白
  // 主曲率方向（排线走向）与置信度，平坦区置信度低走透视/手绘兜底
  angle: Float32Array
  confidence: Float32Array
}

/**
 * 手刷方向场：低分角度网格 + 权重网格。
 * 权重 0 表示该处完全交给自动场，1 表示完全采用手绘角。
 */
export interface FieldOverride {
  cols: number
  rows: number
  angle: Float32Array
  weight: Float32Array
  brushRadius: number // 网格坐标下的笔刷半径
}

// 分区：刀法分区，低分网格存 technique 索引
export interface RegionMap {
  cols: number
  rows: number
  // 0 stipple / 1 short / 2 long
  cells: Uint8Array
}

export interface LineworkParams {
  // 刀口范围（票幅像素，出图时按 DPI 换算毫米）
  minWidth: number
  maxWidth: number
  // 线间距上下限（中心距，像素）
  minSpacing: number
  maxSpacing: number
  // 流线积分步长（像素）
  stepLength: number
  // 单根线最大长度（像素）
  maxLineLength: number
  // 短线刀法长度上限（像素）
  shortLineLength: number
  // 点刻：点直径（像素）与点间距（像素）
  stippleDiameter: number
  stippleSpacing: number
  // 交叉线：最多层数（1 不交叉）与各层角度（相对主方向，弧度）
  crossLayerCount: number
  crossAngles: number[]
  // 触发第二层交叉的暗度阈值（0~1，越大越暗才触发）
  crossThreshold: number
  // 轮廓描边
  outlineEnabled: boolean
  outlineBaseWidth: number
  // 折线（法线突变）检测阈值，弧度
  creaseThreshold: number
  // 方向场手刷影响强度 0~1
  overrideStrength: number
  // 暗部密度增益，越大暗部越密
  densityGain: number
  // 宽度随明暗的指数
  widthExponent: number
  // 线两端收尖长度（像素）
  taperLength: number
  // 随机种子（保证可复现）
  seed: number
}

export interface LinePoint {
  x: number
  y: number
  // 该点的连续线宽（刀口宽度，像素）
  width: number
}

export interface Polyline {
  points: LinePoint[]
  layer: number // 0 主排线，1/2 交叉层，9 轮廓
  technique: Technique
}

export interface Dot {
  x: number
  y: number
  diameter: number
  layer: number
}

export interface Linework {
  width: number
  height: number
  params: LineworkParams
  polylines: Polyline[]
  dots: Dot[]
  // 生成耗时（毫秒），用于性能自检
  elapsedMs: number
}

// 最小间距 / 刀口违规
export interface Violation {
  x: number
  y: number
  kind: 'spacing' | 'width'
  gap: number // 实测间距或宽度，像素
  limit: number // 约束值
}

export interface ValidationReport {
  violations: Violation[]
  minGap: number
  maxInkWidth: number
  lineCount: number
  dotCount: number
}
