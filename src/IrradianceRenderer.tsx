import React, {
  useLayoutEffect,
  useState,
  useMemo,
  useCallback,
  useRef
} from 'react';
import { useThree, useFrame, PointerEvent } from 'react-three-fiber';
import * as THREE from 'three';

import {
  atlasWidth,
  atlasHeight,
  useIrradianceAtlasContext,
  Atlas,
  AtlasQuad
} from './IrradianceSurfaceManager';

const MAX_PASSES = 2;
const EMISSIVE_MULTIPLIER = 32; // global conversion of display -> physical emissiveness

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

export interface IrradianceFactorStaging {
  factorName: string | null;
}

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

function getLightProbeSceneElement(
  atlas: Atlas,
  lastTexture: THREE.Texture,
  activeFactorName: string | null,
  sceneRef: React.MutableRefObject<THREE.Scene | undefined>
) {
  const { lightSceneItems, lightSceneLights } = atlas;

  return (
    // ensure the scene is completely re-rendered if it changes
    <scene key={`light-scene-${Math.random()}`} ref={sceneRef}>
      {lightSceneLights.map(({ dirLight, factorName }) => {
        if (factorName !== activeFactorName) {
          return null;
        }

        const cloneLight = new THREE.DirectionalLight();
        const cloneTarget = new THREE.Object3D();

        // apply world transform (we don't bother re-creating scene hierarchy)
        cloneLight.position.copy(dirLight.position);
        cloneLight.applyMatrix4(dirLight.matrixWorld);

        cloneTarget.position.copy(dirLight.target.position);
        cloneTarget.applyMatrix4(dirLight.target.matrixWorld);

        // @todo assert that original light casts shadows, etc
        return (
          <React.Fragment key={dirLight.uuid}>
            <primitive object={cloneTarget} />

            <primitive
              object={cloneLight}
              color={dirLight.color}
              intensity={dirLight.intensity}
              target={cloneTarget}
              castShadow
            >
              <directionalLightShadow
                attach="shadow"
                camera-left={dirLight.shadow.camera.left}
                camera-right={dirLight.shadow.camera.right}
                camera-top={dirLight.shadow.camera.top}
                camera-bottom={dirLight.shadow.camera.bottom}
              />
            </primitive>
          </React.Fragment>
        );
      })}

      {lightSceneItems.map((item, itemIndex) => {
        const {
          mesh,
          buffer,
          albedo,
          albedoMap,
          emissive,
          emissiveIntensity,
          emissiveMap,
          factorName
        } = item;

        // new mesh instance reusing existing geometry object directly, while material is set later
        const cloneMesh = new THREE.Mesh(buffer);

        // apply world transform (we don't bother re-creating scene hierarchy)
        // @todo still need to copy position
        cloneMesh.applyMatrix4(mesh.matrixWorld);

        // remove emissive effect if active factor does not match
        const activeEmissiveIntensity =
          factorName === activeFactorName ? emissiveIntensity : 0;

        // let the object be auto-disposed of
        // @todo properly clone shadow props
        return (
          <primitive
            object={cloneMesh}
            key={itemIndex}
            castShadow
            receiveShadow
          >
            <meshLambertMaterial
              attach="material"
              color={albedo}
              map={albedoMap}
              emissive={emissive}
              emissiveMap={emissiveMap}
              emissiveIntensity={
                // apply physics multiplier to any display emissive quantity
                // (emission needs to be strong for bounces to work, but that would wash out colours
                // if output directly from visible scene's shader)
                EMISSIVE_MULTIPLIER * activeEmissiveIntensity
              }
              lightMap={lastTexture}
              toneMapped={false} // must output in raw linear space
            />
          </primitive>
        );
      })}
    </scene>
  );
}

function createAtlasTexture(
  atlasWidth: number,
  atlasHeight: number,
  fillWithPattern?: boolean
): [THREE.Texture, Float32Array] {
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

  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  return [texture, data];
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
    atlasFaceInfo: AtlasQuad,
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

export function useIrradianceRenderer(
  factorName: string | null
): {
  outputIsComplete: boolean;
  outputTexture: THREE.Texture;
  lightSceneElement: React.ReactElement | null;
  handleDebugClick: (event: PointerEvent) => void;
  probeDebugTextures: THREE.Texture[];
} {
  const atlas = useIrradianceAtlasContext();

  // light scene lifecycle is fully managed internally
  const lightSceneRef = useRef<THREE.Scene>();

  const createDefaultState = useCallback((activeFactorName: string | null): {
    activeFactorName: string | null;
    activeOutput: THREE.DataTexture;
    activeOutputData: Float32Array;
    activeItemCounter: [number, number];
    lightSceneElement: React.ReactElement | null; // non-null triggers processing
    passes: number;
  } => {
    const [initialTexture, initialData] = createAtlasTexture(
      atlasWidth,
      atlasHeight
    );

    return {
      activeFactorName,
      activeOutput: initialTexture,
      activeOutputData: initialData,
      activeItemCounter: [0, 0], // directly changed in place to avoid re-renders
      lightSceneElement: null,
      passes: 0
    };
  }, []);

  const [
    {
      activeOutput,
      activeOutputData,
      activeItemCounter,
      lightSceneElement,
      passes
    },
    setProcessingState
  ] = useState(() => createDefaultState(factorName));

  // automatically kick off new processing when ready
  useLayoutEffect(() => {
    if (!lightSceneElement && passes < MAX_PASSES) {
      // wait for scene to populate @todo fix this
      setTimeout(() => {
        setProcessingState((prev) => {
          const [nextTexture, nextData] = createAtlasTexture(
            atlasWidth,
            atlasHeight,
            prev.activeFactorName === null // test pattern only on base
          );

          return {
            ...prev,
            activeOutput: nextTexture,
            activeOutputData: nextData,
            activeItemCounter: [0, 0],
            lightSceneElement: getLightProbeSceneElement(
              atlas,
              prev.activeOutput,
              prev.activeFactorName,
              lightSceneRef
            )
          };
        });
      }, 0);
    }
  }, [atlas, lightSceneElement, passes]);

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

  useFrame(({ gl }) => {
    // ensure light scene has been instantiated
    if (!lightSceneRef.current) {
      return;
    }

    const lightScene = lightSceneRef.current; // local var for type safety
    const { quads } = atlas;

    function computeTexel(
      atlasFaceInfo: AtlasQuad,
      faceTexelX: number,
      faceTexelY: number,
      faceTexelCols: number,
      faceTexelRows: number,
      atlasTexelLeft: number,
      atlasTexelTop: number
    ) {
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
      const atlasTexelX = atlasTexelLeft + faceTexelX;
      const atlasTexelY = atlasTexelTop + faceTexelY;

      // store computed illumination value
      const atlasTexelBase = atlasTexelY * atlasWidth + atlasTexelX;
      activeOutputData.set(rgb, atlasTexelBase * 3);

      // propagate texel value to seam bleed offset area if needed
      if (faceTexelX === 0) {
        activeOutputData.set(rgb, (atlasTexelBase - 1) * 3);
      } else if (faceTexelX === faceTexelCols - 1) {
        activeOutputData.set(rgb, (atlasTexelBase + 1) * 3);
      }

      if (faceTexelY === 0) {
        activeOutputData.set(rgb, (atlasTexelBase - atlasWidth) * 3);
      } else if (faceTexelY === faceTexelRows - 1) {
        activeOutputData.set(rgb, (atlasTexelBase + atlasWidth) * 3);
      }

      if (faceTexelX === 0) {
        if (faceTexelY === 0) {
          activeOutputData.set(rgb, (atlasTexelBase - atlasWidth - 1) * 3);
        } else if (faceTexelY === faceTexelRows - 1) {
          activeOutputData.set(rgb, (atlasTexelBase + atlasWidth - 1) * 3);
        }
      } else if (faceTexelX === faceTexelCols - 1) {
        if (faceTexelY === 0) {
          activeOutputData.set(rgb, (atlasTexelBase - atlasWidth + 1) * 3);
        } else if (faceTexelY === faceTexelRows - 1) {
          activeOutputData.set(rgb, (atlasTexelBase + atlasWidth + 1) * 3);
        }
      }

      activeOutput.needsUpdate = true;
    }

    for (let iteration = 0; iteration < iterationsPerFrame; iteration += 1) {
      const [currentItemIndex, fillCount] = activeItemCounter;

      // get current atlas face we are filling up
      const atlasFaceInfo = quads[currentItemIndex];

      const { left, top, sizeU, sizeV } = atlasFaceInfo;

      const texelSizeU = sizeU * atlasWidth;
      const texelSizeV = sizeV * atlasHeight;

      const faceTexelCols = Math.ceil(texelSizeU);
      const faceTexelRows = Math.ceil(texelSizeV);

      // relative integer texel offset from face origin inside texture data
      const faceTexelX = fillCount % faceTexelCols;
      const faceTexelY = Math.floor(fillCount / faceTexelCols);

      const atlasTexelLeft = Math.floor(left * atlasWidth);
      const atlasTexelTop = Math.floor(top * atlasWidth);

      computeTexel(
        atlasFaceInfo,
        faceTexelX,
        faceTexelY,
        faceTexelCols,
        faceTexelRows,
        atlasTexelLeft,
        atlasTexelTop
      );

      if (fillCount < faceTexelRows * faceTexelCols - 1) {
        // tick up face index when this one is done
        activeItemCounter[1] = fillCount + 1;
      } else if (currentItemIndex < quads.length - 1) {
        activeItemCounter[0] = currentItemIndex + 1;
        activeItemCounter[1] = 0;
      } else {
        // mark state as completed once all faces are done
        setProcessingState((prev) => {
          return {
            ...prev,
            lightSceneElement: null,
            passes: prev.passes + 1
          };
        });

        // exit current iteration loop
        break;
      }
    }
  }, 10);

  const { gl } = useThree();

  function handleDebugClick(event: PointerEvent) {
    const { quads } = atlas;

    const quadIndex = Math.floor(event.faceIndex / 2);
    const itemIndex = quads.findIndex(
      (item) => item.mesh === event.object && item.quadIndex === quadIndex
    );

    if (itemIndex === -1) {
      return;
    }

    const item = quads[itemIndex];
    const { mesh, buffer, left, top } = item;

    if (!buffer.index) {
      return;
    }

    const lightScene = lightSceneRef.current;

    if (!lightScene) {
      return;
    }

    // get atlas texture UV (not precomputed by Three since it is in custom attribute)
    fetchFaceIndexes(buffer.index.array, quadIndex);

    fetchFaceAxes(buffer.attributes.position.array, tmpFaceIndexes);
    tmpOrigin.applyMatrix4(mesh.matrixWorld);
    tmpU.applyMatrix4(mesh.matrixWorld);
    tmpV.applyMatrix4(mesh.matrixWorld);

    fetchFaceUVs(buffer.attributes.uv2.array, tmpFaceIndexes);

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
    outputIsComplete: passes >= MAX_PASSES,
    outputTexture: activeOutput,
    lightSceneElement,
    handleDebugClick,
    probeDebugTextures
  };
}
