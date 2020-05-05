import React, { useRef, useState, useMemo } from 'react';
import { useUpdate, useResource, useFrame } from 'react-three-fiber';
import * as THREE from 'three';

const atlasWidth = 128;
const atlasHeight = 128;

const faceTexW = 0.1;
const faceTexH = 0.1;
const texMargin = 0.025;

const atlasFaceMaxDim = 5;

const facesPerRow = Math.floor(1 / (faceTexW + texMargin));

function computeFaceUV(
  atlasFaceIndex: number,
  faceIndex: number,
  posArray: ArrayLike<number>
) {
  const faceColumn = atlasFaceIndex % facesPerRow;
  const faceRow = Math.floor(atlasFaceIndex / facesPerRow);

  // get face vertex positions
  const facePosStart = faceIndex * 4 * 3;
  const facePosOrigin = facePosStart + 2 * 3;
  const facePosU = facePosStart + 3 * 3;
  const facePosV = facePosStart;

  const ox = posArray[facePosOrigin];
  const oy = posArray[facePosOrigin + 1];
  const oz = posArray[facePosOrigin + 2];

  // compute face dimension
  const dU = new THREE.Vector3(
    posArray[facePosU] - ox,
    posArray[facePosU + 1] - oy,
    posArray[facePosU + 2] - oz
  );

  const dV = new THREE.Vector3(
    posArray[facePosV] - ox,
    posArray[facePosV + 1] - oy,
    posArray[facePosV + 2] - oz
  );

  const dUdim = Math.min(atlasFaceMaxDim, dU.length());
  const dVdim = Math.min(atlasFaceMaxDim, dV.length());

  const left = faceColumn * (faceTexW + texMargin);
  const top = faceRow * (faceTexH + texMargin);
  const right = left + faceTexW * (dUdim / atlasFaceMaxDim);
  const bottom = top + faceTexH * (dVdim / atlasFaceMaxDim);

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

      const v = x % 8 === 0 || y % 8 === 0 ? 0 : 255;
      data[stride] = v;
      data[stride + 1] = v;
      data[stride + 2] = v;
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

      const posAttr = meshBuffer.attributes.position;
      const uvAttr = meshBuffer.attributes.uv;

      const faceCount = posAttr.count / 4;

      for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
        const atlasFaceIndex = atlasInfo.length;
        const { left, top, right, bottom } = computeFaceUV(
          atlasFaceIndex,
          faceIndex,
          posAttr.array
        );

        // default is [0, 1, 1, 1, 0, 0, 1, 0]
        const uvItemBase = faceIndex * 4;
        uvAttr.setXY(uvItemBase, left, bottom);
        uvAttr.setXY(uvItemBase + 1, right, bottom);
        uvAttr.setXY(uvItemBase + 2, left, top);
        uvAttr.setXY(uvItemBase + 3, right, top);

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

  const rtWidth = 32;
  const rtHeight = 32;
  const testTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(rtWidth, rtHeight);
  }, []);

  const testCam = useMemo(() => {
    const rtFov = 90; // full near-180 FOV actually works poorly
    const rtAspect = rtWidth / rtHeight;
    const rtNear = 0.05;
    const rtFar = 10;
    return new THREE.PerspectiveCamera(rtFov, rtAspect, rtNear, rtFar);
  }, []);

  const testBuffer = useMemo(() => {
    return new Uint8Array(rtWidth * rtHeight * 4);
  }, []);

  const probeDebugTexture = useMemo(() => {
    return new THREE.DataTexture(
      testBuffer,
      rtWidth,
      rtHeight,
      THREE.RGBAFormat
    );
  }, []);

  const atlasFaceFillIndexRef = useRef(4); // @todo use 0 start

  useFrame(({ gl, scene }) => {
    // wait until atlas is initialized
    if (atlasInfo.length === 0) {
      return;
    }

    // get current atlas face we are filling up
    const currentAtlasFaceIndex = atlasFaceFillIndexRef.current;
    const atlasFaceInfo = atlasInfo[currentAtlasFaceIndex];

    const { mesh, buffer, faceIndex, left, top, right, bottom } = atlasFaceInfo;
    const faceTexW = (right - left) * atlasWidth;
    const faceTexH = (bottom - top) * atlasHeight;
    const faceTexelCols = Math.ceil(faceTexW);
    const faceTexelRows = Math.ceil(faceTexH);

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
      // @todo start with face 0
      if (atlasFaceFillIndexRef.current === 4) {
        console.log('update stack');
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
    const pU = (atlasTexelX + 0.5 - atlasTexelLeft) / faceTexW;
    const pV = (atlasTexelY + 0.5 - atlasTexelTop) / faceTexH;

    // read vertex position for this face and interpolate along U and V axes
    const posArray = buffer.attributes.position.array;
    const normalArray = buffer.attributes.normal.array;
    const facePosStart = faceIndex * 4 * 3;
    const facePosOrigin = facePosStart + 2 * 3;
    const facePosU = facePosStart + 3 * 3;
    const facePosV = facePosStart;

    const faceNormalStart = faceIndex * 4 * 3;

    const ox = posArray[facePosOrigin];
    const oy = posArray[facePosOrigin + 1];
    const oz = posArray[facePosOrigin + 2];

    const dUx = posArray[facePosU] - ox;
    const dUy = posArray[facePosU + 1] - oy;
    const dUz = posArray[facePosU + 2] - oz;

    const dVx = posArray[facePosV] - ox;
    const dVy = posArray[facePosV + 1] - oy;
    const dVz = posArray[facePosV + 2] - oz;

    // console.log(atlasTexelX, atlasTexelY, pUVx, pUVy, pUVz);

    // set camera to match texel, first in mesh-local space
    const texelPos = new THREE.Vector3(
      ox + dUx * pU + dVx * pV,
      oy + dUy * pU + dVy * pV,
      oz + dUz * pU + dVz * pV
    );

    testCam.position.copy(texelPos);

    texelPos.x += normalArray[faceNormalStart];
    texelPos.y += normalArray[faceNormalStart + 1];
    texelPos.z += normalArray[faceNormalStart + 2];

    const upAngle = Math.random() * Math.PI;
    const upAngleCos = Math.cos(upAngle);
    const upAngleSin = Math.sin(upAngle);

    testCam.up.set(
      dUx * upAngleCos - dVx * upAngleSin,
      dUy * upAngleCos - dVy * upAngleSin,
      dUz * upAngleCos - dVz * upAngleSin
    ); // random rotation (in face plane) @todo normalize axes?

    testCam.lookAt(texelPos);

    // then, transform camera into world space
    testCam.applyMatrix4(mesh.matrixWorld);

    gl.setRenderTarget(testTarget);
    gl.render(lightScene, testCam);
    gl.setRenderTarget(null);

    gl.readRenderTargetPixels(testTarget, 0, 0, rtWidth, rtHeight, testBuffer);
    probeDebugTexture.needsUpdate = true;

    const rtLength = testBuffer.length;
    let r = 0,
      g = 0,
      b = 0;
    for (let i = 0; i < rtLength; i += 4) {
      r += testBuffer[i];
      g += testBuffer[i + 1];
      b += testBuffer[i + 2];
    }

    const pixelCount = rtWidth * rtHeight;
    const ar = Math.round(r / pixelCount);
    const ag = Math.round(g / pixelCount);
    const ab = Math.round(b / pixelCount);

    atlasStack[0].data.set(
      [ar, ag, ab],
      (atlasTexelY * atlasWidth + atlasTexelX) * 3
    );
    atlasStack[0].texture.needsUpdate = true;
  }, 10);

  return {
    atlasInfo,
    lightSceneRef,
    outputTexture: atlasStack[0].texture,
    lightSceneTexture: atlasStack[1].texture,
    probeDebugTexture
  };
}
