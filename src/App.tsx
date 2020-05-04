import React, { useRef, useState } from 'react';
import { Canvas, useFrame, ReactThreeFiber } from 'react-three-fiber';
import * as THREE from 'three';

function App() {
  return (
    <Canvas
      shadowMap
      camera={{ position: [-4, -4, 8], up: [0, 0, 1] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputEncoding = THREE.sRGBEncoding;
      }}
    >
      >
      <ambientLight intensity={0.1} />
      <pointLight position={[-30, 30, 30]} intensity={0.2} />
      <spotLight
        intensity={0.3}
        position={[30, 7, 40]}
        angle={0.1}
        penumbra={0.4}
        castShadow
      />
      <mesh receiveShadow position={[0, 0, -5]}>
        <planeBufferGeometry attach="geometry" args={[200, 200]} />
        <meshStandardMaterial attach="material" color="#171717" />
      </mesh>
      <mesh position={[0, 0, -2]} castShadow receiveShadow>
        <boxBufferGeometry attach="geometry" args={[5, 5, 2]} />
        <meshStandardMaterial attach="material" color="orange" />
      </mesh>
      <mesh position={[0, 0, 2]} castShadow receiveShadow>
        <boxBufferGeometry attach="geometry" args={[2, 2, 5]} />
        <meshStandardMaterial attach="material" color="hotpink" />
      </mesh>
    </Canvas>
  );
}

export default App;
