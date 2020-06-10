import React, { useMemo, useEffect, useState, useRef } from 'react';
import { Canvas, useResource, useFrame, useThree } from 'react-three-fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

import IrradianceSurfaceManager, {
  IrradianceTextureContext
} from './IrradianceSurfaceManager';
import IrradianceSurface from './IrradianceSurface';
import IrradianceLight from './IrradianceLight';
import { useIrradianceRenderer } from './IrradianceRenderer';
import { useIrradianceCompositor } from './IrradianceCompositor';
import SceneControls from './SceneControls';
import GridGeometry from './GridGeometry';
import { IrradianceDebugMaterial } from './IrradianceMaterials';

import sceneUrl from './tile-game-room3.glb';

const Scene: React.FC<{
  loadedMeshList: THREE.Mesh[];
  loadedLightList: THREE.DirectionalLight[];
  loadedClipList: THREE.AnimationClip[];
}> = React.memo(({ loadedMeshList, loadedLightList, loadedClipList }) => {
  const {
    outputTexture: baseLightTexture,
    lightSceneElement: baseLightSceneElement,
    handleDebugClick,
    probeDebugTextures
  } = useIrradianceRenderer(null);

  const {
    outputTexture: signLightTexture,
    lightSceneElement: signLightSceneElement
  } = useIrradianceRenderer('sign');

  const {
    factorValues,
    outputTexture,
    compositorSceneElement
  } = useIrradianceCompositor(baseLightTexture, { sign: signLightTexture });

  // animate sign intensity
  const signMaterialRef = useRef<THREE.MeshLambertMaterial>();

  useFrame(({ clock }) => {
    const signMaterial = signMaterialRef.current;

    if (!signMaterial) {
      return;
    }

    const signIntensity =
      1 -
      (0.5 + Math.sin(clock.elapsedTime * 50) * 0.5) *
        (1 -
          Math.max(0, Math.min(1, Math.sin(clock.elapsedTime * 2) * 20 + 18)));

    // update the material as well as its lightmap factor
    signMaterial.emissiveIntensity = signIntensity;
    factorValues.sign = signIntensity;
  });

  const baseMesh = loadedMeshList.find((item) => item.name === 'Base');
  const coverMesh = loadedMeshList.find((item) => item.name === 'Cover');
  const lidAMesh = loadedMeshList.find((item) => item.name === 'LidA');
  const lidBMesh = loadedMeshList.find((item) => item.name === 'LidB');

  if (!baseMesh || !coverMesh || !lidAMesh || !lidBMesh) {
    throw new Error('objects not found');
  }

  const lidAClip = loadedClipList.find((item) => item.name === 'LidAAction');
  const lidBClip = loadedClipList.find((item) => item.name === 'LidBAction');
  if (!lidAClip || !lidBClip) {
    throw new Error('no animation clips');
  }

  const sceneMixer = useMemo(() => {
    const animGroup = new THREE.AnimationObjectGroup(lidAMesh, lidBMesh);
    const mixer = new THREE.AnimationMixer(animGroup);

    const actionA = mixer.clipAction(lidAClip, lidAMesh);
    actionA.play();
    const actionB = mixer.clipAction(lidBClip, lidBMesh);
    actionB.play();

    return mixer;
  }, [lidAMesh, lidAClip, lidBMesh, lidBClip]);

  useFrame((state, delta) => {
    sceneMixer.update(delta);
  }, 0);

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

          {loadedLightList.map((light) => (
            <React.Fragment key={light.uuid}>
              <IrradianceLight>
                <primitive object={light} dispose={null} />
              </IrradianceLight>

              <primitive object={light.target} dispose={null} />
            </React.Fragment>
          ))}

          <IrradianceSurface factor="sign" innerMaterialRef={signMaterialRef}>
            <primitive
              object={baseMesh}
              dispose={null}
              onClick={handleDebugClick}
            />
          </IrradianceSurface>

          <IrradianceSurface>
            <primitive object={coverMesh} dispose={null} />
          </IrradianceSurface>

          <IrradianceSurface>
            <primitive object={lidAMesh} dispose={null} />
          </IrradianceSurface>

          <IrradianceSurface>
            <primitive object={lidBMesh} dispose={null} />
          </IrradianceSurface>
        </scene>
      </IrradianceTextureContext.Provider>

      {baseLightSceneElement || signLightSceneElement}
      {compositorSceneElement}
    </>
  );
});

function App() {
  const [loadedClipList, setLoadedClipList] = useState<THREE.AnimationClip[]>(
    []
  );
  const [loadedMeshList, setLoadedMeshList] = useState<THREE.Mesh[]>([]);
  const [loadedLightList, setLoadedLightList] = useState<
    THREE.DirectionalLight[]
  >([]);

  useEffect(() => {
    new GLTFLoader().load(sceneUrl, (data) => {
      const clips = [
        data.animations.find((anim) => anim.name === 'LidAAction'),
        data.animations.find((anim) => anim.name === 'LidBAction')
      ].filter((item) => !!item) as THREE.AnimationClip[];

      setLoadedClipList(clips);

      data.scene.traverse((object) => {
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

          setLoadedLightList((list) => [...list, light]);
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
          <Scene
            loadedMeshList={loadedMeshList}
            loadedLightList={loadedLightList}
            loadedClipList={loadedClipList}
          />
        </IrradianceSurfaceManager>
      ) : null}

      <SceneControls />
    </Canvas>
  );
}

export default App;
