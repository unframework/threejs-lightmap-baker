import React, { useMemo } from 'react';
import { Canvas, useResource, useFrame, useThree } from 'react-three-fiber';
import * as THREE from 'three';

import IrradianceSurfaceManager, {
  IrradianceSurface
} from './IrradianceSurfaceManager';
import { useIrradianceRenderer } from './IrradianceRenderer';
import SceneControls from './SceneControls';
import GridGeometry from './GridGeometry';
import {
  IrradianceDebugMaterial,
  IrradianceTextureContext
} from './IrradianceMaterials';

function Scene() {
  const {
    outputTexture,
    lightSceneElement,
    handleDebugClick,
    probeDebugTextures
  } = useIrradianceRenderer();

  const [mainSceneRef, mainScene] = useResource<THREE.Scene>();
  const [debugSceneRef, debugScene] = useResource<THREE.Scene>();

  const { size } = useThree();
  const debugCamera = useMemo(() => {
    // top-left corner is (0, 100), top-right is (100, 100)
    const aspect = size.height / size.width;
    return new THREE.OrthographicCamera(0, 100, 100, 100 * (1 - aspect), -1, 1);
  }, [size]);

  useFrame(({ gl, camera }) => {
    gl.render(mainScene, camera);
  }, 20);

  useFrame(({ gl }) => {
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(debugScene, debugCamera);
    gl.autoClear = true;
  }, 30);

  return (
    <>
      <scene ref={debugSceneRef}>
        {/* render textures using probe-scene materials to avoid being affected by tone mapping */}
        {probeDebugTextures.map((tex, texIndex) => (
          <mesh position={[5, 95 - texIndex * 9, 0]} key={texIndex}>
            <planeBufferGeometry attach="geometry" args={[8, 8]} />
            <IrradianceDebugMaterial attach="material" lumMap={tex} />
          </mesh>
        ))}
        <mesh position={[85, 85, 0]}>
          <planeBufferGeometry attach="geometry" args={[20, 20]} />
          <IrradianceDebugMaterial attach="material" lumMap={outputTexture} />
        </mesh>
      </scene>

      <IrradianceTextureContext.Provider value={outputTexture}>
        <scene ref={mainSceneRef}>
          <mesh position={[0, 0, -5]}>
            <planeBufferGeometry attach="geometry" args={[200, 200]} />
            <meshBasicMaterial attach="material" color="#171717" />
          </mesh>

          <IrradianceSurface>
            <mesh position={[0, 0, -1]} onClick={handleDebugClick}>
              <GridGeometry attach="geometry" />
            </mesh>
          </IrradianceSurface>
          <IrradianceSurface>
            <mesh position={[-1.5, 0, 2]} onClick={handleDebugClick}>
              <boxBufferGeometry attach="geometry" args={[2, 1, 4.5]} />
            </mesh>
          </IrradianceSurface>
          <IrradianceSurface>
            <mesh position={[1.5, 0, 2]} onClick={handleDebugClick}>
              <boxBufferGeometry attach="geometry" args={[2, 1, 4.5]} />
            </mesh>
          </IrradianceSurface>
          <IrradianceSurface>
            <mesh position={[0, 3, 3]} onClick={handleDebugClick}>
              <boxBufferGeometry attach="geometry" args={[3, 0.5, 3]} />
            </mesh>
          </IrradianceSurface>

          <IrradianceSurface lightIntensity={10}>
            <mesh position={[0, -10, 10]}>
              <boxBufferGeometry attach="geometry" args={[6, 2, 6]} />
            </mesh>
          </IrradianceSurface>

          <IrradianceSurface lightIntensity={5}>
            <mesh position={[0, 8, 8]}>
              <boxBufferGeometry attach="geometry" args={[2, 2, 2]} />
            </mesh>
          </IrradianceSurface>
        </scene>
      </IrradianceTextureContext.Provider>

      {lightSceneElement}
    </>
  );
}

function App() {
  return (
    <Canvas
      camera={{ position: [-4, -4, 8], up: [0, 0, 1] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.9;

        gl.outputEncoding = THREE.sRGBEncoding;
      }}
    >
      <IrradianceSurfaceManager>
        <Scene />
      </IrradianceSurfaceManager>

      <SceneControls />
    </Canvas>
  );
}

export default App;
