/*
 * Copyright (c) 2020-now Nick Matantsev
 * Licensed under the MIT license
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useContext,
  useRef
} from 'react';
import * as THREE from 'three';

import {
  useIrradianceTexture,
  useIrradianceMapSize
} from './IrradianceCompositor';
import IrradianceAtlasMapper, {
  Workbench,
  AtlasMap
} from './IrradianceAtlasMapper';

const IrradianceSceneManager: React.FC<{
  children: (
    lightSceneRef: React.MutableRefObject<THREE.Scene | null>,
    workbench: Workbench | null,
    startWorkbench: () => void
  ) => React.ReactNode;
}> = ({ children }) => {
  const lightMap = useIrradianceTexture();
  const [lightMapWidth, lightMapHeight] = useIrradianceMapSize();

  // read once
  const lightMapWidthRef = useRef(lightMapWidth);
  const lightMapHeightRef = useRef(lightMapHeight);

  // handle for light scene
  const lightSceneRef = useRef<THREE.Scene>(null);

  // basic snapshot triggered by start handler
  const [workbenchBasics, setWorkbenchBasics] = useState<{
    id: number; // for refresh
    scene: THREE.Scene;
  } | null>(null);

  const startHandler = useCallback(() => {
    const scene = lightSceneRef.current;
    if (!scene) {
      throw new Error('could not get light scene reference');
    }

    // save a snapshot copy of staging data
    setWorkbenchBasics((prev) => ({
      id: prev ? prev.id + 1 : 1,
      scene
    }));
  }, []);

  // full workbench with atlas map
  const [workbench, setWorkbench] = useState<Workbench | null>(null);

  const atlasMapHandler = useCallback(
    (atlasMap: AtlasMap) => {
      if (!workbenchBasics) {
        throw new Error('unexpected early call');
      }

      // save final copy of workbench
      setWorkbench({
        id: workbenchBasics.id,
        lightScene: workbenchBasics.scene,
        atlasMap
      });
    },
    [workbenchBasics]
  );

  return (
    <>
      {children(lightSceneRef, workbench, startHandler)}

      {workbenchBasics && (
        <IrradianceAtlasMapper
          key={workbenchBasics.id} // re-create for new workbench
          width={lightMapWidthRef.current} // read from initial snapshot
          height={lightMapHeightRef.current} // read from initial snapshot
          lightMap={lightMap}
          lightScene={workbenchBasics.scene}
          onComplete={atlasMapHandler}
        />
      )}
    </>
  );
};

export default IrradianceSceneManager;
