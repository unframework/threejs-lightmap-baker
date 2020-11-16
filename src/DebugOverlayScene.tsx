import React, { useMemo } from 'react';
import { useResource, useFrame, useThree } from 'react-three-fiber';
import * as THREE from 'three';

import { useIrradianceTexture } from './core/IrradianceCompositor';
import { PROBE_BATCH_COUNT } from './core/IrradianceLightProbe';

// simple debug material that skips tone mapping
// @todo replace with meshBasicMaterial (currently latter shows up brighter even with toneMapped = false)
const DebugMaterial: React.FC<{
  attach?: string;
  map: THREE.Texture;
}> = ({ attach, map }) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
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
      }),
    []
  );

  // disposable managed object
  return (
    <primitive object={material} attach={attach} uniforms-map-value={map} />
  );
};

export const DebugOverlayScene: React.FC<{
  atlasTexture?: THREE.Texture | null;
  probeTexture?: THREE.Texture | null;
}> = React.memo(({ atlasTexture, probeTexture }) => {
  const outputTexture = useIrradianceTexture();

  const [debugSceneRef, debugScene] = useResource<THREE.Scene>();

  const { size } = useThree();
  const debugCamera = useMemo(() => {
    // top-left corner is (0, 100), top-right is (100, 100)
    const aspect = size.height / size.width;
    return new THREE.OrthographicCamera(0, 100, 100, 100 * (1 - aspect), -1, 1);
  }, [size]);

  useFrame(({ gl }) => {
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(debugScene, debugCamera);
    gl.autoClear = true;
  }, 30);

  return (
    <scene ref={debugSceneRef}>
      {outputTexture && (
        <mesh position={[85, 85, 0]}>
          <planeBufferGeometry attach="geometry" args={[20, 20]} />
          <DebugMaterial attach="material" map={outputTexture} />
        </mesh>
      )}

      {atlasTexture && (
        <mesh position={[85, 64, 0]}>
          <planeBufferGeometry attach="geometry" args={[20, 20]} />
          <DebugMaterial attach="material" map={atlasTexture} />
        </mesh>
      )}

      {probeTexture && (
        <mesh position={[10, 95 - (5 * PROBE_BATCH_COUNT) / 2, 0]}>
          <planeBufferGeometry
            attach="geometry"
            args={[10, 5 * PROBE_BATCH_COUNT]}
          />
          <DebugMaterial attach="material" map={probeTexture} />
        </mesh>
      )}
    </scene>
  );
});
