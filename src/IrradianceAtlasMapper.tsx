import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useFrame } from 'react-three-fiber';
import * as THREE from 'three';

import {
  useIrradianceAtlasContext,
  AtlasQuad,
  atlasWidth,
  atlasHeight
} from './IrradianceSurfaceManager';

// write out original face geometry info into the atlas map
// each texel corresponds to: (quadX, quadY, quadIndex)
// where quadX and quadY are 0..1 representing a spot in the original quad
// and quadIndex is 1-based to distinguish from blank space
// which allows to find original 3D position/normal/etc for that texel
// (quad index is int stored as float, but precision should be good enough)
// @todo consider stencil buffer, or just 8bit texture
// @todo consider rounding to account for texel size
const AtlasItemMaterial: React.FC = () => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide, // UVs might have arbitrary winding
        vertexShader: `
          varying vec3 vFacePos;

          void main() {
            vFacePos = position;

            gl_Position = projectionMatrix * vec4(
              uv, // UV is the actual position on map
              0,
              1.0
            );
          }
        `,
        fragmentShader: `
          varying vec3 vFacePos;

          void main() {
            // encode the face information in map
            gl_FragColor = vec4(vFacePos.xy, vFacePos.z + 1.0, 1.0);
          }
        `
      }),
    []
  );

  return <primitive attach="material" object={material} />;
};

// @todo provide output via context (esp once quad-based autolayout is removed/separated from main surface manager)
// @todo dispose of render target, etc
export function useIrradianceAtlasMapper(): {
  atlasMapTexture: THREE.Texture;
  atlasMapData: Float32Array;
  mapperSceneElement: React.ReactElement | null;
} {
  const orthoSceneRef = useRef<THREE.Scene>();
  const renderComplete = useRef(false);

  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const atlas = useIrradianceAtlasContext();

  const geoms = useMemo(
    () =>
      isLoaded
        ? atlas.lightSceneItems
            .filter((item) => !!item.albedoMap)
            .map((item, itemIndex) => {
              const { buffer } = item;

              if (!(buffer instanceof THREE.BufferGeometry)) {
                throw new Error('expected buffer geometry');
              }

              const indexAttr = buffer.index;
              if (!indexAttr) {
                throw new Error('expected face index array');
              }

              const faceVertexCount = indexAttr.count;
              const uv2Attr = buffer.attributes.uv2;
              if (!uv2Attr || !(uv2Attr instanceof THREE.BufferAttribute)) {
                throw new Error('expected uv2 attribute');
              }
              const uv2Data = uv2Attr.array;

              const atlasUVAttr = new THREE.Float32BufferAttribute(
                faceVertexCount * 2,
                2
              );
              const atlasFacePosAttr = new THREE.Float32BufferAttribute(
                faceVertexCount * 3,
                3
              );

              const indexData = indexAttr.array;
              for (
                let faceVertexIndex = 0;
                faceVertexIndex < faceVertexCount;
                faceVertexIndex += 1
              ) {
                atlasUVAttr.copyAt(
                  faceVertexIndex,
                  uv2Attr,
                  indexData[faceVertexIndex]
                );

                // positioning in face
                const faceMod = faceVertexIndex % 3;
                const facePosX = faceMod & 1;
                const facePosY = (faceMod & 2) >> 1;

                // mesh index + face index combined into one
                const faceIndex = (faceVertexIndex - faceMod) / 3;

                atlasFacePosAttr.setXYZ(
                  faceVertexIndex,
                  facePosX,
                  facePosY,
                  itemIndex * 1000 + faceIndex // @todo put +1 here instead of shader (Threejs somehow fails to set it though?)
                );
              }

              const atlasBuffer = new THREE.BufferGeometry();
              atlasBuffer.setAttribute('position', atlasFacePosAttr);
              atlasBuffer.setAttribute('uv', atlasUVAttr);

              return atlasBuffer;
            })
        : null,
    [atlas.lightSceneItems, isLoaded]
  );

  const orthoTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(atlasWidth, atlasHeight, {
      type: THREE.FloatType,
      magFilter: THREE.NearestFilter, // pixelate for debug display
      minFilter: THREE.NearestFilter,
      depthBuffer: false,
      generateMipmaps: false
    });
  }, []);

  const orthoCamera = useMemo(() => {
    return new THREE.OrthographicCamera(0, 1, 1, 0, 0, 1);
  }, []);

  const orthoData = useMemo(() => {
    return new Float32Array(atlasWidth * atlasHeight * 4);
  }, []);

  useFrame(({ gl }) => {
    // ensure render scene has been instantiated
    if (!orthoSceneRef.current || renderComplete.current) {
      return;
    }

    renderComplete.current = true; // prevent further renders

    const orthoScene = orthoSceneRef.current; // local var for type safety

    // produce the output
    gl.autoClear = true;
    gl.setRenderTarget(orthoTarget);
    gl.render(orthoScene, orthoCamera);
    gl.setRenderTarget(null);

    gl.readRenderTargetPixels(
      orthoTarget,
      0,
      0,
      atlasWidth,
      atlasHeight,
      orthoData
    );
  }, 10);

  return {
    atlasMapTexture: orthoTarget.texture, // @todo suppress until render is complete
    atlasMapData: orthoData,
    mapperSceneElement: geoms && (
      <scene ref={orthoSceneRef}>
        {geoms.map((geom, geomIndex) => {
          return (
            <mesh key={geomIndex}>
              <primitive attach="geometry" object={geom} />
              <AtlasItemMaterial />
            </mesh>
          );
        })}
      </scene>
    )
  };
}
