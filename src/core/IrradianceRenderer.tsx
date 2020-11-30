import React, { useEffect, useState, useMemo, useContext, useRef } from 'react';
import { useFrame } from 'react-three-fiber';
import * as THREE from 'three';

import { WorkManagerContext } from './WorkManager';
import { useIrradianceRendererData } from './IrradianceCompositor';
import { Workbench, MAX_ITEM_FACES, AtlasMap } from './IrradianceAtlasMapper';
import {
  ProbeBatchRenderer,
  ProbeBatchReader,
  useLightProbe
} from './IrradianceLightProbe';

const MAX_PASSES = 2;
const EMISSIVE_MULTIPLIER = 32; // global conversion of display -> physical emissiveness

const tmpRgba = [0, 0, 0, 0];

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
// @todo correctly replicate shadowing parameters/etc
function getLightProbeSceneElement(
  workbench: Workbench,
  lastTexture: THREE.Texture,
  activeFactorName: string | null,
  animationTime: number
) {
  const { lightSceneItems, lightSceneLights } = workbench;

  return (
    <scene
      key={`light-scene-${Math.random()}`} // ensure scene is fully re-created @todo why?
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
              shadow-autoUpdate={false} // no need to update between frames
              shadow-needsUpdate={true} // trigger one-time shadow map render
              shadow-camera-left={dirLight.shadow.camera.left}
              shadow-camera-right={dirLight.shadow.camera.right}
              shadow-camera-top={dirLight.shadow.camera.top}
              shadow-camera-bottom={dirLight.shadow.camera.bottom}
            />
          </React.Fragment>
        );
      })}

      {lightSceneItems.map((item, itemIndex) => {
        const { mesh, material, hasUV2, factorName, animationClip } = item;

        // new mesh instance reusing existing geometry object directly, while material is set later
        const cloneMesh = new THREE.Mesh(mesh.geometry);

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
          factorName === activeFactorName ? material.emissiveIntensity : 0;

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
              color={material.color}
              map={material.map}
              emissive={material.emissive}
              emissiveMap={material.emissiveMap}
              emissiveIntensity={
                // apply physics multiplier to any display emissive quantity
                // (emission needs to be strong for bounces to work, but that would wash out colours
                // if output directly from visible scene's shader)
                EMISSIVE_MULTIPLIER * activeEmissiveIntensity
              }
              lightMap={hasUV2 ? lastTexture : undefined} // only light if has UV2
              toneMapped={false} // must output in raw linear space
            />
          </primitive>
        );
      })}
    </scene>
  );
}

// applied inside the light probe scene
function createTemporaryLightMapTexture(
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

  // use nearest filter inside the light probe scene for performance
  // @todo allow tweaking?
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
  // (nested loop to avoid tripping sandbox infinite loop detection)
  for (let y = 0; y < atlasHeight; y += 1) {
    const yStart = y * atlasWidth * 4;

    for (let x = 0; x < atlasWidth; x += 1) {
      const stride = yStart + x * 4;

      const tileX = Math.floor(x / 4);
      const tileY = Math.floor(y / 4);

      const on = tileX % 2 === tileY % 2;

      data[stride] = on ? 0.2 : 0.8;
      data[stride + 1] = 0.5;
      data[stride + 2] = on ? 0.8 : 0.2;
      data[stride + 3] = 0;
    }
  }
}

function queueTexel(
  atlasMap: AtlasMap,
  texelIndex: number,
  renderLightProbe: ProbeBatchRenderer
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

  // render the probe viewports (will read the data later)
  renderLightProbe(texelIndex, atlasItem, texelFaceIndex, texelPosU, texelPosV);

  // signal that computation happened
  return true;
}

// collect and combine pixel aggregate from rendered probe viewports
function readTexel(
  rgba: number[],
  readLightProbe: ProbeBatchReader,
  probePixelAreaLookup: number[]
) {
  let r = 0,
    g = 0,
    b = 0,
    totalDivider = 0;

  readLightProbe((probeData, rowPixelStride, box, originX, originY) => {
    const probeTargetSize = box.z; // assuming width is always full

    const rowStride = rowPixelStride * 4;
    let rowStart = box.y * rowStride + box.x * 4;
    const totalMax = (box.y + box.w) * rowStride;
    let py = originY;

    while (rowStart < totalMax) {
      const rowMax = rowStart + box.z * 4;
      let px = originX;

      for (let i = rowStart; i < rowMax; i += 4) {
        // compute multiplier as affected by inclination of corresponding ray
        const area = probePixelAreaLookup[py * probeTargetSize + px];

        r += area * probeData[i];
        g += area * probeData[i + 1];
        b += area * probeData[i + 2];

        totalDivider += area;

        px += 1;
      }

      rowStart += rowStride;
      py += 1;
    }
  });

  rgba[0] = r / totalDivider;
  rgba[1] = g / totalDivider;
  rgba[2] = b / totalDivider;
  rgba[3] = 1;
}

// offsets for 3x3 brush
const offDirX = [1, 1, 0, -1, -1, -1, 0, 1];
const offDirY = [0, 1, 1, 1, 0, -1, -1, -1];

// individual renderer worker lifecycle instance
// (in parent, key to workbench.id to restart on changes)
// @todo report completed flag
const IrradianceRenderer: React.FC<{
  workbench: Workbench;
  factorName?: string;
  time?: number;
  onDebugLightProbe?: (debugLightProbeTexture: THREE.Texture) => void;
}> = (props) => {
  // get the work manager hook
  const useWorkManager = useContext(WorkManagerContext);
  if (useWorkManager === null) {
    throw new Error('expected work manager');
  }

  // read once
  const workbenchRef = useRef(props.workbench);
  const factorNameRef = useRef(props.factorName || null);
  const animationTimeRef = useRef(props.time || 0);

  // wrap params in ref to avoid unintended re-triggering
  const onDebugLightProbeRef = useRef(props.onDebugLightProbe);
  onDebugLightProbeRef.current = props.onDebugLightProbe;

  // output of the previous baking pass (applied to the light probe scene)
  const [previousOutput, previousOutputData] = useMemo(
    () =>
      createTemporaryLightMapTexture(
        workbenchRef.current.atlasMap.width,
        workbenchRef.current.atlasMap.height
      ),
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
  const [activeOutput, activeOutputData] = useIrradianceRendererData(
    factorNameRef.current
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
    setLightSceneElement(
      getLightProbeSceneElement(
        workbenchRef.current,
        previousOutput,
        factorNameRef.current,
        animationTimeRef.current
      )
    );
  }, [previousOutput]);

  // kick off new pass when current one is complete
  useEffect(() => {
    const { atlasMap } = workbenchRef.current;
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
      atlasMap.width,
      atlasMap.height,
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
  const { renderLightProbeBatch, probePixelAreaLookup } = useLightProbe(
    probeTargetSize
  );

  const outputIsComplete =
    processingState.passesRemaining === 0 && processingState.passComplete;

  useWorkManager(
    outputIsComplete
      ? null
      : (gl) => {
          const lightScene = lightSceneRef.current;
          if (!lightScene) {
            return; // nothing to do yet
          }

          const { passTexelCounter } = processingState;

          const { atlasMap } = workbenchRef.current;
          const { width: atlasWidth, height: atlasHeight } = atlasMap;
          const totalTexelCount = atlasWidth * atlasHeight;

          // allow for skipping a certain amount of empty texels
          const maxCounter = Math.min(
            totalTexelCount,
            passTexelCounter[0] + 100
          );

          renderLightProbeBatch(
            gl,
            lightScene,
            (renderBatchItem) => {
              // keep trying texels until non-empty one is found
              while (passTexelCounter[0] < maxCounter) {
                const texelIndex = passTexelCounter[0];

                // always update texel count
                passTexelCounter[0] = texelIndex + 1;

                if (!queueTexel(atlasMap, texelIndex, renderBatchItem)) {
                  continue;
                }

                // if something was queued, stop the loop
                break;
              }
            },
            (texelIndex, readLightProbe) => {
              readTexel(tmpRgba, readLightProbe, probePixelAreaLookup);

              // store computed illumination value
              activeOutputData.set(tmpRgba, texelIndex * 4);

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

                if (
                  offTexelFaceEnc === 0 &&
                  (isStrongNeighbour || isUnfilled)
                ) {
                  activeOutputData.set(tmpRgba, offTexelBase);
                }
              }

              activeOutput.needsUpdate = true;
            }
          );

          // mark state as completed once all texels are done
          if (passTexelCounter[0] >= totalTexelCount) {
            setProcessingState((prev) => {
              return {
                ...prev,
                passComplete: true
              };
            });
          }
        }
  );

  // debug probe
  const {
    renderLightProbeBatch: debugProbeBatch,
    debugLightProbeTexture
  } = useLightProbe(probeTargetSize);
  const debugProbeRef = useRef(false);
  useFrame(({ gl }) => {
    const lightScene = lightSceneRef.current;
    if (!lightScene) {
      return; // nothing to do yet
    }

    // run only once
    if (debugProbeRef.current) {
      return;
    }
    debugProbeRef.current = true;

    const { atlasMap } = workbenchRef.current;

    let batchCount = 0;

    debugProbeBatch(
      gl,
      lightScene,
      (renderBatchItem) => {
        queueTexel(
          atlasMap,
          atlasMap.width * 1 + 1 + batchCount,
          renderBatchItem
        );
        batchCount += 1;
      },
      () => {
        // no-op (not consuming the data)
      }
    );
  });

  // report debug texture
  useEffect(() => {
    if (onDebugLightProbeRef.current) {
      onDebugLightProbeRef.current(debugLightProbeTexture);
    }
  }, [debugLightProbeTexture]);

  return (
    <>
      {outputIsComplete
        ? null
        : lightSceneElement &&
          React.cloneElement(lightSceneElement, {
            ref: lightSceneRef
          })}
    </>
  );
};

export default IrradianceRenderer;
