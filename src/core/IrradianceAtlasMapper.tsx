/*
 * Copyright (c) 2020-now Nick Matantsev
 * Licensed under the MIT license
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useUpdate, useThree } from 'react-three-fiber';
import * as THREE from 'three';

export type WorkbenchMaterialType =
  | THREE.MeshLambertMaterial
  | THREE.MeshPhongMaterial
  | THREE.MeshStandardMaterial;

export interface WorkbenchSceneItem {
  mesh: THREE.Mesh;
  material: WorkbenchMaterialType;
  needsLightMap: boolean;
}

export type WorkbenchLightType =
  | THREE.SpotLight
  | THREE.DirectionalLight
  | THREE.PointLight;

export interface WorkbenchSceneLight {
  light: WorkbenchLightType;
}

export interface AtlasMapItem {
  faceCount: number;
  originalMesh: THREE.Mesh;
  originalBuffer: THREE.BufferGeometry;
}

interface AtlasMapInternalItem extends AtlasMapItem {
  perFaceBuffer: THREE.BufferGeometry;
}

export interface AtlasMap {
  width: number;
  height: number;
  items: AtlasMapItem[];
  data: Float32Array;
  texture: THREE.Texture;
}

export interface Workbench {
  id: number; // for refresh
  lightScene: THREE.Scene;
  lightSceneItems: WorkbenchSceneItem[];
  atlasMap: AtlasMap;
}

export const MAX_ITEM_FACES = 1000; // used for encoding item+face index in texture

// can be arbitrary colour (empty pixels are ignored due to zero alpha)
const ATLAS_BG_COLOR = new THREE.Color('#000000');

// temp objects for computation
const tmpNormal = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();

const VERTEX_SHADER = `
  attribute vec2 uv2;

  varying vec3 vFacePos;
  uniform vec2 uvOffset;

  void main() {
    vFacePos = position;

    gl_Position = projectionMatrix * vec4(
      uv2 + uvOffset, // UV2 is the actual position on map
      0,
      1.0
    );
  }
`;

const FRAGMENT_SHADER = `
  varying vec3 vFacePos;

  void main() {
    // encode the face information in map
    gl_FragColor = vec4(vFacePos.xyz, 1.0);
  }
`;

// write out original face geometry info into the atlas map
// each texel corresponds to: (quadX, quadY, quadIndex)
// where quadX and quadY are 0..1 representing a spot in the original quad
// and quadIndex is 1-based to distinguish from blank space
// which allows to find original 3D position/normal/etc for that texel
// (quad index is int stored as float, but precision should be good enough)
// NOTE: each atlas texture sample corresponds to the position of
// the physical midpoint of the corresponding rendered texel
// (e.g. if lightmap was shown pixelated); this works well
// with either bilinear or nearest filtering
// @todo consider stencil buffer, or just 8bit texture
const IrradianceAtlasMapper: React.FC<{
  width: number;
  height: number;
  lightSceneItems: WorkbenchSceneItem[];
  onComplete: (atlasMap: AtlasMap) => void;
}> = ({ width, height, lightSceneItems, onComplete }) => {
  // read value only on first render
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  const lightSceneItemsRef = useRef(lightSceneItems);

  // wait until next render to queue up data to render into atlas texture
  const [inputItems, setInputItems] = useState<AtlasMapInternalItem[] | null>(
    null
  );
  const [isComplete, setIsComplete] = useState<boolean>(false);

  useEffect(() => {
    // disposed during scene unmount
    setInputItems(
      lightSceneItemsRef.current
        .filter(({ needsLightMap }) => needsLightMap)
        .map((item, itemIndex) => {
          const { mesh } = item;
          const buffer = mesh.geometry;

          if (!(buffer instanceof THREE.BufferGeometry)) {
            throw new Error('expected buffer geometry');
          }

          const indexAttr = buffer.index;
          if (!indexAttr) {
            throw new Error('expected face index array');
          }

          const faceVertexCount = indexAttr.array.length;
          const uv2Attr = buffer.attributes.uv2;
          const normalAttr = buffer.attributes.normal;

          if (!uv2Attr || !(uv2Attr instanceof THREE.BufferAttribute)) {
            throw new Error('expected uv2 attribute');
          }

          if (!normalAttr || !(normalAttr instanceof THREE.BufferAttribute)) {
            throw new Error('expected normal attribute');
          }

          const atlasUVAttr = new THREE.Float32BufferAttribute(
            faceVertexCount * 2,
            2
          );
          const atlasNormalAttr = new THREE.Float32BufferAttribute(
            faceVertexCount * 3,
            3
          );
          const atlasFacePosAttr = new THREE.Float32BufferAttribute(
            faceVertexCount * 3,
            3
          );

          // unroll indexed mesh data into non-indexed buffer so that we can encode per-face data
          // (otherwise vertices may be shared, and hence cannot have face-specific info in vertex attribute)
          const indexData = indexAttr.array;
          for (
            let faceVertexIndex = 0;
            faceVertexIndex < faceVertexCount;
            faceVertexIndex += 1
          ) {
            const faceMod = faceVertexIndex % 3;

            atlasUVAttr.copyAt(
              faceVertexIndex,
              uv2Attr,
              indexData[faceVertexIndex]
            );

            atlasNormalAttr.copyAt(
              faceVertexIndex,
              normalAttr,
              indexData[faceVertexIndex]
            );

            // position of vertex in face: (0,0), (0,1) or (1,0)
            const facePosX = faceMod & 1;
            const facePosY = (faceMod & 2) >> 1;

            // mesh index + face index combined into one
            const faceIndex = (faceVertexIndex - faceMod) / 3;

            atlasFacePosAttr.setXYZ(
              faceVertexIndex,
              facePosX,
              facePosY,
              itemIndex * MAX_ITEM_FACES + faceIndex + 1 // encode face info in texel
            );
          }

          // this buffer is disposed of when atlas scene is unmounted
          const atlasBuffer = new THREE.BufferGeometry();
          atlasBuffer.setAttribute('position', atlasFacePosAttr);
          atlasBuffer.setAttribute('uv2', atlasUVAttr);
          atlasBuffer.setAttribute('normal', atlasNormalAttr);

          return {
            faceCount: faceVertexCount / 3,
            perFaceBuffer: atlasBuffer,
            originalMesh: mesh,
            originalBuffer: buffer
          };
        })
    );
  }, []);

  const orthoTarget = useMemo(() => {
    // set up simple rasterization for pure data consumption
    return new THREE.WebGLRenderTarget(widthRef.current, heightRef.current, {
      type: THREE.FloatType,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      depthBuffer: false,
      generateMipmaps: false
    });
  }, []);

  useEffect(
    () => () => {
      // clean up on unmount
      orthoTarget.dispose();
    },
    [orthoTarget]
  );

  const orthoCamera = useMemo(() => {
    return new THREE.OrthographicCamera(0, 1, 1, 0, 0, 1);
  }, []);

  const orthoData = useMemo(() => {
    return new Float32Array(widthRef.current * heightRef.current * 4);
  }, []);

  // render the output as needed
  const { gl } = useThree();
  const orthoSceneRef = useUpdate<THREE.Scene>(
    (orthoScene) => {
      // nothing to do
      if (!inputItems || isComplete) {
        return;
      }

      // save existing renderer state
      const prevClearColor = new THREE.Color();
      prevClearColor.copy(gl.getClearColor());
      const prevClearAlpha = gl.getClearAlpha();
      const prevAutoClear = gl.autoClear;

      // produce the output
      gl.setRenderTarget(orthoTarget);

      gl.setClearColor(ATLAS_BG_COLOR, 0); // alpha must be zero
      gl.autoClear = true;

      gl.render(orthoScene, orthoCamera);

      // restore previous renderer state
      gl.setRenderTarget(null);
      gl.setClearColor(prevClearColor, prevClearAlpha);
      gl.autoClear = prevAutoClear;

      gl.readRenderTargetPixels(
        orthoTarget,
        0,
        0,
        widthRef.current,
        heightRef.current,
        orthoData
      );

      setIsComplete(true);
      setInputItems(null); // release references to atlas-specific geometry clones

      onComplete({
        width: widthRef.current,
        height: heightRef.current,
        texture: orthoTarget.texture,
        data: orthoData,

        // no need to expose references to atlas-specific geometry clones
        items: inputItems.map(
          ({ faceCount, originalMesh, originalBuffer }) => ({
            faceCount,
            originalMesh,
            originalBuffer
          })
        )
      });
    },
    [inputItems]
  );

  return (
    <>
      {inputItems && !isComplete && (
        <scene ref={orthoSceneRef}>
          {inputItems.map((geom, geomIndex) => {
            return (
              <mesh
                key={geomIndex}
                frustumCulled={false} // skip bounding box checks (not applicable and logic gets confused)
                position={[0, 0, 0]}
              >
                <primitive attach="geometry" object={geom.perFaceBuffer} />

                <shaderMaterial
                  attach="material"
                  side={THREE.DoubleSide}
                  vertexShader={VERTEX_SHADER}
                  fragmentShader={FRAGMENT_SHADER}
                />
              </mesh>
            );
          })}
        </scene>
      )}
    </>
  );
};

export default IrradianceAtlasMapper;
