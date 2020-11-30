import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useUpdate, useThree } from 'react-three-fiber';
import * as THREE from 'three';

export interface WorkbenchSceneItem {
  mesh: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
  hasUV2: boolean;
  factorName: string | null;
  animationClip: THREE.AnimationClip | null;
}

export interface WorkbenchSceneLight {
  dirLight: THREE.DirectionalLight;
  factorName: string | null;
}

export interface AtlasMapItem {
  faceCount: number;
  faceBuffer: THREE.BufferGeometry;
  originalMesh: THREE.Mesh;
  originalBuffer: THREE.BufferGeometry;
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
  lightSceneItems: WorkbenchSceneItem[];
  lightSceneLights: WorkbenchSceneLight[];
  atlasMap: AtlasMap;
}

export const MAX_ITEM_FACES = 1000; // used for encoding item+face index in texture

// temp objects for computation
const tmpNormal = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();

const VERTEX_SHADER = `
  varying vec3 vFacePos;
  uniform vec2 uvOffset;

  void main() {
    vFacePos = position;

    gl_Position = projectionMatrix * vec4(
      uv + uvOffset, // UV is the actual position on map
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
// if lightmap is displayed in nearest-neighbour mode, default pixel-midpoint
// sampling of rasterizer is kept as is (texel [0,0] is UV [0.5*pixelsize,0.5*pixelsize]),
// otherwise the atlas is shifted by half-texel to make texel [0,0] actually match UV [0,0]
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
  const [inputItems, setInputItems] = useState<AtlasMapItem[] | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);

  useEffect(() => {
    // disposed during scene unmount
    setInputItems(
      lightSceneItemsRef.current
        .filter(({ hasUV2 }) => hasUV2)
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
              itemIndex * MAX_ITEM_FACES + faceIndex + 1 // encode face info in texel
            );
          }

          // @todo dispose of this buffer on unmount/etc? this is already disposed of automatically here
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
  }, []);

  const orthoTarget = useMemo(() => {
    // set up rasterization with no frills
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

      // produce the output
      gl.autoClear = true;
      gl.setRenderTarget(orthoTarget);
      gl.render(orthoScene, orthoCamera);
      gl.setRenderTarget(null);

      gl.readRenderTargetPixels(
        orthoTarget,
        0,
        0,
        widthRef.current,
        heightRef.current,
        orthoData
      );

      setIsComplete(true);

      onComplete({
        width: widthRef.current,
        height: heightRef.current,
        texture: orthoTarget.texture,
        data: orthoData,
        items: inputItems
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
                <primitive attach="geometry" object={geom.faceBuffer} />

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
