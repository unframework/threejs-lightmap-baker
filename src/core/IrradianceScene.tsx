/*
 * Copyright (c) 2020-now Nick Matantsev
 * Licensed under the MIT license
 */

import React from 'react';
import { useResource } from 'react-three-fiber';
import * as THREE from 'three';

import { useMeshRegister, useLightRegister } from './IrradianceSurfaceManager';

// add as a child of a mesh to track it as a contributor of the light scene
export const IrradianceSurface: React.FC<{
  factor?: string;
  animationClip?: THREE.AnimationClip;
}> = ({ factor, animationClip }) => {
  const groupRef = useResource<THREE.Group>();

  const mesh = groupRef.current && groupRef.current.parent;

  // extra error checks
  if (mesh) {
    if (!(mesh instanceof THREE.Mesh)) {
      throw new Error('light scene element should be a mesh');
    }

    if (Array.isArray(mesh.material)) {
      throw new Error('material array not supported');
    }

    if (!(mesh.material instanceof THREE.MeshLambertMaterial)) {
      throw new Error('only Lambert materials are supported');
    }
  }

  useMeshRegister(
    mesh,
    mesh && mesh.material instanceof THREE.MeshLambertMaterial
      ? mesh.material
      : null,
    factor || null,
    animationClip || null
  );

  // placeholder to attach under the target mesh
  return <group ref={groupRef} />;
};

// add as a child of a light object to track it as a contributor of the light scene
export const IrradianceLight: React.FC<{
  factor?: string;
}> = ({ factor, children }) => {
  const groupRef = useResource<THREE.Group>();

  const light = groupRef.current && groupRef.current.parent;

  if (light && !(light instanceof THREE.DirectionalLight)) {
    throw new Error('only directional lights are supported');
  }

  // @todo dynamic light factor update
  useLightRegister(light, factor || null);

  return <group ref={groupRef} />;
};
