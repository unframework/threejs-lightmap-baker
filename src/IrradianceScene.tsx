import React from 'react';
import { useUpdate } from 'react-three-fiber';
import * as THREE from 'three';

import { useMeshRegister, useLightRegister } from './IrradianceSurfaceManager';

// add as a child of a mesh to track it as a contributor of the light scene
export const IrradianceSurface: React.FC<{
  factor?: string;
  animationClip?: THREE.AnimationClip;
}> = ({ factor, animationClip }) => {
  const meshRegistrationHandler = useMeshRegister(
    factor || null,
    animationClip || null
  );

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

      // add to light scene
      meshRegistrationHandler(mesh, material);
    },
    [meshRegistrationHandler]
  );

  return <group ref={groupRef} />;
};

// add as a child of a light object to track it as a contributor of the light scene
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
