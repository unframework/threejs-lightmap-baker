import React, { useContext, useEffect, useRef } from 'react';
import * as THREE from 'three';

import {
  useAtlasMeshRef,
  IrradianceTextureContext
} from './IrradianceSurfaceManager';

export const IrradianceSurface: React.FC<{
  factor?: string;
  animationClip?: THREE.AnimationClip;
  children: React.ReactElement<{}, 'mesh' | 'primitive'>;
}> = ({ factor, animationClip, children }) => {
  const irradianceMap = useContext(IrradianceTextureContext);

  if (!irradianceMap) {
    throw new Error('no texture provided');
  }

  const materialRef = useRef<THREE.MeshLambertMaterial | undefined>(undefined);
  const meshRef = useAtlasMeshRef(
    factor || null,
    animationClip || null,
    (mesh) => {
      if (Array.isArray(mesh.material)) {
        throw new Error('material array not supported');
      }

      if (!(mesh.material instanceof THREE.MeshLambertMaterial)) {
        throw new Error('only Lambert materials are supported');
      }

      materialRef.current = mesh.material;
    }
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
