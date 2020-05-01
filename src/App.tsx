import React, { useRef, useState } from 'react';
import { Canvas, useFrame, ReactThreeFiber } from 'react-three-fiber';
import * as THREE from 'three';

const Box: React.FC<{ position: THREE.Vector3 }> = ({ position }) => {
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
      scale={active ? [1.5, 1.5, 1.5] : [1, 1, 1]}
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
    <Canvas>
      <ambientLight />
      <pointLight position={[10, 10, 10]} />
      <Box position={[-1.2, 0, 0]} />
      <Box position={[1.2, 0, 0]} />
    </Canvas>
  );
}

export default App;
