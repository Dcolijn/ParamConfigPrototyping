import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import ParametricInputsPanel from './components/ParametricInputsPanel'
import DebugPanel from './components/DebugPanel'
import PMESelector from './components/PMESelector'
import { loadConfigurationDataFromJson } from './engine/configurationData'
import { prepareEvaluator, runEvaluator } from './engine/evaluator'
import type { ConfigurationData, EvaluationResult, Vec3 } from './engine/types'
import ParametricScene from './scene/ParametricScene'
import { loadIone3dPackage, type LoadedPbrPackage } from './scene/pbrPackage'
import './App.css'

type InputValue = number | boolean
type RawJson = Record<string, unknown>

interface RuntimePmeNode {
  instanceId: string
  elementId: string
  config: ConfigurationData
  parentInstanceId: string | null
  sourceAttachmentId: string | null
  targetAttachmentId: string | null
  linkedInputMapping: Record<string, string>
}

const PME_OPTIONS = ['PME_counter-top_straight_sink.json', 'PME_counter-top_corner_sink.json']

// In gewone taal: maak van elke input in de JSON meteen een bruikbare beginwaarde voor het formulier.
const buildInitialInputs = (configuration: ConfigurationData): Record<string, InputValue> =>
  Object.fromEntries(
    configuration.input.map((input) => [
      input.id,
      input.type === 'boolean' ? Boolean(input.default) : typeof input.default === 'number' ? input.default : 0,
    ]),
  )

const normalizeMappedInputId = (value: string): string => (value.startsWith('$') ? value : `$${value}`)

const composeMatrixFromAttachment = (attachment?: { location: Vec3; rotation: Vec3 }): Matrix4 =>
  attachment
    ? new Matrix4().makeRotationFromEuler(
        new Euler((attachment.rotation[0] * Math.PI) / 180, (attachment.rotation[1] * Math.PI) / 180, (attachment.rotation[2] * Math.PI) / 180, 'XYZ'),
      ).setPosition(new Vector3(attachment.location[0], attachment.location[1], attachment.location[2]))
    : new Matrix4().identity()

export default function App() {
  const [selectedPme, setSelectedPme] = useState(PME_OPTIONS[0])
  const [configuration, setConfiguration] = useState<ConfigurationData | null>(null)
  const [runtimeNodes, setRuntimeNodes] = useState<RuntimePmeNode[]>([])
  const [inputValues, setInputValues] = useState<Record<string, InputValue>>({})
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [morphWarnings, setMorphWarnings] = useState<string[]>([])
  const [pbrPackage, setPbrPackage] = useState<LoadedPbrPackage | null>(null)
  const [pbrStatus, setPbrStatus] = useState<string>('Nog geen .ione3d bestand geladen.')
  const [pbrRepeat, setPbrRepeat] = useState<number>(1)

  useEffect(() => {
    let isCurrent = true

    const loadSelectedConfiguration = async () => {
      setIsLoadingConfig(true)
      setLoadError(null)

      try {
        // In gewone taal: haal de gekozen JSON op uit public/configs en controleer hem streng.
        const response = await fetch(`/configs/${selectedPme}`)
        if (!response.ok) {
          throw new Error(`Kon ${selectedPme} niet laden (HTTP ${response.status}).`)
        }

        const jsonText = await response.text()
        const rootRaw = JSON.parse(jsonText) as RawJson
        const rootElementId = selectedPme.replace(/\.json$/i, '')
        const nodes: RuntimePmeNode[] = []
        const visit = async (
          elementId: string,
          raw: RawJson,
          parentInstanceId: string | null,
          sourceAttachmentId: string | null,
          targetAttachmentId: string | null,
          linkedInputMapping: Record<string, string>,
          depth = 0,
          ancestry: string[] = [],
        ) => {
          if (depth > 10 || ancestry.includes(elementId)) return
          const config = loadConfigurationDataFromJson(JSON.stringify(raw))
          const instanceId = `${elementId}__${nodes.length}`
          nodes.push({ instanceId, elementId, config, parentInstanceId, sourceAttachmentId, targetAttachmentId, linkedInputMapping })

          const rootAttachmentPoints = (Array.isArray(raw.attachmentPoints)
            ? raw.attachmentPoints
            : (raw.output as RawJson | undefined)?.attachmentPoints ?? (raw.output as RawJson | undefined)?.attachmentpoints) as unknown[]

          for (const apRaw of Array.isArray(rootAttachmentPoints) ? rootAttachmentPoints : []) {
            if (!apRaw || typeof apRaw !== 'object') continue
            const ap = apRaw as RawJson
            const childRaw = ap.child as RawJson | undefined
            if (!childRaw || typeof childRaw !== 'object') continue
            const childElementId = typeof childRaw.elementId === 'string' ? childRaw.elementId.trim() : ''
            if (!childElementId) continue
            const childResponse = await fetch(`/configs/${childElementId}.json`)
            if (!childResponse.ok) continue
            const childText = await childResponse.text()
            const childJson = JSON.parse(childText) as RawJson
            const mappingRaw = (childRaw.outputValueMapping ?? {}) as Record<string, unknown>
            const mapping: Record<string, string> = {}
            Object.entries(mappingRaw).forEach(([key, value]) => {
              if (typeof value === 'string') mapping[normalizeMappedInputId(key)] = value
            })
            await visit(
              childElementId,
              childJson,
              instanceId,
              typeof ap.id === 'string' ? ap.id : null,
              typeof childRaw.targetId === 'string' ? childRaw.targetId : null,
              mapping,
              depth + 1,
              [...ancestry, elementId],
            )
          }
        }

        await visit(rootElementId, rootRaw, null, null, null, {})
        const parsedConfiguration = nodes[0]?.config ?? loadConfigurationDataFromJson(jsonText)

        if (!isCurrent) {
          return
        }

        // Bij wisselen van PME resetten we alles: inputs terug naar defaults + juiste part-bestanden koppelen.
        setRuntimeNodes(nodes)
        const mergedInputs: ConfigurationData['input'] = []
        const seen = new Set<string>()
        for (const node of nodes) {
          const linkedKeys = new Set(Object.keys(node.linkedInputMapping))
          for (const input of node.config.input) {
            if (linkedKeys.has(input.id) || seen.has(input.id)) continue
            seen.add(input.id)
            mergedInputs.push(input)
          }
        }
        const syntheticRootConfig: ConfigurationData = { ...parsedConfiguration, input: mergedInputs }
        setConfiguration(syntheticRootConfig)
        setInputValues(buildInitialInputs(syntheticRootConfig))
      } catch (error) {
        if (!isCurrent) {
          return
        }
        setConfiguration(null)
        setRuntimeNodes([])
        setInputValues({})
        setLoadError(error instanceof Error ? error.message : 'Onbekende fout tijdens laden van JSON.')
      } finally {
        if (isCurrent) {
          setIsLoadingConfig(false)
        }
      }
    }

    void loadSelectedConfiguration()

    return () => {
      isCurrent = false
    }
  }, [selectedPme])

  useEffect(() => {
    return () => {
      pbrPackage?.dispose()
    }
  }, [pbrPackage])

  const preparedEvaluator = useMemo(() => {
    if (!runtimeNodes.length) {
      return null
    }
    return runtimeNodes.map((node) => ({ node, prepared: prepareEvaluator(node.config) }))
  }, [runtimeNodes])

  const evaluation = useMemo<{
    root: EvaluationResult | null
    partInstances: Array<{ key: string; partName: string; url: string; shapekeys: EvaluationResult['outputs']['shapekeys']; position: Vec3; rotation: Vec3 }>
    worldAttachmentPoints: EvaluationResult['outputs']['attachment_points']
  }>(() => {
    if (!preparedEvaluator) {
      return { root: null, partInstances: [], worldAttachmentPoints: {} }
    }
    const evalById: Record<string, EvaluationResult> = {}
    const worldMatrixById: Record<string, Matrix4> = {}
    const worldAttachmentPoints: EvaluationResult['outputs']['attachment_points'] = {}

    const depthFor = (instanceId: string): number => {
      let depth = 0
      const seen = new Set<string>()
      let current = preparedEvaluator.find((entry) => entry.node.instanceId === instanceId)?.node
      while (current?.parentInstanceId && !seen.has(current.parentInstanceId)) {
        seen.add(current.parentInstanceId)
        depth += 1
        current = preparedEvaluator.find((entry) => entry.node.instanceId === current?.parentInstanceId)?.node
      }
      return depth
    }
    const depthSorted = [...preparedEvaluator].sort((a, b) => depthFor(a.node.instanceId) - depthFor(b.node.instanceId))

    for (const entry of depthSorted) {
      const { node, prepared } = entry
      const effectiveInputs: Record<string, unknown> = { ...inputValues }
      if (node.parentInstanceId) {
        const parentEval = evalById[node.parentInstanceId]
        if (parentEval) {
          Object.entries(node.linkedInputMapping).forEach(([childInputId, parentRefId]) => {
            const v =
              parentEval.expressions[parentRefId] ??
              parentEval.outputs.values[parentRefId] ??
              (inputValues as Record<string, unknown>)[parentRefId]
            if (typeof v === 'number' || typeof v === 'boolean') effectiveInputs[childInputId] = v
          })
        }
      }
      const evaluated = runEvaluator(prepared, effectiveInputs)
      evalById[node.instanceId] = evaluated

      let worldMatrix = new Matrix4().identity()
      if (node.parentInstanceId) {
        const parentMatrix = worldMatrixById[node.parentInstanceId] ?? new Matrix4().identity()
        const parentEval = evalById[node.parentInstanceId]
        const sourceAp = node.sourceAttachmentId ? parentEval?.outputs.attachment_points[node.sourceAttachmentId] : undefined
        const targetAp = node.targetAttachmentId ? evaluated.outputs.attachment_points[node.targetAttachmentId] : undefined
        const sourceMatrix = composeMatrixFromAttachment(sourceAp)
        const targetMatrix = composeMatrixFromAttachment(targetAp)
        const targetInverse = new Matrix4().copy(targetMatrix).invert()
        worldMatrix = new Matrix4().multiplyMatrices(parentMatrix, new Matrix4().multiplyMatrices(sourceMatrix, targetInverse))
      }
      worldMatrixById[node.instanceId] = worldMatrix

      Object.entries(evaluated.outputs.attachment_points).forEach(([id, ap]) => {
        const local = composeMatrixFromAttachment(ap)
        const world = new Matrix4().multiplyMatrices(worldMatrix, local)
        const pos = new Vector3()
        const quat = new Quaternion()
        const scale = new Vector3()
        world.decompose(pos, quat, scale)
        const rot = new Euler().setFromQuaternion(quat, 'XYZ')
        worldAttachmentPoints[`${node.instanceId}:${id}`] = {
          location: [pos.x, pos.y, pos.z],
          rotation: [(rot.x * 180) / Math.PI, (rot.y * 180) / Math.PI, (rot.z * 180) / Math.PI],
        }
      })
    }

    const partInstances = preparedEvaluator.flatMap(({ node }) => {
      const evalResult = evalById[node.instanceId]
      const matrix = worldMatrixById[node.instanceId] ?? new Matrix4().identity()
      const pos = new Vector3()
      const quat = new Quaternion()
      const scale = new Vector3()
      matrix.decompose(pos, quat, scale)
      const rot = new Euler().setFromQuaternion(quat, 'XYZ')
      return (node.config.parts ?? []).map((partName) => ({
        key: `${node.instanceId}:${partName}`,
        partName,
        url: `/parts/${partName}.glb`,
        shapekeys: evalResult?.outputs.shapekeys ?? {},
        position: [pos.x, pos.y, pos.z] as Vec3,
        rotation: [rot.x, rot.y, rot.z] as Vec3,
      }))
    })

    return { root: evalById[preparedEvaluator[0].node.instanceId] ?? null, partInstances, worldAttachmentPoints }
  }, [preparedEvaluator, inputValues])

  const handleInputChange = (id: string, value: InputValue) => {
    setInputValues((previous) => ({ ...previous, [id]: value }))
  }

  const handlePbrUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]

    if (!selectedFile) {
      return
    }

    if (!selectedFile.name.toLowerCase().endsWith('.ione3d')) {
      setPbrStatus('Upload mislukt: kies een bestand met de extensie .ione3d.')
      return
    }

    setPbrStatus(`Bezig met laden van ${selectedFile.name}...`)

    try {
      const loadedPackage = await loadIone3dPackage(selectedFile)

      // In gewone taal: oude textures opruimen, daarna de nieuwe set overal gebruiken.
      setPbrPackage((previous) => {
        previous?.dispose()
        return loadedPackage
      })

      setPbrStatus(`Geladen: ${loadedPackage.sourceFileName}. De PBR maps zijn nu globaal toegepast op alle 3D parts.`)
    } catch (error) {
      setPbrStatus(error instanceof Error ? `Upload mislukt: ${error.message}` : 'Upload mislukt door een onbekende fout.')
    } finally {
      // In gewone taal: input resetten zodat hetzelfde bestand opnieuw gekozen kan worden.
      event.target.value = ''
    }
  }

  const handlePbrRepeatChange = (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(event.target.value)

    // In gewone taal: alleen geldige positieve waarden accepteren, anders terugvallen op 1.
    setPbrRepeat(Number.isFinite(parsed) && parsed > 0 ? parsed : 1)
  }

  return (
    <main className="app-shell">
      <h1>Parametrische configuratie</h1>
      <p>Kies eerst een PME, pas daarna de waarden aan. Het 3D-model en de uitkomsten verversen automatisch.</p>

      <PMESelector options={PME_OPTIONS} selected={selectedPme} isLoading={isLoadingConfig} onSelect={setSelectedPme} />

      <section className="model-upload-toolbar">
        <label className="browse-button" htmlFor="pbr-upload-input">
          Upload .ione3d PBR set
          <input id="pbr-upload-input" type="file" accept=".ione3d" onChange={handlePbrUpload} />
        </label>
        <span>{pbrStatus}</span>
        <label className="inline-input">
          Repeat
          <input type="number" min="0.1" step="0.1" value={pbrRepeat} onChange={handlePbrRepeatChange} />
        </label>
      </section>

      {loadError ? <p className="error-banner">{loadError}</p> : null}

      <section className="workspace-grid">
        <ParametricInputsPanel inputs={configuration?.input ?? []} values={inputValues} onValueChange={handleInputChange} />

        <div className="canvas-wrapper">
          <ParametricScene
            partInstances={evaluation.partInstances}
            attachmentPoints={evaluation.worldAttachmentPoints}
            onMorphTargetWarningsChange={setMorphWarnings}
            pbrPackage={pbrPackage}
            pbrRepeat={pbrRepeat}
          />
        </div>
      </section>

      {evaluation.root ? <DebugPanel inputValues={inputValues} evaluation={evaluation.root} morphWarnings={morphWarnings} /> : null}
    </main>
  )
}
