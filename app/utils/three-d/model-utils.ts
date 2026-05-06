import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Object3D } from 'three'
import { AnimationClip, Mesh } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

type DisposableMaterial = Record<string, unknown> & {
  dispose?: () => void
}

const disposeMaterialResources = (material: DisposableMaterial) => {
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && 'isTexture' in value) {
      (value as { dispose?: () => void }).dispose?.()
    }
  }

  material.dispose?.()
}

export const disposeObjectResources = (object: Object3D) => {
  object.traverse((node: Object3D) => {
    if (!(node instanceof Mesh)) {
      return
    }

    node.geometry.dispose()

    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material]

    for (const material of materials) {
      disposeMaterialResources(material as DisposableMaterial)
    }
  })
}

export const clearObjectChildren = (root: Object3D) => {
  for (const child of [...root.children]) {
    root.remove(child)
    disposeObjectResources(child)
  }
}

export const findAnimationClip = (clips: AnimationClip[], matcher: RegExp) => {
  return clips.find((clip) => matcher.test(clip.name))
}

export const createLatestGltfLoader = () => {
  const loader = new GLTFLoader()
  let loadVersion = 0

  return {
    invalidate() {
      loadVersion += 1
    },

    load(url: string, onLoad: (gltf: GLTF) => void, onError?: (error: unknown) => void) {
      const requestVersion = ++loadVersion

      loader.load(
        url,
        (gltf) => {
          if (requestVersion !== loadVersion) {
            return
          }

          onLoad(gltf)
        },
        undefined,
        onError,
      )
    }
  }
}
