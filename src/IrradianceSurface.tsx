import React, { useContext, useEffect, useRef } from 'react';
import { useFrame } from 'react-three-fiber';
import * as THREE from 'three';

import {
  useAtlasMeshRef,
  IrradianceTextureContext
} from './IrradianceSurfaceManager';

export const IrradianceSurface: React.FC<{
  factor?: string;
  children: React.ReactElement<{}, 'mesh' | 'primitive'>;
  innerRef?: React.MutableRefObject<THREE.Mesh | undefined>; // convenience ref
  innerMaterialRef?: React.MutableRefObject<
    THREE.MeshLambertMaterial | undefined
  >; // convenience ref
}> = ({ factor, children, innerRef, innerMaterialRef }) => {
  const irradianceMap = useContext(IrradianceTextureContext);

  if (!irradianceMap) {
    throw new Error('no texture provided');
  }

  const materialRef = useRef<THREE.MeshLambertMaterial | undefined>(undefined);
  const meshRef = useAtlasMeshRef(factor || null, (mesh) => {
    if (Array.isArray(mesh.material)) {
      throw new Error('material array not supported');
    }

    if (!(mesh.material instanceof THREE.MeshLambertMaterial)) {
      throw new Error('only Lambert materials are supported');
    }

    materialRef.current = mesh.material;

    // fill convenience refs for upstream
    if (innerRef) {
      innerRef.current = mesh;
    }

    if (innerMaterialRef) {
      innerMaterialRef.current = mesh.material;
    }
  });

  // override lightmap with our own
  useEffect(() => {
    const material = materialRef.current;

    if (!material) {
      return;
    }

    material.lightMap = irradianceMap;
  }, [irradianceMap]);

  // @todo dynamic light factor update

  return React.cloneElement(children, { ref: meshRef });
};

export default IrradianceSurface;
