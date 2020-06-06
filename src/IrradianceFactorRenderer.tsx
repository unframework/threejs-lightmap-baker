import { useMemo, useLayoutEffect, useState } from 'react';

import { useIrradianceAtlasContext } from './IrradianceSurfaceManager';
import { useIrradianceRenderer } from './IrradianceRenderer';

export function useIrradianceFactorRenderer() {
  const atlas = useIrradianceAtlasContext();

  // active factor being rendered
  const [factorIndex, setFactorIndex] = useState<number>(-1);

  // grab latest live value from light factors set
  const activeFactorName = useMemo(
    () =>
      factorIndex === -1 ? null : Object.keys(atlas.lightFactors)[factorIndex],
    [factorIndex, atlas]
  );

  const {
    outputFactorName,
    outputIsComplete,
    outputTexture,

    lightSceneElement,
    handleDebugClick,
    probeDebugTextures
  } = useIrradianceRenderer(activeFactorName);

  const [baseOutput, setBaseOutput] = useState<THREE.Texture>(() => {
    return outputTexture; // initial renderer output is the base blank texture
  });
  const [factorOutputs, setFactorOutputs] = useState<{
    [name: string]: THREE.Texture;
  }>({});

  useLayoutEffect(() => {
    // stash the output
    if (outputFactorName === null) {
      setBaseOutput(outputTexture);
    } else {
      setFactorOutputs((prev) => ({
        ...prev,
        [outputFactorName]: outputTexture
      }));
    }

    if (outputIsComplete) {
      // keep incrementing until last one
      setFactorIndex((prevFactorIndex) => {
        const factorList = Object.keys(atlas.lightFactors);
        return Math.min(factorList.length - 1, prevFactorIndex + 1);
      });
    }
  }, [atlas, outputFactorName, outputIsComplete, outputTexture]);

  return {
    lightSceneElement,
    handleDebugClick,
    probeDebugTextures,
    baseOutput,
    factorOutputs
  };
}
