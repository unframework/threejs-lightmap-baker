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

const IrradianceWorkbenchContext = React.createContext<Workbench | null>(null);

export function useIrradianceWorkbenchContext() {
  const atlasInfo = useContext(IrradianceWorkbenchContext);

  if (!atlasInfo) {
    throw new Error('must be inside manager context');
  }

  return atlasInfo;
}

// @todo wrap in provider helper
export const IrradianceTextureContext = React.createContext<THREE.Texture | null>(
  null
);

// allow to attach a mesh to be mapped in texture atlas
export function useMeshRegister(
  mesh: THREE.Mesh | null,
  material: THREE.MeshLambertMaterial | null,
  factorName: string | null,
  animationClip: THREE.AnimationClip | null
) {
  const { lightSceneItems } = useIrradianceWorkbenchContext();

  // wrap in refs to keep only initial value
  const animationClipRef = useRef(animationClip);
  const factorNameRef = useRef(factorName);

  useEffect(() => {
    if (!mesh || !material) {
      return;
    }

    // determine whether this material accepts a lightmap
    const hasUV2 =
      mesh.geometry instanceof THREE.Geometry
        ? mesh.geometry.faceVertexUvs.length > 1
        : !!mesh.geometry.attributes.uv2;

    // register display item
    lightSceneItems.push({
      mesh,
      material,
      hasUV2,
      factorName: factorNameRef.current,
      animationClip: animationClipRef.current
    });

    // on unmount, clean up
    return () => {
      const index = lightSceneItems.findIndex((item) => {
        return item.mesh === mesh;
      });

      if (index !== -1) {
        lightSceneItems.splice(index, 1);
      }
    };
  }, [lightSceneItems, mesh, material]);
}

export function useLightRegister(
  light: THREE.DirectionalLight | null,
  factorName: string | null
) {
  const { lightSceneLights } = useIrradianceWorkbenchContext();

  const factorNameRef = useRef(factorName);

  useEffect(() => {
    if (!light) {
      return;
    }

    // register display item
    lightSceneLights.push({
      dirLight: light,
      factorName: factorNameRef.current
    });

    // on unmount, clean up
    return () => {
      const index = lightSceneLights.findIndex((item) => {
        return item.dirLight === light;
      });

      if (index !== -1) {
        lightSceneLights.splice(index, 1);
      }
    };
  }, [lightSceneLights, light]);
}

const IrradianceSurfaceManager: React.FC<{
  children: (
    workbench: Workbench | null,
    startWorkbench: () => void
  ) => React.ReactElement;
}> = ({ children }) => {
  // collect current available meshes/lights
  const stagingWorkbench: Workbench = useMemo(
    () => ({
      lightSceneItems: [],
      lightSceneLights: []
    }),
    []
  );

  // snapshot triggered by start handler
  const [workbench, setWorkbench] = useState<Workbench | null>(null);

  const startHandler = useCallback(() => {
    // save a snapshot copy of staging data
    setWorkbench({
      lightSceneItems: [...stagingWorkbench.lightSceneItems],
      lightSceneLights: [...stagingWorkbench.lightSceneLights]
    });
  }, [stagingWorkbench]);

  return (
    <IrradianceWorkbenchContext.Provider value={stagingWorkbench}>
      {children(workbench, startHandler)}
    </IrradianceWorkbenchContext.Provider>
  );
};

export default IrradianceSurfaceManager;
