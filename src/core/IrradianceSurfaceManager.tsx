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

import IrradianceAtlasMapper, {
  Workbench,
  WorkbenchSceneItem,
  WorkbenchSceneLight,
  WorkbenchLightType,
  AtlasMap
} from './IrradianceAtlasMapper';

interface WorkbenchStagingItem {
  mesh: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
  factorName: string | null;
  animationClip: THREE.AnimationClip | null;
}

const IrradianceWorkbenchContext = React.createContext<{
  items: { [uuid: string]: WorkbenchStagingItem | undefined };
  lights: { [uuid: string]: WorkbenchSceneLight | undefined };
} | null>(null);

function useWorkbenchStagingContext() {
  const workbenchStage = useContext(IrradianceWorkbenchContext);

  if (!workbenchStage) {
    throw new Error('must be inside manager context');
  }

  return workbenchStage;
}

// allow to attach a mesh to be mapped in texture atlas
export function useMeshRegister(
  mesh: THREE.Mesh | null,
  material: THREE.MeshLambertMaterial | null,
  factorName: string | null,
  animationClip: THREE.AnimationClip | null
) {
  const { items } = useWorkbenchStagingContext();

  // wrap in refs to keep only initial value
  const animationClipRef = useRef(animationClip);
  const factorNameRef = useRef(factorName);

  useEffect(() => {
    if (!mesh || !material) {
      return;
    }

    const uuid = mesh.uuid; // freeze local reference

    // register display item
    items[uuid] = {
      mesh,
      material,
      factorName: factorNameRef.current,
      animationClip: animationClipRef.current
    };

    // on unmount, clean up
    return () => {
      delete items[uuid];
    };
  }, [items, mesh, material]);
}

export function useLightRegister(
  light: WorkbenchLightType | null,
  factorName: string | null
) {
  const { lights } = useWorkbenchStagingContext();

  const factorNameRef = useRef(factorName);

  useEffect(() => {
    if (!light) {
      return;
    }

    const uuid = light.uuid; // freeze local reference

    // register display item
    lights[uuid] = {
      light,
      factorName: factorNameRef.current
    };

    // on unmount, clean up
    return () => {
      delete lights[uuid];
    };
  }, [lights, light]);
}

const IrradianceSurfaceManager: React.FC<{
  lightMapWidth: number;
  lightMapHeight: number;
  autoStartDelayMs?: number;
  children: (
    workbench: Workbench | null,
    startWorkbench: () => void
  ) => React.ReactNode;
}> = ({ lightMapWidth, lightMapHeight, autoStartDelayMs, children }) => {
  // read once
  const lightMapWidthRef = useRef(lightMapWidth);
  const lightMapHeightRef = useRef(lightMapHeight);

  // collect current available meshes/lights
  const workbenchStage = useMemo(
    () => ({
      items: {} as { [uuid: string]: WorkbenchStagingItem },
      lights: {} as { [uuid: string]: WorkbenchSceneLight }
    }),
    []
  );

  // basic snapshot triggered by start handler
  const [workbenchBasics, setWorkbenchBasics] = useState<{
    id: number; // for refresh
    items: WorkbenchSceneItem[];
    lights: WorkbenchSceneLight[];
  } | null>(null);

  const startHandler = useCallback(() => {
    // save a snapshot copy of staging data
    setWorkbenchBasics((prev) => ({
      id: prev ? prev.id + 1 : 1,
      items: Object.values(workbenchStage.items).map((item) => {
        const { material } = item;

        // determine whether this material uses a lightmap
        // (doing this at time of snapshot rather than earlier)
        const needsLightMap = !!material.lightMap;

        return {
          ...item,
          needsLightMap
        };
      }),
      lights: Object.values(workbenchStage.lights)
    }));
  }, [workbenchStage]);

  const autoStartDelayMsRef = useRef(autoStartDelayMs); // read once
  useEffect(() => {
    // do nothing if not specified
    if (autoStartDelayMsRef.current === undefined) {
      return;
    }

    const timeoutId = setTimeout(startHandler, autoStartDelayMsRef.current);

    // always clean up on unmount
    return clearTimeout.bind(null, timeoutId);
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
        lightSceneItems: workbenchBasics.items,
        lightSceneLights: workbenchBasics.lights,
        atlasMap
      });
    },
    [workbenchBasics]
  );

  return (
    <>
      <IrradianceWorkbenchContext.Provider value={workbenchStage}>
        {children(workbench, startHandler)}
      </IrradianceWorkbenchContext.Provider>

      {workbenchBasics && (
        <IrradianceAtlasMapper
          key={workbenchBasics.id} // re-create for new workbench
          width={lightMapWidthRef.current} // read from initial snapshot
          height={lightMapHeightRef.current} // read from initial snapshot
          lightSceneItems={workbenchBasics.items}
          onComplete={atlasMapHandler}
        />
      )}
    </>
  );
};

export default IrradianceSurfaceManager;
