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
  const controlTexture = useMemo(() => {
    const width = 256;
    const height = 256;
    const size = width * height;
    const data = new Uint8Array(3 * size);

    for (let i = 0; i < size; i++) {
      const x = i % width;
      const y = Math.floor(i / width);

      const stride = i * 3;

      const v = x % 8 === 0 || y % 8 === 0 ? 0 : 255;
      data[stride] = v;
      data[stride + 1] = v;
      data[stride + 2] = v;
    }

    return new THREE.DataTexture(data, width, height, THREE.RGBFormat);
  }, []);

  const testTexture = useMemo(() => {
    const width = 256;
    const height = 256;
    const size = width * height;
    const data = new Uint8Array(3 * size);

    for (let i = 0; i < size; i++) {
      const stride = i * 3;

      const v = 255;
      data[stride] = v;
      data[stride + 1] = v;
      data[stride + 2] = v;
    }

    return new THREE.DataTexture(data, width, height, THREE.RGBFormat);
  }, []);

  const boxBufferRef = useUpdate<THREE.BoxBufferGeometry>((boxBuffer) => {
    const uvAttr = boxBuffer.attributes.uv;
    const faceTexW = 0.2;
    const faceTexH = 0.2;
    const texMargin = 0.1;

    const facesPerRow = Math.floor(1 / (faceTexW + texMargin));

    // face 4 is the top one
    for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
      const faceColumn = faceIndex % facesPerRow;
      const faceRow = Math.floor(faceIndex / facesPerRow);

      const left = faceColumn * (faceTexW + texMargin);
      const top = faceRow * (faceTexH + texMargin);
      const right = left + faceTexW;
      const bottom = top + faceTexH;

      // default is [0, 1, 1, 1, 0, 0, 1, 0]
      const uvItemBase = faceIndex * 4;
      uvAttr.setXY(uvItemBase, left, bottom);
      uvAttr.setXY(uvItemBase + 1, right, bottom);
      uvAttr.setXY(uvItemBase + 2, left, top);
      uvAttr.setXY(uvItemBase + 3, right, top);
    }

    boxBuffer.setAttribute('uv2', new THREE.BufferAttribute(uvAttr.array, 2));
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
          map={controlTexture}
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
