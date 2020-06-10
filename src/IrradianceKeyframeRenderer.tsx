import { useRef } from 'react';
import * as THREE from 'three';

import { useIrradianceRenderer } from './IrradianceRenderer';

export function useIrradianceKeyframeRenderer(
  factorName: string,
  times: number[]
): {
  outputIsComplete: boolean;
  outputTextures: THREE.Texture[];
  lightSceneElement: React.ReactElement | null;
} {
  const timesRef = useRef(times);

  let allComplete = true;
  let firstLightSceneElement = null;
  const textureList = [];

  for (const time of timesRef.current) {
    const {
      outputTexture,
      outputIsComplete,
      lightSceneElement
    } = useIrradianceRenderer(factorName, time); // eslint-disable-line react-hooks/rules-of-hooks

    allComplete = allComplete && outputIsComplete;
    firstLightSceneElement = firstLightSceneElement || lightSceneElement;
    textureList.push(outputTexture);
  }

  return {
    outputIsComplete: allComplete,
    outputTextures: textureList,
    lightSceneElement: firstLightSceneElement
  };
}
