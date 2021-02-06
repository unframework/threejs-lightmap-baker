import React, { useEffect } from 'react';
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

import helvetikerFontData from './helvetiker.json';
const helvetikerFont = new THREE.Font(helvetikerFontData);

const LIGHT_MAP_RES = 64;

export default {
  title: 'Text mesh scene'
} as Meta;

const FontLoader: React.FC = () => {
  useEffect(() => {}, []);

  return null;
};

export const Main: Story = () => (
  <Canvas
    colorManagement={false} // @todo reconsider
    camera={{ position: [-6, -4, 4], up: [0, 0, 1] }}
    shadowMap
    onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 0.9;

      gl.outputEncoding = THREE.sRGBEncoding;
    }}
  >
    <FontLoader />

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
                  <meshPhongMaterial
                    attach="material"
                    color="#808080"
                    //shininess={0}
                  />
                  <IrradianceSurface />
                </mesh>

                <mesh position={[-2, -1, 0]} castShadow receiveShadow>
                  <textBufferGeometry
                    attach="geometry"
                    args={[
                      'Hi',
                      {
                        font: helvetikerFont,
                        size: 4,
                        height: 1.5,
                        curveSegments: 1
                      }
                    ]}
                  />
                  <meshPhongMaterial attach="material" color="#c0c0c0" />
                  <AutoUV2 />
                  <IrradianceSurface mapped />
                </mesh>

                <spotLight
                  angle={0.75}
                  distance={25}
                  intensity={2}
                  penumbra={0.5}
                  position={[-8, 8, 8]}
                  castShadow
                >
                  <IrradianceLight />
                </spotLight>
              </scene>
            </DebugOverlayScene>
          </>
        )}
      </IrradianceSceneManager>
    </IrradianceCompositor>

    <DebugControls />
  </Canvas>
);
