import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  Canvas,
  useUpdate,
  useResource,
  useFrame,
  ReactThreeFiber
} from 'react-three-fiber';
import * as THREE from 'three';

function Scene() {
  const testTexture = useMemo(() => {
    const width = 256;
    const height = 256;
    const size = width * height;
    const data = new Uint8Array(3 * size);

    for (let i = 0; i < size; i++) {
      const v = Math.floor((255 * i) / size);
      const stride = i * 3;

      data[stride] = v;
      data[stride + 1] = v;
      data[stride + 2] = v;
    }

    return new THREE.DataTexture(data, width, height, THREE.RGBFormat);
  }, []);

  const boxBufferRef = useUpdate<THREE.BoxBufferGeometry>((boxBuffer) => {
    const uvs = boxBuffer.attributes.uv.array;
    boxBuffer.setAttribute('uv2', new THREE.BufferAttribute(uvs, 2));
  }, []);

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[-30, 30, 30]} intensity={0.1} />
      <mesh position={[0, 0, -5]}>
        <planeBufferGeometry attach="geometry" args={[200, 200]} />
        <meshStandardMaterial attach="material" color="#171717" />
      </mesh>
      <mesh position={[0, 0, -2]}>
        <boxBufferGeometry
          attach="geometry"
          args={[5, 5, 2]}
          ref={boxBufferRef}
        />
        <meshStandardMaterial
          attach="material"
          color="orange"
          aoMap={testTexture}
          aoMapIntensity={1}
        />
      </mesh>
      <mesh position={[0, 0, 2]}>
        <boxBufferGeometry attach="geometry" args={[2, 2, 5]} />
        <meshStandardMaterial attach="material" color="hotpink" />
      </mesh>
    </>
  );
}

function App() {
  return (
    <Canvas
      camera={{ position: [-4, -4, 8], up: [0, 0, 1] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputEncoding = THREE.sRGBEncoding;
      }}
    >
      <Scene />
    </Canvas>
  );
}

export default App;
