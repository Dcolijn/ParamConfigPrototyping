import { useMemo, useState } from 'react'
import type { EvaluationResult } from '../engine/types'

type InputValue = number | boolean

interface DebugPanelProps {
  inputValues: Record<string, InputValue>
  evaluation: EvaluationResult
  morphWarnings: string[]
}

export default function DebugPanel({ inputValues, evaluation, morphWarnings }: DebugPanelProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // In gewone taal: dit is precies de debug-structuur die we willen vergelijken met Blender-debug-output.
  const debugPayload = useMemo(
    () => ({
      input_values: inputValues,
      expressions: evaluation.expressions,
      output: {
        shapekeys: evaluation.outputs.shapekeys,
        attachment_points: evaluation.outputs.attachment_points,
        values: evaluation.outputs.values,
      },
    }),
    [evaluation, inputValues],
  )

  const debugJson = useMemo(() => JSON.stringify(debugPayload, null, 2), [debugPayload])

  const handleCopyDebugJson = async () => {
    try {
      await navigator.clipboard.writeText(debugJson)
      setCopyStatus('success')
    } catch {
      setCopyStatus('error')
    }
  }

  return (
    <section className="debug-panel" aria-label="Debuggegevens">
      <div className="debug-panel__header">
        <div>
          <h2>Debugpaneel (live)</h2>
          <p>
            Deze JSON kun je 1-op-1 vergelijken met het gedrag van <code>PARAMETRIC_OT_debug_evaluation</code>.
          </p>
        </div>

        <button type="button" className="debug-panel__copy-button" onClick={handleCopyDebugJson}>
          Kopieer debug JSON
        </button>
      </div>

      {copyStatus === 'success' ? <p className="debug-panel__copy-feedback">Gekopieerd naar klembord.</p> : null}
      {copyStatus === 'error' ? (
        <p className="debug-panel__copy-feedback debug-panel__copy-feedback--error">
          Kopiëren mislukte. Je browser blokkeert mogelijk clipboard-toegang.
        </p>
      ) : null}

      {morphWarnings.length > 0 && (
        <div className="debug-panel__warnings">
          <h3>Waarschuwingen uit 3D-model</h3>
          <ul>
            {morphWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="debug-panel__grid">
        <article>
          <h3>Huidige input values</h3>
          <pre>{JSON.stringify(inputValues, null, 2)}</pre>
        </article>

        <article>
          <h3>Expression resultaten</h3>
          <pre>{JSON.stringify(evaluation.expressions, null, 2)}</pre>
        </article>

        <article>
          <h3>Output object</h3>
          <pre>{JSON.stringify(debugPayload.output, null, 2)}</pre>
        </article>
      </div>
    </section>
  )
}
