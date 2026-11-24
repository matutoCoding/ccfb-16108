// 外部三维素材导入：glTF 与 OBJ，统一归一化到取景框

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'

export async function loadModelAsset(
  blob: Blob,
  fileName: string,
): Promise<THREE.Object3D> {
  const lower = fileName.toLowerCase()
  const buffer = await blob.arrayBuffer()
  if (lower.endsWith('.gltf') || lower.endsWith('.glb')) {
    return loadGltf(buffer)
  }
  if (lower.endsWith('.obj')) {
    return loadObj(buffer)
  }
  throw new Error(`不支持的三维格式：${fileName}，仅支持 glTF/GLB 与 OBJ`)
}

function loadGltf(buffer: ArrayBuffer): Promise<THREE.Object3D> {
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => {
    loader.parse(
      buffer,
      '',
      (gltf) => {
        const root = gltf.scene
        ensureMeshes(root)
        resolve(root)
      },
      (err) => reject(new Error(`glTF 解析失败：${err}`)),
    )
  })
}

function loadObj(buffer: ArrayBuffer): THREE.Object3D {
  const text = new TextDecoder().decode(buffer)
  const loader = new OBJLoader()
  const obj = loader.parse(text)
  ensureMeshes(obj)
  return obj
}

// 没有法线的老 OBJ 补法线，材质统一成哑光灰，保证 G-buffer 稳定
function ensureMeshes(root: THREE.Object3D): void {
  const fallback = new THREE.MeshStandardMaterial({
    color: 0xc0c4cc,
    roughness: 0.85,
    metalness: 0.05,
  })
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals()
    mesh.material = fallback
  })
}
