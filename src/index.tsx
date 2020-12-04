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

import IrradianceSurfaceManager from './core/IrradianceSurfaceManager';
import WorkManager from './core/WorkManager';
import IrradianceRenderer from './core/IrradianceRenderer';
import IrradianceCompositor from './core/IrradianceCompositor';
import { IrradianceSurface, IrradianceLight } from './core/IrradianceScene';
import { AutoUV2, AutoUV2Provider } from './core/AutoUV2';
import { AutoIndex } from './core/AutoIndex';
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
              lightMapWorldWidth={20}
            >
              <WorkManager>
                {workbench && <IrradianceRenderer workbench={workbench} />}
              </WorkManager>

              <DebugOverlayScene
                atlasTexture={workbench && workbench.atlasMap.texture}
              >
                <scene>
                  <mesh position={[0, 0, -0.1]} receiveShadow>
                    <planeBufferGeometry attach="geometry" args={[9, 5]} />
                    <meshLambertMaterial
                      attach="material"
                      color="#ffffff"
                      lightMap={outputLightMap}
                    />
                    <AutoUV2 />
                    <IrradianceSurface />
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
                    <meshLambertMaterial
                      attach="material"
                      color="#ffe020"
                      lightMap={outputLightMap}
                    />

                    <AutoIndex />
                    <AutoUV2 />
                    <IrradianceSurface />
                  </mesh>

                  <directionalLight
                    intensity={1.5}
                    position={[-2, 2, 4]}
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

    <DebugControls />
  </Canvas>,
  document.getElementById('root')
);
