import { useMemo } from 'react'
import type { EvaluationResult } from '../engine/types'

interface AttachmentPointsLayerProps {
  attachmentPoints: EvaluationResult['outputs']['attachment_points']
}

export default function AttachmentPointsLayer({ attachmentPoints }: AttachmentPointsLayerProps) {
  const points = useMemo(() => Object.entries(attachmentPoints), [attachmentPoints])

  return (
    <group name="attachment-points-layer">
      {points.map(([id, data]) => {
        const [x, y, z] = data.location
        const [rx, ry, rz] = data.rotation

        return (
          <group key={id} position={[x, y, z]} rotation={[rx, ry, rz]}>
            {/* Bolletje precies op het attachment point. */}
            <mesh>
              <sphereGeometry args={[0.03, 12, 12]} />
              <meshStandardMaterial color="#10b981" emissive="#065f46" emissiveIntensity={0.2} />
            </mesh>

            {/* Klein pijltje zodat je ook de richting/rotatie ziet. */}
            <mesh position={[0, 0, 0.08]}>
              <coneGeometry args={[0.015, 0.06, 10]} />
              <meshStandardMaterial color="#0ea5e9" emissive="#082f49" emissiveIntensity={0.15} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
