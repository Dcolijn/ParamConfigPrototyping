import type { Mesh } from 'three'
import type { EvaluatedValue } from '../engine/types'

type ShapekeyMap = Record<string, EvaluatedValue>

const toInfluence = (value: EvaluatedValue): number => {
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return 0
}

/**
 * Zet evaluator-output om naar morph-target invloeden op één mesh.
 * Returned een lijst met shapekey-ids waarvoor deze mesh géén morph target heeft.
 */
export const applyShapekeysToMesh = (mesh: Mesh, shapekeys: ShapekeyMap): string[] => {
  const dictionary = mesh.morphTargetDictionary
  const influences = mesh.morphTargetInfluences

  if (!dictionary || !influences) {
    return Object.keys(shapekeys)
  }

  const missing: string[] = []

  Object.entries(shapekeys).forEach(([outputId, rawValue]) => {
    const morphIndex = dictionary[outputId]

    if (typeof morphIndex !== 'number') {
      missing.push(outputId)
      return
    }

    // In gewone taal: evaluator rekent alles uit; hier zetten we dat direct op de morph-target invloed.
    influences[morphIndex] = toInfluence(rawValue)
  })

  return missing
}
