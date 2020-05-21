import React, { useMemo, useLayoutEffect, useContext, useRef } from 'react';
import { useThree, useFrame } from 'react-three-fiber';
import * as THREE from 'three';

import {
  useIrradianceAtlasContext,
  atlasWidth,
  atlasHeight
} from './IrradianceSurfaceManager';

const CompositorLayerMaterial: React.FC<{
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

export function useIrradianceCompositor(
  baseOutput: THREE.Texture,
  factorOutputs: { [name: string]: THREE.Texture }
) {
  const orthoSceneRef = useRef<THREE.Scene>();
  const atlas = useIrradianceAtlasContext();

  const orthoTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(atlasWidth, atlasHeight, {
      type: THREE.FloatType,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      generateMipmaps: false
    });
  }, []);

  const orthoCamera = useMemo(() => {
    return new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  }, []);

  useFrame(({ gl }) => {
    // ensure light scene has been instantiated
    if (!orthoSceneRef.current) {
      return;
    }

    const orthoScene = orthoSceneRef.current; // local var for type safety

    gl.autoClear = true;
    gl.setRenderTarget(orthoTarget);
    gl.render(orthoScene, orthoCamera);
    gl.setRenderTarget(null);
  }, 15);

  return {
    outputTexture: orthoTarget.texture,
    compositorSceneElement: (
      <scene ref={orthoSceneRef}>
        <mesh position={[0, 0, 0]}>
          <planeBufferGeometry attach="geometry" args={[2, 2]} />
          <CompositorLayerMaterial attach="material" map={baseOutput} />
        </mesh>
      </scene>
    )
  };
}
