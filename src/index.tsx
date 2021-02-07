/**
 *
 * Hi! This file can run inside CodeSandbox or a similar live-editing environment.
 * For local development, try the storybook files under src/stories.
 *
 */

import React from 'react';
import ReactDOM from 'react-dom';
import { Canvas } from 'react-three-fiber';
import * as THREE from 'three';

import { AutoUV2Provider, AutoUV2 } from './core/AutoUV2';
import IrradianceSceneManager from './core/IrradianceSceneManager';
import WorkManager from './core/WorkManager';
import IrradianceRenderer from './core/IrradianceRenderer';
import IrradianceCompositor from './core/IrradianceCompositor';
import { IrradianceSurface } from './core/IrradianceScene';
import DebugControls from './stories/DebugControls';
import { DebugOverlayScene } from './stories/DebugOverlayScene';

import './stories/viewport.css';

import helvetikerFontData from './stories/helvetiker.json';
const helvetikerFont = new THREE.Font(helvetikerFontData);

const LIGHT_MAP_RES = 128;

ReactDOM.render(
  <Canvas
    colorManagement={false} // @todo reconsider
    camera={{ position: [-2, -4, 6], up: [0, 0, 1] }}
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
                <AutoUV2Provider texelSize={0.15}>
                  <mesh position={[0, 0, -0.1]} receiveShadow>
                    <planeBufferGeometry attach="geometry" args={[9, 5]} />
                    <meshLambertMaterial attach="material" color="#ffffff" />
                    <AutoUV2 />
                    <IrradianceSurface mapped />
                  </mesh>

                  <mesh position={[-3.2, -0.8, 0]} castShadow receiveShadow>
                    <textBufferGeometry
                      attach="geometry"
                      args={[
                        'Light!',
                        {
                          font: helvetikerFont,
                          size: 2,
                          height: 1.5,
                          curveSegments: 1
                        }
                      ]}
                    />
                    <meshLambertMaterial attach="material" color="#ffe020" />
                    <AutoUV2 />
                    <IrradianceSurface mapped />
                  </mesh>
                </AutoUV2Provider>

                <directionalLight
                  intensity={1.5}
                  position={[-2, 2, 4]}
                  castShadow
                />
              </scene>
            </DebugOverlayScene>
          </React.Suspense>
        )}
      </IrradianceSceneManager>
    </IrradianceCompositor>

    <DebugControls />
  </Canvas>,
  document.getElementById('root')
);
