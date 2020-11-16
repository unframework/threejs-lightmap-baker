import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useContext,
  useRef
} from 'react';
import * as THREE from 'three';

export interface WorkbenchSceneItem {
  mesh: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
  hasUV2: boolean;
  factorName: string | null;
  animationClip: THREE.AnimationClip | null;
}

export interface WorkbenchSceneLight {
  dirLight: THREE.DirectionalLight;
  factorName: string | null;
}

export interface WorkbenchLightFactor {
  mesh: THREE.Mesh;
  emissiveIntensity: number;
}

export interface Workbench {
  lightSceneItems: WorkbenchSceneItem[];
  lightSceneLights: WorkbenchSceneLight[];
}

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
  children: (
    workbench: Workbench | null,
    startWorkbench: () => void
  ) => React.ReactElement;
}> = ({ children }) => {
  // collect current available meshes/lights
  const workbenchStage = useMemo(
    () => ({
      items: {},
      lights: {}
    }),
    []
  );

  // snapshot triggered by start handler
  const [workbench, setWorkbench] = useState<Workbench | null>(null);

  const startHandler = useCallback(() => {
    // save a snapshot copy of staging data
    setWorkbench({
      lightSceneItems: Object.values(workbenchStage.items),
      lightSceneLights: Object.values(workbenchStage.lights)
    });
  }, [workbenchStage]);

  return (
    <IrradianceWorkbenchContext.Provider value={workbenchStage}>
      {children(workbench, startHandler)}
    </IrradianceWorkbenchContext.Provider>
  );
};

export default IrradianceSurfaceManager;
