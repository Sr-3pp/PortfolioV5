<script setup lang="ts">
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Object3D, Scene, WebGLRenderer } from 'three'
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import * as CANNON from 'cannon-es'
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Box3,
  Color,
  Fog,
  GridHelper,
  LoopRepeat,
  Group,
  Mesh,
  PCFSoftShadowMap,
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

const floorSize = 28
const sceneColor = new Color(0x11151c)
const camera = new PerspectiveCamera(45, 1, 0.1, 100)
camera.position.set(4, 3, 6)

const gridHelper = new GridHelper(floorSize, 28, 0x5eead4, 0x334155)
gridHelper.position.y = 0.01

const characterRoot = shallowRef(new Group())
const characterVisualRoot = new Group()
characterRoot.value.add(characterVisualRoot)
const characterHalfExtents = new CANNON.Vec3(0.48, 1.15, 0.36)
const pressedMovementKeys = new Set<string>()
const movementSpeed = 3.2

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
let animationMixer: AnimationMixer | undefined
let idleAction: AnimationAction | undefined
let walkAction: AnimationAction | undefined
let activeAction: AnimationAction | undefined
let accumulator = 0
const fixedTimeStep = 1 / 60
const movementDirection = new Vector3()
const characterBounds = new Box3()

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
}

const prepareModel = (gltf: GLTF) => {
  const model = gltf.scene

  model.traverse((node: Object3D) => {
    if (node instanceof Mesh) {
      node.castShadow = true
      node.receiveShadow = true
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
  context.scene.value.background = sceneColor
  context.scene.value.fog = new Fog(sceneColor, 12, 38)

  const renderer = context.renderer.instance
  if ('shadowMap' in renderer) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFSoftShadowMap
  }

  controls = new OrbitControls(camera, renderer.domElement)
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
    characterBody.position.x,
    characterBody.position.y - characterHalfExtents.y,
    characterBody.position.z
  )
  characterRoot.value.quaternion.set(
    characterBody.quaternion.x,
    characterBody.quaternion.y,
    characterBody.quaternion.z,
    characterBody.quaternion.w
  )

  animationMixer?.update(delta)
  alignCharacterToFloor()
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
  const loader = new GLTFLoader()
  loader.load('/models/character.glb', prepareModel)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
})

onBeforeUnmount(() => {
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
    <TresCanvas
      :camera="camera"
      :dpr="[1, 2]"
      :alpha="false"
      :antialias="true"
      :shadows="true"
      :preserve-drawing-buffer="true"
      :shadow-map-type="PCFSoftShadowMap"
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
        :intensity="3"
        cast-shadow
      />
      <TresPointLight
        :position="[-4, 2.5, -3]"
        :args="[0x38bdf8, 18, 14]"
      />

      <primitive :object="characterRoot" />

      <primitive :object="gridHelper" />

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
    </TresCanvas>
  </div>
</template>

<style scoped>
.three-d-scene {
  width: 100%;
  min-height: 100svh;
  overflow: hidden;
  touch-action: none;
}
</style>
