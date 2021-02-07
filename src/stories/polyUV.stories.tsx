import React from 'react';
import { Story, Meta } from '@storybook/react';
import { Canvas } from 'react-three-fiber';
import * as THREE from 'three';

import { AutoUV2Provider, AutoUV2 } from '../core/AutoUV2';
import IrradianceSceneManager from '../core/IrradianceSceneManager';
import WorkManager from '../core/WorkManager';
import IrradianceRenderer from '../core/IrradianceRenderer';
import IrradianceCompositor from '../core/IrradianceCompositor';
import DebugControls from './DebugControls';
import { DebugOverlayScene } from './DebugOverlayScene';

import './viewport.css';

const LIGHT_MAP_RES = 64;

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
    <IrradianceCompositor
      lightMapWidth={LIGHT_MAP_RES}
      lightMapHeight={LIGHT_MAP_RES}
    >
      <IrradianceSceneManager autoStartDelayMs={10}>
        {(sceneRef, workbench) => (
          <React.Suspense fallback={null}>
            <WorkManager>
              {workbench && <IrradianceRenderer workbench={workbench} />}
            </WorkManager>

            <DebugOverlayScene
              atlasTexture={workbench && workbench.atlasMap.texture}
            >
              <scene ref={sceneRef}>
                <mesh position={[0, 0, -2]} receiveShadow>
                  <planeBufferGeometry attach="geometry" args={[20, 20]} />
                  <meshLambertMaterial attach="material" color="#ffffff" />
                </mesh>

                <AutoUV2Provider texelSize={0.25}>
                  <mesh position={[0, 0, 0]} castShadow receiveShadow>
                    <circleBufferGeometry attach="geometry" args={[2, 4]} />
                    <meshLambertMaterial attach="material" color="#c0c0c0" />
                    <AutoUV2 />
                  </mesh>
                </AutoUV2Provider>

                <directionalLight
                  intensity={1}
                  position={[-2.5, 2.5, 4]}
                  castShadow
                />
              </scene>
            </DebugOverlayScene>
          </React.Suspense>
        )}
      </IrradianceSceneManager>
    </IrradianceCompositor>

    <DebugControls />
  </Canvas>
);
