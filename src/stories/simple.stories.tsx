import React, { useEffect } from 'react';
import { Story, Meta } from '@storybook/react';
import { Canvas, useResource } from 'react-three-fiber';
import * as THREE from 'three';

import IrradianceSurfaceManager from '../core/IrradianceSurfaceManager';
import WorkManager from '../core/WorkManager';
import IrradianceRenderer from '../core/IrradianceRenderer';
import IrradianceCompositor from '../core/IrradianceCompositor';
import { IrradianceSurface, IrradianceLight } from '../core/IrradianceScene';
import { useIrradianceTexture } from '../core/IrradianceCompositor';
import DebugControls from './DebugControls';
import { DebugOverlayScene } from './DebugOverlayScene';

import './viewport.css';

export default {
  title: 'Simple scene'
} as Meta;

// return triangle edge canonical code as i1:i2 (in consistent winding order)
function getEdgeCode(
  indexList: ArrayLike<number>,
  start: number,
  edgeIndex: number,
  flip: boolean
) {
  const a = indexList[start + (edgeIndex % 3)];
  const b = indexList[start + ((edgeIndex + 1) % 3)];

  return flip ? `${b}:${a}` : `${a}:${b}`;
}

const tmpOrigin = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();

const tmpNormal = new THREE.Vector3();
const tmpUAxis = new THREE.Vector3();
const tmpVAxis = new THREE.Vector3();

const tmpULocal = new THREE.Vector2();
const tmpVLocal = new THREE.Vector2();

const tmpMinLocal = new THREE.Vector2();
const tmpMaxLocal = new THREE.Vector2();

const AutoUV2: React.FC<{ children: React.ReactElement<{}, 'mesh'> }> = ({
  children
}) => {
  const [meshRef, mesh] = useResource<THREE.Mesh>();

  useEffect(() => {
    if (!mesh) {
      return;
    }

    if (!(mesh instanceof THREE.Mesh)) {
      throw new Error('expecting mesh');
    }

    const buffer = mesh.geometry;

    if (!(buffer instanceof THREE.BufferGeometry)) {
      throw new Error('expecting buffer geometry');
    }

    const indexAttr = buffer.index;

    if (!indexAttr) {
      throw new Error('expecting indexed buffer geometry');
    }

    const indexArray = indexAttr.array;
    const faceCount = Math.floor(indexArray.length / 3);

    const posArray = buffer.attributes.position.array;
    const normalArray = buffer.attributes.normal.array;

    for (let vStart = 0; vStart < faceCount * 3; vStart += 3) {
      const vNextStart = vStart + 3;

      // detect quad
      if (vNextStart < faceCount * 3) {
        // encoded vertex index pairs
        const curEdgeCodes = [
          getEdgeCode(indexArray, vStart, 0, false),
          getEdgeCode(indexArray, vStart, 1, false),
          getEdgeCode(indexArray, vStart, 2, false)
        ];

        // same but flipped (to reflect that here the edge is "walked" in opposite direction)
        const nextEdgeCodes = [
          getEdgeCode(indexArray, vNextStart, 0, true),
          getEdgeCode(indexArray, vNextStart, 1, true),
          getEdgeCode(indexArray, vNextStart, 2, true)
        ];

        const sharedEdgeIndex = curEdgeCodes.findIndex(
          (edgeCode) => nextEdgeCodes.indexOf(edgeCode) !== -1
        );

        // decide which is the "origin" vertex
        const oppositeEdgeIndex = sharedEdgeIndex !== -1 ? sharedEdgeIndex : 1;

        // U and V vertices are on the opposite edge to origin
        const vU = vStart + oppositeEdgeIndex;
        const vV = vStart + ((oppositeEdgeIndex + 1) % 3);
        const vOrigin = vStart + ((oppositeEdgeIndex + 2) % 3);

        // get the non-shared edge vectors
        tmpOrigin.fromArray(posArray, indexArray[vOrigin] * 3);
        tmpU.fromArray(posArray, indexArray[vU] * 3);
        tmpV.fromArray(posArray, indexArray[vV] * 3);

        tmpU.sub(tmpOrigin);
        tmpV.sub(tmpOrigin);

        // compute orthogonal coordinate system for face plane
        tmpNormal.fromArray(normalArray, indexArray[vOrigin] * 3);
        tmpUAxis.crossVectors(tmpV, tmpNormal);
        tmpVAxis.crossVectors(tmpNormal, tmpUAxis);
        tmpUAxis.normalize();
        tmpVAxis.normalize();

        // U and V vertex coords in local face plane
        tmpULocal.set(tmpU.dot(tmpUAxis), tmpU.dot(tmpVAxis));
        tmpVLocal.set(tmpV.dot(tmpUAxis), tmpV.dot(tmpVAxis));

        // compute min and max extents of origin, U and V local coords
        tmpMinLocal.set(0, 0);
        tmpMinLocal.min(tmpULocal);
        tmpMinLocal.min(tmpVLocal);

        tmpMaxLocal.set(0, 0);
        tmpMaxLocal.max(tmpULocal);
        tmpMaxLocal.max(tmpVLocal);

        console.log(tmpMinLocal, tmpMaxLocal);

        // advance by one extra triangle on next cycle if faces share edge
        // @todo process the second triangle
        if (sharedEdgeIndex !== -1) {
          vStart += 3;
        }
      }
    }
  }, [mesh]);

  return React.cloneElement(children, { ref: meshRef });
};

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
                <DebugOverlayScene
                  atlasTexture={workbench && workbench.atlasMap.texture}
                  probeTexture={probeTexture}
                >
                  <scene>
                    <mesh position={[0, 0, -2]} receiveShadow>
                      <planeBufferGeometry attach="geometry" args={[20, 20]} />
                      <meshLambertMaterial attach="material" color="#171717" />
                      <IrradianceSurface />
                    </mesh>

                    <AutoUV2>
                      <mesh position={[0, 0, 0]} castShadow receiveShadow>
                        <boxBufferGeometry attach="geometry" args={[2, 2, 2]} />
                        <meshLambertMaterial
                          attach="material"
                          color="#904090"
                        />
                        <IrradianceSurface />
                      </mesh>
                    </AutoUV2>

                    <directionalLight
                      intensity={1}
                      position={[-1, 1, 2]}
                      castShadow
                    />

                    <DebugControls />
                  </scene>
                </DebugOverlayScene>
              </IrradianceCompositor>
            )}
          </IrradianceRenderer>
        )}
      </IrradianceSurfaceManager>
    </WorkManager>
  </Canvas>
);
