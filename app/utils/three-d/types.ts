import type { Scene, WebGLRenderer } from 'three'

export type TresReadyContext = {
  scene: {
    value: Scene
  }
  renderer: {
    instance: WebGLRenderer
  }
}

export type TresLoopContext = {
  delta: number
}

export type QualityMode = 'low' | 'medium' | 'high'
