import React, { useContext } from 'react';
import * as THREE from 'three';

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
  intensity: number;
}> = ({ attach, intensity }) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0xffffff) },
      intensity: { value: 1 }
    },
    vertexShader: `
      void main() {
        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float intensity;

      void main() {
        gl_FragColor = vec4( color * intensity, 1.0 );
      }
    `
  });

  // disposable managed object
  return (
    <primitive
      object={material}
      attach={attach}
      uniforms-intensity-value={intensity}
    />
  );
};

export const ProbeMeshMaterial: React.FC<{
  attach?: string;
  lumMap: THREE.Texture;
}> = ({ attach, lumMap }) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      lum: { value: null }
    },

    vertexShader: `
      attribute vec2 lumUV;
      varying vec2 vUV;

      void main() {
        vUV = lumUV;

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

export const IrradianceMeshMaterial: React.FC<{
  attach?: string;
}> = ({ attach }) => {
  const lumMap = useIrradianceTexture();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      lum: { value: null }
    },

    vertexShader: `
      attribute vec2 lumUV;
      varying vec2 vUV;

      void main() {
        vUV = lumUV;

        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      uniform sampler2D lum;
      varying vec2 vUV;

      void main() {
        gl_FragColor = vec4(toneMapping(texture2D(lum, vUV).rgb), 1.0);
      }
    `
  });

  // disposable managed object
  return (
    <primitive object={material} attach={attach} uniforms-lum-value={lumMap} />
  );
};

export const IrradianceLightMaterial: React.FC<{
  attach?: string;
  intensity: number;
}> = ({ attach, intensity }) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0xffffff) },
      intensity: { value: 1 }
    },
    vertexShader: `
      void main() {
        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float intensity;

      void main() {
        gl_FragColor = vec4(toneMapping(color * intensity), 1.0);
      }
    `
  });

  // disposable managed object
  return (
    <primitive
      object={material}
      attach={attach}
      uniforms-intensity-value={intensity}
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
