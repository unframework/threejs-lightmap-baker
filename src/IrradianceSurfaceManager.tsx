import React, { useMemo, useCallback, useContext, useRef } from 'react';
import * as THREE from 'three';

export interface AtlasSceneItem {
  mesh: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
  hasUV2: boolean;
  factorName: string | null;
  animationClip: THREE.AnimationClip | null;
}

export interface AtlasSceneLight {
  dirLight: THREE.DirectionalLight;
  factorName: string | null;
}

export interface AtlasLightFactor {
  mesh: THREE.Mesh;
  emissiveIntensity: number;
}

export interface Atlas {
  lightSceneItems: AtlasSceneItem[];
  lightSceneLights: AtlasSceneLight[];
}

const IrradianceAtlasContext = React.createContext<Atlas | null>(null);

export function useIrradianceAtlasContext() {
  const atlasInfo = useContext(IrradianceAtlasContext);

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
export function useAtlasMeshRegister(
  factorName: string | null,
  animationClip: THREE.AnimationClip | null
) {
  const atlas = useIrradianceAtlasContext();
  const { lightSceneItems } = atlas;

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
  const { lightSceneLights } = useIrradianceAtlasContext();

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

const IrradianceSurfaceManager: React.FC = ({ children }) => {
  const atlas: Atlas = useMemo(
    () => ({
      lightSceneItems: [],
      lightSceneLights: []
    }),
    []
  );

  return (
    <IrradianceAtlasContext.Provider value={atlas}>
      {children}
    </IrradianceAtlasContext.Provider>
  );
};

export default IrradianceSurfaceManager;
