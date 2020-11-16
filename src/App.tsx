import React, { useMemo, useEffect, useState } from 'react';
import { Canvas, useResource, useFrame } from 'react-three-fiber';
import * as THREE from 'three';
import { useRenderProp } from 'react-render-prop';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

import IrradianceSurfaceManager, {
  Workbench,
  IrradianceTextureContext
} from './IrradianceSurfaceManager';
import { IrradianceSurface, IrradianceLight } from './IrradianceScene';
import WorkManager from './WorkManager';
import IrradianceAtlasMapper, { AtlasMap } from './IrradianceAtlasMapper';
import IrradianceRenderer from './IrradianceRenderer';
import IrradianceCompositor from './IrradianceCompositor';
import SceneControls from './SceneControls';
import { DebugOverlayScene } from './DebugOverlayScene';

import sceneUrl from './tile-game-room6.glb';

// @todo split up debug scene and core baking state from this
const Scene: React.FC<{
  workbench: Workbench | null;
  loadedData: GLTF;
}> = React.memo(({ workbench, loadedData }) => {
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

  const baseMesh = loadedMeshList.find((item) => item.name === 'Base');
  const coverMesh = loadedMeshList.find((item) => item.name === 'Cover');

  if (!baseMesh || !coverMesh) {
    throw new Error('objects not found');
  }

  // plumbing between baker components
  const [atlasMapSink, atlasMap] = useRenderProp<[AtlasMap | null]>();
  const [baseRendererSink, baseLightTexture, probeTexture] = useRenderProp<
    [THREE.Texture, THREE.Texture]
  >();

  // main scene rendering
  const [mainSceneRef, mainScene] = useResource<THREE.Scene>();

  useFrame(({ gl, camera }) => {
    gl.render(mainScene, camera);
  }, 20);

  return (
    <>
      {workbench && (
        <IrradianceAtlasMapper workbench={workbench}>
          {atlasMapSink}
        </IrradianceAtlasMapper>
      )}

      {workbench && atlasMap && (
        <IrradianceRenderer
          workbench={workbench}
          atlasMap={atlasMap}
          factorName={null}
        >
          {baseRendererSink}
        </IrradianceRenderer>
      )}

      <IrradianceCompositor baseOutput={baseLightTexture} factorOutputs={{}}>
        <DebugOverlayScene
          atlasTexture={atlasMap && atlasMap.texture}
          probeTexture={probeTexture}
        />

        <IrradianceTextureContext.Consumer>
          {(lightMap) => (
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

              <primitive
                object={baseMesh}
                material-lightMap={lightMap}
                dispose={null}
              >
                <IrradianceSurface />
              </primitive>

              <primitive object={coverMesh} dispose={null}>
                <IrradianceSurface />
              </primitive>
            </scene>
          )}
        </IrradianceTextureContext.Consumer>
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

  // awkward hack to start workbench snapshot after a delay
  const [startWorkbenchSink, startWorkbenchHandler] = useRenderProp<
    [() => void]
  >();

  useEffect(() => {
    if (!startWorkbenchHandler) {
      return;
    }

    const timeoutId = setTimeout(startWorkbenchHandler, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [startWorkbenchHandler]);

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
            {(workbench, startWorkbench) => (
              <>
                {startWorkbenchSink(startWorkbench)}
                <Scene workbench={workbench} loadedData={loadedData} />
              </>
            )}
          </IrradianceSurfaceManager>
        </WorkManager>
      ) : null}

      <SceneControls />
    </Canvas>
  );
}

export default App;
