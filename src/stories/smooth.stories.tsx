import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Story, Meta } from '@storybook/react';
import { Canvas } from 'react-three-fiber';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

import IrradianceSceneManager from '../core/IrradianceSceneManager';
import WorkManager from '../core/WorkManager';
import IrradianceRenderer from '../core/IrradianceRenderer';
import IrradianceCompositor from '../core/IrradianceCompositor';
import { IrradianceSurface, IrradianceLight } from '../core/IrradianceScene';
import { useIrradianceTexture } from '../core/IrradianceCompositor';
import DebugControls from './DebugControls';
import { DebugOverlayScene } from './DebugOverlayScene';

import './viewport.css';
import sceneUrl from './cylinder-smooth.glb';

const LIGHT_MAP_RES = 64;

export default {
  title: 'Smooth normals scene'
} as Meta;

const MainScene: React.FC<{ onReady: () => void }> = React.forwardRef(
  ({ onReady }, mainSceneRef) => {
    // data loading
    const [loadedData, setLoadedData] = useState<GLTF | null>(null);

    useEffect(() => {
      new GLTFLoader().load(sceneUrl, (data) => {
        setLoadedData(data);
      });
    }, []);

    const loadedMeshList = useMemo(() => {
      const meshes: THREE.Mesh[] = [];

      if (loadedData) {
        loadedData.scene.traverse((object) => {
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
            object.receiveShadow = true;
          }

          meshes.push(object);
        });
      }

      return meshes;
    }, [loadedData]);

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

    return (
      <scene ref={mainSceneRef}>
        <mesh position={[0, 0, -2]} receiveShadow>
          <planeBufferGeometry attach="geometry" args={[20, 20]} />
          <meshLambertMaterial
            attach="material"
            color="#808080"
            emissive="#ffffff"
          />
          <IrradianceSurface />
        </mesh>

        {loadedMeshList.map((mesh) => (
          <primitive key={mesh.uuid} object={mesh} dispose={null}>
            <IrradianceSurface mapped />
          </primitive>
        ))}
      </scene>
    );
  }
);

export const Main: Story = () => (
  <Canvas
    colorManagement={false} // @todo reconsider
    camera={{ position: [-4, -4, 8], up: [0, 0, 1] }}
    shadowMap
    onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 0.9;

      gl.outputEncoding = THREE.sRGBEncoding;
    }}
  >
    <WorkManager>
      <IrradianceSceneManager
        lightMapWidth={LIGHT_MAP_RES}
        lightMapHeight={LIGHT_MAP_RES}
      >
        {(workbench, startWorkbench) => (
          <IrradianceCompositor
            lightMapWidth={LIGHT_MAP_RES}
            lightMapHeight={LIGHT_MAP_RES}
            textureFilter={THREE.NearestFilter}
          >
            {workbench && <IrradianceRenderer workbench={workbench} />}

            <DebugOverlayScene
              atlasTexture={workbench && workbench.atlasMap.texture}
            >
              <MainScene onReady={startWorkbench} />
            </DebugOverlayScene>
          </IrradianceCompositor>
        )}
      </IrradianceSceneManager>
    </WorkManager>

    <DebugControls />
  </Canvas>
);
