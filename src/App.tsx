import React, { useRef, useState } from 'react';
import { Canvas, useFrame, ReactThreeFiber } from 'react-three-fiber';
import * as THREE from 'three';

const Box: React.FC<{ position: [number, number, number] }> = ({
  position
}) => {
  // This reference will give us direct access to the mesh
  const meshRef = useRef<ReactThreeFiber.Object3DNode<THREE.Geometry, []>>();

  // Set up state for the hovered and active state
  const [hovered, setHover] = useState(false);
  const [active, setActive] = useState(false);

  // Rotate mesh every frame, this is outside of React without overhead
  useFrame(() => {
    if (!meshRef.current) {
      return;
    }

    const meshRotation = meshRef.current.rotation;
    if (!meshRotation) {
      return;
    }

    meshRotation.x = meshRotation.y += 0.01;
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      scale={active ? [2.5, 2.5, 2.5] : [1, 1, 1]}
      castShadow
      receiveShadow
      onClick={(e) => setActive(!active)}
      onPointerOver={(e) => setHover(true)}
      onPointerOut={(e) => setHover(false)}
    >
      <boxBufferGeometry attach="geometry" args={[1, 1, 1]} />
      <meshStandardMaterial
        attach="material"
        color={hovered ? 'hotpink' : 'orange'}
      />
    </mesh>
  );
};

function App() {
  return (
    <Canvas
      shadowMap
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputEncoding = THREE.sRGBEncoding;
      }}
    >
      >
      <ambientLight intensity={0.2} />
      <pointLight position={[30, 30, 30]} intensity={0.4} />
      <spotLight
        intensity={0.3}
        position={[30, 7, 40]}
        angle={0.1}
        penumbra={0.4}
        castShadow
      />
      <mesh receiveShadow position={[0, 0, -2]}>
        <planeBufferGeometry attach="geometry" args={[100, 100]} />
        <meshStandardMaterial attach="material" color="#171717" />
      </mesh>
      <Box position={[-1.2, 0, 0]} />
      <Box position={[1.2, 0, 0]} />
    </Canvas>
  );
}

export default App;
