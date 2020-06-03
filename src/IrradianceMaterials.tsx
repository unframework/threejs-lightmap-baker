import React from 'react';
import * as THREE from 'three';

// @todo move to surface manager
export const IrradianceDebugMaterial: React.FC<{
  attach?: string;
  irradianceMap: THREE.Texture;
}> = ({ attach, irradianceMap }) => {
  // @todo this should be inside memo??
  const material = new THREE.ShaderMaterial({
    uniforms: {
      irradianceMap: { value: null }
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
      uniform sampler2D irradianceMap;
      varying vec2 vUV;

      void main() {
        gl_FragColor = texture2D(irradianceMap, vUV);
      }
    `
  });

  // disposable managed object
  return (
    <primitive
      object={material}
      attach={attach}
      uniforms-irradianceMap-value={irradianceMap}
    />
  );
};
