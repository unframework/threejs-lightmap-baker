import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  Canvas,
  useUpdate,
  useResource,
  useFrame,
  ReactThreeFiber
} from 'react-three-fiber';
import * as THREE from 'three';

const faceTexW = 0.2;
const faceTexH = 0.2;
const texMargin = 0.1;

const facesPerRow = Math.floor(1 / (faceTexW + texMargin));

function computeFaceUV(faceIndex: number) {
  const faceColumn = faceIndex % facesPerRow;
  const faceRow = Math.floor(faceIndex / facesPerRow);

  const left = faceColumn * (faceTexW + texMargin);
  const top = faceRow * (faceTexH + texMargin);
  const right = left + faceTexW;
  const bottom = top + faceTexH;

  return { left, top, right, bottom };
}

function Scene() {
  const atlasWidth = 256;
  const atlasHeight = 256;
  const size = atlasWidth * atlasHeight;

  const atlasData = useMemo(() => {
    const data = new Uint8Array(3 * size);

    for (let i = 0; i < size; i++) {
      const x = i % atlasWidth;
      const y = Math.floor(i / atlasWidth);

      const stride = i * 3;

      const v = x % 8 === 0 || y % 8 === 0 ? 0 : 255;
      data[stride] = v;
      data[stride + 1] = v;
      data[stride + 2] = v;
    }

    return data;
  }, []);

  const controlTexture = useMemo(() => {
    return new THREE.DataTexture(
      atlasData,
      atlasWidth,
      atlasHeight,
      THREE.RGBFormat
    );
  }, []);

  const testTexture = useMemo(() => {
    const width = 256;
    const height = 256;
    const size = width * height;
    const data = new Uint8Array(3 * size);

    for (let i = 0; i < size; i++) {
      const stride = i * 3;

      const v = 255;
      data[stride] = v;
      data[stride + 1] = v;
      data[stride + 2] = v;
    }

    return new THREE.DataTexture(data, width, height, THREE.RGBFormat);
  }, []);

  const boxBufferRef = useUpdate<THREE.BoxBufferGeometry>((boxBuffer) => {
    const uvAttr = boxBuffer.attributes.uv;

    for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
      const { left, top, right, bottom } = computeFaceUV(faceIndex);

      // default is [0, 1, 1, 1, 0, 0, 1, 0]
      const uvItemBase = faceIndex * 4;
      uvAttr.setXY(uvItemBase, left, bottom);
      uvAttr.setXY(uvItemBase + 1, right, bottom);
      uvAttr.setXY(uvItemBase + 2, left, top);
      uvAttr.setXY(uvItemBase + 3, right, top);
    }

    boxBuffer.setAttribute('uv2', new THREE.BufferAttribute(uvAttr.array, 2));
  }, []);

  const rtWidth = 32;
  const rtHeight = 32;
  const testTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(rtWidth, rtHeight);
  }, []);

  const testCam = useMemo(() => {
    const rtFov = 170;
    const rtAspect = rtWidth / rtHeight;
    const rtNear = 0.1;
    const rtFar = 10;
    return new THREE.PerspectiveCamera(rtFov, rtAspect, rtNear, rtFar);
  }, []);

  const testBuffer = useMemo(() => {
    return new Uint8Array(rtWidth * rtHeight * 4);
  }, []);

  useFrame(({ gl, scene }) => {
    // face 4 is the top one
    const faceIndex = 4;
    const faceTexelX = 3; // even texel offset from face origin inside texture data
    const faceTexelY = 2;

    const { left, top, right, bottom } = computeFaceUV(faceIndex);

    // find texel inside atlas, as rounded to texel boundary
    const atlasTexelLeft = left * atlasWidth;
    const atlasTexelTop = top * atlasWidth;
    const atlasTexelX = Math.floor(atlasTexelLeft) + faceTexelX;
    const atlasTexelY = Math.floor(atlasTexelTop) + faceTexelY;

    // compute rounded texel's U and V position within face
    const texW = (right - left) * atlasWidth;
    const texH = (bottom - top) * atlasHeight;
    const pU = (atlasTexelX - atlasTexelLeft) / texW;
    const pV = (atlasTexelY - atlasTexelTop) / texH;

    // read vertex position for this face and interpolate along U and V axes
    // @todo also transform by mesh pos
    const boxBuffer = boxBufferRef.current;
    const posArray = boxBuffer.attributes.position.array;
    const facePosStart = faceIndex * 4 * 3;
    const facePosOrigin = facePosStart + 2 * 3;
    const facePosU = facePosStart + 3 * 3;
    const facePosV = facePosStart;

    const dUx = posArray[facePosU] - posArray[facePosOrigin];
    const dUy = posArray[facePosU + 1] - posArray[facePosOrigin + 1];
    const dUz = posArray[facePosU + 2] - posArray[facePosOrigin + 2];

    const dVx = posArray[facePosV] - posArray[facePosOrigin];
    const dVy = posArray[facePosV + 1] - posArray[facePosOrigin + 1];
    const dVz = posArray[facePosV + 2] - posArray[facePosOrigin + 2];

    const pUVx = posArray[facePosOrigin] + dUx * pU + dVx * pV;
    const pUVy = posArray[facePosOrigin + 1] + dUy * pU + dVy * pV;
    const pUVz = posArray[facePosOrigin + 2] + dUz * pU + dVz * pV;

    console.log(pUVx, pUVy, pUVz);

    testCam.position.set(0, -3, 2);
    testCam.up.set(0, 0, 1);
    testCam.lookAt(0, -2, 10);
    gl.setRenderTarget(testTarget);
    gl.render(scene, testCam);
    gl.setRenderTarget(null);

    gl.readRenderTargetPixels(testTarget, 0, 0, rtWidth, rtHeight, testBuffer);

    const rtLength = testBuffer.length;
    let r = 0,
      g = 0,
      b = 0;
    for (let i = 0; i < rtLength; i += 4) {
      const a = testBuffer[i + 3];
      r += testBuffer[i] + a;
      g += testBuffer[i + 1] + a;
      b += testBuffer[i + 2] + a;
    }

    const pixelCount = rtWidth * rtHeight;
    const ar = r / pixelCount;
    const ag = g / pixelCount;
    const ab = b / pixelCount;

    atlasData.set([ar, ag, ab, 255], 0);
    controlTexture.needsUpdate = true;
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[-30, 30, 30]} intensity={0.1} />
      <mesh position={[0, 0, -5]}>
        <planeBufferGeometry attach="geometry" args={[200, 200]} />
        <meshStandardMaterial attach="material" color="#171717" />
      </mesh>
      <mesh position={[0, 0, -2]}>
        <boxBufferGeometry
          attach="geometry"
          args={[5, 5, 2]}
          ref={boxBufferRef}
        />
        <meshStandardMaterial
          attach="material"
          color="orange"
          map={controlTexture}
          aoMap={testTexture}
          aoMapIntensity={1}
        />
      </mesh>
      <mesh position={[0, 0, 2]}>
        <boxBufferGeometry attach="geometry" args={[2, 2, 5]} />
        <meshStandardMaterial attach="material" color="hotpink" />
      </mesh>
    </>
  );
}

function App() {
  return (
    <Canvas
      camera={{ position: [-4, -4, 8], up: [0, 0, 1] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputEncoding = THREE.sRGBEncoding;
      }}
    >
      <Scene />
    </Canvas>
  );
}

export default App;
