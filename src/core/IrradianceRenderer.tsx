/*
 * Copyright (c) 2020-now Nick Matantsev
 * Licensed under the MIT license
 */

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

// global conversion of display -> physical emissiveness
// @todo this originally was 32 because emissive textures did not reflect enough scene light,
// but making emissiveIntensity > 1 washed out the visible non-light-scene display colours
const EMISSIVE_MULTIPLIER = 1;

const tmpRgba = new THREE.Vector4();
const tmpRgbaAdder = new THREE.Vector4();

// @todo move into surface manager?
// @todo correctly replicate shadowing parameters/etc
function createLightProbeScene(
  workbench: Workbench,
  lastTexture: THREE.Texture | undefined
) {
  const { lightSceneItems, lightSceneLights } = workbench;

  const scene = new THREE.Scene();

  // first pass (no previous input texture), add lights
  if (!lastTexture) {
    for (const { light } of lightSceneLights) {
      const lightTarget =
        light instanceof THREE.DirectionalLight ? light.target : null;

      const cloneLight = light.clone();
      const cloneTarget =
        cloneLight instanceof THREE.DirectionalLight ? cloneLight.target : null;

      // apply world transform (we don't bother re-creating scene hierarchy)
      cloneLight.matrix.copy(light.matrixWorld);
      cloneLight.matrixAutoUpdate = false;
      scene.add(cloneLight);

      if (lightTarget && cloneTarget) {
        cloneTarget.matrix.copy(lightTarget.matrixWorld);
        cloneTarget.matrixAutoUpdate = false;
        scene.add(cloneTarget);
      }
    }
  }

  for (const item of lightSceneItems) {
    const { mesh, material, needsLightMap } = item;

    // new mesh instance reusing existing geometry object directly, while material is set later
    const cloneMesh = new THREE.Mesh(mesh.geometry);
    cloneMesh.castShadow = mesh.castShadow;
    cloneMesh.receiveShadow = mesh.receiveShadow;

    // instantiate a simple equivalent vertex- or pixel-based material
    const cloneMaterial =
      material instanceof THREE.MeshLambertMaterial
        ? new THREE.MeshLambertMaterial()
        : new THREE.MeshPhongMaterial();

    // copy non-specular flat look properties
    // NOTE: we also copy some of the more esoteric display controls, trusting that
    // the developer knows what they are doing
    // skipped: stencil settings because light probe rendering does not allow setting up stencil buffer
    // skipped: fog flag because light scene has no fog anyway
    cloneMaterial.alphaMap = material.alphaMap;
    cloneMaterial.alphaTest = material.alphaTest;
    cloneMaterial.aoMap = material.aoMap;
    cloneMaterial.aoMapIntensity = material.aoMapIntensity;
    cloneMaterial.blendDst = material.blendDst;
    cloneMaterial.blendDstAlpha = material.blendDstAlpha;
    cloneMaterial.blendEquation = material.blendEquation;
    cloneMaterial.blendEquationAlpha = material.blendEquationAlpha;
    cloneMaterial.blending = material.blending;
    cloneMaterial.blendSrc = material.blendSrc;
    cloneMaterial.blendSrcAlpha = material.blendSrcAlpha;
    cloneMaterial.clipIntersection = material.clipIntersection;
    cloneMaterial.clippingPlanes = material.clippingPlanes;
    cloneMaterial.clipShadows = material.clipShadows;
    cloneMaterial.color = material.color;
    cloneMaterial.colorWrite = material.colorWrite;
    cloneMaterial.depthFunc = material.depthFunc;
    cloneMaterial.depthTest = material.depthTest;
    cloneMaterial.depthWrite = material.depthWrite;
    cloneMaterial.dithering = material.dithering;
    cloneMaterial.emissive = material.emissive;
    cloneMaterial.emissiveIntensity = material.emissiveIntensity;
    cloneMaterial.emissiveMap = material.emissiveMap;
    cloneMaterial.flatShading = material.flatShading;
    cloneMaterial.map = material.map;
    cloneMaterial.morphNormals = material.morphNormals;
    cloneMaterial.morphTargets = material.morphTargets;
    cloneMaterial.opacity = material.opacity;
    cloneMaterial.precision = material.precision;
    cloneMaterial.premultipliedAlpha = material.premultipliedAlpha;
    cloneMaterial.shadowSide = material.shadowSide;
    cloneMaterial.side = material.side;
    cloneMaterial.skinning = material.skinning;
    cloneMaterial.transparent = material.transparent;
    cloneMaterial.vertexColors = material.vertexColors;
    cloneMaterial.visible = material.visible;

    // turn off any shininess
    if (cloneMaterial instanceof THREE.MeshPhongMaterial) {
      cloneMaterial.shininess = 0; // no need to change default specular colour
    }

    // mandatory material settings for light scene display
    cloneMaterial.toneMapped = false; // must output in raw linear space
    cloneMaterial.lightMap = (needsLightMap && lastTexture) || null; // only set if expects lightmap normally

    // apply world transform (we don't bother re-creating scene hierarchy)
    cloneMesh.matrix.copy(mesh.matrixWorld);
    cloneMesh.matrixAutoUpdate = false;

    cloneMaterial.emissiveIntensity =
      material.emissiveIntensity * EMISSIVE_MULTIPLIER;

    cloneMesh.material = cloneMaterial;

    scene.add(cloneMesh);
  }

  return scene;
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
// (this ignores the alpha channel from viewports)
function readTexel(
  rgba: THREE.Vector4,
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

  // alpha is set later
  rgba.x = r / totalDivider;
  rgba.y = g / totalDivider;
  rgba.z = b / totalDivider;
}

// offsets for 3x3 brush
const offDirX = [1, 1, 0, -1, -1, -1, 0, 1];
const offDirY = [0, 1, 1, 1, 0, -1, -1, -1];

function storeLightMapValue(
  atlasData: Float32Array,
  atlasWidth: number,
  totalTexelCount: number,
  texelIndex: number,
  combinedOutputData: Float32Array,
  layerOutputData: Float32Array,
  isAdditive: boolean
) {
  // read existing texel value (if adding)
  const mainOffTexelBase = texelIndex * 4;
  if (isAdditive) {
    tmpRgbaAdder.fromArray(combinedOutputData, mainOffTexelBase);
    tmpRgbaAdder.add(tmpRgba);
  } else {
    tmpRgbaAdder.copy(tmpRgba);
  }

  tmpRgba.w = 1; // reset alpha to 1 to indicate filled pixel
  tmpRgbaAdder.w = 1; // reset alpha to 1 to indicate filled pixel

  // main texel write
  tmpRgbaAdder.toArray(combinedOutputData, mainOffTexelBase);
  tmpRgba.toArray(layerOutputData, mainOffTexelBase);

  // propagate combined value to 3x3 brush area
  const texelX = texelIndex % atlasWidth;
  const texelRowStart = texelIndex - texelX;

  for (let offDir = 0; offDir < 8; offDir += 1) {
    const offX = offDirX[offDir];
    const offY = offDirY[offDir];

    const offRowX = (atlasWidth + texelX + offX) % atlasWidth;
    const offRowStart =
      (totalTexelCount + texelRowStart + offY * atlasWidth) % totalTexelCount;
    const offTexelBase = (offRowStart + offRowX) * 4;

    // fill texel if it will not/did not receive real computed data otherwise;
    // also ensure strong neighbour values (not diagonal) take precedence
    // (using layer output data to check for past writes since it is re-initialized per pass)
    const offTexelFaceEnc = atlasData[offTexelBase + 2];
    const isStrongNeighbour = offX === 0 || offY === 0;
    const isUnfilled = layerOutputData[offTexelBase + 3] === 0;

    if (offTexelFaceEnc === 0 && (isStrongNeighbour || isUnfilled)) {
      // no need to separately read existing value for brush-propagated texels
      tmpRgbaAdder.toArray(combinedOutputData, offTexelBase);
      tmpRgba.toArray(layerOutputData, offTexelBase);
    }
  }
}

// individual renderer worker lifecycle instance
// (in parent, key to workbench.id to restart on changes)
// @todo report completed flag
const IrradianceRenderer: React.FC<{
  workbench: Workbench;
  onDebugLightProbe?: (debugLightProbeTexture: THREE.Texture) => void;
}> = (props) => {
  // get the work manager hook
  const useWorkManager = useContext(WorkManagerContext);
  if (useWorkManager === null) {
    throw new Error('expected work manager');
  }

  // read once
  const workbenchRef = useRef(props.workbench);

  // wrap params in ref to avoid unintended re-triggering
  const onDebugLightProbeRef = useRef(props.onDebugLightProbe);
  onDebugLightProbeRef.current = props.onDebugLightProbe;

  // currently produced output
  // this will be pre-filled with test pattern if needed on start of pass
  const [combinedOutput, combinedOutputData] = useIrradianceRendererData(null);

  const texelPickMap = useMemo(() => {
    const { atlasMap } = workbenchRef.current;
    const { width: atlasWidth, height: atlasHeight } = atlasMap;
    const totalTexelCount = atlasWidth * atlasHeight;

    const result = new Array<number>(totalTexelCount);

    // perform main fill in separate tick for responsiveness
    setTimeout(() => {
      const originalSequence = new Array<number>(totalTexelCount);

      // nested loop to avoid tripping sandbox infinite loop detection
      for (let i = 0; i < atlasHeight; i += 1) {
        for (let j = 0; j < atlasWidth; j += 1) {
          const index = i * atlasWidth + j;
          originalSequence[index] = index;
        }
      }

      // nested loop to avoid tripping sandbox infinite loop detection
      for (let i = 0; i < atlasHeight; i += 1) {
        for (let j = 0; j < atlasWidth; j += 1) {
          const index = i * atlasWidth + j;
          const randomIndex = Math.random() * originalSequence.length;
          const sequenceElement = originalSequence.splice(randomIndex, 1)[0];
          result[index] = sequenceElement;
        }
      }
    }, 0);

    return result;
  }, []);

  const lightSceneRef = useRef<THREE.Scene>();

  const [processingState, setProcessingState] = useState(() => {
    return {
      previousLayerOutput: undefined as THREE.Texture | undefined, // previous pass's output (applied to the light probe scene)
      lightScene: null as THREE.Scene | null, // light scene contents
      layerOutput: undefined as THREE.Texture | undefined, // current pass's output
      layerOutputData: undefined as Float32Array | undefined, // current pass's output data
      passTexelCounter: [0], // directly changed in place to avoid re-renders
      passComplete: true, // this triggers new pass on next render
      passesRemaining: MAX_PASSES
    };
  });

  // kick off new pass when current one is complete
  useEffect(() => {
    const { atlasMap } = workbenchRef.current;
    const {
      passComplete,
      passesRemaining,
      previousLayerOutput
    } = processingState;

    // check if there is anything to do
    if (!passComplete) {
      return;
    }

    // always clean up previous texture
    if (previousLayerOutput) {
      previousLayerOutput.dispose();
    }

    // check if a new pass has to be set up
    if (passesRemaining === 0) {
      // on final pass, discard the active layer output texture too
      // (on previous passes it lives on as "previousLayerOutput")
      if (processingState.layerOutput) {
        processingState.layerOutput.dispose();
      }

      // also dereference large data objects to help free up memory
      setProcessingState((prev) => {
        if (!prev.lightScene && !prev.layerOutputData) {
          return prev;
        }
        return { ...prev, lightScene: null, layerOutputData: undefined };
      });
      return;
    }

    // set up a new output texture for new pass
    const [layerOutput, layerOutputData] = createTemporaryLightMapTexture(
      workbenchRef.current.atlasMap.width,
      workbenchRef.current.atlasMap.height
    );

    setProcessingState((prev) => {
      return {
        previousLayerOutput: prev.layerOutput, // previous pass's output
        lightScene: null, // will be created in another tick
        layerOutput,
        layerOutputData,
        passTexelCounter: [0],
        passComplete: false,
        passesRemaining: prev.passesRemaining - 1
      };
    });

    // create light scene in separate render tick (might help responsiveness)
    setTimeout(() => {
      setProcessingState((prev) => {
        // extra check just in case
        if (prev.passComplete) {
          return prev;
        }

        return {
          ...prev,
          lightScene: createLightProbeScene(
            workbenchRef.current,
            prev.previousLayerOutput
          )
        };
      });
    }, 0);
  }, [processingState, combinedOutput, combinedOutputData]);

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
          const {
            lightScene,
            passTexelCounter,
            previousLayerOutput,
            layerOutput,
            layerOutputData
          } = processingState;

          if (!lightScene) {
            return; // nothing to do yet
          }

          const { atlasMap } = workbenchRef.current;
          const { width: atlasWidth, height: atlasHeight } = atlasMap;
          const totalTexelCount = atlasWidth * atlasHeight;

          // wait for lookup map to be built up
          if (texelPickMap.length !== totalTexelCount) {
            return;
          }

          if (!layerOutputData || !layerOutput) {
            throw new Error('unexpected missing output');
          }

          renderLightProbeBatch(
            gl,
            lightScene,
            (renderBatchItem) => {
              // allow for skipping a certain amount of empty texels
              const maxCounter = Math.min(
                totalTexelCount,
                passTexelCounter[0] + 100
              );

              // keep trying texels until non-empty one is found
              while (passTexelCounter[0] < maxCounter) {
                const currentCounter = passTexelCounter[0];

                // always update texel count
                passTexelCounter[0] += 1;

                if (
                  !queueTexel(
                    atlasMap,
                    texelPickMap[currentCounter],
                    renderBatchItem
                  )
                ) {
                  continue;
                }

                // if something was queued, stop the loop
                break;
              }
            },
            (texelIndex, readLightProbe) => {
              readTexel(tmpRgba, readLightProbe, probePixelAreaLookup);

              // add this pass's illumination contribution to upstream output and current isolated layer
              storeLightMapValue(
                atlasMap.data,
                atlasWidth,
                totalTexelCount,
                texelIndex,
                combinedOutputData,
                layerOutputData,
                previousLayerOutput ? true : false // directly overwrite any test pattern if first pass
              );
              combinedOutput.needsUpdate = true;
              layerOutput.needsUpdate = true;
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
        : processingState.lightScene && (
            // this should dispose of scene on unmount
            <primitive
              key={processingState.passesRemaining} // key to current pass
              object={processingState.lightScene}
            />
          )}
    </>
  );
};

export default IrradianceRenderer;
