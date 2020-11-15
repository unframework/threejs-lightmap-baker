import React from 'react';
import { useUpdate } from 'react-three-fiber';
import * as THREE from 'three';

import { useLightRegister } from './IrradianceSurfaceManager';

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
