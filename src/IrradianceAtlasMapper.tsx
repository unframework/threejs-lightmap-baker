import React, { useMemo, useEffect, useRef } from 'react';
import { useFrame } from 'react-three-fiber';
import * as THREE from 'three';

import {
  useIrradianceAtlasContext,
  AtlasQuad,
  atlasWidth,
  atlasHeight
} from './IrradianceSurfaceManager';

// write out original face geometry info into the atlas map
// each texel corresponds to: (quadX, quadY, quadIndex)
// where quadX and quadY are 0..1 representing a spot in the original quad
// which allows to find original 3D position/normal/etc for that texel
// (quad index is int stored as float, but precision should be good enough)
// @todo consider rounding to account for texel size
const AtlasQuadMaterial: React.FC<{ quadIndex: number; quad: AtlasQuad }> = ({
  quadIndex,
  quad
}) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          quadIndex: { value: 0 },
          left: { value: 0 },
          top: { value: 0 },
          sizeU: { value: 0 },
          sizeV: { value: 0 }
        },

        vertexShader: `
          uniform float left;
          uniform float top;
          uniform float sizeU;
          uniform float sizeV;
          varying vec2 vQuadPos;

          void main() {
            vec4 worldPosition = modelMatrix * vec4( position, 1.0 );

            vQuadPos = worldPosition.xy;

            gl_Position = projectionMatrix * vec4(
              left + sizeU * worldPosition.x,
              top + sizeV * worldPosition.y,
              0,
              1.0
            );
          }
        `,
        fragmentShader: `
          uniform float quadIndex;
          varying vec2 vQuadPos;

          void main() {
            gl_FragColor = vec4(vQuadPos, quadIndex, 1.0);
          }
        `
      }),
    []
  );

  return (
    <primitive
      attach="material"
      object={material}
      uniforms-quadIndex-value={quadIndex}
      uniforms-left-value={quad.left}
      uniforms-top-value={quad.top}
      uniforms-sizeU-value={quad.sizeU}
      uniforms-sizeV-value={quad.sizeV}
    />
  );
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
        {atlas.quads.map((quad, quadIndex) => (
          <mesh key={quadIndex} position={[0.5, 0.5, 0]}>
            <planeBufferGeometry attach="geometry" args={[1, 1]} />
            <AtlasQuadMaterial quadIndex={quadIndex} quad={quad} />
          </mesh>
        ))}
      </scene>
    )
  };
}
