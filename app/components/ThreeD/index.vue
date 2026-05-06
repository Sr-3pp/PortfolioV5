<script setup lang="ts">
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Object3D, Scene, ShadowMapType, WebGLRenderer } from 'three'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import * as CANNON from 'cannon-es'
import {
  AnimationAction,
  AnimationClip,
  BasicShadowMap,
  AnimationMixer,
  Box3,
  Color,
  Fog,
  GridHelper,
  LoopRepeat,
  Group,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  Vector3
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

type TresReadyContext = {
  scene: {
    value: Scene
  }
  renderer: {
    instance: WebGLRenderer
  }
}

type TresLoopContext = {
  delta: number
}

type QualityMode = 'low' | 'medium' | 'high'

type QualityPreset = {
  label: string
  modelUrl: string
  dpr: [number, number]
  antialias: boolean
  shadows: boolean
  shadowMapType: ShadowMapType
  directionalLightIntensity: number
  pointLightIntensity: number
  fogFar: number
  floorAlignmentInterval: number
}

const floorSize = 28
const sceneColor = new Color(0x11151c)
const camera = new PerspectiveCamera(45, 1, 0.1, 100)
camera.position.set(4, 3, 6)

const gridHelper = new GridHelper(floorSize, 28, 0x5eead4, 0x334155)
const floorVisualPosition = ref<[number, number, number]>([0, 0, 0])

const characterRoot = shallowRef(new Group())
const characterVisualRoot = new Group()
characterRoot.value.add(characterVisualRoot)
const characterHalfExtents = new CANNON.Vec3(0.48, 1.15, 0.36)
const pressedMovementKeys = new Set<string>()
const movementSpeed = 30

const qualityPresets: Record<QualityMode, QualityPreset> = {
  low: {
    label: 'Low',
    modelUrl: '/models/character-optimized.glb',
    dpr: [1, 1],
    antialias: false,
    shadows: false,
    shadowMapType: BasicShadowMap,
    directionalLightIntensity: 2.1,
    pointLightIntensity: 0,
    fogFar: 28,
    floorAlignmentInterval: 1 / 8
  },
  medium: {
    label: 'Medium',
    modelUrl: '/models/character-optimized.glb',
    dpr: [1, 1.25],
    antialias: true,
    shadows: true,
    shadowMapType: PCFShadowMap,
    directionalLightIntensity: 2.6,
    pointLightIntensity: 9,
    fogFar: 34,
    floorAlignmentInterval: 1 / 12
  },
  high: {
    label: 'High',
    modelUrl: '/models/character.glb',
    dpr: [1, 1.75],
    antialias: true,
    shadows: true,
    shadowMapType: PCFShadowMap,
    directionalLightIntensity: 3,
    pointLightIntensity: 18,
    fogFar: 38,
    floorAlignmentInterval: 1 / 18
  }
}

const qualityModes = Object.keys(qualityPresets) as QualityMode[]
const selectedQuality = ref<QualityMode>('medium')
const currentQuality = computed(() => qualityPresets[selectedQuality.value])

const floorMaterialPhysics = new CANNON.Material('floor')
const characterMaterialPhysics = new CANNON.Material('character')
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0)
})
world.broadphase = new CANNON.SAPBroadphase(world)
world.allowSleep = true
world.addContactMaterial(new CANNON.ContactMaterial(
  floorMaterialPhysics,
  characterMaterialPhysics,
  {
    friction: 0.7,
    restitution: 0.18
  }
))

const floorBody = new CANNON.Body({
  mass: 0,
  material: floorMaterialPhysics,
  shape: new CANNON.Plane()
})
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
world.addBody(floorBody)

const characterBody = new CANNON.Body({
  mass: 8,
  material: characterMaterialPhysics,
  position: new CANNON.Vec3(0, 5, 0),
  shape: new CANNON.Box(characterHalfExtents),
  linearDamping: 0.25,
  angularDamping: 0.82,
  fixedRotation: true
})
characterBody.quaternion.setFromEuler(0, 0.2, 0)
world.addBody(characterBody)

let controls: OrbitControls | undefined
let sceneInstance: Scene | undefined
let rendererInstance: WebGLRenderer | undefined
let animationMixer: AnimationMixer | undefined
let idleAction: AnimationAction | undefined
let walkAction: AnimationAction | undefined
let activeAction: AnimationAction | undefined
let accumulator = 0
let floorAlignmentElapsed = currentQuality.value.floorAlignmentInterval
let hasMounted = false
let modelLoadVersion = 0
const fixedTimeStep = 1 / 60
const movementDirection = new Vector3()
const characterBounds = new Box3()

const disposeMaterialResources = (material: Record<string, unknown> & { dispose?: () => void }) => {
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && 'isTexture' in value) {
      (value as { dispose?: () => void }).dispose?.()
    }
  }

  material.dispose?.()
}

const disposeObjectResources = (object: Object3D) => {
  object.traverse((node: Object3D) => {
    if (!(node instanceof Mesh)) {
      return
    }

    node.geometry.dispose()

    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material]

    for (const material of materials) {
      disposeMaterialResources(material as Record<string, unknown> & { dispose?: () => void })
    }
  })
}

const resetAnimationState = () => {
  animationMixer?.stopAllAction()
  animationMixer = undefined
  idleAction = undefined
  walkAction = undefined
  activeAction = undefined
}

const clearCharacterModel = () => {
  resetAnimationState()

  for (const child of [...characterVisualRoot.children]) {
    characterVisualRoot.remove(child)
    disposeObjectResources(child)
  }
}

const applyQualitySettings = () => {
  floorAlignmentElapsed = currentQuality.value.floorAlignmentInterval

  if (sceneInstance) {
    sceneInstance.fog = new Fog(sceneColor, 12, currentQuality.value.fogFar)
  }

  if (rendererInstance && 'shadowMap' in rendererInstance) {
    rendererInstance.shadowMap.enabled = currentQuality.value.shadows
    rendererInstance.shadowMap.type = currentQuality.value.shadowMapType
  }
}

const findAnimationClip = (clips: AnimationClip[], matcher: RegExp) => {
  return clips.find((clip) => matcher.test(clip.name))
}

const playCharacterAnimation = (nextAction: AnimationAction | undefined) => {
  if (!nextAction || activeAction === nextAction) {
    return
  }

  nextAction.enabled = true
  nextAction.reset()
  nextAction.setLoop(LoopRepeat, Infinity)
  nextAction.fadeIn(0.18)
  nextAction.play()

  activeAction?.fadeOut(0.18)
  activeAction = nextAction
  floorAlignmentElapsed = currentQuality.value.floorAlignmentInterval
}

const prepareModel = (gltf: GLTF) => {
  const model = gltf.scene

  model.traverse((node: Object3D) => {
    if (node instanceof Mesh) {
      node.castShadow = currentQuality.value.shadows
      node.receiveShadow = false
    }
  })

  const initialBox = new Box3().setFromObject(model, true)
  const initialSize = initialBox.getSize(new Vector3())
  const targetHeight = characterHalfExtents.y * 2
  const scale = targetHeight / Math.max(initialSize.y, 0.001)
  model.scale.setScalar(scale)

  const scaledBox = new Box3().setFromObject(model, true)
  const center = scaledBox.getCenter(new Vector3())
  model.position.set(-center.x, -scaledBox.min.y, -center.z)

  characterVisualRoot.add(model)

  animationMixer = new AnimationMixer(model)

  const idleClip = findAnimationClip(gltf.animations, /^idle$/i)
                    ?? findAnimationClip(gltf.animations, /idle/i)
                    ?? gltf.animations[0]

  if (!idleClip) {
    return
  }


  const walkClip = findAnimationClip(gltf.animations, /^walking$/i)
    ?? findAnimationClip(gltf.animations, /walk/i)
    ?? idleClip

  idleAction = animationMixer.clipAction(idleClip)
  walkAction = animationMixer.clipAction(walkClip)

  playCharacterAnimation(idleAction)
}

const loadCharacterModel = () => {
  const loader = new GLTFLoader()
  const requestVersion = ++modelLoadVersion

  clearCharacterModel()

  loader.load(currentQuality.value.modelUrl, (gltf) => {
    if (requestVersion !== modelLoadVersion) {
      return
    }

    prepareModel(gltf)
  })
}

const setQualityMode = (mode: QualityMode) => {
  if (selectedQuality.value === mode) {
    return
  }

  selectedQuality.value = mode
  applyQualitySettings()

  if (hasMounted) {
    loadCharacterModel()
  }
}

const alignCharacterToFloor = () => {
  if (characterVisualRoot.children.length === 0) {
    return
  }

  characterRoot.value.updateMatrixWorld(true)
  characterBounds.setFromObject(characterVisualRoot, true)
  const targetFloorY = characterRoot.value.position.y
  const floorOffset = targetFloorY - characterBounds.min.y

  if (Number.isFinite(floorOffset)) {
    characterVisualRoot.position.y += floorOffset
  }
}

const handleReady = (context: TresReadyContext) => {
  sceneInstance = context.scene.value
  sceneInstance.background = sceneColor

  rendererInstance = context.renderer.instance
  applyQualitySettings()

  controls = new OrbitControls(camera, rendererInstance.domElement)
  controls.enableDamping = true
  controls.target.set(0, 1.2, 0)
  controls.maxPolarAngle = Math.PI * 0.48
  controls.minDistance = 3
  controls.maxDistance = 12
}

const shoveCharacter = () => {
  if (characterBody.sleepState !== CANNON.Body.AWAKE) {
    characterBody.wakeUp()
  }

  characterBody.applyImpulse(
    new CANNON.Vec3(
      (Math.random() - 0.5) * 2.5,
      2.4,
      (Math.random() - 0.5) * 2.5
    ),
    characterBody.position
  )
}

const updateCharacterMovement = () => {
  movementDirection.set(0, 0, 0)

  if (pressedMovementKeys.has('ArrowUp')) {
    movementDirection.z -= 1
  }

  if (pressedMovementKeys.has('ArrowDown')) {
    movementDirection.z += 1
  }

  if (pressedMovementKeys.has('ArrowLeft')) {
    movementDirection.x -= 1
  }

  if (pressedMovementKeys.has('ArrowRight')) {
    movementDirection.x += 1
  }

  if (movementDirection.lengthSq() === 0) {
    characterBody.velocity.x = 0
    characterBody.velocity.z = 0
    playCharacterAnimation(idleAction)
    return
  }

  movementDirection.normalize()

  if (characterBody.sleepState !== CANNON.Body.AWAKE) {
    characterBody.wakeUp()
  }

  characterBody.velocity.x = movementDirection.x * movementSpeed
  characterBody.velocity.z = movementDirection.z * movementSpeed
  characterBody.quaternion.setFromEuler(
    0,
    Math.atan2(movementDirection.x, movementDirection.z),
    0
  )
  playCharacterAnimation(walkAction)
}

const handleLoop = ({ delta }: TresLoopContext) => {
  updateCharacterMovement()

  accumulator += Math.min(delta, 0.1)

  while (accumulator >= fixedTimeStep) {
    world.fixedStep(fixedTimeStep)
    accumulator -= fixedTimeStep
  }

  characterRoot.value.position.set(
    0,
    characterBody.position.y - characterHalfExtents.y,
    0
  )
  characterRoot.value.quaternion.set(
    characterBody.quaternion.x,
    characterBody.quaternion.y,
    characterBody.quaternion.z,
    characterBody.quaternion.w
  )

  animationMixer?.update(delta)

  floorVisualPosition.value = [
    -characterBody.position.x,
    0,
    -characterBody.position.z
  ]

  floorAlignmentElapsed += delta
  if (floorAlignmentElapsed >= currentQuality.value.floorAlignmentInterval) {
    alignCharacterToFloor()
    floorAlignmentElapsed = 0
  }

  controls?.update()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!event.key.startsWith('Arrow')) {
    return
  }

  event.preventDefault()
  pressedMovementKeys.add(event.key)
}

const handleKeyup = (event: KeyboardEvent) => {
  if (!event.key.startsWith('Arrow')) {
    return
  }

  event.preventDefault()
  pressedMovementKeys.delete(event.key)
}

onMounted(() => {
  hasMounted = true
  loadCharacterModel()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
})

onBeforeUnmount(() => {
  hasMounted = false
  clearCharacterModel()
  controls?.dispose()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('keyup', handleKeyup)
})
</script>

<template>
  <div
    class="three-d-scene"
    aria-label="Interactive 3D character scene"
    @pointerdown="shoveCharacter"
  >
    <div class="quality-switcher">
      <button
        v-for="mode in qualityModes"
        :key="mode"
        class="quality-switcher__button"
        :class="{ 'quality-switcher__button--active': selectedQuality === mode }"
        type="button"
        @click="setQualityMode(mode)"
      >
        {{ qualityPresets[mode].label }}
      </button>
    </div>

    <TresCanvas
      :camera="camera"
      :dpr="currentQuality.dpr"
      :alpha="false"
      :antialias="currentQuality.antialias"
      :shadows="currentQuality.shadows"
      :shadow-map-type="currentQuality.shadowMapType"
      clear-color="#11151c"
      render-mode="always"
      window-size
      @ready="handleReady"
      @loop="handleLoop"
    >
      <TresHemisphereLight
        :args="[0xc7d2fe, 0x1f2937, 1.2]"
      />
      <TresDirectionalLight
        :position="[4, 7, 5]"
        :intensity="currentQuality.directionalLightIntensity"
        :cast-shadow="currentQuality.shadows"
      />
      <TresPointLight
        v-if="currentQuality.pointLightIntensity > 0"
        :position="[-4, 2.5, -3]"
        :args="[0x38bdf8, currentQuality.pointLightIntensity, 14]"
      />

      <primitive :object="characterRoot" />

      <primitive
        :object="gridHelper"
        :position="[floorVisualPosition[0], 0.01, floorVisualPosition[2]]"
      />

      <TresMesh
        :position="floorVisualPosition"
        :rotation="[-Math.PI / 2, 0, 0]"
        receive-shadow
      >
        <TresPlaneGeometry :args="[floorSize, floorSize]" />
        <TresMeshStandardMaterial
          :color="0x252a33"
          :roughness="0.82"
          :metalness="0.05"
        />
      </TresMesh>
    </TresCanvas>
  </div>
</template>

<style scoped>
.three-d-scene {
  position: relative;
  width: 100%;
  min-height: 100svh;
  overflow: hidden;
  touch-action: none;
}

.quality-switcher {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  z-index: 2;
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid rgb(94 234 212 / 18%);
  border-radius: 999px;
  background: rgb(15 23 42 / 78%);
  backdrop-filter: blur(12px);
}

.quality-switcher__button {
  border: 0;
  border-radius: 999px;
  padding: 0.5rem 0.85rem;
  background: transparent;
  color: rgb(191 219 254);
  font: inherit;
  cursor: pointer;
}

.quality-switcher__button--active {
  background: rgb(94 234 212 / 16%);
  color: rgb(94 234 212);
}
</style>
