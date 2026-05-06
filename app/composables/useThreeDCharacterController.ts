import type { AnimationAction } from 'three'
import * as CANNON from 'cannon-es'
import { Group, Vector3 } from 'three'

type AnimationState = {
  idleAction?: AnimationAction
  walkAction?: AnimationAction
  crouchIdleAction?: AnimationAction
  crouchWalkAction?: AnimationAction
  jumpAction?: AnimationAction
  playAnimation: (action?: AnimationAction) => void
}

export const useThreeDCharacterController = (movementSpeed: number, crouchMovementSpeed: number, jumpImpulse: number) => {
  const crouchSpeed = Math.max(crouchMovementSpeed, 0)
  const characterRoot = shallowRef(new Group())
  const characterVisualRoot = new Group()
  characterRoot.value.add(characterVisualRoot)

  const characterHalfExtents = new CANNON.Vec3(0.48, 1.15, 0.36)
  const floorVisualPosition = ref<[number, number, number]>([0, 0, 0])

  const pressedMovementKeys = new Set<string>()
  let isCrouching = false
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

  let accumulator = 0
  const fixedTimeStep = 1 / 60
  const movementDirection = new Vector3()
  const isJumpCharging = ref(false)
  let isJumping = false
  let jumpReleased = false

  const groundContactThreshold = 0.08
  const groundedVerticalSpeedThreshold = 0.35

  const isGrounded = () => {
    const standingHeight = characterHalfExtents.y
    return characterBody.position.y <= standingHeight + groundContactThreshold
      && Math.abs(characterBody.velocity.y) <= groundedVerticalSpeedThreshold
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

  const updateCharacterMovement = ({
    idleAction,
    walkAction,
    crouchIdleAction,
    crouchWalkAction,
    jumpAction,
    playAnimation
  }: AnimationState) => {
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
      playAnimation(
        isJumpCharging.value || isJumping
          ? jumpAction
          : isCrouching
            ? crouchIdleAction ?? idleAction
            : idleAction
      )
      return
    }

    movementDirection.normalize()

    if (characterBody.sleepState !== CANNON.Body.AWAKE) {
      characterBody.wakeUp()
    }

    const activeMovementSpeed = isCrouching ? crouchSpeed : movementSpeed

    characterBody.velocity.x = movementDirection.x * activeMovementSpeed
    characterBody.velocity.z = movementDirection.z * activeMovementSpeed
    characterBody.quaternion.setFromEuler(
      0,
      Math.atan2(movementDirection.x, movementDirection.z),
      0
    )
    playAnimation(
      isJumpCharging.value || isJumping
        ? jumpAction
        : isCrouching
          ? crouchWalkAction ?? walkAction
          : walkAction
    )
  }

  const updateFrame = (delta: number, animationState: AnimationState) => {
    if (jumpReleased && isJumpCharging.value && isGrounded()) {
      characterBody.velocity.y = jumpImpulse
      isJumping = true
      isJumpCharging.value = false
      jumpReleased = false
    }

    updateCharacterMovement(animationState)

    accumulator += Math.min(delta, 0.1)

    while (accumulator >= fixedTimeStep) {
      world.fixedStep(fixedTimeStep)
      accumulator -= fixedTimeStep
    }

    if (isJumping && isGrounded()) {
      isJumping = false
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

    floorVisualPosition.value = [
      -characterBody.position.x,
      0,
      -characterBody.position.z
    ]
  }

  const isShiftEvent = (event: KeyboardEvent) => {
    return event.key === 'Shift' || event.code.startsWith('Shift')
  }

  const handleWindowBlur = () => {
    isCrouching = false
    isJumpCharging.value = false
    isJumping = false
    jumpReleased = false
    pressedMovementKeys.clear()
  }

  const handleKeydown = (event: KeyboardEvent) => {
    isCrouching = isCrouching || event.shiftKey || isShiftEvent(event)

    if (isShiftEvent(event)) {
      event.preventDefault()
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
      if (!isJumping && isGrounded()) {
        isJumpCharging.value = true
        jumpReleased = false
      }
      return
    }

    if (!event.key.startsWith('Arrow')) {
      return
    }

    event.preventDefault()
    pressedMovementKeys.add(event.key)
  }

  const handleKeyup = (event: KeyboardEvent) => {
    if (isShiftEvent(event)) {
      isCrouching = false
      event.preventDefault()
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
      if (isJumpCharging.value) {
        jumpReleased = true
      }
      return
    }

    isCrouching = event.shiftKey

    if (!event.key.startsWith('Arrow')) {
      return
    }

    event.preventDefault()
    pressedMovementKeys.delete(event.key)
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('keyup', handleKeyup)
    window.addEventListener('blur', handleWindowBlur)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('keyup', handleKeyup)
    window.removeEventListener('blur', handleWindowBlur)
  })

  return {
    characterBody,
    characterHalfExtents,
    characterRoot,
    characterVisualRoot,
    floorVisualPosition,
    isJumpCharging,
    shoveCharacter,
    updateFrame,
  }
}
