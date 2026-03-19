import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import ParametricInputsPanel from './components/ParametricInputsPanel'
import { evaluateConfiguration } from './engine/evaluator'
import { loadConfigurationDataFromJson } from './engine/configurationData'
import type { EvaluationResult } from './engine/types'
import pmeStraightSinkJson from './data/PME_counter-top_straight_sink.json?raw'
import './App.css'

type InputValue = number | boolean

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

function DemoScene({ evaluation }: { evaluation: EvaluationResult }) {
  const widthFactor = Number(evaluation.outputs.shapekeys['$shape-width'] ?? 0)
  const depthFactor = Number(evaluation.outputs.shapekeys['$shape-depth'] ?? 0)
  const heightFactor = Number(evaluation.outputs.shapekeys['$shape-height'] ?? 0)

  const sinkLocation = Number(evaluation.outputs.shapekeys['$shape-sink-location'] ?? 0)
  const sinkWidth = Number(evaluation.outputs.shapekeys['$shape-sink-width'] ?? 0)

  // Deze vertaling maakt de 3D kubus "meebewegen" met outputdata, als simpele live feedback.
  const scale: [number, number, number] = [1 + widthFactor, 1 + heightFactor * 0.4, 1 + depthFactor]

  return (
    <group>
      <mesh scale={scale} rotation={[0.4, 0.2, 0]}>
        <boxGeometry args={[1.5, 1.5, 1.5]} />
        <meshStandardMaterial color="#5b8def" />
      </mesh>

      <mesh position={[sinkLocation * 1.6, 0.95, 0]}>
        <sphereGeometry args={[0.12 + sinkWidth * 0.08, 24, 24]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
    </group>
  )
}

export default function App() {
  const [inputValues, setInputValues] = useState<Record<string, InputValue>>(() => buildInitialInputs())

  const evaluation = useMemo(() => {
    // Elke input-wijziging triggert direct opnieuw evalueren.
    return evaluateConfiguration(configuration, inputValues)
  }, [inputValues])

  const handleInputChange = (id: string, value: InputValue) => {
    setInputValues((previous) => ({ ...previous, [id]: value }))
  }

  return (
    <main className="app-shell">
      <h1>Parametrische configuratie</h1>
      <p>Pas hieronder de waarden aan. Het 3D-model en de berekeningen verversen automatisch.</p>

      <section className="workspace-grid">
        <ParametricInputsPanel inputs={configuration.input} values={inputValues} onValueChange={handleInputChange} />

        <div className="canvas-wrapper">
          <Canvas camera={{ position: [2.8, 2.2, 2.8], fov: 50 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[3, 3, 3]} intensity={1} />
            <DemoScene evaluation={evaluation} />
            <OrbitControls enableDamping />
          </Canvas>
        </div>
      </section>
    </main>
  )
}
