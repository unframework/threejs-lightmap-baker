import React, { useContext } from 'react';
import * as THREE from 'three';

// default white texture fill
const defaultTextureData = new Uint8Array([255, 255, 255, 255]);
const defaultTexture = new THREE.DataTexture(
  defaultTextureData,
  1,
  1,
  THREE.RGBAFormat
);

// @todo wrap in provider helper
export const IrradianceTextureContext = React.createContext<THREE.Texture | null>(
  null
);

function useIrradianceTexture() {
  const texture = useContext(IrradianceTextureContext);

  if (!texture) {
    throw new Error('no texture provided');
  }

  return texture;
}

// @todo move to baker logic
export const ProbeMeshMaterial: React.FC<{
  attach?: string;
  albedoMap?: THREE.Texture;
  emissiveIntensity?: number;
  emissiveMap?: THREE.Texture;
  lumMap: THREE.Texture;
}> = ({ attach, albedoMap, emissiveIntensity, emissiveMap, lumMap }) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      albedoMap: { value: null },
      emissiveMap: { value: null },
      emissiveIntensity: { value: null },
      lum: { value: null }
    },

    vertexShader: `
      attribute vec2 lumUV;
      varying vec2 vUV;
      varying vec2 vLumUV;

      void main() {
        vUV = uv;
        vLumUV = lumUV;

        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      uniform float emissiveIntensity;
      uniform sampler2D albedoMap;
      uniform sampler2D emissiveMap;
      uniform sampler2D lum;
      varying vec2 vUV;
      varying vec2 vLumUV;

      void main() {
        vec4 base = texture2D(albedoMap, vUV);
        vec4 irradiance = texture2D(lum, vLumUV);
        vec4 emit = vec4(texture2D(emissiveMap, vUV).rgb * emissiveIntensity, 1.0);
        gl_FragColor = base * irradiance + emit;
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
      uniforms-lum-value={lumMap}
    />
  );
};

// @todo move to surface manager
export const IrradianceMeshMaterial: React.FC<{
  attach?: string;
  albedoMap?: THREE.Texture;
  emissiveIntensity?: number;
  emissiveMap?: THREE.Texture;
}> = ({ attach, albedoMap, emissiveIntensity, emissiveMap }) => {
  const lumMap = useIrradianceTexture();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      albedoMap: { value: null },
      emissiveMap: { value: null },
      emissiveIntensity: { value: null },
      lum: { value: null }
    },

    vertexShader: `
      attribute vec2 lumUV;
      varying vec2 vUV;
      varying vec2 vLumUV;

      void main() {
        vUV = uv;
        vLumUV = lumUV;

        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      uniform float emissiveIntensity;
      uniform sampler2D albedoMap;
      uniform sampler2D emissiveMap;
      uniform sampler2D lum;
      varying vec2 vUV;
      varying vec2 vLumUV;

      void main() {
        // drastically reduce emissive intensity at display time to preserve colour
        float emissiveFaded = 1.0 - 1.0 / (emissiveIntensity + 1.0);

        vec3 base = texture2D(albedoMap, vUV).rgb;
        vec3 emit = texture2D(emissiveMap, vUV).rgb * emissiveFaded;
        vec3 irradiance = texture2D(lum, vLumUV).rgb;
        gl_FragColor = vec4(toneMapping(base * irradiance + emit), 1.0);
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
      uniforms-lum-value={lumMap}
    />
  );
};

export const IrradianceDebugMaterial: React.FC<{
  attach?: string;
  lumMap: THREE.Texture;
}> = ({ attach, lumMap }) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      lum: { value: null }
    },

    vertexShader: `
      varying vec2 vUV;

      void main() {
        vUV = uv;

        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      uniform sampler2D lum;
      varying vec2 vUV;

      void main() {
        gl_FragColor = texture2D(lum, vUV);
      }
    `
  });

  // disposable managed object
  return (
    <primitive object={material} attach={attach} uniforms-lum-value={lumMap} />
  );
};
