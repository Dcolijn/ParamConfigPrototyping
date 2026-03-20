import { Suspense, useEffect, useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import type { EvaluationResult } from '../engine/types'
import { applyShapekeysToMesh } from './morphTargets'
import AttachmentPointsLayer from './AttachmentPointsLayer'

interface ParametricSceneProps {
  partNames: string[]
  modelUrlsByPart: Record<string, string>
  shapekeys: EvaluationResult['outputs']['shapekeys']
  attachmentPoints: EvaluationResult['outputs']['attachment_points']
  onMorphTargetWarningsChange?: (warnings: string[]) => void
}

interface ModelPartProps {
  url: string
  partName: string
  index: number
  shapekeys: EvaluationResult['outputs']['shapekeys']
  onWarningsChange: (partName: string, warnings: string[]) => void
}

function ModelPart({ url, partName, index, shapekeys, onWarningsChange }: ModelPartProps) {
  const { scene } = useGLTF(url)
  const sceneInstance = useMemo(() => scene.clone(), [scene])

  useEffect(() => {
    const availableMorphNames = new Set<string>()
    const missingByShapekey = new Set<string>()

    sceneInstance.traverse((node) => {
      if (!(node as Mesh).isMesh) {
        return
      }

      const mesh = node as Mesh
      const meshWarnings = applyShapekeysToMesh(mesh, shapekeys)

      Object.keys(mesh.morphTargetDictionary ?? {}).forEach((name) => {
        availableMorphNames.add(name)
      })

      meshWarnings.forEach((warningId) => {
        missingByShapekey.add(warningId)
      })
    })

    const filteredWarnings = Array.from(missingByShapekey).filter((shapekeyId) => !availableMorphNames.has(shapekeyId))

    onWarningsChange(partName, filteredWarnings.map((shapekeyId) => `Part "${partName}": morph target "${shapekeyId}" ontbreekt.`))
  }, [onWarningsChange, partName, sceneInstance, shapekeys])

  return <primitive object={sceneInstance} position={[0, index * 0.001, 0]} name={partName} />
}

export default function ParametricScene({
  partNames,
  modelUrlsByPart,
  shapekeys,
  attachmentPoints,
  onMorphTargetWarningsChange,
}: ParametricSceneProps) {
  const safePartNames = partNames.filter((partName) => partName.trim().length > 0)
  const safePartNamesKey = useMemo(() => safePartNames.join('|'), [safePartNames])
  const warningsByPartRef = useRef<Record<string, string[]>>({})

  useEffect(() => {
    warningsByPartRef.current = {}
    onMorphTargetWarningsChange?.([])
  }, [safePartNamesKey, onMorphTargetWarningsChange])

  const handleWarningsChange = (partName: string, warnings: string[]) => {
    warningsByPartRef.current = {
      ...warningsByPartRef.current,
      [partName]: warnings,
    }

    const mergedWarnings = Object.values(warningsByPartRef.current).flat()
    onMorphTargetWarningsChange?.(mergedWarnings)
  }

  return (
    <Canvas camera={{ position: [2.8, 2.2, 2.8], fov: 50 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 4]} intensity={1.1} />

      <Suspense fallback={null}>
        <group>
          {safePartNames.map((partName, index) => {
            const url = modelUrlsByPart[partName]

            if (!url) {
              console.warn(`[ParametricScene] Geen model ingeladen voor part "${partName}".`)
              return null
            }

            return (
              <group key={partName}>
                <ModelPart
                  partName={partName}
                  url={url}
                  index={index}
                  shapekeys={shapekeys}
                  onWarningsChange={handleWarningsChange}
                />
              </group>
            )
          })}
        </group>

        <AttachmentPointsLayer attachmentPoints={attachmentPoints} />
      </Suspense>

      <OrbitControls enableDamping />
    </Canvas>
  )
}
