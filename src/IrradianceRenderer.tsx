import React, {
  useLayoutEffect,
  useState,
  useMemo,
  useCallback,
  useContext,
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
import { WorkManagerContext } from './WorkManager';

const MAX_PASSES = 0;
const EMISSIVE_MULTIPLIER = 32; // global conversion of display -> physical emissiveness

const tmpFaceIndexes: [number, number, number, number] = [-1, -1, -1, -1];
const tmpOrigin = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();

const tmpNormal = new THREE.Vector3();
const tmpLookAt = new THREE.Vector3();

const tmpOriginUV = new THREE.Vector2();
const tmpUUV = new THREE.Vector2();
const tmpVUV = new THREE.Vector2();

export interface IrradianceStagingTimelineMesh {
  uuid: string;
  clip: THREE.AnimationClip;
}

export interface IrradianceStagingTimeline {
  factorName: string | null;
  time: number;
  meshes: IrradianceStagingTimelineMesh[];
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
  animationTime: number
) {
  const { lightSceneItems, lightSceneLights } = atlas;

  return (
    <scene
      key={`light-scene-${Math.random()}`} // ensure scene is fully re-created
    >
      {lightSceneLights.map(({ dirLight, factorName }) => {
        if (factorName !== activeFactorName) {
          return null;
        }

        const cloneLight = new THREE.DirectionalLight();
        const cloneTarget = new THREE.Object3D();

        // apply world transform (we don't bother re-creating scene hierarchy)
        cloneLight.matrix.copy(dirLight.matrixWorld);
        cloneLight.matrixAutoUpdate = false;
        cloneTarget.matrix.copy(dirLight.target.matrixWorld);
        cloneTarget.matrixAutoUpdate = false;

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
          factorName,
          animationClip
        } = item;

        // new mesh instance reusing existing geometry object directly, while material is set later
        const cloneMesh = new THREE.Mesh(buffer);

        if (animationClip) {
          // source parameters from animation, if given
          // @todo copy parent transform
          const mixer = new THREE.AnimationMixer(cloneMesh);
          const action = mixer.clipAction(animationClip);
          action.play();
          mixer.setTime(animationTime);
        } else {
          // apply world transform (we don't bother re-creating scene hierarchy)
          cloneMesh.matrix.copy(mesh.matrixWorld);
          cloneMesh.matrixAutoUpdate = false;
        }

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
              lightMap={albedoMap ? lastTexture : undefined} // only light if has UV
              toneMapped={false} // must output in raw linear space
            />
          </primitive>
        );
      })}
    </scene>
  );
}

// alpha channel stays at zero if not filled out yet
function createAtlasTexture(
  atlasWidth: number,
  atlasHeight: number,
  fillWithPattern?: boolean
): [THREE.Texture, Float32Array] {
  const atlasSize = atlasWidth * atlasHeight;
  const data = new Float32Array(4 * atlasSize);

  if (fillWithPattern) {
    // pre-fill with a test pattern
    for (let i = 0; i < atlasSize; i++) {
      const x = i % atlasWidth;
      const y = Math.floor(i / atlasWidth);

      const stride = i * 4;

      const tileX = Math.floor(x / 4);
      const tileY = Math.floor(y / 4);

      const on = tileX % 2 === tileY % 2;

      data[stride] = on ? 0.2 : 0.8;
      data[stride + 1] = 0.5;
      data[stride + 2] = on ? 0.8 : 0.2;
      data[stride + 3] = 0;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    atlasWidth,
    atlasHeight,
    THREE.RGBAFormat,
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

  // @todo ensure there is biasing to be in middle of texel physical square
  function renderLightProbe(
    gl: THREE.WebGLRenderer,
    atlasFaceInfo: AtlasQuad,
    pU: number,
    pV: number,
    lightScene: THREE.Scene,
    handleProbeData: (
      rgbaData: Float32Array,
      pixelStart: number,
      pixelCount: number
    ) => void
  ) {
    const { mesh, buffer, quadIndex } = atlasFaceInfo;

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

// offsets for 3x3 brush
const offDirX = [1, 1, 0, -1, -1, -1, 0, 1];
const offDirY = [0, 1, 1, 1, 0, -1, -1, -1];

export function useIrradianceRenderer(
  atlasMapData: Float32Array,
  factorName: string | null,
  time?: number
): {
  outputIsComplete: boolean;
  outputTexture: THREE.Texture;
} {
  // get the work manager hook
  const useWorkManager = useContext(WorkManagerContext);
  if (useWorkManager === null) {
    throw new Error('expected work manager');
  }

  const animationTimeRef = useRef(time || 0); // remember the initial animation time
  const atlas = useIrradianceAtlasContext();

  const createDefaultState = useCallback((activeFactorName: string | null): {
    activeFactorName: string | null;
    activeOutput: THREE.DataTexture;
    activeOutputData: Float32Array;
    activeTexelCounter: [number];
    lightSceneElement: React.ReactElement | null;
    passComplete: boolean;
    passes: number;
  } => {
    const [initialTexture, initialData] = createAtlasTexture(
      atlasWidth,
      atlasHeight,
      factorName === null // test pattern only on base
    );

    return {
      activeFactorName,
      activeOutput: initialTexture,
      activeOutputData: initialData,
      activeTexelCounter: [0], // directly changed in place to avoid re-renders
      lightSceneElement: null,
      passComplete: true, // trigger first pass
      passes: 0
    };
  }, []);

  const [
    {
      activeOutput,
      activeOutputData,
      activeTexelCounter,
      lightSceneElement,
      passComplete,
      passes
    },
    setProcessingState
  ] = useState(() => createDefaultState(factorName));

  // automatically kick off new processing when ready
  useLayoutEffect(() => {
    // check if we need to set up new pass
    if (!passComplete || passes >= MAX_PASSES) {
      return;
    }

    // wait for scene to populate @todo fix this
    setTimeout(() => {
      setProcessingState((prev) => {
        const [nextTexture, nextData] = createAtlasTexture(
          atlasWidth,
          atlasHeight,
          prev.activeFactorName === null // test pattern only on base
        );

        return {
          activeFactorName: prev.activeFactorName,
          activeOutput: nextTexture,
          activeOutputData: nextData,
          activeTexelCounter: [0],
          // @todo create once and just copy texture data
          lightSceneElement: getLightProbeSceneElement(
            atlas,
            prev.activeOutput,
            prev.activeFactorName,
            animationTimeRef.current
          ),
          passComplete: false,
          passes: prev.passes + 1
        };
      });
    }, 0);
  }, [atlas, passComplete, passes]);

  const probeTargetSize = 16;
  const renderLightProbe = useLightProbe(probeTargetSize);

  const outputIsComplete = passes >= MAX_PASSES && passComplete;

  useWorkManager(
    outputIsComplete ? null : lightSceneElement,
    (gl, lightScene) => {
      const { quads } = atlas;
      const totalTexelCount = atlasWidth * atlasHeight;

      // allow for skipping a certain amount of empty texels
      const maxCounter = Math.min(totalTexelCount, activeTexelCounter[0] + 100);

      // keep trying texels until non-empty one is found
      while (activeTexelCounter[0] < maxCounter) {
        const texelIndex = activeTexelCounter[0];

        // always update texel count
        // and mark state as completed once all texels are done
        activeTexelCounter[0] = texelIndex + 1;

        if (activeTexelCounter[0] >= totalTexelCount) {
          setProcessingState((prev) => {
            return {
              ...prev,
              passComplete: true
            };
          });
        }

        // get current atlas face we are filling up
        const texelInfoBase = texelIndex * 4;
        const texelPosU = atlasMapData[texelInfoBase];
        const texelPosV = atlasMapData[texelInfoBase + 1];
        const texelQuadEnc = atlasMapData[texelInfoBase + 2];

        // skip computation if this texel is empty
        if (texelQuadEnc === 0) {
          continue;
        }

        // otherwise, proceed with computation and exit
        const texelQuadIndex = Math.round(texelQuadEnc - 1);

        if (texelQuadIndex < 0 || texelQuadIndex >= quads.length) {
          throw new Error(
            `incorrect atlas map data: ${texelPosU}, ${texelPosV}, ${
              atlasMapData[texelInfoBase + 2]
            }`
          );
        }

        const atlasFaceInfo = quads[texelQuadIndex];

        // render the probe viewports and collect pixel aggregate
        let r = 0,
          g = 0,
          b = 0,
          totalDivider = 0;

        renderLightProbe(
          gl,
          atlasFaceInfo,
          texelPosU,
          texelPosV,
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

        const rgba = [r / totalDivider, g / totalDivider, b / totalDivider, 1];

        // store computed illumination value
        activeOutputData.set(rgba, texelIndex * 4);

        // propagate value to 3x3 brush area
        // @todo track already-written texels
        const texelX = texelIndex % atlasWidth;
        const texelRowStart = texelIndex - texelX;

        for (let offDir = 0; offDir < 8; offDir += 1) {
          const offX = offDirX[offDir];
          const offY = offDirY[offDir];

          const offRowX = (atlasWidth + texelX + offX) % atlasWidth;
          const offRowStart =
            (totalTexelCount + texelRowStart + offY * atlasWidth) %
            totalTexelCount;
          const offTexelBase = (offRowStart + offRowX) * 4;

          // fill texel if it will not/did not receive real computed data otherwise;
          // also ensure strong neighbour values (not diagonal) take precedence
          const offTexelQuadEnc = atlasMapData[offTexelBase + 2];
          const isStrongNeighbour = offX === 0 || offY === 0;
          const isUnfilled = activeOutputData[offTexelBase + 3] === 0;

          if (offTexelQuadEnc === 0 && (isStrongNeighbour || isUnfilled)) {
            activeOutputData.set(rgba, offTexelBase);
          }
        }

        activeOutput.needsUpdate = true;

        // some computation happened, do not iterate further
        break;
      }
    }
  );

  return {
    outputIsComplete,
    outputTexture: activeOutput
  };
}
