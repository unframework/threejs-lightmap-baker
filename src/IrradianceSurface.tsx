import React, { useContext, useRef } from 'react';
import { useFrame } from 'react-three-fiber';
import * as THREE from 'three';

import {
  useIrradianceAtlasContext,
  useAtlasMeshRef,
  IrradianceTextureContext
} from './IrradianceSurfaceManager';

// default white texture fill
const defaultTextureData = new Uint8Array([255, 255, 255, 255]);
const defaultTexture = new THREE.DataTexture(
  defaultTextureData,
  1,
  1,
  THREE.RGBAFormat
);

const IrradianceMeshMaterial: React.FC<{
  attach?: string;
  albedoMap?: THREE.Texture;
  emissiveIntensity?: number;
  emissiveMap?: THREE.Texture;
  materialRef?: React.MutableRefObject<THREE.ShaderMaterial | null>;
}> = ({ attach, albedoMap, emissiveIntensity, emissiveMap, materialRef }) => {
  const irradianceMap = useContext(IrradianceTextureContext);

  if (!irradianceMap) {
    throw new Error('no texture provided');
  }

  // disposable managed object
  return (
    <meshLambertMaterial
      attach={attach}
      map={albedoMap || defaultTexture}
      emissiveMap={emissiveMap || defaultTexture}
      emissiveIntensity={emissiveIntensity || 0}
      lightMap={irradianceMap}
      ref={materialRef}
    />
  );
};

export const IrradianceSurface: React.FC<{
  albedoMap?: THREE.Texture;
  emissiveMap?: THREE.Texture;
  emissiveIntensity?: number;
  factor?: string;
  children: React.ReactElement<{}, 'mesh' | 'primitive'>;
}> = ({ albedoMap, emissiveMap, emissiveIntensity, factor, children }) => {
  const atlas = useIrradianceAtlasContext();

  const meshRef = useAtlasMeshRef(
    albedoMap,
    emissiveMap,
    emissiveIntensity,
    factor
  );
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  // @todo consider how to skip if not a light factor
  useFrame(() => {
    if (materialRef.current && emissiveIntensity && factor) {
      // read latest value live
      const multiplier = atlas.factorValues[factor];
      materialRef.current.uniforms.emissiveIntensity.value =
        emissiveIntensity * (multiplier || 0);

      materialRef.current.uniformsNeedUpdate = true;
    }
  }, 10);

  return React.cloneElement(
    children,
    { ref: meshRef },
    children.props.children,
    <IrradianceMeshMaterial
      attach="material"
      albedoMap={albedoMap}
      emissiveMap={emissiveMap}
      emissiveIntensity={factor ? 0 : emissiveIntensity}
      materialRef={materialRef}
    />
  );
};

export default IrradianceSurface;
