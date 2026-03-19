import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import './App.css'

function DemoScene() {
  return (
    // Deze mesh is een eenvoudige 3D-kubus zodat je direct ziet dat Three.js werkt.
    <mesh rotation={[0.4, 0.2, 0]}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      <meshStandardMaterial color="#5b8def" />
    </mesh>
  )
}

export default function App() {
  return (
    <main className="app-shell">
      <h1>Vite + React + Three.js</h1>
      <p>Dit is de nieuwe webapp met 3D libraries geïnstalleerd.</p>

      <div className="canvas-wrapper">
        {/* Canvas is het 3D-tekenvlak van @react-three/fiber. */}
        <Canvas camera={{ position: [2.5, 2.5, 2.5], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[3, 3, 3]} intensity={1} />
          <DemoScene />
          <OrbitControls enableDamping />
        </Canvas>
      </div>
    </main>
  )
}
