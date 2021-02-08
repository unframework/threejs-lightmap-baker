import React, { useMemo, useContext } from 'react';
import {
  useResource,
  useFrame,
  useThree,
  createPortal
} from 'react-three-fiber';
import * as THREE from 'three';

import { useIrradianceTexture } from '../core/IrradianceCompositor';
import { PROBE_BATCH_COUNT } from '../core/IrradianceLightProbe';

const DebugOverlayContext = React.createContext<THREE.Scene | null>(null);

// set up a special render loop with a debug overlay for various widgets (see below)
export const DebugOverlayRenderer: React.FC<{
  children: (sceneRef: React.MutableRefObject<THREE.Scene>) => React.ReactNode;
}> = ({ children }) => {
  const mainSceneRef = useResource<THREE.Scene>();
  const debugSceneRef = useResource<THREE.Scene>();

  const { size } = useThree();
  const debugCamera = useMemo(() => {
    // top-left corner is (0, 100), top-right is (100, 100)
    const aspect = size.height / size.width;
    return new THREE.OrthographicCamera(0, 100, 100, 100 * (1 - aspect), -1, 1);
  }, [size]);

  useFrame(({ gl, camera }) => {
    gl.render(mainSceneRef.current, camera);
  }, 20);

  useFrame(({ gl }) => {
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(debugSceneRef.current, debugCamera);
    gl.autoClear = true;
  }, 30);

  return (
    <>
      <DebugOverlayContext.Provider value={debugSceneRef.current || null}>
        {children(mainSceneRef)}
      </DebugOverlayContext.Provider>

      {/* portal container for debug widgets */}
      <scene ref={debugSceneRef} />
    </>
  );
};

// show provided textures as widgets on debug overlay (via createPortal)
export const DebugOverlayWidgets: React.FC<{
  atlasTexture?: THREE.Texture | null;
  probeTexture?: THREE.Texture | null;
}> = React.memo(({ atlasTexture, probeTexture }) => {
  const debugScene = useContext(DebugOverlayContext);

  const outputTexture = useIrradianceTexture();

  if (!debugScene) {
    return null;
  }

  return (
    <>
      {createPortal(
        <>
          {outputTexture && (
            <mesh position={[85, 85, 0]}>
              <planeBufferGeometry attach="geometry" args={[20, 20]} />
              <meshBasicMaterial
                attach="material"
                map={outputTexture}
                toneMapped={false}
              />
            </mesh>
          )}

          {atlasTexture && (
            <mesh position={[85, 64, 0]}>
              <planeBufferGeometry attach="geometry" args={[20, 20]} />
              <meshBasicMaterial
                attach="material"
                map={atlasTexture}
                toneMapped={false}
              />
            </mesh>
          )}

          {probeTexture && (
            <mesh position={[10, 95 - (5 * PROBE_BATCH_COUNT) / 2, 0]}>
              <planeBufferGeometry
                attach="geometry"
                args={[10, 5 * PROBE_BATCH_COUNT]}
              />
              <meshBasicMaterial
                attach="material"
                map={probeTexture}
                toneMapped={false}
              />
            </mesh>
          )}
        </>,
        debugScene
      )}
    </>
  );
});
