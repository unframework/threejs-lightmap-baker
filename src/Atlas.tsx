import React, { useRef, useState, useMemo } from 'react';
import { useUpdate, useResource, useFrame } from 'react-three-fiber';
import * as THREE from 'three';

const iterationsPerFrame = 10; // how many texels to fill per frame

const atlasWidth = 128;
const atlasHeight = 128;

const itemSizeU = 0.1;
const itemSizeV = 0.1;
const itemUVMargin = 0.025;

// maximum physical dimension of a stored item's face
const atlasItemMaxDim = 5;

const itemsPerRow = Math.floor(1 / (itemSizeU + itemUVMargin));

const tmpFaceIndexes: [number, number, number, number] = [-1, -1, -1, -1];
const tmpOrigin = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();

function fetchFaceIndexes(indexArray: ArrayLike<number>, faceIndex: number) {
  const vBase = faceIndex * 6;

  // pattern is ABD, BCD
  tmpFaceIndexes[0] = indexArray[vBase];
  tmpFaceIndexes[1] = indexArray[vBase + 1];
  tmpFaceIndexes[2] = indexArray[vBase + 4];
  tmpFaceIndexes[3] = indexArray[vBase + 5];
}

function fetchFaceUV(
  posArray: ArrayLike<number>,
  faceIndexes: [number, number, number, number]
) {
  // get face vertex positions
  const facePosOrigin = faceIndexes[1] * 3;
  const facePosU = faceIndexes[2] * 3;
  const facePosV = faceIndexes[0] * 3;

  tmpOrigin.fromArray(posArray, facePosOrigin);
  tmpU.fromArray(posArray, facePosU);
  tmpV.fromArray(posArray, facePosV);
}

function computeFaceUV(
  atlasFaceIndex: number,
  posArray: ArrayLike<number>,
  faceIndexes: ArrayLike<number>
) {
  const itemColumn = atlasFaceIndex % itemsPerRow;
  const itemRow = Math.floor(atlasFaceIndex / itemsPerRow);

  // get face vertex positions
  fetchFaceUV(posArray, tmpFaceIndexes);

  // compute face dimensions
  tmpU.sub(tmpOrigin);
  tmpV.sub(tmpOrigin);

  const dUdim = Math.min(atlasItemMaxDim, tmpU.length());
  const dVdim = Math.min(atlasItemMaxDim, tmpV.length());

  const left = itemColumn * (itemSizeU + itemUVMargin);
  const top = itemRow * (itemSizeV + itemUVMargin);
  const right = left + itemSizeU * (dUdim / atlasItemMaxDim);
  const bottom = top + itemSizeV * (dVdim / atlasItemMaxDim);

  return { left, top, right, bottom };
}

function createAtlasTexture(
  atlasWidth: number,
  atlasHeight: number,
  fillWithPattern?: boolean
) {
  const atlasSize = atlasWidth * atlasHeight;
  const data = new Uint8Array(3 * atlasSize);

  if (fillWithPattern) {
    // pre-fill with a test pattern
    for (let i = 0; i < atlasSize; i++) {
      const x = i % atlasWidth;
      const y = Math.floor(i / atlasWidth);

      const stride = i * 3;

      const tileX = Math.floor(x / 4);
      const tileY = Math.floor(y / 4);

      const on = tileX % 2 === tileY % 2;

      data[stride] = on ? 40 : 240;
      data[stride + 1] = 128;
      data[stride + 2] = on ? 240 : 40;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    atlasWidth,
    atlasHeight,
    THREE.RGBFormat
  );

  return { data, texture };
}

export interface AtlasItem {
  mesh: THREE.Mesh;
  buffer: THREE.BufferGeometry;
  faceIndex: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  pixelFillCount: number;
}

export function useMeshWithAtlas(
  atlasInfo: AtlasItem[],
  meshBuffer: THREE.BufferGeometry | undefined
) {
  const meshRef = useUpdate<THREE.Mesh>(
    (mesh) => {
      // wait until geometry buffer is initialized
      if (!meshBuffer) {
        return;
      }

      if (!meshBuffer.index) {
        throw new Error('expecting indexed mesh buffer');
      }

      const indexes = meshBuffer.index.array;
      const posAttr = meshBuffer.attributes.position;
      const uvAttr = meshBuffer.attributes.uv;

      const faceCount = Math.floor(indexes.length / 6); // assuming quads, 2x tris each

      for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
        const atlasFaceIndex = atlasInfo.length;

        fetchFaceIndexes(indexes, faceIndex);
        const { left, top, right, bottom } = computeFaceUV(
          atlasFaceIndex,
          posAttr.array,
          tmpFaceIndexes
        );

        uvAttr.setXY(tmpFaceIndexes[0], left, bottom);
        uvAttr.setXY(tmpFaceIndexes[1], left, top);
        uvAttr.setXY(tmpFaceIndexes[2], right, top);
        uvAttr.setXY(tmpFaceIndexes[3], right, bottom);

        atlasInfo.push({
          mesh: mesh,
          buffer: meshBuffer,
          faceIndex,
          left,
          top,
          right,
          bottom,
          pixelFillCount: 0
        });
      }
    },
    [meshBuffer]
  );

  return meshRef;
}

export function useAtlas(): {
  atlasInfo: AtlasItem[];
  outputTexture: THREE.Texture;
  lightSceneRef: React.MutableRefObject<THREE.Scene>;
  lightSceneTexture: THREE.Texture;
  probeDebugTexture: THREE.Texture;
} {
  const [lightSceneRef, lightScene] = useResource<THREE.Scene>();

  const [atlasStack, setAtlasStack] = useState(() => [
    createAtlasTexture(atlasWidth, atlasHeight, true),
    createAtlasTexture(atlasWidth, atlasHeight)
  ]);

  const atlasInfo: AtlasItem[] = useMemo(() => [], []);

  const probeTargetSize = 32;
  const probeTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(probeTargetSize, probeTargetSize);
  }, []);

  const probeCam = useMemo(() => {
    const rtFov = 90; // full near-180 FOV actually works poorly
    const rtAspect = 1; // square render target
    const rtNear = 0.05;
    const rtFar = 50;
    return new THREE.PerspectiveCamera(rtFov, rtAspect, rtNear, rtFar);
  }, []);

  const probeData = useMemo(() => {
    return new Uint8Array(probeTargetSize * probeTargetSize * 4);
  }, []);

  const probeDebugTexture = useMemo(() => {
    return new THREE.DataTexture(
      probeData,
      probeTargetSize,
      probeTargetSize,
      THREE.RGBAFormat
    );
  }, [probeData]);

  const atlasFaceFillIndexRef = useRef(0);

  useFrame(({ gl, scene }) => {
    // wait until atlas is initialized
    if (atlasInfo.length === 0) {
      return;
    }

    function iterate() {
      // get current atlas face we are filling up
      const currentAtlasFaceIndex = atlasFaceFillIndexRef.current;
      const atlasFaceInfo = atlasInfo[currentAtlasFaceIndex];

      const {
        mesh,
        buffer,
        faceIndex,
        left,
        top,
        right,
        bottom
      } = atlasFaceInfo;
      const itemSizeU = (right - left) * atlasWidth;
      const itemSizeV = (bottom - top) * atlasHeight;
      const faceTexelCols = Math.ceil(itemSizeU);
      const faceTexelRows = Math.ceil(itemSizeV);

      // even texel offset from face origin inside texture data
      const fillCount = atlasFaceInfo.pixelFillCount;

      const faceTexelX = fillCount % faceTexelCols;
      const faceTexelY = Math.floor(fillCount / faceTexelCols);

      atlasFaceInfo.pixelFillCount =
        (fillCount + 1) % (faceTexelRows * faceTexelCols);

      // tick up face index when this one is done
      if (atlasFaceInfo.pixelFillCount === 0) {
        atlasFaceFillIndexRef.current =
          (currentAtlasFaceIndex + 1) % atlasInfo.length;

        // tick up atlas texture stack once all faces are done
        if (atlasFaceFillIndexRef.current === 0) {
          setAtlasStack((prev) => {
            // promote items up one level, taking last one to be the new first one
            const last = prev[prev.length - 1];
            return [last, ...prev.slice(0, -1)];
          });
        }
      }

      // find texel inside atlas, as rounded to texel boundary
      const atlasTexelLeft = left * atlasWidth;
      const atlasTexelTop = top * atlasWidth;
      const atlasTexelX = Math.floor(atlasTexelLeft) + faceTexelX;
      const atlasTexelY = Math.floor(atlasTexelTop) + faceTexelY;

      // compute rounded texel's U and V position within face
      // (biasing to be in middle of texel physical square)
      const pU = (atlasTexelX + 0.5 - atlasTexelLeft) / itemSizeU;
      const pV = (atlasTexelY + 0.5 - atlasTexelTop) / itemSizeV;

      // read vertex position for this face and interpolate along U and V axes
      if (!buffer.index) {
        throw new Error('no indexes');
      }
      const indexes = buffer.index.array;
      const posArray = buffer.attributes.position.array;
      const normalArray = buffer.attributes.normal.array;

      // get face vertex positions
      fetchFaceIndexes(indexes, faceIndex);
      fetchFaceUV(posArray, tmpFaceIndexes);

      // compute face dimensions
      tmpU.sub(tmpOrigin);
      tmpV.sub(tmpOrigin);

      // set camera to match texel, first in mesh-local space
      tmpOrigin.addScaledVector(tmpU, pU);
      tmpOrigin.addScaledVector(tmpV, pV);

      probeCam.position.copy(tmpOrigin);

      // random rotation (in face plane) @todo normalize axes?
      const upAngle = Math.random() * Math.PI;
      const upAngleCos = Math.cos(upAngle);
      const upAngleSin = Math.sin(upAngle);

      probeCam.up.set(0, 0, 0);
      probeCam.up.addScaledVector(tmpU, upAngleCos);
      probeCam.up.addScaledVector(tmpV, -upAngleSin);

      // add normal to accumulator and look at it
      const faceNormalStart = tmpFaceIndexes[0] * 3;
      tmpOrigin.x += normalArray[faceNormalStart];
      tmpOrigin.y += normalArray[faceNormalStart + 1];
      tmpOrigin.z += normalArray[faceNormalStart + 2];

      probeCam.lookAt(tmpOrigin);

      // then, transform camera into world space
      probeCam.applyMatrix4(mesh.matrixWorld);

      gl.setRenderTarget(probeTarget);
      gl.render(lightScene, probeCam);
      gl.setRenderTarget(null);

      gl.readRenderTargetPixels(
        probeTarget,
        0,
        0,
        probeTargetSize,
        probeTargetSize,
        probeData
      );

      // mark debug texture for copying
      probeDebugTexture.needsUpdate = true;

      const probeDataLength = probeData.length;
      let r = 0,
        g = 0,
        b = 0;
      for (let i = 0; i < probeDataLength; i += 4) {
        r += probeData[i];
        g += probeData[i + 1];
        b += probeData[i + 2];
      }

      const pixelCount = probeTargetSize * probeTargetSize;
      const ar = Math.round(r / pixelCount);
      const ag = Math.round(g / pixelCount);
      const ab = Math.round(b / pixelCount);

      atlasStack[0].data.set(
        [ar, ag, ab],
        (atlasTexelY * atlasWidth + atlasTexelX) * 3
      );
      atlasStack[0].texture.needsUpdate = true;
    }

    for (let iteration = 0; iteration < iterationsPerFrame; iteration += 1) {
      iterate();
    }
  }, 10);

  return {
    atlasInfo,
    lightSceneRef,
    outputTexture: atlasStack[0].texture,
    lightSceneTexture: atlasStack[1].texture,
    probeDebugTexture
  };
}
