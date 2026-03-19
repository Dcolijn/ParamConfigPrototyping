import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'

interface ParametricSceneProps {
  partNames: string[]
  modelUrlsByPart: Record<string, string>
}

function ModelPart({ url, partName, index }: { url: string; partName: string; index: number }) {
  const { scene } = useGLTF(url)

  // Elke part krijgt een eigen "houder" in de scene, zodat elk model los staat.
  return <primitive object={scene.clone()} position={[0, index * 0.001, 0]} name={partName} />
}

export default function ParametricScene({ partNames, modelUrlsByPart }: ParametricSceneProps) {
  const safePartNames = partNames.filter((partName) => partName.trim().length > 0)

  return (
    <Canvas camera={{ position: [2.8, 2.2, 2.8], fov: 50 }}>
      {/* Basislicht zodat modellen direct zichtbaar zijn. */}
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 4]} intensity={1.1} />

      <Suspense fallback={null}>
        <group>
        {safePartNames.map((partName, index) => {
          const url = modelUrlsByPart[partName]

          // Duidelijke waarschuwing als dit part nog geen ingeladen model heeft.
          if (!url) {
            console.warn(`[ParametricScene] Geen model ingeladen voor part "${partName}".`)
            return null
          }

          return (
            <group key={partName}>
              <ModelPart partName={partName} url={url} index={index} />
            </group>
          )
        })}
        </group>
      </Suspense>

      {/* Gebruiker kan meteen roteren en in-/uitzoomen. */}
      <OrbitControls enableDamping />
    </Canvas>
  )
}
