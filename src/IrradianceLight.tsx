import React from 'react';

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
