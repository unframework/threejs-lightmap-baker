import React, { useRef, useState, useMemo } from 'react';
import {
  useThree,
  useResource,
  useFrame,
  PointerEvent
} from 'react-three-fiber';
import * as THREE from 'three';

import {
  atlasWidth,
  atlasHeight,
  useIrradianceAtlasContext,
  AtlasItem
} from './IrradianceSurfaceManager';

const iterationsPerFrame = 10; // how many texels to fill per frame

const tmpFaceIndexes: [number, number, number, number] = [-1, -1, -1, -1];
const tmpOrigin = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();

const tmpNormal = new THREE.Vector3();
const tmpLookAt = new THREE.Vector3();

const tmpOriginUV = new THREE.Vector2();
const tmpUUV = new THREE.Vector2();
const tmpVUV = new THREE.Vector2();

// @todo cache this info inside atlas item
function fetchFaceIndexes(indexArray: ArrayLike<number>, quadIndex: number) {
  const vBase = quadIndex * 6;

  // pattern is ABD, BCD
  tmpFaceIndexes[0] = indexArray[vBase];
  tmpFaceIndexes[1] = indexArray[vBase + 1];
  tmpFaceIndexes[2] = indexArray[vBase + 4];
  tmpFaceIndexes[3] = indexArray[vBase + 5];
}

function fetchFaceAxes(
  posArray: ArrayLike<number>,
  quadIndexes: [number, number, number, number]
) {
  // get face vertex positions
  const facePosOrigin = quadIndexes[1] * 3;
  const facePosU = quadIndexes[2] * 3;
  const facePosV = quadIndexes[0] * 3;

  tmpOrigin.fromArray(posArray, facePosOrigin);
  tmpU.fromArray(posArray, facePosU);
  tmpV.fromArray(posArray, facePosV);
}

function fetchFaceUVs(
  uvArray: ArrayLike<number>,
  quadIndexes: [number, number, number, number]
) {
  // get face vertex positions
  const offsetOrigin = quadIndexes[1] * 2;
  const offsetU = quadIndexes[2] * 2;
  const offsetV = quadIndexes[0] * 2;

  tmpOriginUV.fromArray(uvArray, offsetOrigin);
  tmpUUV.fromArray(uvArray, offsetU);
  tmpVUV.fromArray(uvArray, offsetV);
}

function createAtlasTexture(
  atlasWidth: number,
  atlasHeight: number,
  fillWithPattern?: boolean
) {
  const atlasSize = atlasWidth * atlasHeight;
  const data = new Float32Array(3 * atlasSize);

  if (fillWithPattern) {
    // pre-fill with a test pattern
    for (let i = 0; i < atlasSize; i++) {
      const x = i % atlasWidth;
      const y = Math.floor(i / atlasWidth);

      const stride = i * 3;

      const tileX = Math.floor(x / 4);
      const tileY = Math.floor(y / 4);

      const on = tileX % 2 === tileY % 2;

      data[stride] = on ? 0.2 : 0.8;
      data[stride + 1] = 0.5;
      data[stride + 2] = on ? 0.8 : 0.2;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    atlasWidth,
    atlasHeight,
    THREE.RGBFormat,
    THREE.FloatType
  );

  return { data, texture };
}

function setUpProbeUp(
  probeCam: THREE.Camera,
  mesh: THREE.Mesh,
  origin: THREE.Vector3,
  normal: THREE.Vector3,
  uDir: THREE.Vector3
) {
  probeCam.position.copy(origin);

  // align "up" to be along U-axis of face (for convenience)
  probeCam.up.copy(uDir);

  // add normal to accumulator and look at it
  tmpLookAt.copy(normal);
  tmpLookAt.add(origin);

  probeCam.lookAt(tmpLookAt);
  probeCam.scale.set(1, 1, 1);

  // then, transform camera into world space
  probeCam.applyMatrix4(mesh.matrixWorld);
}

function setUpProbeSide(
  probeCam: THREE.Camera,
  mesh: THREE.Mesh,
  origin: THREE.Vector3,
  normal: THREE.Vector3,
  direction: THREE.Vector3,
  directionSign: number
) {
  probeCam.position.copy(tmpOrigin);

  // up is the normal
  probeCam.up.copy(normal);

  // add normal to accumulator and look at it
  tmpLookAt.copy(tmpOrigin);
  tmpLookAt.addScaledVector(direction, directionSign);

  probeCam.lookAt(tmpLookAt);
  probeCam.scale.set(1, 1, 1);

  // then, transform camera into world space
  probeCam.applyMatrix4(mesh.matrixWorld);
}

function useLightProbe(probeTargetSize: number) {
  const probePixelCount = probeTargetSize * probeTargetSize;
  const probeTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(probeTargetSize, probeTargetSize, {
      type: THREE.FloatType
    });
  }, []);

  const probeCam = useMemo(() => {
    const rtFov = 90; // view cone must be quarter of the hemisphere
    const rtAspect = 1; // square render target
    const rtNear = 0.05;
    const rtFar = 50;
    return new THREE.PerspectiveCamera(rtFov, rtAspect, rtNear, rtFar);
  }, []);

  const probeData = useMemo(() => {
    return new Float32Array(probeTargetSize * probeTargetSize * 4);
  }, []);

  function renderLightProbe(
    gl: THREE.WebGLRenderer,
    atlasFaceInfo: AtlasItem,
    faceTexelX: number,
    faceTexelY: number,
    lightScene: THREE.Scene,
    handleProbeData: (
      rgbaData: Float32Array,
      pixelStart: number,
      pixelCount: number
    ) => void
  ) {
    const { mesh, buffer, quadIndex, sizeU, sizeV } = atlasFaceInfo;

    const texelSizeU = sizeU * atlasWidth;
    const texelSizeV = sizeV * atlasHeight;

    // compute rounded texel's U and V position within face
    // (biasing to be in middle of texel physical square)
    const pU = (faceTexelX + 0.5) / texelSizeU;
    const pV = (faceTexelY + 0.5) / texelSizeV;

    // read vertex position for this face and interpolate along U and V axes
    if (!buffer.index) {
      throw new Error('no indexes');
    }
    const indexes = buffer.index.array;
    const posArray = buffer.attributes.position.array;
    const normalArray = buffer.attributes.normal.array;

    // get face vertex positions
    fetchFaceIndexes(indexes, quadIndex);
    fetchFaceAxes(posArray, tmpFaceIndexes);

    // compute face dimensions
    tmpU.sub(tmpOrigin);
    tmpV.sub(tmpOrigin);

    // set camera to match texel, first in mesh-local space
    tmpOrigin.addScaledVector(tmpU, pU);
    tmpOrigin.addScaledVector(tmpV, pV);

    tmpNormal.fromArray(normalArray, tmpFaceIndexes[0] * 3);

    gl.setRenderTarget(probeTarget);

    setUpProbeUp(probeCam, mesh, tmpOrigin, tmpNormal, tmpU);
    gl.render(lightScene, probeCam);
    gl.readRenderTargetPixels(
      probeTarget,
      0,
      0,
      probeTargetSize,
      probeTargetSize,
      probeData
    );
    handleProbeData(probeData, 0, probePixelCount);

    setUpProbeSide(probeCam, mesh, tmpOrigin, tmpNormal, tmpU, 1);
    gl.render(lightScene, probeCam);
    gl.readRenderTargetPixels(
      probeTarget,
      0,
      0,
      probeTargetSize,
      probeTargetSize,
      probeData
    );
    handleProbeData(probeData, probePixelCount / 2, probePixelCount / 2);

    setUpProbeSide(probeCam, mesh, tmpOrigin, tmpNormal, tmpU, -1);
    gl.render(lightScene, probeCam);
    gl.readRenderTargetPixels(
      probeTarget,
      0,
      0,
      probeTargetSize,
      probeTargetSize,
      probeData
    );
    handleProbeData(probeData, probePixelCount / 2, probePixelCount / 2);

    setUpProbeSide(probeCam, mesh, tmpOrigin, tmpNormal, tmpV, 1);
    gl.render(lightScene, probeCam);
    gl.readRenderTargetPixels(
      probeTarget,
      0,
      0,
      probeTargetSize,
      probeTargetSize,
      probeData
    );
    handleProbeData(probeData, probePixelCount / 2, probePixelCount / 2);

    setUpProbeSide(probeCam, mesh, tmpOrigin, tmpNormal, tmpV, -1);
    gl.render(lightScene, probeCam);
    gl.readRenderTargetPixels(
      probeTarget,
      0,
      0,
      probeTargetSize,
      probeTargetSize,
      probeData
    );
    handleProbeData(probeData, probePixelCount / 2, probePixelCount / 2);

    gl.setRenderTarget(null);
  }

  return renderLightProbe;
}

// @todo split into atlas setup and texel probe sweep render loop
export function useIrradianceRenderer(): {
  outputTexture: THREE.Texture;
  lightSceneRef: React.MutableRefObject<THREE.Scene>;
  lightSceneTexture: THREE.Texture;
  handleDebugClick: (event: PointerEvent) => void;
  probeDebugTextures: THREE.Texture[];
} {
  const atlasInfo = useIrradianceAtlasContext();

  const [lightSceneRef, lightScene] = useResource<THREE.Scene>();

  const [atlasStack, setAtlasStack] = useState(() => [
    createAtlasTexture(atlasWidth, atlasHeight, true),
    createAtlasTexture(atlasWidth, atlasHeight)
  ]);

  const probeTargetSize = 16;
  const renderLightProbe = useLightProbe(probeTargetSize);

  const probeDebugDataList = useMemo(() => {
    return [
      new Uint8Array(probeTargetSize * probeTargetSize * 4),
      new Uint8Array(probeTargetSize * probeTargetSize * 4),
      new Uint8Array(probeTargetSize * probeTargetSize * 4),
      new Uint8Array(probeTargetSize * probeTargetSize * 4),
      new Uint8Array(probeTargetSize * probeTargetSize * 4)
    ];
  }, []);

  const probeDebugTextures = useMemo(() => {
    return probeDebugDataList.map(
      (data) =>
        new THREE.DataTexture(
          data,
          probeTargetSize,
          probeTargetSize,
          THREE.RGBAFormat
        )
    );
  }, [probeDebugDataList]);

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

      const { left, top, sizeU, sizeV } = atlasFaceInfo;

      const texelSizeU = sizeU * atlasWidth;
      const texelSizeV = sizeV * atlasHeight;

      const faceTexelCols = Math.ceil(texelSizeU);
      const faceTexelRows = Math.ceil(texelSizeV);

      // relative integer texel offset from face origin inside texture data
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

      // render the probe viewports and collect pixel aggregate
      let r = 0,
        g = 0,
        b = 0,
        totalDivider = 0;

      renderLightProbe(
        gl,
        atlasFaceInfo,
        faceTexelX,
        faceTexelY,
        lightScene,
        (probeData, pixelStart, pixelCount) => {
          const dataMax = (pixelStart + pixelCount) * 4;

          for (let i = pixelStart * 4; i < dataMax; i += 4) {
            // compute offset from center (with a bias for target pixel size)
            const px = i / 4;
            const pdx = (px % probeTargetSize) + 0.5;
            const pyx = Math.floor(px / probeTargetSize) + 0.5;
            const dx = Math.abs(pdx / probeTargetSize - 0.5);
            const dy = Math.abs(pyx / probeTargetSize - 0.5);

            // compute multiplier as affected by inclination of corresponding ray
            const span = Math.hypot(dx * 2, dy * 2);
            const hypo = Math.hypot(span, 1);
            const area = 1 / hypo;

            r += area * probeData[i];
            g += area * probeData[i + 1];
            b += area * probeData[i + 2];

            totalDivider += area;
          }
        }
      );

      const rgb = [r / totalDivider, g / totalDivider, b / totalDivider];

      // find texel inside atlas, as rounded to texel boundary
      const atlasTexelLeft = Math.floor(left * atlasWidth);
      const atlasTexelTop = Math.floor(top * atlasWidth);
      const atlasTexelX = atlasTexelLeft + faceTexelX;
      const atlasTexelY = atlasTexelTop + faceTexelY;

      // store computed illumination value
      const atlasTexelBase = atlasTexelY * atlasWidth + atlasTexelX;
      atlasStack[0].data.set(rgb, atlasTexelBase * 3);

      // propagate texel value to seam bleed offset area if needed
      if (faceTexelX === 0) {
        atlasStack[0].data.set(rgb, (atlasTexelBase - 1) * 3);
      }

      if (faceTexelY === 0) {
        atlasStack[0].data.set(rgb, (atlasTexelBase - atlasWidth) * 3);
      }

      if (faceTexelX === 0 && faceTexelY === 0) {
        atlasStack[0].data.set(rgb, (atlasTexelBase - atlasWidth - 1) * 3);
      }

      atlasStack[0].texture.needsUpdate = true;
    }

    for (let iteration = 0; iteration < iterationsPerFrame; iteration += 1) {
      iterate();
    }
  }, 10);

  const { gl } = useThree();

  function handleDebugClick(event: PointerEvent) {
    const quadIndex = Math.floor(event.faceIndex / 2);
    const itemIndex = atlasInfo.findIndex(
      (item) => item.mesh === event.object && item.quadIndex === quadIndex
    );

    if (itemIndex === -1) {
      return;
    }

    const item = atlasInfo[itemIndex];
    const { mesh, buffer, left, top } = item;

    if (!buffer.index) {
      return;
    }

    // get atlas texture UV (not precomputed by Three since it is in custom attribute)
    fetchFaceIndexes(buffer.index.array, quadIndex);

    fetchFaceAxes(buffer.attributes.position.array, tmpFaceIndexes);
    tmpOrigin.applyMatrix4(mesh.matrixWorld);
    tmpU.applyMatrix4(mesh.matrixWorld);
    tmpV.applyMatrix4(mesh.matrixWorld);

    fetchFaceUVs(buffer.attributes.lumUV.array, tmpFaceIndexes);

    const clickAtlasUV = new THREE.Vector2();
    THREE.Triangle.getUV(
      event.point,
      tmpOrigin,
      tmpU,
      tmpV,
      tmpOriginUV,
      tmpUUV,
      tmpVUV,
      clickAtlasUV
    );

    // find integer texel offset inside atlas item
    const atlasTexelLeft = Math.floor(left * atlasWidth);
    const atlasTexelTop = Math.floor(top * atlasWidth);

    const faceTexelX = Math.floor(clickAtlasUV.x * atlasWidth - atlasTexelLeft);
    const faceTexelY = Math.floor(clickAtlasUV.y * atlasHeight - atlasTexelTop);

    console.log(
      'probing item',
      itemIndex,
      '@',
      quadIndex,
      faceTexelX,
      faceTexelY
    );

    let debugIndex = 0;
    renderLightProbe(
      gl,
      item,
      faceTexelX,
      faceTexelY,
      lightScene,
      (probeData, pixelStart, pixelCount) => {
        // copy viewport data and mark debug texture for copying
        const probeDebugData = probeDebugDataList[debugIndex];
        const probeDebugTexture = probeDebugTextures[debugIndex];

        for (let i = 0; i < probeData.length; i += 4) {
          // compute offset from center (with a bias for target pixel size)
          const px = i / 4;
          const pdx = (px % probeTargetSize) + 0.5;
          const pyx = Math.floor(px / probeTargetSize) + 0.5;
          const dx = Math.abs(pdx / probeTargetSize - 0.5);
          const dy = Math.abs(pyx / probeTargetSize - 0.5);

          // compute multiplier as affected by inclination of corresponding ray
          const span = Math.hypot(dx * 2, dy * 2);
          const hypo = Math.hypot(span, 1);
          const area = 1 / hypo;

          probeDebugData[i] = area * Math.min(255, 255 * probeData[i]);
          probeDebugData[i + 1] = area * Math.min(255, 255 * probeData[i + 1]);
          probeDebugData[i + 2] = area * Math.min(255, 255 * probeData[i + 2]);
          probeDebugData[i + 3] = 255;
        }

        probeDebugTexture.needsUpdate = true;

        debugIndex += 1;
      }
    );
  }

  return {
    lightSceneRef,
    outputTexture: atlasStack[0].texture,
    lightSceneTexture: atlasStack[1].texture,
    handleDebugClick,
    probeDebugTextures
  };
}
