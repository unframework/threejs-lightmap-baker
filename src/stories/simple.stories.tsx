import React from 'react';
import { Story, Meta } from '@storybook/react';
import { Canvas } from 'react-three-fiber';
import * as THREE from 'three';

import { AutoUV2Provider, AutoUV2 } from '../core/AutoUV2';
import IrradianceSceneManager from '../core/IrradianceSceneManager';
import WorkManager from '../core/WorkManager';
import IrradianceRenderer from '../core/IrradianceRenderer';
import IrradianceCompositor from '../core/IrradianceCompositor';
import IrradianceScene from '../core/IrradianceScene';
import DebugControls from './DebugControls';
import { DebugOverlayRenderer, DebugOverlayWidgets } from './DebugOverlayScene';

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
    <DebugOverlayRenderer>
      {(sceneRef) => (
        <IrradianceCompositor
          lightMapWidth={LIGHT_MAP_RES}
          lightMapHeight={LIGHT_MAP_RES}
        >
          <IrradianceSceneManager>
            {(workbench, startWorkbench) => (
              <React.Suspense fallback={null}>
                <WorkManager>
                  {workbench && <IrradianceRenderer workbench={workbench} />}
                </WorkManager>

                <IrradianceScene ref={sceneRef} onReady={startWorkbench}>
                  <AutoUV2Provider texelSize={0.5}>
                    <mesh position={[0, 0, -3]} receiveShadow>
                      <planeBufferGeometry attach="geometry" args={[20, 20]} />
                      <meshLambertMaterial attach="material" color="#808080" />
                      <AutoUV2 />
                    </mesh>

                    <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
                      <boxBufferGeometry attach="geometry" args={[2, 2, 5]} />
                      <meshLambertMaterial attach="material" color="#c0c0c0" />
                      <AutoUV2 />
                    </mesh>

                    <mesh position={[0, -1.5, -1.5]} castShadow receiveShadow>
                      <boxBufferGeometry attach="geometry" args={[2, 2, 2]} />
                      <meshLambertMaterial
                        attach="material"
                        color="#0000ff"
                        emissive="#0000ff"
                        emissiveIntensity={0.25}
                      />
                      <AutoUV2 />
                    </mesh>

                    <mesh position={[0, -1.5, 1.5]} castShadow receiveShadow>
                      <boxBufferGeometry attach="geometry" args={[2, 2, 2]} />
                      <meshLambertMaterial attach="material" color="#ff0000" />
                      <AutoUV2 />
                    </mesh>
                  </AutoUV2Provider>

                  <directionalLight
                    intensity={1}
                    position={[-2.5, 2.5, 4]}
                    castShadow
                  />

                  <DebugOverlayWidgets
                    atlasTexture={workbench && workbench.atlasMap.texture}
                  />
                </IrradianceScene>
              </React.Suspense>
            )}
          </IrradianceSceneManager>
        </IrradianceCompositor>
      )}
    </DebugOverlayRenderer>

    <DebugControls />
  </Canvas>
);
