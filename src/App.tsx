import React, { useRef, useState, useLayoutEffect, useMemo } from 'react';
import {
  Canvas,
  useUpdate,
  useResource,
  useFrame,
  useThree,
  extend,
  ReactThreeFiber
} from 'react-three-fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import { useAtlas, useMeshWithAtlas } from './Atlas';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      orbitControls: ReactThreeFiber.Object3DNode<
        OrbitControls,
        typeof OrbitControls
      >;
    }
  }
}

extend({ OrbitControls });

function Scene() {
  const {
    atlasInfo,
    outputTexture,
    lightSceneRef,
    lightSceneTexture,
    probeDebugTexture
  } = useAtlas();

  const [mainSceneRef, mainScene] = useResource<THREE.Scene>();

  const [meshBuffer1Ref, meshBuffer1] = useResource<THREE.BufferGeometry>();
  const mesh1Ref = useMeshWithAtlas(atlasInfo, meshBuffer1);

  const [meshBuffer2Ref, meshBuffer2] = useResource<THREE.BufferGeometry>();
  const mesh2Ref = useMeshWithAtlas(atlasInfo, meshBuffer2);

  useFrame(({ gl, camera }) => {
    gl.render(mainScene, camera);
  }, 20);

  const mesh1Pos: [number, number, number] = [0, 0, -2];
  const mesh1Args: [number, number, number] = [5, 5, 2];
  const mesh2Pos: [number, number, number] = [0, 0, 2];
  const mesh2Args: [number, number, number] = [1, 1, 5];
  const lightPos: [number, number, number] = [5, -5, 10];

  return (
    <>
      <scene ref={mainSceneRef}>
        <mesh position={[0, 0, -5]}>
          <planeBufferGeometry attach="geometry" args={[200, 200]} />
          <meshBasicMaterial attach="material" color="#171717" />
        </mesh>
        <mesh position={[-4, 4, 0]}>
          <planeBufferGeometry attach="geometry" args={[2, 2]} />
          <meshBasicMaterial attach="material" map={probeDebugTexture} />
        </mesh>

        <mesh position={mesh1Pos} ref={mesh1Ref}>
          <boxBufferGeometry
            attach="geometry"
            args={mesh1Args}
            ref={meshBuffer1Ref}
          />
          <meshBasicMaterial attach="material" map={outputTexture} />
        </mesh>
        <mesh position={mesh2Pos} ref={mesh2Ref}>
          <boxBufferGeometry
            attach="geometry"
            args={mesh2Args}
            ref={meshBuffer2Ref}
          />
          <meshBasicMaterial attach="material" map={outputTexture} />
        </mesh>
      </scene>

      <scene ref={lightSceneRef}>
        <mesh position={mesh1Pos}>
          {meshBuffer1 && (
            <primitive attach="geometry" object={meshBuffer1} dispose={null} />
          )}
          <meshBasicMaterial attach="material" map={lightSceneTexture} />
        </mesh>

        <mesh position={mesh2Pos}>
          {meshBuffer2 && (
            <primitive attach="geometry" object={meshBuffer2} dispose={null} />
          )}
          <meshBasicMaterial attach="material" map={lightSceneTexture} />
        </mesh>

        <mesh position={lightPos}>
          <boxBufferGeometry attach="geometry" args={[8, 8, 8]} />
          <meshBasicMaterial attach="material" color="white" />
        </mesh>
      </scene>
    </>
  );
}

const Controls: React.FC = () => {
  const { camera, gl } = useThree();
  const orbitControlsRef = useRef<OrbitControls>();

  useFrame(() => {
    if (!orbitControlsRef.current) {
      return;
    }
    orbitControlsRef.current.update();
  });

  return (
    <orbitControls
      ref={orbitControlsRef}
      args={[camera, gl.domElement]}
      enableDamping
      dampingFactor={0.1}
      rotateSpeed={0.5}
    />
  );
};

function App() {
  return (
    <Canvas
      camera={{ position: [-4, -4, 8], up: [0, 0, 1] }}
      onCreated={({ gl }) => {
        // gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputEncoding = THREE.sRGBEncoding;
      }}
    >
      <Scene />

      <Controls />
    </Canvas>
  );
}

export default App;
