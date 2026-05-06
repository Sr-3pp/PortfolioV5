import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { useThreeDCharacterController } from '../../app/composables/useThreeDCharacterController'

const animationState = {
  playAnimation: vi.fn(),
}

describe('useThreeDCharacterController', () => {
  it('applies a jump impulse when space is pressed and released on the ground', async () => {
    let controller: ReturnType<typeof useThreeDCharacterController> | undefined

    await mountSuspended(defineComponent({
      setup() {
        controller = useThreeDCharacterController(40, 35, 8.5)
        return () => null
      },
    }))

    expect(controller).toBeDefined()

    for (let frame = 0; frame < 180; frame += 1) {
      controller!.updateFrame(1 / 60, animationState)
    }

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }))
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }))
    controller!.updateFrame(1 / 60, animationState)

    expect(controller!.characterBody.velocity.y).toBeGreaterThan(6)
  })
})
