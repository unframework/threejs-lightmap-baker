import React, { useMemo, useCallback, useContext, useRef } from 'react';
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
  factorName: string | null,
  animationClip: THREE.AnimationClip | null
) {
  const { lightSceneItems } = useIrradianceWorkbenchContext();

  // wrap in refs to keep only initial value
  const animationClipRef = useRef(animationClip);
  const factorNameRef = useRef(factorName);

  const meshRegistrationHandler = useCallback(
    (mesh: THREE.Mesh, material: THREE.MeshLambertMaterial) => {
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
    },
    [lightSceneItems]
  );

  return meshRegistrationHandler;
}

export function useLightRegister(factorName: string | null) {
  const { lightSceneLights } = useIrradianceWorkbenchContext();

  const factorNameRef = useRef(factorName);

  const lightRegistrationHandler = useCallback(
    (light: THREE.DirectionalLight) => {
      // register display item
      lightSceneLights.push({
        dirLight: light,
        factorName: factorNameRef.current
      });
    },
    [lightSceneLights]
  );

  return lightRegistrationHandler;
}

const IrradianceSurfaceManager: React.FC<{
  children: (workbench: Workbench | null) => React.ReactElement;
}> = ({ children }) => {
  const workbench: Workbench = useMemo(
    () => ({
      lightSceneItems: [],
      lightSceneLights: []
    }),
    []
  );

  return (
    <IrradianceWorkbenchContext.Provider value={workbench}>
      {children(workbench)}
    </IrradianceWorkbenchContext.Provider>
  );
};

export default IrradianceSurfaceManager;
