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

  // @todo this should be inside memo??
  const material = new THREE.ShaderMaterial({
    uniforms: {
      albedoMap: { value: null },
      emissiveMap: { value: null },
      emissiveIntensity: { value: null },
      irradianceMap: { value: null }
    },

    vertexShader: `
      attribute vec2 uv2;
      varying vec2 vUV;
      varying vec2 vAtlasUV;

      void main() {
        vUV = uv;
        vAtlasUV = uv2;

        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      uniform float emissiveIntensity;
      uniform sampler2D albedoMap;
      uniform sampler2D emissiveMap;
      uniform sampler2D irradianceMap;
      varying vec2 vUV;
      varying vec2 vAtlasUV;

      void main() {
        // drastically reduce emissive intensity at display time to preserve colour
        float emissiveFaded = emissiveIntensity * 0.25;

        vec3 base = texture2D(albedoMap, vUV).rgb;
        vec3 emit = texture2D(emissiveMap, vUV).rgb * emissiveFaded;
        vec3 irradiance = texture2D(irradianceMap, vAtlasUV).rgb;
        gl_FragColor = vec4(toneMapping(base * irradiance + emit), 1.0);
        gl_FragColor = linearToOutputTexel( gl_FragColor );
      }
    `
  });

  // disposable managed object
  return (
    <primitive
      object={material}
      attach={attach}
      uniforms-albedoMap-value={albedoMap || defaultTexture}
      uniforms-emissiveMap-value={emissiveMap || defaultTexture}
      uniforms-emissiveIntensity-value={emissiveIntensity || 0}
      uniforms-irradianceMap-value={irradianceMap}
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
