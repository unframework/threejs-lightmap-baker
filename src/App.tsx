import React from 'react';
import { Canvas } from 'react-three-fiber';
import * as THREE from 'three';
import { useRenderProp } from 'react-render-prop';

import IrradianceSurfaceManager from './core/IrradianceSurfaceManager';
import WorkManager from './core/WorkManager';
import IrradianceAtlasMapper, { AtlasMap } from './core/IrradianceAtlasMapper';
import IrradianceRenderer from './core/IrradianceRenderer';
import IrradianceCompositor from './core/IrradianceCompositor';
import DebugControls from './stories/DebugControls';
import { DebugOverlayScene } from './stories/DebugOverlayScene';
import { MainScene } from './MainScene';

function App() {
  // plumbing between baker components
  const [atlasMapSink, atlasMap] = useRenderProp<[AtlasMap | null]>();
  const [baseRendererSink, baseLightTexture, probeTexture] = useRenderProp<
    [THREE.Texture, THREE.Texture]
  >();

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

                <MainScene onReady={startWorkbench} />
              </IrradianceCompositor>
            </>
          )}
        </IrradianceSurfaceManager>
      </WorkManager>

      <DebugControls />
    </Canvas>
  );
}

export default App;
