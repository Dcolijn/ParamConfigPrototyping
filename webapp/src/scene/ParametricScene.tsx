import { Suspense, useEffect, useMemo, useRef } from 'react'
import type { Material, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { EquirectangularReflectionMapping, MeshStandardMaterial as ThreeMeshStandardMaterial } from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import type { EvaluationResult } from '../engine/types'
import { applyShapekeysToMesh } from './morphTargets'
import AttachmentPointsLayer from './AttachmentPointsLayer'
import type { LoadedPbrPackage } from './pbrPackage'

interface ParametricSceneProps {
  partNames: string[]
  modelUrlsByPart: Record<string, string>
  shapekeys: EvaluationResult['outputs']['shapekeys']
  attachmentPoints: EvaluationResult['outputs']['attachment_points']
  onMorphTargetWarningsChange?: (warnings: string[]) => void
  pbrPackage: LoadedPbrPackage | null
}

interface ModelPartProps {
  url: string
  partName: string
  index: number
  shapekeys: EvaluationResult['outputs']['shapekeys']
  pbrPackage: LoadedPbrPackage | null
  onWarningsChange: (partName: string, warnings: string[]) => void
}

const applyGlobalMaterialSet = (root: Object3D, pbrPackage: LoadedPbrPackage | null) => {
  root.traverse((node) => {
    if (!(node as Mesh).isMesh) {
      return
    }

    const mesh = node as Mesh
    const originalMaterial = mesh.material as Material | Material[]

    const ensureStandardMaterial = (material: Material): MeshStandardMaterial => {
      if (material instanceof ThreeMeshStandardMaterial) {
        return material
      }

      // In gewone taal: als het model een ander materiaaltype heeft, zetten we het om naar PBR.
      const converted = new ThreeMeshStandardMaterial({
        color: '#ffffff',
      })

      material.dispose()
      return converted
    }

    if (Array.isArray(originalMaterial)) {
      mesh.material = originalMaterial.map(ensureStandardMaterial)
    } else {
      mesh.material = ensureStandardMaterial(originalMaterial)
    }

    const assignToMaterial = (material: MeshStandardMaterial) => {
      if (!pbrPackage) {
        return
      }

      const { diffuseMap, normalMap, ormMap, roughness, metalness, envMap, envMapIntensity } = pbrPackage.textureSet

      material.map = diffuseMap
      material.normalMap = normalMap
      material.aoMap = ormMap
      material.roughnessMap = ormMap
      material.metalnessMap = ormMap
      material.roughness = roughness
      material.metalness = metalness
      material.envMap = envMap
      material.envMapIntensity = envMapIntensity
      material.needsUpdate = true
    }

    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => assignToMaterial(material as MeshStandardMaterial))
    } else {
      assignToMaterial(mesh.material as MeshStandardMaterial)
    }
  })
}

function SceneEnvironment({ pbrPackage }: { pbrPackage: LoadedPbrPackage | null }) {
  const { scene } = useThree()

  useEffect(() => {
    if (!pbrPackage?.textureSet.envMap) {
      scene.environment = null
      return
    }

    const environmentTexture = pbrPackage.textureSet.envMap
    environmentTexture.mapping = EquirectangularReflectionMapping
    scene.environment = environmentTexture

    return () => {
      if (scene.environment === environmentTexture) {
        scene.environment = null
      }
    }
  }, [pbrPackage, scene])

  return null
}

function ModelPart({ url, partName, index, shapekeys, pbrPackage, onWarningsChange }: ModelPartProps) {
  const { scene } = useGLTF(url)
  const sceneInstance = useMemo(() => scene.clone(), [scene])

  useEffect(() => {
    const availableMorphNames = new Set<string>()
    const missingByShapekey = new Set<string>()

    applyGlobalMaterialSet(sceneInstance, pbrPackage)

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
  }, [onWarningsChange, partName, pbrPackage, sceneInstance, shapekeys])

  return <primitive object={sceneInstance} position={[0, index * 0.001, 0]} name={partName} />
}

export default function ParametricScene({
  partNames,
  modelUrlsByPart,
  shapekeys,
  attachmentPoints,
  onMorphTargetWarningsChange,
  pbrPackage,
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
      <SceneEnvironment pbrPackage={pbrPackage} />

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
                  pbrPackage={pbrPackage}
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
