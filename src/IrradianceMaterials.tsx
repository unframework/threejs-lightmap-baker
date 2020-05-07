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
export const ProbeLightMaterial: React.FC<{
  attach?: string;
  amount: number;
  map?: THREE.Texture;
}> = ({ attach, amount, map }) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0xffffff) },
      amount: { value: 1 },
      luminance: { value: null }
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
      uniform sampler2D luminance;
      uniform vec3 color;
      uniform float amount;
      varying vec2 vUV;

      void main() {
        vec3 base = texture2D(luminance, vUV).rgb;
        gl_FragColor = vec4(color * amount * base, 1.0);
      }
    `
  });

  // disposable managed object
  return (
    <primitive
      object={material}
      attach={attach}
      uniforms-amount-value={amount}
      uniforms-luminance-value={map || defaultTexture}
    />
  );
};

export const ProbeMeshMaterial: React.FC<{
  attach?: string;
  map?: THREE.Texture;
  lumMap: THREE.Texture;
}> = ({ attach, map, lumMap }) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      albedo: { value: null },
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
      uniform sampler2D albedo;
      uniform sampler2D lum;
      varying vec2 vUV;
      varying vec2 vLumUV;

      void main() {
        vec4 base = texture2D(albedo, vUV);
        vec4 irradiance = texture2D(lum, vLumUV);
        gl_FragColor = base * irradiance;
      }
    `
  });

  // disposable managed object
  return (
    <primitive
      object={material}
      attach={attach}
      uniforms-albedo-value={map || defaultTexture}
      uniforms-lum-value={lumMap}
    />
  );
};

export const IrradianceMeshMaterial: React.FC<{
  attach?: string;
  map?: THREE.Texture;
}> = ({ attach, map }) => {
  const lumMap = useIrradianceTexture();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      albedo: { value: null },
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
      uniform sampler2D albedo;
      uniform sampler2D lum;
      varying vec2 vUV;
      varying vec2 vLumUV;

      void main() {
        vec3 base = texture2D(albedo, vUV).rgb;
        vec3 irradiance = texture2D(lum, vLumUV).rgb;
        gl_FragColor = vec4(toneMapping(base * irradiance), 1.0);
      }
    `
  });

  // disposable managed object
  return (
    <primitive
      object={material}
      attach={attach}
      uniforms-albedo-value={map || defaultTexture}
      uniforms-lum-value={lumMap}
    />
  );
};

export const IrradianceLightMaterial: React.FC<{
  attach?: string;
  amount: number;
  map?: THREE.Texture;
}> = ({ attach, amount, map }) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0xffffff) },
      amount: { value: 1 },
      luminance: { value: null }
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
      uniform sampler2D luminance;
      uniform vec3 color;
      uniform float amount;
      varying vec2 vUV;

      void main() {
        vec3 base = texture2D(luminance, vUV).rgb;
        gl_FragColor = vec4(toneMapping(color * amount * base), 1.0);
      }
    `
  });

  // disposable managed object
  return (
    <primitive
      object={material}
      attach={attach}
      uniforms-amount-value={amount}
      uniforms-luminance-value={map || defaultTexture}
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
