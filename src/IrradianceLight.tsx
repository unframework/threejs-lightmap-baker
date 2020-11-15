import React from 'react';
import { useUpdate } from 'react-three-fiber';
import * as THREE from 'three';

import { useLightRegister } from './IrradianceSurfaceManager';

export const IrradianceLight: React.FC<{
  factor?: string;
  children: React.ReactElement<{}, 'mesh' | 'primitive'>;
}> = ({ factor, children }) => {
  // @todo dynamic light factor update
  const lightRegistrationHandler = useLightRegister(factor || null);

  const lightRef = useUpdate<THREE.Light>(
    (light) => {
      if (!(light instanceof THREE.DirectionalLight)) {
        throw new Error('only directional lights are supported');
      }

      lightRegistrationHandler(light);
    },
    [lightRegistrationHandler]
  );

  return React.cloneElement(children, { ref: lightRef });
};

export default IrradianceLight;
