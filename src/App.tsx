import React from 'react';
import { Canvas, useResource, useFrame } from 'react-three-fiber';
import * as THREE from 'three';

import { useAtlas, useMeshWithAtlas } from './Atlas';
import SceneControls from './SceneControls';

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
  const mesh2Pos: [number, number, number] = [0, 0, 2];

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
          <planeBufferGeometry
            attach="geometry"
            args={[5, 5]}
            ref={meshBuffer1Ref}
          />
          <meshBasicMaterial attach="material" map={outputTexture} />
        </mesh>
        <mesh position={mesh2Pos} ref={mesh2Ref}>
          <boxBufferGeometry
            attach="geometry"
            args={[1, 1, 5]}
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

        <mesh position={[10, -10, 20]}>
          <boxBufferGeometry attach="geometry" args={[8, 8, 8]} />
          <meshBasicMaterial attach="material" color="#ffffff" />
        </mesh>

        <mesh position={[-8, -8, 20]}>
          <boxBufferGeometry attach="geometry" args={[4, 4, 4]} />
          <meshBasicMaterial attach="material" color="#ff8080" />
        </mesh>
      </scene>
    </>
  );
}

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

      <SceneControls />
    </Canvas>
  );
}

export default App;
