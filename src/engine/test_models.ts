// 程序化测试模型：人物头像与古塔，用基础几何体拼合并融合法线
// 头像包含脸颊曲面（检验顺弧排线），古塔包含圆柱与平墙（检验曲率与透视方向）

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

function mergeGroup(parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[]): THREE.Mesh {
  const geometries: THREE.BufferGeometry[] = []
  for (const part of parts) {
    const g = part.geo.clone()
    geometries.push(g)
  }
  const merged = mergeGeometries(geometries, false)
  if (!merged) throw new Error('测试模型几何体合并失败')
  merged.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc7ccd6,
    roughness: 0.85,
    metalness: 0.05,
  })
  const mesh = new THREE.Mesh(merged, mat)
  mesh.name = 'procedural-model'
  return mesh
}

// 人物头像：头椭球 + 鼻锥 + 颈柱 + 双耳，比例偏雕塑感
export function createHeadModel(): THREE.Object3D {
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = []
  const mat = new THREE.MeshStandardMaterial({ color: 0xc7ccd6, roughness: 0.85 })

  const head = new THREE.SphereGeometry(1, 48, 32)
  head.scale(0.82, 1.05, 0.9)
  head.translate(0, 0.35, 0)
  parts.push({ geo: head, mat })

  const nose = new THREE.ConeGeometry(0.16, 0.55, 24)
  nose.rotateX(Math.PI / 2)
  nose.translate(0, 0.25, 0.88)
  parts.push({ geo: nose, mat })

  const neck = new THREE.CylinderGeometry(0.32, 0.38, 0.7, 32)
  neck.translate(0, -1.0, -0.05)
  parts.push({ geo: neck, mat })

  for (const side of [-1, 1]) {
    const ear = new THREE.SphereGeometry(0.2, 20, 16)
    ear.scale(0.6, 1, 0.45)
    ear.translate(side * 0.82, 0.3, 0)
    parts.push({ geo: ear, mat })
  }

  // 眉骨两个小椭球，制造折边，检验折线描边
  for (const side of [-1, 1]) {
    const brow = new THREE.SphereGeometry(0.16, 16, 12)
    brow.scale(1.4, 0.5, 0.6)
    brow.translate(side * 0.32, 0.55, 0.72)
    parts.push({ geo: brow, mat })
  }

  return mergeGroup(parts)
}

// 古塔：须弥座 + 五层塔身（圆柱墙 + 锥形檐）+ 塔刹，检验平墙透视与圆柱顺弧
export function createPagodaModel(): THREE.Object3D {
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = []
  const mat = new THREE.MeshStandardMaterial({ color: 0xb8b0a2, roughness: 0.9 })

  // 方形须弥座两级
  const base1 = new THREE.BoxGeometry(2.4, 0.3, 2.4)
  base1.translate(0, -1.9, 0)
  parts.push({ geo: base1, mat })
  const base2 = new THREE.BoxGeometry(2.0, 0.28, 2.0)
  base2.translate(0, -1.62, 0)
  parts.push({ geo: base2, mat })

  let y = -1.35
  let radius = 0.95
  const tiers = 5
  for (let i = 0; i < tiers; i++) {
    // 圆柱形塔身：平墙方向应顺透视，弧面顺主曲率
    const wallH = 0.5 - i * 0.03
    const wall = new THREE.CylinderGeometry(radius, radius * 1.02, wallH, 36, 1)
    wall.translate(0, y + wallH / 2, 0)
    parts.push({ geo: wall, mat })

    // 四个方向的门洞浮雕（小方块），制造折边
    for (let k = 0; k < 4; k++) {
      const angle = (k / 4) * Math.PI * 2
      const door = new THREE.BoxGeometry(0.22, 0.3, 0.06)
      door.translate(
        Math.cos(angle) * (radius + 0.02),
        y + wallH * 0.45,
        Math.sin(angle) * (radius + 0.02),
      )
      door.rotateY(-angle)
      parts.push({ geo: door, mat })
    }

    // 锥形塔檐
    const eaveH = 0.28
    const eave = new THREE.ConeGeometry(radius * 1.28, eaveH, 36)
    eave.translate(0, y + wallH + eaveH / 2, 0)
    parts.push({ geo: eave, mat })

    y += wallH + eaveH - 0.04
    radius *= 0.86
  }

  // 塔刹：细圆柱 + 球 + 尖锥
  const spireBase = new THREE.CylinderGeometry(0.12, 0.16, 0.4, 20)
  spireBase.translate(0, y + 0.15, 0)
  parts.push({ geo: spireBase, mat })
  const pearl = new THREE.SphereGeometry(0.16, 20, 16)
  pearl.translate(0, y + 0.42, 0)
  parts.push({ geo: pearl, mat })
  const tip = new THREE.ConeGeometry(0.1, 0.55, 20)
  tip.translate(0, y + 0.78, 0)
  parts.push({ geo: tip, mat })

  return mergeGroup(parts)
}
