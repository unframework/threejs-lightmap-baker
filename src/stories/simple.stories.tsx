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

const LIGHT_MAP_RES = 64;

export default {
  title: 'Simple scene'
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
      <IrradianceSurfaceManager
        lightMapWidth={LIGHT_MAP_RES}
        lightMapHeight={LIGHT_MAP_RES}
        autoStartDelayMs={10}
      >
        {(workbench) => (
          <IrradianceCompositor
            lightMapWidth={LIGHT_MAP_RES}
            lightMapHeight={LIGHT_MAP_RES}
          >
            {(outputLightMap) => (
              <AutoUV2Provider
                lightMapWidth={LIGHT_MAP_RES}
                lightMapHeight={LIGHT_MAP_RES}
                lightMapTexelSize={0.5}
              >
                {workbench && <IrradianceRenderer workbench={workbench} />}

                <DebugOverlayScene
                  atlasTexture={workbench && workbench.atlasMap.texture}
                >
                  <scene>
                    <mesh position={[0, 0, -3]} receiveShadow>
                      <planeBufferGeometry attach="geometry" args={[20, 20]} />
                      <meshLambertMaterial
                        attach="material"
                        color="#808080"
                        lightMap={outputLightMap}
                      />
                      <AutoUV2 />
                      <IrradianceSurface />
                    </mesh>

                    <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
                      <boxBufferGeometry attach="geometry" args={[2, 2, 5]} />
                      <meshLambertMaterial
                        attach="material"
                        color="#c0c0c0"
                        lightMap={outputLightMap}
                      />
                      <AutoUV2 />
                      <IrradianceSurface />
                    </mesh>

                    <mesh position={[0, -1.5, -1.5]} castShadow receiveShadow>
                      <boxBufferGeometry attach="geometry" args={[2, 2, 2]} />
                      <meshLambertMaterial
                        attach="material"
                        color="#0000ff"
                        emissive="#0000ff"
                        emissiveIntensity={0.25}
                        lightMap={outputLightMap}
                      />
                      <AutoUV2 />
                      <IrradianceSurface />
                    </mesh>

                    <mesh position={[0, -1.5, 1.5]} castShadow receiveShadow>
                      <boxBufferGeometry attach="geometry" args={[2, 2, 2]} />
                      <meshLambertMaterial
                        attach="material"
                        color="#ff0000"
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
      </IrradianceSurfaceManager>
    </WorkManager>

    <DebugControls />
  </Canvas>
);
