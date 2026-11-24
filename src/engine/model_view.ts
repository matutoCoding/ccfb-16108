// 三维视图：正交相机、轨道交互、G-buffer 离屏渲染
// 输出 mask/深度/法线/亮度四通道场，喂给方向场与排线引擎

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createSurfaceBuffer, idx } from './grid'
import type { SurfaceBuffer } from './types'

export interface RenderedFields {
  surface: SurfaceBuffer
  normalsX: Float32Array
  normalsY: Float32Array
}

// G-buffer 材质：rgb 写视图空间法线，a 写线性深度
const gbufferVert = /* glsl */ `
varying vec3 vViewNormal;
varying vec3 vViewPos;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`

const gbufferFrag = /* glsl */ `
precision highp float;
varying vec3 vViewNormal;
varying vec3 vViewPos;
uniform float uNear;
uniform float uFar;
void main() {
  // 法线分量 [-1,1] -> [0,1]
  vec3 n = vViewNormal * 0.5 + 0.5;
  // 线性深度归一化
  float d = (-vViewPos.z - uNear) / (uFar - uNear);
  gl_FragColor = vec4(n, clamp(d, 0.0, 1.0));
}
`

// 亮度材质：简单漫反射 + 距离衰减，暗部信息供线宽与交叉层使用
const luminanceFrag = /* glsl */ `
precision highp float;
varying vec3 vViewNormal;
uniform vec3 uLightDir;
void main() {
  vec3 n = normalize(vViewNormal);
  float diff = max(dot(n, normalize(uLightDir)), 0.0);
  float lum = 0.25 + 0.75 * diff;
  gl_FragColor = vec4(vec3(lum), 1.0);
}
`

export class ModelView {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  readonly controls: OrbitControls
  private gbufferMat: THREE.ShaderMaterial
  private lumMat: THREE.ShaderMaterial
  private target: THREE.Group
  private renderTarget: THREE.WebGLRenderTarget
  private tmpScene = new THREE.Scene()
  private tmpCam: THREE.OrthographicCamera

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: false,
    })
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(width, height, false)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xf1f5f9)

    const aspect = width / height
    const viewSize = 3.2
    this.camera = new THREE.OrthographicCamera(
      (-viewSize * aspect) / 2,
      (viewSize * aspect) / 2,
      viewSize / 2,
      -viewSize / 2,
      0.1,
      100,
    )
    this.camera.position.set(0, 0, 6)
    this.camera.lookAt(0, 0, 0)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minZoom = 0.6
    this.controls.maxZoom = 6

    this.target = new THREE.Group()
    this.scene.add(this.target)

    this.gbufferMat = new THREE.ShaderMaterial({
      vertexShader: gbufferVert,
      fragmentShader: gbufferFrag,
      uniforms: {
        uNear: { value: this.camera.near },
        uFar: { value: this.camera.far },
      },
    })
    this.lumMat = new THREE.ShaderMaterial({
      vertexShader: gbufferVert,
      fragmentShader: luminanceFrag,
      uniforms: {
        uLightDir: { value: new THREE.Vector3(-0.4, 0.6, 0.8).normalize() },
      },
    })

    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.UnsignedByteType,
    })

    this.tmpCam = this.camera.clone()
  }

  setObject(obj: THREE.Object3D): void {
    this.clearObject()
    this.normalizeToFrame(obj)
    this.target.add(obj)
  }

  clearObject(): void {
    while (this.target.children.length) {
      const child = this.target.children[0]
      this.target.remove(child)
    }
  }

  // 归一化：包围盒居中并缩放到统一尺寸，不同来源模型取景一致
  private normalizeToFrame(obj: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(obj)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const scale = 2.4 / maxDim
    obj.position.sub(center)
    obj.scale.setScalar(scale)
  }

  renderToCanvas(): void {
    this.controls.update()
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)
  }

  // 抓取 G-buffer 与亮度场，组装 SurfaceBuffer
  captureFields(): RenderedFields {
    const w = this.renderTarget.width
    const h = this.renderTarget.height
    this.tmpCam.copy(this.camera)

    // Pass 1: G-buffer
    const gPass = this.target.clone(true)
    gPass.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.material = this.gbufferMat
    })
    this.tmpScene.add(gPass)
    this.renderer.setRenderTarget(this.renderTarget)
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.clear()
    this.renderer.render(this.tmpScene, this.tmpCam)
    const gPixels = new Uint8Array(w * h * 4)
    this.renderer.readRenderTargetPixels(this.renderTarget, 0, 0, w, h, gPixels)
    this.tmpScene.remove(gPass)

    // Pass 2: 亮度
    const lPass = this.target.clone(true)
    lPass.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.material = this.lumMat
    })
    this.tmpScene.add(lPass)
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.clear()
    this.renderer.render(this.tmpScene, this.tmpCam)
    const lPixels = new Uint8Array(w * h * 4)
    this.renderer.readRenderTargetPixels(this.renderTarget, 0, 0, w, h, lPixels)
    this.tmpScene.remove(lPass)
    this.renderer.setRenderTarget(null)

    return this.assemble(w, h, gPixels, lPixels)
  }

  // WebGL 像素自底向上，这里翻转到画布顶向下坐标系
  private assemble(
    w: number,
    h: number,
    gPixels: Uint8Array,
    lPixels: Uint8Array,
  ): RenderedFields {
    const surface = createSurfaceBuffer(w, h)
    const normalsX = new Float32Array(w * h)
    const normalsY = new Float32Array(w * h)

    for (let fy = 0; fy < h; fy++) {
      const srcRow = h - 1 - fy
      for (let x = 0; x < w; x++) {
        const si = (srcRow * w + x) * 4
        const di = idx(w, x, fy)
        const r = gPixels[si]
        const g = gPixels[si + 1]
        const a = gPixels[si + 3]
        // 清屏 alpha 为 0，几何像素 alpha 非 0
        const covered = a > 0
        surface.mask[di] = covered ? 1 : 0
        if (!covered) continue
        surface.depth[di] = gPixels[si + 3] / 255
        surface.luminance[di] = lPixels[si] / 255
        normalsX[di] = r / 255 * 2 - 1
        normalsY[di] = g / 255 * 2 - 1
      }
    }
    return { surface, normalsX, normalsY }
  }

  resize(width: number, height: number): void {
    const aspect = width / height
    const viewSize = 3.2
    this.camera.left = (-viewSize * aspect) / 2
    this.camera.right = (viewSize * aspect) / 2
    this.camera.top = viewSize / 2
    this.camera.bottom = -viewSize / 2
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.renderTarget.setSize(width, height)
  }

  dispose(): void {
    this.renderTarget.dispose()
    this.gbufferMat.dispose()
    this.lumMat.dispose()
    this.renderer.dispose()
    this.controls.dispose()
  }
}
