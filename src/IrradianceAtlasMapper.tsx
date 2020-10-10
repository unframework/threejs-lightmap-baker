import React, { useMemo, useEffect, useRef } from 'react';
import { useFrame } from 'react-three-fiber';
import * as THREE from 'three';

import {
  useIrradianceAtlasContext,
  atlasWidth,
  atlasHeight
} from './IrradianceSurfaceManager';

const AtlasItemMaterial: React.FC<{}> = ({}) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: `
          varying vec2 vUV;

          void main() {
            vUV = position.xy;

            vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          }
        `,
        fragmentShader: `
          varying vec2 vUV;

          void main() {
            gl_FragColor = vec4(vUV, 0, 1.0);
          }
        `
      }),
    []
  );

  return <primitive attach="material" object={material} />;
};

// @todo dispose of render target, etc
export function useIrradianceAtlasMapper(): {
  atlasMapTexture: THREE.Texture;
  mapperSceneElement: React.ReactElement | null;
} {
  const orthoSceneRef = useRef<THREE.Scene>();
  const renderComplete = useRef(false);

  const atlas = useIrradianceAtlasContext();

  const orthoTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(atlasWidth, atlasHeight, {
      type: THREE.FloatType,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      generateMipmaps: false
    });
  }, []);

  const orthoCamera = useMemo(() => {
    return new THREE.OrthographicCamera(0, 1, 1, 0, 0, 1);
  }, []);

  useFrame(({ gl }) => {
    // ensure render scene has been instantiated
    if (!orthoSceneRef.current || renderComplete.current) {
      return;
    }

    renderComplete.current = true; // prevent further renders

    const orthoScene = orthoSceneRef.current; // local var for type safety

    // produce the output
    gl.autoClear = true;
    gl.setRenderTarget(orthoTarget);
    gl.render(orthoScene, orthoCamera);
    gl.setRenderTarget(null);
  }, 10);

  return {
    atlasMapTexture: orthoTarget.texture,
    mapperSceneElement: (
      <scene ref={orthoSceneRef}>
        {atlas.lightSceneItems.map((item, itemIndex) => (
          <mesh key={itemIndex} position={[0.5, 0.5, 0]}>
            <planeBufferGeometry attach="geometry" args={[1, 1]} />
            <AtlasItemMaterial />
          </mesh>
        ))}
      </scene>
    )
  };
}
