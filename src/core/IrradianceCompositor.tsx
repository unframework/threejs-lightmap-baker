/*
 * Copyright (c) 2020-now Nick Matantsev
 * Licensed under the MIT license
 */

import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import { useFrame } from 'react-three-fiber';
import * as THREE from 'three';

const IrradianceRendererContext = React.createContext<{
  baseTexture: THREE.Texture;
  baseArray: Float32Array;

  factorTextures: { [name: string]: THREE.Texture | undefined };
  factorArrays: { [name: string]: Float32Array | undefined };
} | null>(null);

export function useIrradianceRendererData(
  factorName: string | null
): [THREE.Texture, Float32Array] {
  const ctx = useContext(IrradianceRendererContext);
  if (!ctx) {
    throw new Error('must be placed under irradiance texture compositor');
  }

  const result = useMemo<[THREE.Texture, Float32Array]>(() => {
    if (!factorName) {
      return [ctx.baseTexture, ctx.baseArray];
    }

    const factorTexture = ctx.factorTextures[factorName];
    const factorArray = ctx.factorArrays[factorName];

    if (!factorTexture || !factorArray) {
      throw new Error(
        `unknown irradiance texture compositor factor: ${factorName}`
      );
    }

    return [factorTexture, factorArray];
  }, [ctx, factorName]);

  return result;
}

const IrradianceTextureContext = React.createContext<THREE.Texture | null>(
  null
);

export function useIrradianceTexture(): THREE.Texture {
  const texture = useContext(IrradianceTextureContext);

  if (!texture) {
    throw new Error('must be placed under irradiance texture compositor');
  }

  return texture;
}

const LIGHTMAP_BG_COLOR = new THREE.Color('#000000'); // blank must be all zeroes (as one would expect)

const tmpPrevClearColor = new THREE.Color();

function createRendererTexture(
  atlasWidth: number,
  atlasHeight: number,
  withTestPattern?: boolean
): [THREE.Texture, Float32Array] {
  const atlasSize = atlasWidth * atlasHeight;
  const data = new Float32Array(4 * atlasSize);

  const texture = new THREE.DataTexture(
    data,
    atlasWidth,
    atlasHeight,
    THREE.RGBAFormat,
    THREE.FloatType
  );

  // always use nearest filter because this is an intermediate texture
  // used for compositing later
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  // pre-fill with a test pattern
  // (nested loop to avoid tripping sandbox infinite loop detection)
  if (withTestPattern) {
    for (let y = 0; y < atlasHeight; y += 1) {
      const yStart = y * atlasWidth * 4;

      for (let x = 0; x < atlasWidth; x += 1) {
        const stride = yStart + x * 4;

        const tileX = Math.floor(x / 4);
        const tileY = Math.floor(y / 4);

        const on = tileX % 2 === tileY % 2;

        data[stride] = on ? 0.2 : 0.8;
        data[stride + 1] = 0.5;
        data[stride + 2] = on ? 0.8 : 0.2;
        data[stride + 3] = 0;
      }
    }
  }

  return [texture, data];
}

const CompositorLayerMaterial: React.FC<{
  map: THREE.Texture;
  materialRef: React.MutableRefObject<THREE.ShaderMaterial | null>;
}> = ({ map, materialRef }) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          map: { value: null },
          multiplier: { value: 0 }
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
          uniform sampler2D map;
          uniform float multiplier;
          varying vec2 vUV;

          void main() {
            gl_FragColor = vec4(texture2D(map, vUV).rgb * multiplier, 1.0);
          }
        `,

        blending: THREE.AdditiveBlending
      }),
    []
  );

  // disposable managed object
  return (
    <primitive
      object={material}
      attach="material"
      uniforms-map-value={map}
      ref={materialRef}
    />
  );
};

export type LightMapConsumerChild = (
  outputLightMap: THREE.Texture
) => React.ReactNode;

export default function IrradianceCompositor<
  FactorValueMap extends { [name: string]: number }
>({
  lightMapWidth,
  lightMapHeight,
  textureFilter,
  factors,
  children
}: React.PropsWithChildren<{
  lightMapWidth: number;
  lightMapHeight: number;
  textureFilter?: THREE.TextureFilter;
  factors?: FactorValueMap;
  children: LightMapConsumerChild | React.ReactNode;
}>): React.ReactElement {
  // read value only on first render
  const widthRef = useRef(lightMapWidth);
  const heightRef = useRef(lightMapHeight);
  const textureFilterRef = useRef(textureFilter);

  const orthoSceneRef = useRef<THREE.Scene>();

  // read factor names once
  const [factorNames] = useState<Array<keyof FactorValueMap>>(() =>
    factors ? Object.keys(factors) : []
  );

  // incoming base rendered texture (filled elsewhere)
  const [baseTexture, baseArray] = useMemo(
    () => createRendererTexture(widthRef.current, heightRef.current, true),
    []
  );
  useEffect(
    () => () => {
      baseTexture.dispose();
    },
    [baseTexture]
  );

  // incoming extra rendered factors textures (filled elsewhere)
  // not including a test pattern here to avoid additive colour artifacts
  const [factorTextures, factorArrays] = useMemo<
    [
      Record<keyof FactorValueMap, THREE.Texture>,
      Record<keyof FactorValueMap, Float32Array>
    ]
  >(() => {
    const textures = {} as Record<keyof FactorValueMap, THREE.Texture>;
    const arrays = {} as Record<keyof FactorValueMap, Float32Array>;

    for (const key of factorNames) {
      const [texture, array] = createRendererTexture(
        widthRef.current,
        heightRef.current
      );

      textures[key] = texture;
      arrays[key] = array;
    }

    return [textures, arrays];
  }, [factorNames]);
  useEffect(
    () => () => {
      for (const texture of Object.values(factorTextures)) {
        texture.dispose();
      }
    },
    [factorTextures]
  );

  // refs to all the corresponding materials
  const baseMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const factorMaterialRefMap = useMemo(() => {
    // createRef assumes null as default value (not undefined)
    const result = {} as Record<
      keyof FactorValueMap,
      React.MutableRefObject<THREE.ShaderMaterial | null>
    >;

    for (const key of factorNames) {
      result[key] = React.createRef<THREE.ShaderMaterial>();
    }
    return result;
  }, [factorNames]);

  // info for renderer instances
  const rendererDataCtx = useMemo(
    () => ({
      baseTexture,
      baseArray,
      factorTextures,
      factorArrays
    }),
    [baseTexture, baseArray, factorTextures, factorArrays]
  );

  // compositor output
  const orthoTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(widthRef.current, heightRef.current, {
      type: THREE.FloatType,
      magFilter: textureFilterRef.current || THREE.LinearFilter,
      minFilter: textureFilterRef.current || THREE.LinearFilter,
      generateMipmaps: false
    });
  }, []);

  useEffect(
    () => () => {
      // clean up on unmount
      orthoTarget.dispose();
    },
    [orthoTarget]
  );

  // compositing render
  const orthoCamera = useMemo(() => {
    return new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  }, []);

  useFrame(({ gl }) => {
    // ensure light scene has been instantiated
    if (!orthoSceneRef.current) {
      return;
    }

    const orthoScene = orthoSceneRef.current; // local var for type safety

    // live-update actual intensity values
    if (baseMaterialRef.current) {
      baseMaterialRef.current.uniforms.multiplier.value = 1;
    }

    for (const factorName of factorNames) {
      const factorMaterialRef = factorMaterialRefMap[factorName];
      const multiplier = factors && factors[factorName];

      if (factorMaterialRef.current && multiplier) {
        factorMaterialRef.current.uniforms.multiplier.value = multiplier;
      }
    }

    // save existing renderer state
    tmpPrevClearColor.copy(gl.getClearColor());
    const prevClearAlpha = gl.getClearAlpha();
    const prevAutoClear = gl.autoClear;

    // produce output
    gl.setRenderTarget(orthoTarget);

    gl.setClearColor(LIGHTMAP_BG_COLOR, 1);
    gl.autoClear = true;

    gl.render(orthoScene, orthoCamera);

    // restore previous renderer state
    gl.setRenderTarget(null);
    gl.setClearColor(tmpPrevClearColor, prevClearAlpha);
    gl.autoClear = prevAutoClear;
  });

  return (
    <>
      <scene ref={orthoSceneRef}>
        <mesh>
          <planeBufferGeometry attach="geometry" args={[2, 2]} />
          <CompositorLayerMaterial
            map={baseTexture}
            materialRef={baseMaterialRef}
          />
        </mesh>

        {Object.keys(factorTextures).map((factorName) => (
          <mesh key={factorName}>
            <planeBufferGeometry attach="geometry" args={[2, 2]} />
            <CompositorLayerMaterial
              map={factorTextures[factorName]}
              materialRef={factorMaterialRefMap[factorName]}
            />
          </mesh>
        ))}
      </scene>

      <IrradianceRendererContext.Provider value={rendererDataCtx}>
        <IrradianceTextureContext.Provider value={orthoTarget.texture}>
          {typeof children === 'function'
            ? (children as LightMapConsumerChild)(orthoTarget.texture)
            : children}
        </IrradianceTextureContext.Provider>
      </IrradianceRendererContext.Provider>
    </>
  );
}
