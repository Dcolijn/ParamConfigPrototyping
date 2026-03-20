import { useEffect, useRef, useState } from 'react'
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
  const [liveSliderValues, setLiveSliderValues] = useState<Record<string, number>>({})
  const flushTimersRef = useRef<Record<string, number>>({})

  useEffect(() => {
    return () => {
      // In gewone taal: als dit paneel verdwijnt, stoppen we alle nog lopende timers netjes.
      Object.values(flushTimersRef.current).forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [])

  useEffect(() => {
    // In gewone taal: bij een nieuwe set inputs (bijv. andere PME) beginnen de live-sliderwaarden weer schoon.
    setLiveSliderValues({})
  }, [inputs])

  const commitSliderValueSoon = (id: string, value: number) => {
    const existingTimer = flushTimersRef.current[id]
    if (existingTimer) {
      window.clearTimeout(existingTimer)
    }

    // In gewone taal: "debounce" betekent hier:
    // pas na een héél korte pauze sturen we de waarde door naar de globale app-state.
    // Daardoor blijft slepen soepel en rekenen we niet bij elke pixelbeweging opnieuw.
    flushTimersRef.current[id] = window.setTimeout(() => {
      onValueChange(id, value)
      delete flushTimersRef.current[id]
    }, 80)
  }

  const flushSliderImmediately = (id: string, value: number) => {
    const existingTimer = flushTimersRef.current[id]
    if (existingTimer) {
      window.clearTimeout(existingTimer)
      delete flushTimersRef.current[id]
    }
    // In gewone taal: bij loslaten van de slider sturen we meteen de laatste stand door.
    onValueChange(id, value)
  }

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
        const committedValue = clampNumber(Number(currentValue ?? input.default ?? min), input.min, input.max)
        const localValue = liveSliderValues[input.id]
        const liveValue = clampNumber(
          Number(typeof localValue === 'number' ? localValue : committedValue),
          input.min,
          input.max,
        )

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
                value={liveValue}
                onChange={(event) => {
                  const next = clampNumber(Number(event.target.value), input.min, input.max)
                  setLiveSliderValues((previous) => ({ ...previous, [input.id]: next }))
                  commitSliderValueSoon(input.id, next)
                }}
                onPointerUp={(event) => {
                  const next = clampNumber(Number((event.currentTarget as HTMLInputElement).value), input.min, input.max)
                  flushSliderImmediately(input.id, next)
                }}
              />
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={liveValue}
                onChange={(event) => {
                  const next = clampNumber(Number(event.target.value), input.min, input.max)
                  setLiveSliderValues((previous) => ({ ...previous, [input.id]: next }))
                  flushSliderImmediately(input.id, next)
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
