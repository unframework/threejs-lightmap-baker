/*
 * Copyright (c) 2020-now Nick Matantsev
 * Licensed under the MIT license
 */

import React, { useRef, useEffect } from 'react';
import { useResource } from 'react-three-fiber';
import * as THREE from 'three';

import { useIrradianceTexture } from './IrradianceCompositor';

// add as a child of a mesh to track it as a contributor of the light scene
// @todo remove
export const IrradianceSurface: React.FC<{
  mapped?: boolean;
}> = ({ mapped }) => {
  const mappedRef = useRef(mapped); // read once

  const groupRef = useResource<THREE.Group>();
  const mesh = groupRef.current && groupRef.current.parent;

  // extra error checks
  if (mesh) {
    if (!(mesh instanceof THREE.Mesh)) {
      throw new Error('light scene element should be a mesh');
    }
  }

  const material = mesh && mesh.material;

  if (material) {
    if (Array.isArray(material)) {
      throw new Error('material array not supported');
    }

    if (
      !(material instanceof THREE.MeshLambertMaterial) &&
      !(material instanceof THREE.MeshPhongMaterial) &&
      !(material instanceof THREE.MeshStandardMaterial)
    ) {
      throw new Error('only Lambert/Phong/standard materials are supported');
    }
  }

  // attach light map
  const lightMap = useIrradianceTexture();
  useEffect(() => {
    if (!mappedRef.current || !material) {
      return;
    }

    // check against accidentally overriding some unrelated lightmap
    if (material.lightMap && material.lightMap !== lightMap) {
      throw new Error('do not set light map manually');
    }

    material.lightMap = lightMap;
  }, [material, lightMap]);

  // placeholder to attach under the target mesh
  return <group ref={groupRef} />;
};
