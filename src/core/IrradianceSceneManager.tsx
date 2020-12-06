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

import { computeAutoUV2Layout, AutoUV2Settings } from './AutoUV2';

import IrradianceAtlasMapper, {
  Workbench,
  WorkbenchSceneItem,
  WorkbenchSceneLight,
  WorkbenchMaterialType,
  WorkbenchLightType,
  AtlasMap
} from './IrradianceAtlasMapper';

interface WorkbenchStagingItem {
  mesh: THREE.Mesh;
  material: WorkbenchMaterialType;
  isMapped: boolean;
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
  material: WorkbenchMaterialType | null,
  isMapped: boolean,
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
      isMapped,
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

const IrradianceSceneManager: React.FC<{
  lightMapWidth: number;
  lightMapHeight: number;
  autoUV2?: AutoUV2Settings;
  autoStartDelayMs?: number;
  children: (
    workbench: Workbench | null,
    startWorkbench: () => void
  ) => React.ReactNode;
}> = ({
  lightMapWidth,
  lightMapHeight,
  autoUV2,
  autoStartDelayMs,
  children
}) => {
  // read once
  const lightMapWidthRef = useRef(lightMapWidth);
  const lightMapHeightRef = useRef(lightMapHeight);
  const autoUV2Ref = useRef(autoUV2);

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
    needsUV2: boolean;
    items: WorkbenchSceneItem[];
    lights: WorkbenchSceneLight[];
  } | null>(null);

  const startHandler = useCallback(() => {
    // take a snapshot of existing staging items/lights
    const items = Object.values(workbenchStage.items).map((item) => {
      const { material, isMapped } = item;

      return {
        ...item,
        needsLightMap: isMapped // @todo eliminate separate staging item type
      };
    });

    const lights = Object.values(workbenchStage.lights);

    // save a snapshot copy of staging data
    setWorkbenchBasics((prev) => ({
      id: prev ? prev.id + 1 : 1,
      needsUV2: !!autoUV2Ref.current, // mark as needing UV2 computation if requested
      items,
      lights
    }));

    // schedule auto-UV layout for uv2 in a separate tick
    if (autoUV2Ref.current) {
      const settings = autoUV2Ref.current; // stable local reference

      setTimeout(() => {
        computeAutoUV2Layout(
          lightMapWidthRef.current,
          lightMapHeightRef.current,
          items
            .filter(({ needsLightMap }) => needsLightMap)
            .map(({ mesh }) => mesh),
          settings
        );

        // mark auto-UV as done
        setWorkbenchBasics((prev) => {
          // ignore if somehow a new state has popped on
          if (!prev || prev.items !== items) {
            return prev;
          }

          return {
            ...prev,
            needsUV2: false
          };
        });
      }, 0);
    }
  }, [workbenchStage]);

  // auto-start helper
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

      {workbenchBasics && !workbenchBasics.needsUV2 && (
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

export default IrradianceSceneManager;
