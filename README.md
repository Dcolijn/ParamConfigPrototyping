# ParamConfigPrototyping
Parametric Configuration Prototyping tool.

## Ultra-simpele handleiding (Stap 1-2-3)

Deze uitleg is gemaakt voor **niet-coders**.

### Stap 1 — Eenmalig voorbereiden
1. Dubbelklik op `setup-webapp.bat`.
2. Wacht tot je `[KLAAR] Setup voltooid` ziet.
3. Druk op een toets om het venster te sluiten.

![Screenshot Stap 1 - setup (nog toe te voegen)](docs/screenshots/stap-1-setup.png)

### Stap 2 — Webapp starten
1. Dubbelklik op `start-webapp.bat`.
2. Wacht tot de server draait.
3. Open de link in het venster (meestal `http://localhost:5173`).

![Screenshot Stap 2 - starten (nog toe te voegen)](docs/screenshots/stap-2-start.png)

### Stap 3 — Model kiezen en sliders aanpassen
1. Kies in de webapp het model dat je wilt bekijken.
2. Schuif aan de sliders om afmetingen/instellingen te veranderen.
3. Kijk direct naar het resultaat in het 3D-voorbeeld.

![Screenshot Stap 3 - model + sliders (nog toe te voegen)](docs/screenshots/stap-3-model-sliders.png)

### Handige extra bestanden
- `build-webapp.bat` (optioneel): maakt een productie-build met `npm run build`.
- Als je een foutmelding krijgt over Node.js: installeer eerst Node.js LTS via https://nodejs.org/.

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
