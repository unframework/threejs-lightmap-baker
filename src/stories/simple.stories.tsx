import React from 'react';
import { Story, Meta } from '@storybook/react';
import { Canvas } from 'react-three-fiber';
import * as THREE from 'three';

import IrradianceSurfaceManager from '../core/IrradianceSurfaceManager';
import WorkManager from '../core/WorkManager';
import IrradianceRenderer from '../core/IrradianceRenderer';
import IrradianceCompositor from '../core/IrradianceCompositor';
import { IrradianceSurface, IrradianceLight } from '../core/IrradianceScene';
import { useIrradianceTexture } from '../core/IrradianceCompositor';
import { AutoUV2 } from '../core/AutoUV2';
import DebugControls from './DebugControls';
import { DebugOverlayScene } from './DebugOverlayScene';

import './viewport.css';

export default {
  title: 'Simple scene'
} as Meta;

export const Main: Story = () => (
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
      <IrradianceSurfaceManager autoStartDelayMs={10}>
        {(workbench) => (
          <IrradianceRenderer workbench={workbench} factorName={null}>
            {(baseLightTexture, probeTexture) => (
              <IrradianceCompositor baseOutput={baseLightTexture}>
                {(outputLightMap) => (
                  <DebugOverlayScene
                    atlasTexture={workbench && workbench.atlasMap.texture}
                    probeTexture={probeTexture}
                  >
                    <scene>
                      <mesh position={[0, 0, -2]} receiveShadow>
                        <planeBufferGeometry
                          attach="geometry"
                          args={[20, 20]}
                        />
                        <meshLambertMaterial
                          attach="material"
                          color="#c04020"
                        />
                        <IrradianceSurface />
                      </mesh>

                      <AutoUV2>
                        <mesh position={[0, 0, 0]} castShadow receiveShadow>
                          <boxBufferGeometry
                            attach="geometry"
                            args={[2, 2, 2]}
                          />
                          <meshLambertMaterial
                            attach="material"
                            color="#ffffff"
                            lightMap={outputLightMap}
                          />
                          <IrradianceSurface />
                        </mesh>
                      </AutoUV2>

                      <directionalLight
                        intensity={1}
                        position={[-1, 1, 2]}
                        castShadow
                      >
                        <IrradianceLight />
                      </directionalLight>

                      <DebugControls />
                    </scene>
                  </DebugOverlayScene>
                )}
              </IrradianceCompositor>
            )}
          </IrradianceRenderer>
        )}
      </IrradianceSurfaceManager>
    </WorkManager>
  </Canvas>
);
