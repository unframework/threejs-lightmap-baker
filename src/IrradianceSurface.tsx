import React, { useContext, useEffect, useRef } from 'react';
import { useUpdate } from 'react-three-fiber';
import * as THREE from 'three';

import {
  useAtlasMeshRegister,
  IrradianceTextureContext
} from './IrradianceSurfaceManager';

// tracks given geometry as part of light scene and attaches resulting lightmap to its material
// @todo separate the two?
export const IrradianceSurface: React.FC<{
  factor?: string;
  animationClip?: THREE.AnimationClip;
  children: React.ReactElement<{}, 'mesh' | 'primitive'>;
}> = ({ factor, animationClip, children }) => {
  const irradianceMap = useContext(IrradianceTextureContext);

  if (!irradianceMap) {
    throw new Error('no texture provided');
  }

  const meshRegistrationHandler = useAtlasMeshRegister(
    factor || null,
    animationClip || null
  );

  const materialRef = useRef<THREE.MeshLambertMaterial | undefined>(undefined);

  const meshRef = useUpdate<THREE.Mesh>(
    (mesh) => {
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

  return React.cloneElement(children, { ref: meshRef });
};

export default IrradianceSurface;
