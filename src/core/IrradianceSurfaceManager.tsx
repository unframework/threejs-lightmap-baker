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
  AtlasMap
} from './IrradianceAtlasMapper';

export type { Workbench, WorkbenchSceneItem, WorkbenchSceneLight };

const IrradianceWorkbenchContext = React.createContext<{
  items: { [uuid: string]: WorkbenchSceneItem | undefined };
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

    // determine whether this material accepts a lightmap
    const hasUV2 =
      mesh.geometry instanceof THREE.Geometry
        ? mesh.geometry.faceVertexUvs.length > 1
        : !!mesh.geometry.attributes.uv2;

    // register display item
    items[uuid] = {
      mesh,
      material,
      hasUV2,
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
  light: THREE.DirectionalLight | null,
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
      dirLight: light,
      factorName: factorNameRef.current
    };

    // on unmount, clean up
    return () => {
      delete lights[uuid];
    };
  }, [lights, light]);
}

const IrradianceSurfaceManager: React.FC<{
  autoStartDelayMs?: number;
  children: (
    workbench: Workbench | null,
    startWorkbench: () => void
  ) => React.ReactElement;
}> = ({ autoStartDelayMs, children }) => {
  // collect current available meshes/lights
  const workbenchStage = useMemo(
    () => ({
      items: {},
      lights: {}
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
      items: Object.values(workbenchStage.items),
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
          lightSceneItems={workbenchBasics.items}
          onComplete={atlasMapHandler}
        />
      )}
    </>
  );
};

export default IrradianceSurfaceManager;
