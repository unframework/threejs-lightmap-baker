import React from 'react';
import * as THREE from 'three';

// simple debug material that skips tone mapping
export const DebugMaterial: React.FC<{
  attach?: string;
  map: THREE.Texture;
}> = ({ attach, map }) => {
  // @todo this should be inside memo??
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: null }
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
      uniform sampler2D map;
      varying vec2 vUV;

      void main() {
        gl_FragColor = texture2D(map, vUV);
      }
    `
  });

  // disposable managed object
  return (
    <primitive object={material} attach={attach} uniforms-map-value={map} />
  );
};
