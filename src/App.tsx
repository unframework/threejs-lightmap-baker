import React, { useMemo } from 'react';
import { Canvas, useResource, useFrame, useThree } from 'react-three-fiber';
import * as THREE from 'three';

import { useAtlas, useMeshWithAtlas } from './Atlas';
import SceneControls from './SceneControls';
import GridGeometry from './GridGeometry';

const ProbeLightMaterial: React.FC<{ attach?: string; intensity: number }> = ({
  attach,
  intensity
}) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0xffffff) },
      intensity: { value: 1 }
    },
    vertexShader: `
      void main() {
        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float intensity;

      void main() {
        gl_FragColor = vec4( color * intensity, 1.0 );
      }
    `
  });

  // disposable managed object
  return (
    <primitive
      object={material}
      attach={attach}
      uniforms-intensity-value={intensity}
    />
  );
};

const ProbeMeshMaterial: React.FC<{
  attach?: string;
  lumMap: THREE.Texture;
}> = ({ attach, lumMap }) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      lum: { value: null }
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
      uniform sampler2D lum;
      varying vec2 vUV;

      void main() {
        gl_FragColor = texture2D(lum, vUV);
      }
    `
  });

  // disposable managed object
  return (
    <primitive object={material} attach={attach} uniforms-lum-value={lumMap} />
  );
};

const FinalMeshMaterial: React.FC<{
  attach?: string;
  lumMap: THREE.Texture;
}> = ({ attach, lumMap }) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      lum: { value: null }
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
      uniform sampler2D lum;
      varying vec2 vUV;

      void main() {
        gl_FragColor = vec4(toneMapping(texture2D(lum, vUV).rgb), 1.0);
      }
    `
  });

  // disposable managed object
  return (
    <primitive object={material} attach={attach} uniforms-lum-value={lumMap} />
  );
};

function Scene() {
  const {
    atlasInfo,
    outputTexture,
    lightSceneRef,
    lightSceneTexture,
    probeDebugTexture
  } = useAtlas();

  const [mainSceneRef, mainScene] = useResource<THREE.Scene>();
  const [debugSceneRef, debugScene] = useResource<THREE.Scene>();

  const { size } = useThree();
  const debugCamera = useMemo(() => {
    // top-left corner is (0, 100), top-right is (100, 100)
    const aspect = size.height / size.width;
    return new THREE.OrthographicCamera(0, 100, 100, 100 * (1 - aspect), -1, 1);
  }, [size]);

  const [meshBuffer1Ref, meshBuffer1] = useResource<THREE.BufferGeometry>();
  const mesh1Ref = useMeshWithAtlas(atlasInfo, meshBuffer1);

  const [meshBuffer2Ref, meshBuffer2] = useResource<THREE.BufferGeometry>();
  const mesh2Ref = useMeshWithAtlas(atlasInfo, meshBuffer2);

  const [meshBuffer3Ref, meshBuffer3] = useResource<THREE.BufferGeometry>();
  const mesh3Ref = useMeshWithAtlas(atlasInfo, meshBuffer3);

  const [meshBuffer4Ref, meshBuffer4] = useResource<THREE.BufferGeometry>();
  const mesh4Ref = useMeshWithAtlas(atlasInfo, meshBuffer4);

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
        <mesh position={[10, 90, 0]}>
          <planeBufferGeometry attach="geometry" args={[10, 10]} />
          <ProbeMeshMaterial attach="material" lumMap={probeDebugTexture} />
        </mesh>
        <mesh position={[85, 85, 0]}>
          <planeBufferGeometry attach="geometry" args={[20, 20]} />
          <ProbeMeshMaterial attach="material" lumMap={outputTexture} />
        </mesh>
      </scene>

      <scene ref={mainSceneRef}>
        <mesh position={[0, 0, -5]}>
          <planeBufferGeometry attach="geometry" args={[200, 200]} />
          <meshBasicMaterial attach="material" color="#171717" />
        </mesh>

        <mesh position={[0, 0, -1]} ref={mesh1Ref}>
          <GridGeometry attach="geometry" ref={meshBuffer1Ref} />
          <FinalMeshMaterial attach="material" lumMap={outputTexture} />
        </mesh>
        <mesh position={[-1.5, 0, 2]} ref={mesh2Ref}>
          <boxBufferGeometry
            attach="geometry"
            args={[2, 1, 4.5]}
            ref={meshBuffer2Ref}
          />
          <FinalMeshMaterial attach="material" lumMap={outputTexture} />
        </mesh>
        <mesh position={[1.5, 0, 2]} ref={mesh3Ref}>
          <boxBufferGeometry
            attach="geometry"
            args={[2, 1, 4.5]}
            ref={meshBuffer3Ref}
          />
          <FinalMeshMaterial attach="material" lumMap={outputTexture} />
        </mesh>
        <mesh position={[0, 3, 3]} ref={mesh4Ref}>
          <boxBufferGeometry
            attach="geometry"
            args={[3, 0.5, 3]}
            ref={meshBuffer4Ref}
          />
          <FinalMeshMaterial attach="material" lumMap={outputTexture} />
        </mesh>
      </scene>

      <scene ref={lightSceneRef}>
        {mesh1Ref.current && meshBuffer1 && (
          <mesh position={mesh1Ref.current.position}>
            <primitive attach="geometry" object={meshBuffer1} dispose={null} />
            <ProbeMeshMaterial attach="material" lumMap={lightSceneTexture} />
          </mesh>
        )}

        {mesh2Ref.current && meshBuffer2 && (
          <mesh position={mesh2Ref.current.position}>
            <primitive attach="geometry" object={meshBuffer2} dispose={null} />
            <ProbeMeshMaterial attach="material" lumMap={lightSceneTexture} />
          </mesh>
        )}

        {mesh3Ref.current && meshBuffer3 && (
          <mesh position={mesh3Ref.current.position}>
            <primitive attach="geometry" object={meshBuffer3} dispose={null} />
            <ProbeMeshMaterial attach="material" lumMap={lightSceneTexture} />
          </mesh>
        )}

        {mesh4Ref.current && meshBuffer4 && (
          <mesh position={mesh4Ref.current.position}>
            <primitive attach="geometry" object={meshBuffer4} dispose={null} />
            <ProbeMeshMaterial attach="material" lumMap={lightSceneTexture} />
          </mesh>
        )}

        <mesh position={[0, -4, 4]}>
          <boxBufferGeometry attach="geometry" args={[4, 2, 4]} />
          <ProbeLightMaterial attach="material" intensity={10} />
        </mesh>

        <mesh position={[0, 8, 8]}>
          <boxBufferGeometry attach="geometry" args={[2, 2, 2]} />
          <ProbeLightMaterial attach="material" intensity={0.8} />
        </mesh>
      </scene>
    </>
  );
}

function App() {
  return (
    <Canvas
      camera={{ position: [-4, -4, 8], up: [0, 0, 1] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.9;

        gl.outputEncoding = THREE.sRGBEncoding;
      }}
    >
      <Scene />

      <SceneControls />
    </Canvas>
  );
}

export default App;
