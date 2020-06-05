import React, { useMemo, useEffect, useState } from 'react';
import { Canvas, useResource, useFrame, useThree } from 'react-three-fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

import IrradianceSurfaceManager, {
  IrradianceTextureContext
} from './IrradianceSurfaceManager';
import IrradianceSurface from './IrradianceSurface';
import { useIrradianceFactorRenderer } from './IrradianceFactorRenderer';
import { useIrradianceCompositor } from './IrradianceCompositor';
import SceneControls from './SceneControls';
import GridGeometry from './GridGeometry';
import { IrradianceDebugMaterial } from './IrradianceMaterials';

import sceneUrl from './tile-game-room1.glb';
import sceneTextureUrl from './tile-game-room1.png';
import sceneLumTextureUrl from './tile-game-room1-lum.png';

const Scene: React.FC<{
  loadedMesh: THREE.Mesh;
  loadedTexture: THREE.Texture;
  loadedEmissiveTexture: THREE.Texture;
}> = React.memo(({ loadedMesh, loadedTexture, loadedEmissiveTexture }) => {
  const {
    baseOutput,
    factorOutputs,
    lightSceneElement,
    handleDebugClick,
    probeDebugTextures
  } = useIrradianceFactorRenderer();

  const { outputTexture, compositorSceneElement } = useIrradianceCompositor(
    baseOutput,
    factorOutputs
  );

  // debug output texture
  // const outputTexture = Object.values(factorOutputs)[0] || baseOutput;

  const [mainSceneRef, mainScene] = useResource<THREE.Scene>();
  const [debugSceneRef, debugScene] = useResource<THREE.Scene>();

  const { size } = useThree();
  const debugCamera = useMemo(() => {
    // top-left corner is (0, 100), top-right is (100, 100)
    const aspect = size.height / size.width;
    return new THREE.OrthographicCamera(0, 100, 100, 100 * (1 - aspect), -1, 1);
  }, [size]);

  useFrame(({ gl, camera }) => {
    gl.render(mainScene, camera);
  }, 20);

  useFrame(({ gl }) => {
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(debugScene, debugCamera);
    gl.autoClear = true;
  }, 30);

  return (
    <>
      <scene ref={debugSceneRef}>
        {/* render textures using probe-scene materials to avoid being affected by tone mapping */}
        {probeDebugTextures.map((tex, texIndex) => (
          <mesh position={[5, 95 - texIndex * 9, 0]} key={texIndex}>
            <planeBufferGeometry attach="geometry" args={[8, 8]} />
            <IrradianceDebugMaterial attach="material" irradianceMap={tex} />
          </mesh>
        ))}
        <mesh position={[85, 85, 0]}>
          <planeBufferGeometry attach="geometry" args={[20, 20]} />
          <IrradianceDebugMaterial
            attach="material"
            irradianceMap={outputTexture}
          />
        </mesh>
      </scene>

      <IrradianceTextureContext.Provider value={outputTexture}>
        <scene ref={mainSceneRef}>
          <mesh position={[0, 0, -5]}>
            <planeBufferGeometry attach="geometry" args={[200, 200]} />
            <meshBasicMaterial attach="material" color="#171717" />
          </mesh>

          <directionalLight position={[-3, 3, 6]} castShadow intensity={5}>
            <directionalLightShadow
              attach="shadow"
              camera-left={-10}
              camera-right={10}
              camera-top={10}
              camera-bottom={-10}
            />
          </directionalLight>

          <IrradianceSurface
            albedoMap={loadedTexture}
            emissiveMap={loadedEmissiveTexture}
            emissiveIntensity={10}
          >
            <primitive
              object={loadedMesh}
              castShadow
              receiveShadow
              dispose={null}
              onClick={handleDebugClick}
            />
          </IrradianceSurface>
        </scene>
      </IrradianceTextureContext.Provider>

      {lightSceneElement}
      {compositorSceneElement}
    </>
  );
});

function App() {
  const [loadedTexture, setLoadedTexture] = useState<THREE.Texture | null>(
    null
  );
  const [
    loadedEmissiveTexture,
    setLoadedLumTexture
  ] = useState<THREE.Texture | null>(null);
  const [loadedMesh, setLoadedMesh] = useState<THREE.Mesh | null>(null);

  useEffect(() => {
    new THREE.TextureLoader().load(sceneTextureUrl, (data) => {
      data.magFilter = THREE.NearestFilter;
      data.flipY = false;
      setLoadedTexture(data);
    });

    new THREE.TextureLoader().load(sceneLumTextureUrl, (data) => {
      data.magFilter = THREE.NearestFilter;
      data.flipY = false;
      setLoadedLumTexture(data);
    });

    new GLTFLoader().load(sceneUrl, (data) => {
      data.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }

        if (object.name === 'Base') {
          setLoadedMesh(object);
        }
      });
    });
  }, []);

  return (
    <Canvas
      camera={{ position: [-4, -4, 8], up: [0, 0, 1] }}
      shadowMap
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.9;

        gl.outputEncoding = THREE.sRGBEncoding;
      }}
    >
      {loadedMesh && loadedTexture && loadedEmissiveTexture ? (
        <IrradianceSurfaceManager>
          <Scene
            loadedMesh={loadedMesh}
            loadedTexture={loadedTexture}
            loadedEmissiveTexture={loadedEmissiveTexture}
          />
        </IrradianceSurfaceManager>
      ) : null}

      <SceneControls />
    </Canvas>
  );
}

export default App;
