import React, { useMemo, useEffect, useState } from 'react';
import { Canvas, useResource, useFrame, useThree } from 'react-three-fiber';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

import IrradianceSurfaceManager, {
  IrradianceTextureContext
} from './IrradianceSurfaceManager';
import { IrradianceSurface, IrradianceLight } from './IrradianceScene';
import WorkManager from './WorkManager';
import IrradianceAtlasMapper, { AtlasMap } from './IrradianceAtlasMapper';
import IrradianceRenderer from './IrradianceRenderer';
import { PROBE_BATCH_COUNT } from './IrradianceLightProbe';
import IrradianceCompositor from './IrradianceCompositor';
import SceneControls from './SceneControls';
import { DebugMaterial } from './DebugMaterial';
import { useRenderProp } from 'react-render-prop';

import sceneUrl from './tile-game-room6.glb';

const Scene: React.FC<{
  loadedData: GLTF;
}> = React.memo(({ loadedData }) => {
  const { loadedMeshList, loadedLightList } = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    const lights: THREE.DirectionalLight[] = [];

    loadedData.scene.traverse((object) => {
      // glTF import is still not great with lights, so we improvise
      if (object.name.includes('Light')) {
        const light = new THREE.DirectionalLight();
        light.intensity = object.scale.z;

        light.castShadow = true;
        light.shadow.camera.left = -object.scale.x;
        light.shadow.camera.right = object.scale.x;
        light.shadow.camera.top = object.scale.y;
        light.shadow.camera.bottom = -object.scale.y;

        light.position.copy(object.position);

        const target = new THREE.Object3D();
        target.position.set(0, 0, -1);
        target.position.applyEuler(object.rotation);
        target.position.add(light.position);

        light.target = target;

        lights.push(light);
        return;
      }

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

      meshes.push(object);
    });

    return {
      loadedMeshList: meshes,
      loadedLightList: lights
    };
  }, [loadedData]);

  const [atlasMapSink, atlasMap] = useRenderProp<[AtlasMap | null]>();
  const [baseLightTextureSink, baseLightTexture] = useRenderProp<
    [THREE.Texture]
  >();

  const [outputTextureSink, outputTexture] = useRenderProp<
    [THREE.Texture | null]
  >();

  const baseMesh = loadedMeshList.find((item) => item.name === 'Base');
  const coverMesh = loadedMeshList.find((item) => item.name === 'Cover');

  if (!baseMesh || !coverMesh) {
    throw new Error('objects not found');
  }

  // debug output texture
  // const outputTexture = Object.values(factorOutputs)[0] || baseOutput;

  const [mainSceneRef, mainScene] = useResource<THREE.Scene>();
  const [debugSceneRef, debugScene] = useResource<THREE.Scene>();

  const [probeDebugMeshRef, probeDebugMesh] = useResource<THREE.Mesh>();

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
      <IrradianceAtlasMapper>{atlasMapSink}</IrradianceAtlasMapper>

      {atlasMap && (
        <IrradianceRenderer
          atlasMap={atlasMap}
          factorName={null}
          debugMesh={probeDebugMesh}
        >
          {baseLightTextureSink}
        </IrradianceRenderer>
      )}

      <scene ref={debugSceneRef}>
        {outputTexture && (
          <mesh position={[85, 85, 0]}>
            <planeBufferGeometry attach="geometry" args={[20, 20]} />
            <DebugMaterial attach="material" map={outputTexture} />
          </mesh>
        )}

        {atlasMap && (
          <mesh position={[85, 64, 0]}>
            <planeBufferGeometry attach="geometry" args={[20, 20]} />
            <DebugMaterial attach="material" map={atlasMap.texture} />
          </mesh>
        )}

        <mesh
          position={[10, 95 - (5 * PROBE_BATCH_COUNT) / 2, 0]}
          ref={probeDebugMeshRef}
        >
          <planeBufferGeometry
            attach="geometry"
            args={[10, 5 * PROBE_BATCH_COUNT]}
          />
        </mesh>
      </scene>

      <IrradianceCompositor baseOutput={baseLightTexture} factorOutputs={{}}>
        {/* collect output for debug display */}
        <IrradianceTextureContext.Consumer>
          {outputTextureSink}
        </IrradianceTextureContext.Consumer>

        <scene ref={mainSceneRef}>
          <mesh position={[0, 0, -5]}>
            <planeBufferGeometry attach="geometry" args={[200, 200]} />
            <meshBasicMaterial attach="material" color="#171717" />
          </mesh>

          {loadedLightList.map((light) => (
            <React.Fragment key={light.uuid}>
              <primitive object={light} dispose={null}>
                <IrradianceLight />
              </primitive>

              <primitive object={light.target} dispose={null} />
            </React.Fragment>
          ))}

          <primitive object={baseMesh} dispose={null}>
            <IrradianceSurface />
          </primitive>

          <primitive object={coverMesh} dispose={null}>
            <IrradianceSurface />
          </primitive>
        </scene>
      </IrradianceCompositor>
    </>
  );
});

function App() {
  const [loadedData, setLoadedData] = useState<GLTF | null>(null);

  useEffect(() => {
    new GLTFLoader().load(sceneUrl, (data) => {
      setLoadedData(data);
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
      {loadedData ? (
        <WorkManager>
          <IrradianceSurfaceManager>
            <Scene loadedData={loadedData} />
          </IrradianceSurfaceManager>
        </WorkManager>
      ) : null}

      <SceneControls />
    </Canvas>
  );
}

export default App;
