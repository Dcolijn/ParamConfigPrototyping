import JSZip from 'jszip'
import { RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from 'three'

interface Ione3dIndex {
  diffuseFile?: string
  normalFile?: string
  roughnessFile?: string
  metalnessFile?: string
  aoFile?: string
  ormFile?: string
  envMapFile?: string
  repeat?: {
    repeatx?: number
    repeaty?: number
  }
  roughness?: number
  metalness?: number
  envMapIntensity?: number
  reflectivity?: number
}

export interface LoadedPbrPackage {
  textureSet: {
    diffuseMap: Texture | null
    normalMap: Texture | null
    ormMap: Texture | null
    envMap: Texture | null
    repeatX: number
    repeatY: number
    roughness: number
    metalness: number
    envMapIntensity: number
  }
  dispose: () => void
  sourceFileName: string
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const normalizePath = (value: string): string => value.replace(/^\.\//, '')

const collectPossibleFileNames = (value?: string): string[] => {
  if (!value || value.trim().length === 0) {
    return []
  }

  const trimmed = normalizePath(value.trim())

  // In gewone taal: sommige export-tools zetten per ongeluk dubbele extensies zoals "orm.jpg.jpg".
  // Daarom proberen we een paar veilige varianten zodat uploaden minder snel faalt.
  const options = new Set<string>([trimmed])

  if (trimmed.endsWith('.jpg.jpg')) {
    options.add(trimmed.replace(/\.jpg\.jpg$/, '.jpg'))
  }
  if (trimmed.endsWith('.png.png')) {
    options.add(trimmed.replace(/\.png\.png$/, '.png'))
  }

  return Array.from(options)
}

const findZipEntry = (zip: JSZip, fileNameCandidates: string[]) => {
  for (const fileName of fileNameCandidates) {
    const exactMatch = zip.file(fileName)
    if (exactMatch) {
      return exactMatch
    }

    const lowerCaseMatch = zip.file(new RegExp(`^${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'))[0]
    if (lowerCaseMatch) {
      return lowerCaseMatch
    }
  }

  return null
}

const loadTextureFromZip = async (
  zip: JSZip,
  loader: TextureLoader,
  fileName?: string,
  onObjectUrlCreated?: (objectUrl: string) => void,
): Promise<Texture | null> => {
  const candidates = collectPossibleFileNames(fileName)
  if (candidates.length === 0) {
    return null
  }

  const entry = findZipEntry(zip, candidates)
  if (!entry) {
    return null
  }

  const blob = await entry.async('blob')
  const objectUrl = URL.createObjectURL(blob)
  onObjectUrlCreated?.(objectUrl)

  return loader.loadAsync(objectUrl)
}

export const loadIone3dPackage = async (file: File): Promise<LoadedPbrPackage> => {
  const zip = await JSZip.loadAsync(file)
  const indexEntry = zip.file('index.json') ?? zip.file('INDEX.JSON')

  if (!indexEntry) {
    throw new Error('Het .ione3d bestand mist index.json.')
  }

  const indexContent = await indexEntry.async('text')
  const settings = JSON.parse(indexContent) as Ione3dIndex
  const loader = new TextureLoader()
  const objectUrls: string[] = []

  const [diffuseMap, normalMap, ormMap, envMap] = await Promise.all([
    loadTextureFromZip(zip, loader, settings.diffuseFile, (url) => objectUrls.push(url)),
    loadTextureFromZip(zip, loader, settings.normalFile, (url) => objectUrls.push(url)),
    loadTextureFromZip(zip, loader, settings.ormFile || settings.roughnessFile || settings.metalnessFile || settings.aoFile, (url) =>
      objectUrls.push(url),
    ),
    loadTextureFromZip(zip, loader, settings.envMapFile, (url) => objectUrls.push(url)),
  ])

  const repeatX = isFiniteNumber(settings.repeat?.repeatx) ? settings.repeat.repeatx : 1
  const repeatY = isFiniteNumber(settings.repeat?.repeaty) ? settings.repeat.repeaty : 1

  ;[diffuseMap, normalMap, ormMap, envMap].forEach((map) => {
    if (!map) {
      return
    }

    map.wrapS = RepeatWrapping
    map.wrapT = RepeatWrapping
    map.repeat.set(repeatX, repeatY)
  })

  if (diffuseMap) {
    diffuseMap.colorSpace = SRGBColorSpace
  }
  if (envMap) {
    envMap.colorSpace = SRGBColorSpace
  }

  const dispose = () => {
    // In gewone taal: we ruimen GPU-geheugen en tijdelijke URL's op zodra er een nieuwe set wordt geladen.
    ;[diffuseMap, normalMap, ormMap, envMap].forEach((map) => map?.dispose())
    objectUrls.forEach((url) => URL.revokeObjectURL(url))
  }

  return {
    sourceFileName: file.name,
    textureSet: {
      diffuseMap,
      normalMap,
      ormMap,
      envMap,
      repeatX,
      repeatY,
      roughness: clamp01(isFiniteNumber(settings.roughness) ? settings.roughness : 1),
      metalness: clamp01(isFiniteNumber(settings.metalness) ? settings.metalness : 0),
      envMapIntensity: clamp01(isFiniteNumber(settings.envMapIntensity) ? settings.envMapIntensity : 1),
    },
    dispose,
  }
}
