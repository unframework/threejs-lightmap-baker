import React, { useContext, useEffect, useRef } from 'react';
import { useUpdate } from 'react-three-fiber';
import * as THREE from 'three';

import {
  useAtlasMeshRegister,
  useLightRegister,
  IrradianceTextureContext
} from './IrradianceSurfaceManager';

// tracks given geometry as part of light scene and attaches resulting lightmap to its material
// @todo separate the two?
export const IrradianceSurface: React.FC<{
  factor?: string;
  animationClip?: THREE.AnimationClip;
}> = ({ factor, animationClip }) => {
  const irradianceMap = useContext(IrradianceTextureContext);

  if (!irradianceMap) {
    throw new Error('no texture provided');
  }

  const meshRegistrationHandler = useAtlasMeshRegister(
    factor || null,
    animationClip || null
  );

  const materialRef = useRef<THREE.MeshLambertMaterial | undefined>(undefined);

  // get placeholder to attach under the target mesh
  const groupRef = useUpdate<THREE.Group>(
    (group) => {
      const mesh = group.parent;
      if (!(mesh instanceof THREE.Mesh)) {
        throw new Error('light scene element should be a mesh');
      }

      const material = mesh.material;

      if (Array.isArray(material)) {
        throw new Error('material array not supported');
      }

      if (!(material instanceof THREE.MeshLambertMaterial)) {
        throw new Error('only Lambert materials are supported');
      }

      // stash reference for an attachment check later
      materialRef.current = material;

      // add to atlas
      meshRegistrationHandler(mesh, material);
    },
    [meshRegistrationHandler]
  );

  // override lightmap with our own
  useEffect(() => {
    const material = materialRef.current;

    if (!material) {
      return;
    }

    // only use lightmap if this has an atlas entry
    // @todo better signaling
    if (material.map) {
      material.lightMap = irradianceMap;
    }
  }, [irradianceMap]);

  return <group ref={groupRef} />;
};

export const IrradianceLight: React.FC<{
  factor?: string;
}> = ({ factor, children }) => {
  // @todo dynamic light factor update
  const lightRegistrationHandler = useLightRegister(factor || null);

  const groupRef = useUpdate<THREE.Group>(
    (group) => {
      const light = group.parent;

      if (!(light instanceof THREE.DirectionalLight)) {
        throw new Error('only directional lights are supported');
      }

      lightRegistrationHandler(light);
    },
    [lightRegistrationHandler]
  );

  return <group ref={groupRef} />;
};
