import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Story, Meta } from '@storybook/react';
import { useRenderProp } from 'react-render-prop';
import { Canvas, useResource, useFrame } from 'react-three-fiber';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

import IrradianceSurfaceManager from '../core/IrradianceSurfaceManager';
import WorkManager from '../core/WorkManager';
import IrradianceAtlasMapper, { AtlasMap } from '../core/IrradianceAtlasMapper';
import IrradianceRenderer from '../core/IrradianceRenderer';
import IrradianceCompositor from '../core/IrradianceCompositor';
import { IrradianceSurface, IrradianceLight } from '../core/IrradianceScene';
import { useIrradianceTexture } from '../core/IrradianceCompositor';
import DebugControls from './DebugControls';
import { DebugOverlayScene } from './DebugOverlayScene';

import './viewport.css';
import sceneUrl from './tile-game-room6.glb';

export default {
  title: 'glTF scene'
} as Meta;

const Baker: React.FC<{
  children: (onReady: () => void) => React.ReactElement;
}> = ({ children }) => {
  // plumbing between baker components
  const [baseRendererSink, baseLightTexture, probeTexture] = useRenderProp<
    [THREE.Texture, THREE.Texture]
  >();

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
      <WorkManager>
        <IrradianceSurfaceManager>
          {(workbench, startWorkbench) => (
            <>
              {workbench && (
                <IrradianceRenderer workbench={workbench} factorName={null}>
                  {baseRendererSink}
                </IrradianceRenderer>
              )}

              <IrradianceCompositor
                baseOutput={baseLightTexture}
                factorOutputs={{}}
              >
                <DebugOverlayScene
                  atlasTexture={workbench && workbench.atlasMap.texture}
                  probeTexture={probeTexture}
                />

                {children(startWorkbench)}
              </IrradianceCompositor>
            </>
          )}
        </IrradianceSurfaceManager>
      </WorkManager>

      <DebugControls />
    </Canvas>
  );
};

const MainScene: React.FC<{ onReady: () => void }> = ({ onReady }) => {
  // resulting lightmap texture produced by the baking process
  const lightMap = useIrradianceTexture();

  // data loading
  const [loadedData, setLoadedData] = useState<GLTF | null>(null);

  useEffect(() => {
    new GLTFLoader().load(sceneUrl, (data) => {
      setLoadedData(data);
    });
  }, []);

  const { loadedMeshList, loadedLightList } = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    const lights: THREE.DirectionalLight[] = [];

    if (loadedData) {
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

        // convert glTF's standard material into Lambert
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
    }

    return {
      loadedMeshList: meshes,
      loadedLightList: lights
    };
  }, [loadedData]);

  const baseMesh = loadedMeshList.find((item) => item.name === 'Base');
  const coverMesh = loadedMeshList.find((item) => item.name === 'Cover');

  // signal readiness when loaded
  const onReadyRef = useRef(onReady); // wrap in ref to avoid re-triggering
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!loadedData) {
      return;
    }

    const timeoutId = setTimeout(onReadyRef.current, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [loadedData]);

  // main scene rendering
  const [mainSceneRef, mainScene] = useResource<THREE.Scene>();

  useFrame(({ gl, camera }) => {
    gl.render(mainScene, camera);
  }, 20);

  return (
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

      {baseMesh && (
        <primitive
          object={baseMesh}
          material-lightMap={lightMap}
          dispose={null}
        >
          <IrradianceSurface />
        </primitive>
      )}

      {coverMesh && (
        <primitive object={coverMesh} dispose={null}>
          <IrradianceSurface />
        </primitive>
      )}
    </scene>
  );
};

export const Main: Story = () => (
  <Baker>{(onReady) => <MainScene onReady={onReady} />}</Baker>
);
