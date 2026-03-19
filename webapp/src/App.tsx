import { useEffect, useMemo, useRef, useState } from 'react'
import ParametricInputsPanel from './components/ParametricInputsPanel'
import { evaluateConfiguration } from './engine/evaluator'
import { loadConfigurationDataFromJson } from './engine/configurationData'
import type { EvaluationResult } from './engine/types'
import ParametricScene from './scene/ParametricScene'
import pmeStraightSinkJson from './data/PME_counter-top_straight_sink.json?raw'
import './App.css'

type InputValue = number | boolean

type ModelUrlMap = Record<string, string>

const configuration = loadConfigurationDataFromJson(pmeStraightSinkJson)

const buildInitialInputs = (): Record<string, InputValue> => {
  // In gewone taal: we vullen het formulier meteen met de standaardwaardes uit de JSON.
  return Object.fromEntries(
    configuration.input.map((input) => {
      if (input.type === 'boolean') {
        return [input.id, Boolean(input.default)]
      }
      return [input.id, typeof input.default === 'number' ? input.default : 0]
    }),
  )
}

// In gewone taal: haal de bestandsnaam zonder extensie op, bv. "counter-top_main.glb" -> "counter-top_main".
const getPartNameFromFile = (fileName: string): string => fileName.replace(/\.glb$/i, '')

const mergeModelFiles = (files: FileList | File[], previousMap: ModelUrlMap): ModelUrlMap => {
  const nextMap = { ...previousMap }

  Array.from(files).forEach((file) => {
    if (!file.name.toLowerCase().endsWith('.glb')) {
      return
    }

    const partName = getPartNameFromFile(file.name)

    // Als dit part al bestond, ruimen we de oude tijdelijke URL op om geheugen netjes te houden.
    const existingUrl = nextMap[partName]
    if (existingUrl) {
      URL.revokeObjectURL(existingUrl)
    }

    nextMap[partName] = URL.createObjectURL(file)
  })

  return nextMap
}

function ConfigurationDebugSummary({ evaluation }: { evaluation: EvaluationResult }) {
  const shapeCount = Object.keys(evaluation.outputs.shapekeys).length
  const attachmentCount = Object.keys(evaluation.outputs.attachment_points).length
  return (
    <p>
      Actieve evaluatie: {shapeCount} shapekeys en {attachmentCount} attachment points berekend.
    </p>
  )
}

interface ModelUploadModalProps {
  isOpen: boolean
  expectedPartNames: string[]
  loadedPartNames: string[]
  onClose: () => void
  onFilesAdded: (files: FileList | File[]) => void
}

function ModelUploadModal({
  isOpen,
  expectedPartNames,
  loadedPartNames,
  onClose,
  onFilesAdded,
}: ModelUploadModalProps) {
  const [isDragging, setIsDragging] = useState(false)

  if (!isOpen) {
    return null
  }
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <h2>GLB modellen inladen</h2>
        <p>
          Sleep hier je <code>.glb</code>-bestanden naartoe, of klik op <strong>Bladeren</strong>.
          Bestandsnaam moet gelijk zijn aan de partnaam uit de JSON.
        </p>

        <div
          className={`dropzone ${isDragging ? 'dropzone--active' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragging(false)
            onFilesAdded(event.dataTransfer.files)
          }}
        >
          Sleep & drop GLB files hier
        </div>

        <label className="browse-button">
          Bladeren
          <input
            type="file"
            accept=".glb"
            multiple
            onChange={(event) => {
              if (event.target.files) {
                onFilesAdded(event.target.files)
              }
              event.currentTarget.value = ''
            }}
          />
        </label>

        <div className="model-status-grid">
          <div>
            <h3>Verwachte parts</h3>
            <ul>
              {expectedPartNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Al ingeladen</h3>
            <ul>
              {loadedPartNames.length > 0 ? loadedPartNames.map((name) => <li key={name}>{name}</li>) : <li>Nog leeg</li>}
            </ul>
          </div>
        </div>

        <button type="button" className="close-button" onClick={onClose}>
          Sluiten
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [inputValues, setInputValues] = useState<Record<string, InputValue>>(() => buildInitialInputs())
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [modelUrlsByPart, setModelUrlsByPart] = useState<ModelUrlMap>({})
  const modelUrlsRef = useRef<ModelUrlMap>({})

  useEffect(() => {
    modelUrlsRef.current = modelUrlsByPart
  }, [modelUrlsByPart])

  useEffect(() => {
    return () => {
      Object.values(modelUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const evaluation = useMemo(() => {
    // Elke input-wijziging triggert direct opnieuw evalueren.
    return evaluateConfiguration(configuration, inputValues)
  }, [inputValues])

  const partNames = useMemo(() => configuration.parts ?? [], [])

  const handleInputChange = (id: string, value: InputValue) => {
    setInputValues((previous) => ({ ...previous, [id]: value }))
  }

  const handleFilesAdded = (files: FileList | File[]) => {
    setModelUrlsByPart((previous) => mergeModelFiles(files, previous))
  }

  const loadedPartNames = Object.keys(modelUrlsByPart).sort((a, b) => a.localeCompare(b))

  return (
    <main className="app-shell">
      <h1>Parametrische configuratie</h1>
      <p>Pas hieronder de waarden aan. Het 3D-model en de berekeningen verversen automatisch.</p>

      <div className="model-upload-toolbar">
        <button type="button" onClick={() => setIsUploadModalOpen(true)}>
          Modellen laden
        </button>
        <span>{loadedPartNames.length} model(len) ingeladen</span>
      </div>

      <section className="workspace-grid">
        <ParametricInputsPanel inputs={configuration.input} values={inputValues} onValueChange={handleInputChange} />

        <div className="canvas-wrapper">
          <ParametricScene partNames={partNames} modelUrlsByPart={modelUrlsByPart} />
        </div>
      </section>

      <ConfigurationDebugSummary evaluation={evaluation} />

      <ModelUploadModal
        isOpen={isUploadModalOpen}
        expectedPartNames={partNames}
        loadedPartNames={loadedPartNames}
        onClose={() => setIsUploadModalOpen(false)}
        onFilesAdded={handleFilesAdded}
      />
    </main>
  )
}
