import React, { useContext, useEffect, useRef } from 'react';
import { useFrame } from 'react-three-fiber';
import * as THREE from 'three';

import { useLightRef } from './IrradianceSurfaceManager';

export const IrradianceLight: React.FC<{
  factor?: string;
  children: React.ReactElement<{}, 'mesh' | 'primitive'>;
}> = ({ factor, children }) => {
  const lightRef = useLightRef(factor || null);

  // @todo dynamic light factor update

  return React.cloneElement(children, { ref: lightRef });
};

export default IrradianceLight;
