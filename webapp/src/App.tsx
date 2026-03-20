import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import ParametricInputsPanel from './components/ParametricInputsPanel'
import DebugPanel from './components/DebugPanel'
import PMESelector from './components/PMESelector'
import { loadConfigurationDataFromJson } from './engine/configurationData'
import { evaluateConfiguration } from './engine/evaluator'
import type { ConfigurationData } from './engine/types'
import ParametricScene from './scene/ParametricScene'
import { loadIone3dPackage, type LoadedPbrPackage } from './scene/pbrPackage'
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

  useEffect(() => {
    return () => {
      pbrPackage?.dispose()
    }
  }, [pbrPackage])

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
            partNames={partNames}
            modelUrlsByPart={modelUrlsByPart}
            shapekeys={evaluation?.outputs.shapekeys ?? {}}
            attachmentPoints={evaluation?.outputs.attachment_points ?? {}}
            onMorphTargetWarningsChange={setMorphWarnings}
            pbrPackage={pbrPackage}
            pbrRepeat={pbrRepeat}
          />
        </div>
      </section>

      {evaluation ? <DebugPanel inputValues={inputValues} evaluation={evaluation} morphWarnings={morphWarnings} /> : null}
    </main>
  )
}
