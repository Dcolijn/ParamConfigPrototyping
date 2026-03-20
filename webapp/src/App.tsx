import { useEffect, useMemo, useState } from 'react'
import ParametricInputsPanel from './components/ParametricInputsPanel'
import DebugPanel from './components/DebugPanel'
import PMESelector from './components/PMESelector'
import { loadConfigurationDataFromJson } from './engine/configurationData'
import { evaluateConfiguration } from './engine/evaluator'
import type { ConfigurationData } from './engine/types'
import ParametricScene from './scene/ParametricScene'
import './App.css'

type InputValue = number | boolean

const PME_OPTIONS = ['PME_counter-top_straight_sink.json', 'PME_counter-top_corner_sink.json']

// In gewone taal: maak van elke input in de JSON meteen een bruikbare beginwaarde voor het formulier.
const buildInitialInputs = (configuration: ConfigurationData): Record<string, InputValue> =>
  Object.fromEntries(
    configuration.input.map((input) => [
      input.id,
      input.type === 'boolean' ? Boolean(input.default) : typeof input.default === 'number' ? input.default : 0,
    ]),
  )

const buildModelUrlsByPart = (partNames: string[]): Record<string, string> =>
  Object.fromEntries(partNames.map((partName) => [partName, `/parts/${partName}.glb`]))

export default function App() {
  const [selectedPme, setSelectedPme] = useState(PME_OPTIONS[0])
  const [configuration, setConfiguration] = useState<ConfigurationData | null>(null)
  const [inputValues, setInputValues] = useState<Record<string, InputValue>>({})
  const [modelUrlsByPart, setModelUrlsByPart] = useState<Record<string, string>>({})
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [morphWarnings, setMorphWarnings] = useState<string[]>([])

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
        const parsedConfiguration = loadConfigurationDataFromJson(jsonText)

        if (!isCurrent) {
          return
        }

        // Bij wisselen van PME resetten we alles: inputs terug naar defaults + juiste part-bestanden koppelen.
        setConfiguration(parsedConfiguration)
        setInputValues(buildInitialInputs(parsedConfiguration))
        setModelUrlsByPart(buildModelUrlsByPart(parsedConfiguration.parts ?? []))
      } catch (error) {
        if (!isCurrent) {
          return
        }
        setConfiguration(null)
        setInputValues({})
        setModelUrlsByPart({})
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

  const evaluation = useMemo(() => {
    if (!configuration) {
      return null
    }
    // In gewone taal: elke wijziging in de schuifjes laat alle uitkomsten direct opnieuw berekenen.
    return evaluateConfiguration(configuration, inputValues)
  }, [configuration, inputValues])

  const partNames = configuration?.parts ?? []

  const handleInputChange = (id: string, value: InputValue) => {
    setInputValues((previous) => ({ ...previous, [id]: value }))
  }

  return (
    <main className="app-shell">
      <h1>Parametrische configuratie</h1>
      <p>Kies eerst een PME, pas daarna de waarden aan. Het 3D-model en de uitkomsten verversen automatisch.</p>

      <PMESelector options={PME_OPTIONS} selected={selectedPme} isLoading={isLoadingConfig} onSelect={setSelectedPme} />

      {loadError ? <p className="error-banner">{loadError}</p> : null}

      <section className="workspace-grid">
        <ParametricInputsPanel inputs={configuration?.input ?? []} values={inputValues} onValueChange={handleInputChange} />

        <div className="canvas-wrapper">
          <ParametricScene
            partNames={partNames}
            modelUrlsByPart={modelUrlsByPart}
            shapekeys={evaluation?.outputs.shapekeys ?? {}}
            attachmentPoints={evaluation?.outputs.attachment_points ?? {}}
            onMorphTargetWarningsChange={setMorphWarnings}
          />
        </div>
      </section>

      {evaluation ? <DebugPanel inputValues={inputValues} evaluation={evaluation} morphWarnings={morphWarnings} /> : null}
    </main>
  )
}
