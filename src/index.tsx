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
import Lightmap from './core/Lightmap';
import Spinner from './stories/Spinner';
import DebugControls from './stories/DebugControls';

import './stories/viewport.css';

import helvetikerFontData from './stories/helvetiker.json';
const helvetikerFont = new THREE.Font(helvetikerFontData);

/**
 * Try changing this!
 */
const DISPLAY_TEXT = 'Light!';

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
    <React.Suspense fallback={<Spinner />}>
      <Lightmap lightMapWidth={128} lightMapHeight={128}>
        <AutoUV2Provider texelSize={0.5}>
          <mesh position={[0, 0, -0.1]} receiveShadow>
            <planeBufferGeometry attach="geometry" args={[9, 5]} />
            <meshLambertMaterial attach="material" color="#ffffff" />
            <AutoUV2 />
          </mesh>

          <mesh position={[-3.2, -0.8, 0]} castShadow receiveShadow>
            <textBufferGeometry
              attach="geometry"
              args={[
                DISPLAY_TEXT,
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
          </mesh>
        </AutoUV2Provider>

        <directionalLight intensity={1.5} position={[-2, 2, 4]} castShadow />
      </Lightmap>
    </React.Suspense>

    <DebugControls />
  </Canvas>,
  document.getElementById('root')
);
