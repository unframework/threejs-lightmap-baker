import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useContext,
  useRef
} from 'react';
import { useThree, useFrame, PointerEvent } from 'react-three-fiber';
import * as THREE from 'three';

import { useIrradianceAtlasContext, Atlas } from './IrradianceSurfaceManager';
import { WorkManagerContext } from './WorkManager';
import {
  atlasWidth,
  atlasHeight,
  MAX_ITEM_FACES,
  AtlasMap,
  AtlasMapItem
} from './IrradianceAtlasMapper';

const MAX_PASSES = 2;
const EMISSIVE_MULTIPLIER = 32; // global conversion of display -> physical emissiveness

const tmpOrigin = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();

const tmpNormal = new THREE.Vector3();
const tmpLookAt = new THREE.Vector3();

export interface IrradianceStagingTimelineMesh {
  uuid: string;
  clip: THREE.AnimationClip;
}

export interface IrradianceStagingTimeline {
  factorName: string | null;
  time: number;
  meshes: IrradianceStagingTimelineMesh[];
}

// @todo move into surface manager?
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
function createOutputTexture(
  atlasWidth: number,
  atlasHeight: number
): [THREE.Texture, Float32Array] {
  const atlasSize = atlasWidth * atlasHeight;
  const data = new Float32Array(4 * atlasSize);

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

function clearOutputTexture(
  atlasWidth: number,
  atlasHeight: number,
  data: Float32Array,
  withTestPattern?: boolean
) {
  const atlasSize = atlasWidth * atlasHeight;

  if (!withTestPattern) {
    data.fill(0);
  }

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

function setUpProbeUp(
  probeCam: THREE.Camera,
  mesh: THREE.Mesh,
  origin: THREE.Vector3,
  normal: THREE.Vector3,
  uDir: THREE.Vector3
) {
  probeCam.position.copy(origin);

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
  probeCam.position.copy(origin);

  // up is the normal
  probeCam.up.copy(normal);

  // add normal to accumulator and look at it
  tmpLookAt.copy(origin);
  tmpLookAt.addScaledVector(direction, directionSign);

  probeCam.lookAt(tmpLookAt);
  probeCam.scale.set(1, 1, 1);

  // then, transform camera into world space
  probeCam.applyMatrix4(mesh.matrixWorld);
}

type ProbeDataHandler = (
  rgbaData: Float32Array,
  pixelStart: number,
  pixelCount: number,
  probeTargetSize: number
) => void;

type ProbeRenderer = (
  gl: THREE.WebGLRenderer,
  atlasMapItem: AtlasMapItem,
  faceIndex: number,
  pU: number,
  pV: number,
  lightScene: THREE.Scene,
  handleProbeData: ProbeDataHandler
) => void;

function useLightProbe(probeTargetSize: number): ProbeRenderer {
  const probePixelCount = probeTargetSize * probeTargetSize;
  const probeTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(probeTargetSize, probeTargetSize, {
      type: THREE.FloatType
    });
  }, [probeTargetSize]);

  useEffect(
    () => () => {
      // clean up on unmount
      probeTarget.dispose();
    },
    [probeTarget]
  );

  const probeCam = useMemo(() => {
    const rtFov = 90; // view cone must be quarter of the hemisphere
    const rtAspect = 1; // square render target
    const rtNear = 0.05;
    const rtFar = 50;
    return new THREE.PerspectiveCamera(rtFov, rtAspect, rtNear, rtFar);
  }, []);

  const probeData = useMemo(() => {
    return new Float32Array(probeTargetSize * probeTargetSize * 4);
  }, [probeTargetSize]);

  // @todo ensure there is biasing to be in middle of texel physical square
  return function renderLightProbe(
    gl,
    atlasMapItem,
    faceIndex,
    pU,
    pV,
    lightScene,
    handleProbeData
  ) {
    const { faceBuffer, originalMesh, originalBuffer } = atlasMapItem;

    if (!originalBuffer.index) {
      throw new Error('expected indexed mesh');
    }

    // read vertex position for this face and interpolate along U and V axes
    const origIndexArray = originalBuffer.index.array;
    const origPosArray = originalBuffer.attributes.position.array;

    const normalArray = faceBuffer.attributes.normal.array;

    // get face vertex positions
    const faceVertexBase = faceIndex * 3;
    tmpOrigin.fromArray(origPosArray, origIndexArray[faceVertexBase] * 3);
    tmpU.fromArray(origPosArray, origIndexArray[faceVertexBase + 1] * 3);
    tmpV.fromArray(origPosArray, origIndexArray[faceVertexBase + 2] * 3);

    // compute face dimensions
    tmpU.sub(tmpOrigin);
    tmpV.sub(tmpOrigin);

    // set camera to match texel, first in mesh-local space
    tmpOrigin.addScaledVector(tmpU, pU);
    tmpOrigin.addScaledVector(tmpV, pV);

    // get precomputed normal and cardinal directions
    tmpNormal.fromArray(normalArray, faceVertexBase * 3);
    tmpU.fromArray(normalArray, (faceVertexBase + 1) * 3);
    tmpV.fromArray(normalArray, (faceVertexBase + 2) * 3);

    gl.setRenderTarget(probeTarget);

    setUpProbeUp(probeCam, originalMesh, tmpOrigin, tmpNormal, tmpU);
    gl.render(lightScene, probeCam);
    gl.readRenderTargetPixels(
      probeTarget,
      0,
      0,
      probeTargetSize,
      probeTargetSize,
      probeData
    );
    handleProbeData(probeData, 0, probePixelCount, probeTargetSize);

    setUpProbeSide(probeCam, originalMesh, tmpOrigin, tmpNormal, tmpU, 1);
    gl.render(lightScene, probeCam);
    gl.readRenderTargetPixels(
      probeTarget,
      0,
      0,
      probeTargetSize,
      probeTargetSize,
      probeData
    );
    handleProbeData(
      probeData,
      probePixelCount / 2,
      probePixelCount / 2,
      probeTargetSize
    );

    setUpProbeSide(probeCam, originalMesh, tmpOrigin, tmpNormal, tmpU, -1);
    gl.render(lightScene, probeCam);
    gl.readRenderTargetPixels(
      probeTarget,
      0,
      0,
      probeTargetSize,
      probeTargetSize,
      probeData
    );
    handleProbeData(
      probeData,
      probePixelCount / 2,
      probePixelCount / 2,
      probeTargetSize
    );

    setUpProbeSide(probeCam, originalMesh, tmpOrigin, tmpNormal, tmpV, 1);
    gl.render(lightScene, probeCam);
    gl.readRenderTargetPixels(
      probeTarget,
      0,
      0,
      probeTargetSize,
      probeTargetSize,
      probeData
    );
    handleProbeData(
      probeData,
      probePixelCount / 2,
      probePixelCount / 2,
      probeTargetSize
    );

    setUpProbeSide(probeCam, originalMesh, tmpOrigin, tmpNormal, tmpV, -1);
    gl.render(lightScene, probeCam);
    gl.readRenderTargetPixels(
      probeTarget,
      0,
      0,
      probeTargetSize,
      probeTargetSize,
      probeData
    );
    handleProbeData(
      probeData,
      probePixelCount / 2,
      probePixelCount / 2,
      probeTargetSize
    );

    gl.setRenderTarget(null);
  };
}

function processTexel(
  gl: THREE.WebGLRenderer,
  atlasMap: AtlasMap,
  texelIndex: number,
  lightScene: THREE.Scene,
  renderLightProbe: ProbeRenderer,
  rgba: number[]
): boolean {
  // get current atlas face we are filling up
  const texelInfoBase = texelIndex * 4;
  const texelPosU = atlasMap.data[texelInfoBase];
  const texelPosV = atlasMap.data[texelInfoBase + 1];
  const texelFaceEnc = atlasMap.data[texelInfoBase + 2];

  // skip computation if this texel is empty
  if (texelFaceEnc === 0) {
    return false;
  }

  // otherwise, proceed with computation and exit
  const texelFaceIndexCombo = Math.round(texelFaceEnc - 1);
  const texelFaceIndex = texelFaceIndexCombo % MAX_ITEM_FACES;
  const texelItemIndex =
    (texelFaceIndexCombo - texelFaceIndex) / MAX_ITEM_FACES;

  if (texelItemIndex < 0 || texelItemIndex >= atlasMap.items.length) {
    throw new Error(
      `incorrect atlas map item data: ${texelPosU}, ${texelPosV}, ${texelFaceEnc}`
    );
  }

  const atlasItem = atlasMap.items[texelItemIndex];

  if (texelFaceIndex < 0 || texelFaceIndex >= atlasItem.faceCount) {
    throw new Error(
      `incorrect atlas map face data: ${texelPosU}, ${texelPosV}, ${texelFaceEnc}`
    );
  }

  // render the probe viewports and collect pixel aggregate
  let r = 0,
    g = 0,
    b = 0,
    totalDivider = 0;

  renderLightProbe(
    gl,
    atlasItem,
    texelFaceIndex,
    texelPosU,
    texelPosV,
    lightScene,
    (probeData, pixelStart, pixelCount, probeTargetSize) => {
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

  rgba[0] = r / totalDivider;
  rgba[1] = g / totalDivider;
  rgba[2] = b / totalDivider;
  rgba[3] = 1;

  // signal that computation happened
  return true;
}

// offsets for 3x3 brush
const offDirX = [1, 1, 0, -1, -1, -1, 0, 1];
const offDirY = [0, 1, 1, 1, 0, -1, -1, -1];

const IrradianceRenderer: React.FC<{
  atlasMap: AtlasMap;
  factorName: string | null;
  time?: number;
  onStart: (lightMap: THREE.Texture) => void;
}> = (props) => {
  // get the work manager hook
  const useWorkManager = useContext(WorkManagerContext);
  if (useWorkManager === null) {
    throw new Error('expected work manager');
  }

  // wrap params in ref to avoid unintended re-triggering
  const atlasMapRef = useRef(props.atlasMap); // read once
  const factorNameRef = useRef(props.factorName); // read once
  const animationTimeRef = useRef(props.time || 0); // read once

  const onStartRef = useRef(props.onStart);
  onStartRef.current = props.onStart; // keep latest

  const atlas = useIrradianceAtlasContext();

  // output of the previous baking pass (applied to the light probe scene)
  const [previousOutput, previousOutputData] = useMemo(
    () => createOutputTexture(atlasWidth, atlasHeight),
    []
  );
  useEffect(
    () => () => {
      previousOutput.dispose();
    },
    [previousOutput]
  );

  // currently produced output
  // this will be pre-filled with test pattern if needed on start of pass
  const [activeOutput, activeOutputData] = useMemo(
    () => createOutputTexture(atlasWidth, atlasHeight),
    []
  );
  useEffect(
    () => () => {
      activeOutput.dispose();
    },
    [activeOutput]
  );

  const withTestPattern = factorNameRef.current === null; // only base factor gets pattern

  const lightSceneRef = useRef<THREE.Scene>();
  const [
    lightSceneElement,
    setLightSceneElement
  ] = useState<React.ReactElement | null>(null);

  const [processingState, setProcessingState] = useState(() => {
    return {
      passTexelCounter: [0], // directly changed in place to avoid re-renders
      passComplete: true, // this triggers new pass on next render
      passesRemaining: MAX_PASSES
    };
  });

  // create light scene in separate render tick
  useEffect(() => {
    // @todo for some reason the scene does not render unless created inside the timeout
    // (even though the atlas is already initialized/etc by now anyway)
    setTimeout(() => {
      setLightSceneElement(
        getLightProbeSceneElement(
          atlas,
          previousOutput,
          factorNameRef.current,
          animationTimeRef.current
        )
      );
    }, 0);

    // running last in case there are errors
    onStartRef.current(activeOutput);
  }, [atlas, previousOutput]);

  // kick off new pass when current one is complete
  useEffect(() => {
    const { passComplete, passesRemaining } = processingState;

    // check if we need to set up new pass
    if (!passComplete || passesRemaining === 0) {
      return;
    }

    // copy completed data
    previousOutputData.set(activeOutputData);
    previousOutput.needsUpdate = true;

    // reset output (re-create test pattern only on base)
    // @todo do this only when needing to show debug output?
    clearOutputTexture(
      atlasWidth,
      atlasHeight,
      activeOutputData,
      withTestPattern
    );
    activeOutput.needsUpdate = true;

    setProcessingState((prev) => {
      return {
        passTexelCounter: [0],
        passComplete: false,
        passesRemaining: prev.passesRemaining - 1
      };
    });
  }, [
    withTestPattern,
    processingState,
    previousOutput,
    previousOutputData,
    activeOutput,
    activeOutputData
  ]);

  const probeTargetSize = 16;
  const renderLightProbe = useLightProbe(probeTargetSize);

  const outputIsComplete =
    processingState.passesRemaining === 0 && processingState.passComplete;

  // used during processing
  const rgba = [0, 0, 0, 0];

  useWorkManager(
    outputIsComplete
      ? null
      : (gl) => {
          const lightScene = lightSceneRef.current;
          if (!lightScene) {
            return; // nothing to do yet
          }

          const { passTexelCounter } = processingState;

          const atlasMap = atlasMapRef.current;
          const totalTexelCount = atlasWidth * atlasHeight;

          // allow for skipping a certain amount of empty texels
          const maxCounter = Math.min(
            totalTexelCount,
            passTexelCounter[0] + 100
          );

          // keep trying texels until non-empty one is found
          while (passTexelCounter[0] < maxCounter) {
            const texelIndex = passTexelCounter[0];

            // always update texel count
            // and mark state as completed once all texels are done
            passTexelCounter[0] = texelIndex + 1;

            if (passTexelCounter[0] >= totalTexelCount) {
              setProcessingState((prev) => {
                return {
                  ...prev,
                  passComplete: true
                };
              });
            }

            if (
              !processTexel(
                gl,
                atlasMap,
                texelIndex,
                lightScene,
                renderLightProbe,
                rgba
              )
            ) {
              continue;
            }

            // store computed illumination value
            activeOutputData.set(rgba, texelIndex * 4);

            // propagate value to 3x3 brush area
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
              const offTexelFaceEnc = atlasMap.data[offTexelBase + 2];
              const isStrongNeighbour = offX === 0 || offY === 0;
              const isUnfilled = activeOutputData[offTexelBase + 3] === 0;

              if (offTexelFaceEnc === 0 && (isStrongNeighbour || isUnfilled)) {
                activeOutputData.set(rgba, offTexelBase);
              }
            }

            activeOutput.needsUpdate = true;

            // some computation happened, do not iterate further
            break;
          }
        }
  );

  return outputIsComplete
    ? null
    : lightSceneElement &&
        React.cloneElement(lightSceneElement, {
          ref: lightSceneRef
        });
};

export default IrradianceRenderer;
