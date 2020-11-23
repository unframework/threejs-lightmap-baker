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
import { AutoUV2, AutoUV2Provider } from '../core/AutoUV2';
import DebugControls from './DebugControls';
import { DebugOverlayScene } from './DebugOverlayScene';

import './viewport.css';

export default {
  title: 'Cylinder scene (polygon UV)'
} as Meta;

export const Main: Story = () => (
  <Canvas
    colorManagement={false} // @todo reconsider
    camera={{ position: [-6, -4, 2], up: [0, 0, 1] }}
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
                  <AutoUV2Provider mapWorldWidth={16}>
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
                            color="#ffffff"
                          />
                          <IrradianceSurface />
                        </mesh>

                        <mesh position={[0, 0, 0]} castShadow receiveShadow>
                          <circleBufferGeometry
                            attach="geometry"
                            args={[2, 4]}
                          />
                          <meshLambertMaterial
                            attach="material"
                            color="#c0c0c0"
                            lightMap={outputLightMap}
                          />
                          <AutoUV2 />
                          <IrradianceSurface />
                        </mesh>

                        <directionalLight
                          intensity={1}
                          position={[-2.5, 2.5, 4]}
                          castShadow
                        >
                          <IrradianceLight />
                        </directionalLight>
                      </scene>
                    </DebugOverlayScene>
                  </AutoUV2Provider>
                )}
              </IrradianceCompositor>
            )}
          </IrradianceRenderer>
        )}
      </IrradianceSurfaceManager>
    </WorkManager>

    <DebugControls />
  </Canvas>
);
