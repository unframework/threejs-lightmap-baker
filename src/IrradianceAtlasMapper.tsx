import React, { useState, useMemo, useEffect } from 'react';
import { useUpdate, useThree } from 'react-three-fiber';
import * as THREE from 'three';

import { useIrradianceAtlasContext } from './IrradianceSurfaceManager';

export interface AtlasMapItem {
  faceCount: number;
  faceBuffer: THREE.BufferGeometry;
  originalMesh: THREE.Mesh;
  originalBuffer: THREE.BufferGeometry;
}

export interface AtlasMap {
  items: AtlasMapItem[];
  data: Float32Array;
  texture: THREE.Texture;
}

export const atlasWidth = 64;
export const atlasHeight = 64;

export const MAX_ITEM_FACES = 1000; // used for encoding item+face index in texture

// temp objects for computation
const tmpNormal = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();

// write out original face geometry info into the atlas map
// each texel corresponds to: (quadX, quadY, quadIndex)
// where quadX and quadY are 0..1 representing a spot in the original quad
// and quadIndex is 1-based to distinguish from blank space
// which allows to find original 3D position/normal/etc for that texel
// (quad index is int stored as float, but precision should be good enough)
// @todo consider stencil buffer, or just 8bit texture
// @todo consider rounding to account for texel size
// @todo provide output via context
const IrradianceAtlasMapper: React.FC<{
  children: (atlasMap: AtlasMap | null) => React.ReactElement | null;
}> = ({ children }) => {
  const atlas = useIrradianceAtlasContext();

  // wait until next render to queue up data to render into atlas texture
  const [inputItems, setInputItems] = useState<AtlasMapItem[] | null>(null);

  // set when render is complete
  const [atlasMap, setAtlasMap] = useState<AtlasMap | null>(null);

  useEffect(() => {
    // disposed during scene unmount
    setInputItems(
      atlas.lightSceneItems
        .filter((item) => !!item.albedoMap)
        .map((item, itemIndex) => {
          const { mesh, buffer } = item;

          if (!(buffer instanceof THREE.BufferGeometry)) {
            throw new Error('expected buffer geometry');
          }

          const indexAttr = buffer.index;
          if (!indexAttr) {
            throw new Error('expected face index array');
          }

          const faceVertexCount = indexAttr.count;
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

            // store normal and compute cardinal directions for later
            if (faceMod === 0) {
              // source data should specify normals correctly (since winding order is unknown)
              atlasNormalAttr.copyAt(
                faceVertexIndex,
                normalAttr,
                indexData[faceVertexIndex]
              );

              tmpNormal.fromArray(atlasNormalAttr.array, faceVertexIndex * 3);

              // use consistent "left" and "up" directions based on just the normal
              if (tmpNormal.x === 0 && tmpNormal.y === 0) {
                tmpU.set(1, 0, 0);
              } else {
                tmpU.set(0, 0, 1);
              }

              tmpV.crossVectors(tmpNormal, tmpU);
              tmpV.normalize();

              tmpU.crossVectors(tmpNormal, tmpV);
              tmpU.normalize();

              atlasNormalAttr.setXYZ(
                faceVertexIndex + 1,
                tmpU.x,
                tmpU.y,
                tmpU.z
              );
              atlasNormalAttr.setXYZ(
                faceVertexIndex + 2,
                tmpV.x,
                tmpV.y,
                tmpV.z
              );
            }

            // positioning in face
            const facePosX = faceMod & 1;
            const facePosY = (faceMod & 2) >> 1;

            // mesh index + face index combined into one
            const faceIndex = (faceVertexIndex - faceMod) / 3;

            atlasFacePosAttr.setXYZ(
              faceVertexIndex,
              facePosX,
              facePosY,
              itemIndex * MAX_ITEM_FACES + faceIndex // @todo put +1 here instead of shader (Threejs somehow fails to set it though?)
            );
          }

          const atlasBuffer = new THREE.BufferGeometry();
          atlasBuffer.setAttribute('position', atlasFacePosAttr);
          atlasBuffer.setAttribute('uv', atlasUVAttr);
          atlasBuffer.setAttribute('normal', atlasNormalAttr);

          return {
            faceCount: faceVertexCount / 3,
            faceBuffer: atlasBuffer,
            originalMesh: mesh,
            originalBuffer: buffer
          };
        })
    );
  }, [atlas]);

  const orthoTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(atlasWidth, atlasHeight, {
      type: THREE.FloatType,
      magFilter: THREE.NearestFilter, // pixelate for debug display
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
    return new Float32Array(atlasWidth * atlasHeight * 4);
  }, []);

  // disposed during scene unmount
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide, // UVs might have arbitrary winding
        vertexShader: `
          varying vec3 vFacePos;

          void main() {
            vFacePos = position;

            gl_Position = projectionMatrix * vec4(
              uv, // UV is the actual position on map
              0,
              1.0
            );
          }
        `,
        fragmentShader: `
          varying vec3 vFacePos;

          void main() {
            // encode the face information in map
            gl_FragColor = vec4(vFacePos.xy, vFacePos.z + 1.0, 1.0);
          }
        `
      }),
    []
  );

  // render the output as needed
  const { gl } = useThree();
  const orthoSceneRef = useUpdate<THREE.Scene>(
    (orthoScene) => {
      // nothing to do
      if (!inputItems) {
        return;
      }

      // produce the output
      gl.autoClear = true;
      gl.setRenderTarget(orthoTarget);
      gl.render(orthoScene, orthoCamera);
      gl.setRenderTarget(null);

      gl.readRenderTargetPixels(
        orthoTarget,
        0,
        0,
        atlasWidth,
        atlasHeight,
        orthoData
      );

      setAtlasMap({
        texture: orthoTarget.texture,
        data: orthoData,
        items: inputItems
      });
    },
    [inputItems]
  );

  return (
    <>
      {children(atlasMap)}

      {inputItems && (
        <scene ref={orthoSceneRef}>
          {inputItems.map((geom, geomIndex) => {
            return (
              <mesh key={geomIndex}>
                <primitive attach="geometry" object={geom.faceBuffer} />
                <primitive attach="material" object={material} />
              </mesh>
            );
          })}
        </scene>
      )}
    </>
  );
};

export default IrradianceAtlasMapper;
