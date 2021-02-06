import React from 'react';
import { Story, Meta } from '@storybook/react';
import { Canvas } from 'react-three-fiber';
import * as THREE from 'three';

import { AutoUV2 } from '../core/AutoUV2';
import IrradianceSceneManager from '../core/IrradianceSceneManager';
import WorkManager from '../core/WorkManager';
import IrradianceRenderer from '../core/IrradianceRenderer';
import IrradianceCompositor from '../core/IrradianceCompositor';
import { IrradianceSurface, IrradianceLight } from '../core/IrradianceScene';
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
      <IrradianceSceneManager
        autoUV2={{ texelSize: 0.25 }}
        autoStartDelayMs={10}
      >
        {(workbench) => (
          <>
            <WorkManager>
              {workbench && <IrradianceRenderer workbench={workbench} />}
            </WorkManager>

            <DebugOverlayScene
              atlasTexture={workbench && workbench.atlasMap.texture}
            >
              <scene>
                <mesh position={[0, 0, -2]} receiveShadow>
                  <planeBufferGeometry attach="geometry" args={[20, 20]} />
                  <meshLambertMaterial attach="material" color="#ffffff" />
                  <IrradianceSurface />
                </mesh>

                <mesh position={[0, 0, 0]} castShadow receiveShadow>
                  <circleBufferGeometry attach="geometry" args={[2, 4]} />
                  <meshLambertMaterial attach="material" color="#c0c0c0" />
                  <AutoUV2 />
                  <IrradianceSurface mapped />
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
          </>
        )}
      </IrradianceSceneManager>
    </IrradianceCompositor>

    <DebugControls />
  </Canvas>
);
