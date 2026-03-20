interface PMESelectorProps {
  options: string[]
  selected: string
  isLoading: boolean
  onSelect: (nextValue: string) => void
}

export default function PMESelector({ options, selected, isLoading, onSelect }: PMESelectorProps) {
  return (
    <section className="pme-selector">
      <label htmlFor="pme-selector" className="pme-selector__label">
        Kies een PME-configuratie
      </label>
      <select
        id="pme-selector"
        value={selected}
        disabled={isLoading}
        onChange={(event) => onSelect(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <p className="pme-selector__hint">
        We laden de JSON van deze keuze, zetten de standaardwaarden terug en koppelen automatisch de juiste parts.
      </p>
    </section>
  )
}
