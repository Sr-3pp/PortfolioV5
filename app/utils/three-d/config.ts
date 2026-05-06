import type { ShadowMapType } from 'three'
import { BasicShadowMap, Color, PCFShadowMap, PerspectiveCamera } from 'three'

import type { QualityMode } from './types.js'

export type QualityPreset = {
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

export const floorSize = 28
export const sceneColor = new Color(0x11151c)
export const movementSpeed = 30

export const camera = new PerspectiveCamera(45, 1, 0.1, 100)
camera.position.set(4, 3, 6)

export const qualityPresets: Record<QualityMode, QualityPreset> = {
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

export const qualityModes = Object.keys(qualityPresets) as QualityMode[]
