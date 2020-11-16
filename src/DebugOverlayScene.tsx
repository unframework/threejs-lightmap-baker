import React, { useMemo } from 'react';
import { useResource, useFrame, useThree } from 'react-three-fiber';
import * as THREE from 'three';

import { PROBE_BATCH_COUNT } from './IrradianceLightProbe';
import { DebugMaterial } from './DebugMaterial';

export const DebugOverlayScene: React.FC<{
  atlasTexture?: THREE.Texture | null;
  outputTexture?: THREE.Texture | null;
  probeTexture?: THREE.Texture | null;
}> = React.memo(({ atlasTexture, outputTexture, probeTexture }) => {
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
