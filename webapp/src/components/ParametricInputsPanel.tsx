import type { ConfigurationInput } from '../engine/types'

type ParametricInputValue = number | boolean

interface ParametricInputsPanelProps {
  inputs: ConfigurationInput[]
  values: Record<string, ParametricInputValue>
  onValueChange: (id: string, value: ParametricInputValue) => void
}

const getTitle = (input: ConfigurationInput): string => input.name?.trim() || input.id

const clampNumber = (value: number, min?: number, max?: number): number => {
  // In gewone taal: we zorgen dat een getal nooit buiten de grenzen uit de JSON valt.
  if (typeof min === 'number' && value < min) return min
  if (typeof max === 'number' && value > max) return max
  return value
}

export default function ParametricInputsPanel({ inputs, values, onValueChange }: ParametricInputsPanelProps) {
  const standardInputs = inputs.filter((input) => input.type !== 'variable')
  const variableInputs = inputs.filter((input) => input.type === 'variable')

  return (
    <aside className="inputs-panel" aria-label="Parametrische instellingen">
      <h2>Instellingen</h2>

      {standardInputs.map((input) => {
        const currentValue = values[input.id]

        if (input.type === 'boolean') {
          const checked = Boolean(currentValue)
          return (
            <label key={input.id} className="input-card input-card--checkbox">
              <span className="input-title">{getTitle(input)}</span>
              <span className="input-subtitle">{input.id}</span>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onValueChange(input.id, event.target.checked)}
              />
            </label>
          )
        }

        const min = typeof input.min === 'number' ? input.min : 0
        const max = typeof input.max === 'number' ? input.max : Math.max(min + 100, Number(currentValue ?? min) + 100)
        const step = Number.isInteger(min) && Number.isInteger(max) ? 1 : 0.1
        const numericValue = clampNumber(Number(currentValue ?? input.default ?? min), input.min, input.max)

        return (
          <div key={input.id} className="input-card">
            <label htmlFor={`range-${input.id}`} className="input-title">
              {getTitle(input)}
            </label>
            <span className="input-subtitle">{input.id}</span>

            <div className="number-controls">
              <input
                id={`range-${input.id}`}
                type="range"
                min={min}
                max={max}
                step={step}
                value={numericValue}
                onChange={(event) => onValueChange(input.id, Number(event.target.value))}
              />
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={numericValue}
                onChange={(event) => {
                  const next = clampNumber(Number(event.target.value), input.min, input.max)
                  onValueChange(input.id, next)
                }}
              />
            </div>
          </div>
        )
      })}

      {variableInputs.length > 0 && (
        <section className="advanced-block">
          <h3>Geavanceerde variabelen</h3>
          {variableInputs.map((input) => {
            const numericValue = Number(values[input.id] ?? input.default ?? 0)
            return (
              <div key={input.id} className="input-card">
                <label htmlFor={`variable-${input.id}`} className="input-title">
                  {getTitle(input)}
                </label>
                <span className="input-subtitle">{input.id}</span>
                <input
                  id={`variable-${input.id}`}
                  type="number"
                  value={numericValue}
                  onChange={(event) => onValueChange(input.id, Number(event.target.value))}
                />
              </div>
            )
          })}
        </section>
      )}
    </aside>
  )
}
