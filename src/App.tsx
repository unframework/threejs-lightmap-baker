import React, { useMemo, useEffect, useState } from 'react';
import { Canvas, useResource, useFrame, useThree } from 'react-three-fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

import IrradianceSurfaceManager, {
  IrradianceTextureContext
} from './IrradianceSurfaceManager';
import IrradianceSurface from './IrradianceSurface';
import IrradianceLight from './IrradianceLight';
import { useIrradianceFactorRenderer } from './IrradianceFactorRenderer';
import { useIrradianceCompositor } from './IrradianceCompositor';
import SceneControls from './SceneControls';
import GridGeometry from './GridGeometry';
import { IrradianceDebugMaterial } from './IrradianceMaterials';

import sceneUrl from './tile-game-room1.glb';

const Scene: React.FC<{
  loadedMeshList: THREE.Mesh[];
}> = React.memo(({ loadedMeshList }) => {
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

          <IrradianceLight>
            <directionalLight position={[-5, 5, 10]} castShadow intensity={18}>
              <directionalLightShadow
                attach="shadow"
                camera-left={-20}
                camera-right={20}
                camera-top={20}
                camera-bottom={-20}
              />
            </directionalLight>
          </IrradianceLight>

          {loadedMeshList.map((mesh) => (
            <IrradianceSurface key={mesh.uuid}>
              <primitive
                object={mesh}
                dispose={null}
                onClick={handleDebugClick}
              />
            </IrradianceSurface>
          ))}
        </scene>
      </IrradianceTextureContext.Provider>

      {lightSceneElement}
      {compositorSceneElement}
    </>
  );
});

function App() {
  const [loadedMeshList, setLoadedMeshList] = useState<THREE.Mesh[]>([]);

  useEffect(() => {
    new GLTFLoader().load(sceneUrl, (data) => {
      data.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }

        // process the material
        if (object.material) {
          const stdMat = object.material as THREE.MeshStandardMaterial;

          if (stdMat.map) {
            stdMat.map.magFilter = THREE.NearestFilter;
          }

          if (stdMat.emissiveMap) {
            stdMat.emissiveMap.magFilter = THREE.NearestFilter;
          }

          object.material = new THREE.MeshLambertMaterial({
            color: stdMat.color,
            map: stdMat.map,
            emissive: stdMat.emissive,
            emissiveMap: stdMat.emissiveMap,
            emissiveIntensity: stdMat.emissiveIntensity
          });

          // always cast shadow, but only albedo materials receive it
          object.castShadow = true;

          if (stdMat.map) {
            object.receiveShadow = true;
          }

          // special case for outer sunlight cover
          if (object.name === 'Cover') {
            object.material.depthWrite = false;
            object.material.colorWrite = false;
          }
        }

        setLoadedMeshList((list) => [...list, object]);
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
      {loadedMeshList ? (
        <IrradianceSurfaceManager>
          <Scene loadedMeshList={loadedMeshList} />
        </IrradianceSurfaceManager>
      ) : null}

      <SceneControls />
    </Canvas>
  );
}

export default App;
