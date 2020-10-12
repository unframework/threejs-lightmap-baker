import { useRef } from 'react';
import * as THREE from 'three';

import { useIrradianceRenderer } from './IrradianceRenderer';

export function useIrradianceKeyframeRenderer(
  factorName: string,
  times: number[]
): {
  outputIsComplete: boolean;
  outputTextures: THREE.Texture[];
} {
  const timesRef = useRef(times);

  let allComplete = true;
  const textureList = [];

  for (const time of timesRef.current) {
    // @todo fix
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { outputTexture, outputIsComplete } = useIrradianceRenderer(
      factorName,
      time
    );

    allComplete = allComplete && outputIsComplete;
    textureList.push(outputTexture);
  }

  return {
    outputIsComplete: allComplete,
    outputTextures: textureList
  };
}
