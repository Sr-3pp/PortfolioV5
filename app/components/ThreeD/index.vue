<script setup lang="ts">
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Object3D, Scene, WebGLRenderer } from 'three'
import {
  AnimationAction,
  AnimationMixer,
  Box3,
  Fog,
  GridHelper,
  LoopOnce,
  LoopRepeat,
  Mesh,
  Vector3
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { camera, crouchMovementSpeed, floorSize, jumpAnticipationTime, jumpImpulse, movementSpeed, qualityModes, qualityPresets, sceneColor } from '../../utils/three-d/config.js'
import { clearObjectChildren, createLatestGltfLoader, findAnimationClip } from '../../utils/three-d/model-utils.js'
import type { QualityMode, TresLoopContext, TresReadyContext } from '../../utils/three-d/types.js'

const gridHelper = new GridHelper(floorSize, 28, 0x5eead4, 0x334155)

const {
  characterBody,
  characterHalfExtents,
  characterRoot,
  characterVisualRoot,
  floorRoot,
  isJumpCharging,
  shoveCharacter,
  updateFrame,
} = useThreeDCharacterController(movementSpeed, crouchMovementSpeed, jumpImpulse)
const selectedQuality = ref<QualityMode>('medium')
const currentQuality = computed(() => qualityPresets[selectedQuality.value])

let controls: OrbitControls | undefined
let sceneInstance: Scene | undefined
let rendererInstance: WebGLRenderer | undefined
let animationMixer: AnimationMixer | undefined
let idleAction: AnimationAction | undefined
let walkAction: AnimationAction | undefined
let crouchIdleAction: AnimationAction | undefined
let crouchWalkAction: AnimationAction | undefined
let jumpAction: AnimationAction | undefined
let activeAction: AnimationAction | undefined
let floorAlignmentElapsed = currentQuality.value.floorAlignmentInterval
let hasMounted = false
const fixedTimeStep = 1 / 60
const characterBounds = new Box3()
const modelLoader = createLatestGltfLoader()

const resetAnimationState = () => {
  animationMixer?.stopAllAction()
  animationMixer = undefined
  idleAction = undefined
  walkAction = undefined
  crouchIdleAction = undefined
  crouchWalkAction = undefined
  jumpAction = undefined
  activeAction = undefined
}

const clearCharacterModel = () => {
  resetAnimationState()
  clearObjectChildren(characterVisualRoot)
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

const isCrouchAction = (action: AnimationAction | undefined) => {
  return action === crouchIdleAction || action === crouchWalkAction
}

const isJumpAction = (action: AnimationAction | undefined) => {
  return action === jumpAction
}

const syncJumpChargeAnimation = (delta: number) => {
  if (!jumpAction || !animationMixer) {
    return false
  }

  if (isJumpCharging.value) {
    playCharacterAnimation(jumpAction)

    const holdTime = Math.min(jumpAnticipationTime, jumpAction.getClip().duration)

    if (jumpAction.time < holdTime) {
      jumpAction.paused = false
      animationMixer.update(delta)
    }

    if (jumpAction.time >= holdTime) {
      jumpAction.time = holdTime
      jumpAction.paused = true
    }

    return true
  }

  if (jumpAction.paused) {
    jumpAction.paused = false
  }

  return false
}

const playCharacterAnimation = (nextAction: AnimationAction | undefined) => {
  if (!nextAction || activeAction === nextAction) {
    return
  }

  const enteringCrouch = isCrouchAction(nextAction)
  const leavingCrouch = isCrouchAction(activeAction) && !isCrouchAction(nextAction)
  const jumpTransition = isJumpAction(nextAction) || isJumpAction(activeAction)
  const fadeDuration = jumpTransition
    ? 0.05
    : enteringCrouch
    ? 0
    : leavingCrouch
      ? 0.05
      : 0.18

  nextAction.enabled = true
  nextAction.reset()
  nextAction.setLoop(isJumpAction(nextAction) ? LoopOnce : LoopRepeat, Infinity)
  nextAction.clampWhenFinished = isJumpAction(nextAction)
  nextAction.fadeIn(fadeDuration)
  nextAction.play()

  activeAction?.fadeOut(fadeDuration)
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

  const crouchIdleClip = findAnimationClip(gltf.animations, /^crouch_idle$/i)
    ?? findAnimationClip(gltf.animations, /crouch.*idle|idle.*crouch/i)
    ?? idleClip

  const crouchWalkClip = findAnimationClip(gltf.animations, /^crouched_walking$/i)
    ?? findAnimationClip(gltf.animations, /crouch.*walk|walk.*crouch/i)
    ?? walkClip

  const jumpClip = findAnimationClip(gltf.animations, /^jumping$/i)
    ?? findAnimationClip(gltf.animations, /jump/i)

  idleAction = animationMixer.clipAction(idleClip)
  walkAction = animationMixer.clipAction(walkClip)
  crouchIdleAction = animationMixer.clipAction(crouchIdleClip)
  crouchWalkAction = animationMixer.clipAction(crouchWalkClip)
  jumpAction = jumpClip ? animationMixer.clipAction(jumpClip) : undefined

  playCharacterAnimation(idleAction)
}

const loadCharacterModel = () => {
  clearCharacterModel()

  modelLoader.load(currentQuality.value.modelUrl, prepareModel)
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
  const scene = context.scene.value
  const renderer = context.renderer.instance

  sceneInstance = scene
  scene.background = sceneColor

  rendererInstance = renderer
  applyQualitySettings()

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(0, 1.2, 0)
  controls.maxPolarAngle = Math.PI * 0.48
  controls.minDistance = 3
  controls.maxDistance = 12
}

const handleLoop = ({ delta }: TresLoopContext) => {
  updateFrame(delta, {
    idleAction,
    walkAction,
    crouchIdleAction,
    crouchWalkAction,
    jumpAction,
    playAnimation: playCharacterAnimation
  })

  const handledJumpCharge = syncJumpChargeAnimation(delta)

  if (!handledJumpCharge) {
    animationMixer?.update(delta)
  }

  floorAlignmentElapsed += delta
  if (floorAlignmentElapsed >= currentQuality.value.floorAlignmentInterval) {
    alignCharacterToFloor()
    floorAlignmentElapsed = 0
  }

  controls?.update()
}

onMounted(() => {
  hasMounted = true
  loadCharacterModel()
})

onBeforeUnmount(() => {
  hasMounted = false
  modelLoader.invalidate()
  clearCharacterModel()
  controls?.dispose()
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

      <primitive :object="floorRoot">
        <primitive
          :object="gridHelper"
          :position="[0, 0.01, 0]"
        />

        <TresMesh
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
      </primitive>
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
