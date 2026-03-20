# ParamConfigPrototyping
Parametric Configuration Prototyping tool.

## Webapp starten (zonder code-kennis)
1. Dubbelklik op `start-webapp.bat` in de root van deze repository.
2. Wacht tot de server gestart is.
3. Open de URL die Vite in de terminal toont (meestal `http://localhost:5173`).

Dat is alles: de webapp draait dan lokaal op je computer.

## Morph targets (shapekeys) per GLB
Onderzoek van de aanwezige `.glb`-bestanden in de repo laat zien dat alle modellen morph targets bevatten:

- `counter-top_main.glb`: 7 morph targets (`$shape-width`, `$shape-depth`, `$shape-height`, `$shape-sink-depth`, `$shape-sink-location`, `$shape-faucet-size`, `$shape-sink-width`)
- `counter-top_edge_straight.glb`: 4 morph targets (`$shape-overhang`, `$shape-height`, `$shape-width`, `$shape-depth`)
- `counter-top_edge_overflow.glb`: 2 morph targets (`$shape-width`, `$shape-depth`)
- `counter-top_corner_main.glb`: 3 morph targets (`$shape-height`, `$shape-width`, `$shape-depth`)
- `counter-top_corner_edge_straight.glb`: 4 morph targets (`$shape-height`, `$shape-width`, `$shape-depth`, `$shape-overhang`)
- `counter-top_corner_edge_overflow.glb`: 2 morph targets (`$shape-width`, `$shape-depth`)

## Naamconventie: JSON-output-id ↔ GLB morph naam
- De evaluator levert shapekey-waarden op met IDs zoals `$shape-width`.
- In de GLB moet een morph target exact dezelfde naam hebben (inclusief `$` en `-`).
- Voorbeeld: JSON-output-id `$shape-width` stuurt direct de GLB morph `$shape-width` aan.

### Waardebereik
- In de evaluator worden waarden eerst berekend via de `conversion`-formule uit JSON.
- Daarna zet de scene deze waarde om naar invloed `0..1` (clamp), zodat de morph target veilig aanstuurbaar blijft.
- Booleans worden omgezet naar `0` (uit) of `1` (aan).

### Als een morph target ontbreekt
- De app crasht niet.
- Er komt een waarschuwing in het debug-paneel met partnaam en ontbrekende morph target-naam.
