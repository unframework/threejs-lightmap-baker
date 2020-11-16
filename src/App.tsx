import React, { useEffect, useState } from 'react';
import { Canvas } from 'react-three-fiber';
import * as THREE from 'three';
import { useRenderProp } from 'react-render-prop';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

import IrradianceSurfaceManager from './IrradianceSurfaceManager';
import WorkManager from './WorkManager';
import IrradianceAtlasMapper, { AtlasMap } from './IrradianceAtlasMapper';
import IrradianceRenderer from './IrradianceRenderer';
import IrradianceCompositor from './IrradianceCompositor';
import SceneControls from './SceneControls';
import { DebugOverlayScene } from './DebugOverlayScene';
import { MainScene } from './MainScene';

import sceneUrl from './tile-game-room6.glb';

function App() {
  const [loadedData, setLoadedData] = useState<GLTF | null>(null);

  useEffect(() => {
    new GLTFLoader().load(sceneUrl, (data) => {
      setLoadedData(data);
    });
  }, []);

  // plumbing between baker components
  const [atlasMapSink, atlasMap] = useRenderProp<[AtlasMap | null]>();
  const [baseRendererSink, baseLightTexture, probeTexture] = useRenderProp<
    [THREE.Texture, THREE.Texture]
  >();

  // awkward hack to start workbench snapshot after a delay
  const [startWorkbenchSink, startWorkbenchHandler] = useRenderProp<
    [() => void]
  >();

  useEffect(() => {
    if (!startWorkbenchHandler) {
      return;
    }

    const timeoutId = setTimeout(startWorkbenchHandler, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [startWorkbenchHandler]);

  return (
    <Canvas
      camera={{ position: [-4, -4, 8], up: [0, 0, 1] }}
      shadowMap
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.9;

        gl.outputEncoding = THREE.sRGBEncoding;
      }}
    >
      <WorkManager>
        <IrradianceSurfaceManager>
          {(workbench, startWorkbench) => (
            <>
              {startWorkbenchSink(startWorkbench)}

              {workbench && (
                <IrradianceAtlasMapper workbench={workbench}>
                  {atlasMapSink}
                </IrradianceAtlasMapper>
              )}

              {workbench && atlasMap && (
                <IrradianceRenderer
                  workbench={workbench}
                  atlasMap={atlasMap}
                  factorName={null}
                >
                  {baseRendererSink}
                </IrradianceRenderer>
              )}

              <IrradianceCompositor
                baseOutput={baseLightTexture}
                factorOutputs={{}}
              >
                <DebugOverlayScene
                  atlasTexture={atlasMap && atlasMap.texture}
                  probeTexture={probeTexture}
                />

                {loadedData ? <MainScene loadedData={loadedData} /> : null}
              </IrradianceCompositor>
            </>
          )}
        </IrradianceSurfaceManager>
      </WorkManager>

      <SceneControls />
    </Canvas>
  );
}

export default App;
