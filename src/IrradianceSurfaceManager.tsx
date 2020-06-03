import React, { useMemo, useCallback, useContext, useRef } from 'react';
import { useUpdate, useFrame } from 'react-three-fiber';
import * as THREE from 'three';

export const atlasWidth = 128;
export const atlasHeight = 128;

const bleedOffsetU = 1 / atlasWidth;
const bleedOffsetV = 1 / atlasHeight;

const itemCellU = 1 / 8;
const itemCellV = 1 / 8;
const itemTexelU = Math.floor(atlasWidth * itemCellU) - 2;
const itemTexelV = Math.floor(atlasHeight * itemCellV) - 2;
const itemSizeU = itemTexelU / atlasWidth;
const itemSizeV = itemTexelV / atlasHeight;

// maximum physical dimension of a stored item's face
const atlasItemMaxDim = 5;

const itemsPerRow = Math.floor(1 / itemCellU);

const tmpFaceIndexes: [number, number, number, number] = [-1, -1, -1, -1];
const tmpOrigin = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();

export interface AtlasQuad {
  mesh: THREE.Mesh;
  buffer: THREE.BufferGeometry;
  quadIndex: number;
  left: number;
  top: number;
  sizeU: number;
  sizeV: number;
  map?: THREE.Texture;
}

export interface AtlasSceneItem {
  mesh: THREE.Mesh;
  buffer: THREE.Geometry | THREE.BufferGeometry; // either is fine
  albedoMap?: THREE.Texture;
  emissiveIntensity: number;
  emissiveMap?: THREE.Texture;
}

export interface AtlasLightFactor {
  mesh: THREE.Mesh;
  emissiveIntensity: number;
}

export interface Atlas {
  quads: AtlasQuad[];
  lightSceneItems: AtlasSceneItem[];
  lightFactors: { [name: string]: AtlasLightFactor };
  factorValues: { [name: string]: number };
}

const IrradianceAtlasContext = React.createContext<Atlas | null>(null);

export function useIrradianceAtlasContext() {
  const atlasInfo = useContext(IrradianceAtlasContext);

  if (!atlasInfo) {
    throw new Error('must be inside manager context');
  }

  return atlasInfo;
}

function fetchFaceIndexes(indexArray: ArrayLike<number>, quadIndex: number) {
  const vBase = quadIndex * 6;

  // pattern is ABD, BCD
  tmpFaceIndexes[0] = indexArray[vBase];
  tmpFaceIndexes[1] = indexArray[vBase + 1];
  tmpFaceIndexes[2] = indexArray[vBase + 4];
  tmpFaceIndexes[3] = indexArray[vBase + 5];
}

function fetchFaceAxes(
  posArray: ArrayLike<number>,
  quadIndexes: [number, number, number, number]
) {
  // get face vertex positions
  const facePosOrigin = quadIndexes[1] * 3;
  const facePosU = quadIndexes[2] * 3;
  const facePosV = quadIndexes[0] * 3;

  tmpOrigin.fromArray(posArray, facePosOrigin);
  tmpU.fromArray(posArray, facePosU);
  tmpV.fromArray(posArray, facePosV);
}

function computeFaceUV(
  atlasFaceIndex: number,
  posArray: ArrayLike<number>,
  quadIndexes: ArrayLike<number>
) {
  const itemColumn = atlasFaceIndex % itemsPerRow;
  const itemRow = Math.floor(atlasFaceIndex / itemsPerRow);

  // get face vertex positions
  fetchFaceAxes(posArray, tmpFaceIndexes);

  // compute face dimensions
  tmpU.sub(tmpOrigin);
  tmpV.sub(tmpOrigin);

  const dUdim = Math.min(atlasItemMaxDim, tmpU.length());
  const dVdim = Math.min(atlasItemMaxDim, tmpV.length());

  const texelU = Math.max(
    1,
    Math.floor(atlasWidth * itemSizeU * (dUdim / atlasItemMaxDim))
  );
  const texelV = Math.max(
    1,
    Math.floor(atlasHeight * itemSizeV * (dVdim / atlasItemMaxDim))
  );

  const left = itemColumn * itemCellU + bleedOffsetU;
  const top = itemRow * itemCellV + bleedOffsetV;
  const sizeU = texelU / atlasWidth;
  const sizeV = texelV / atlasHeight;

  return { left, top, sizeU, sizeV };
}

// @todo wrap in provider helper
export const IrradianceTextureContext = React.createContext<THREE.Texture | null>(
  null
);

// default white texture fill
const defaultTextureData = new Uint8Array([255, 255, 255, 255]);
const defaultTexture = new THREE.DataTexture(
  defaultTextureData,
  1,
  1,
  THREE.RGBAFormat
);

const IrradianceMeshMaterial: React.FC<{
  attach?: string;
  albedoMap?: THREE.Texture;
  emissiveIntensity?: number;
  emissiveMap?: THREE.Texture;
  materialRef?: React.MutableRefObject<THREE.ShaderMaterial | null>;
}> = ({ attach, albedoMap, emissiveIntensity, emissiveMap, materialRef }) => {
  const irradianceMap = useContext(IrradianceTextureContext);

  if (!irradianceMap) {
    throw new Error('no texture provided');
  }

  // @todo this should be inside memo??
  const material = new THREE.ShaderMaterial({
    uniforms: {
      albedoMap: { value: null },
      emissiveMap: { value: null },
      emissiveIntensity: { value: null },
      irradianceMap: { value: null }
    },

    vertexShader: `
      attribute vec2 atlasUV;
      varying vec2 vUV;
      varying vec2 vAtlasUV;

      void main() {
        vUV = uv;
        vAtlasUV = atlasUV;

        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      uniform float emissiveIntensity;
      uniform sampler2D albedoMap;
      uniform sampler2D emissiveMap;
      uniform sampler2D irradianceMap;
      varying vec2 vUV;
      varying vec2 vAtlasUV;

      void main() {
        // drastically reduce emissive intensity at display time to preserve colour
        float emissiveFaded = emissiveIntensity * 0.25;

        vec3 base = texture2D(albedoMap, vUV).rgb;
        vec3 emit = texture2D(emissiveMap, vUV).rgb * emissiveFaded;
        vec3 irradiance = texture2D(irradianceMap, vAtlasUV).rgb;
        gl_FragColor = vec4(toneMapping(base * irradiance + emit), 1.0);
      }
    `
  });

  // disposable managed object
  return (
    <primitive
      object={material}
      attach={attach}
      uniforms-albedoMap-value={albedoMap || defaultTexture}
      uniforms-emissiveMap-value={emissiveMap || defaultTexture}
      uniforms-emissiveIntensity-value={emissiveIntensity || 0}
      uniforms-irradianceMap-value={irradianceMap}
      ref={materialRef}
    />
  );
};

export const IrradianceSurface: React.FC<{
  albedoMap?: THREE.Texture;
  emissiveMap?: THREE.Texture;
  emissiveIntensity?: number;
  factor?: string;
  children: React.ReactElement<{}, 'mesh' | 'primitive'>;
}> = ({ albedoMap, emissiveMap, emissiveIntensity, factor, children }) => {
  const atlas = useIrradianceAtlasContext();
  const { quads, lightSceneItems, lightFactors } = atlas;

  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  const meshRef = useUpdate<THREE.Mesh>((mesh) => {
    const meshBuffer = mesh.geometry;

    // register display item
    lightSceneItems.push({
      mesh,
      buffer: meshBuffer,
      albedoMap,
      emissiveIntensity: factor !== undefined ? 0 : emissiveIntensity || 0, // if factor contributor, zero emissive by default
      emissiveMap
    });

    if (factor !== undefined) {
      lightFactors[factor] = {
        mesh,
        emissiveIntensity: emissiveIntensity || 0
      };
    }

    // skip generating irradiance quads if only lit
    if (!albedoMap) {
      return;
    }

    if (!(meshBuffer instanceof THREE.BufferGeometry)) {
      throw new Error('expected buffer geometry');
    }

    if (!meshBuffer.index) {
      throw new Error('expecting indexed mesh buffer');
    }

    const indexes = meshBuffer.index.array;
    const posAttr = meshBuffer.attributes.position;

    const quadCount = Math.floor(indexes.length / 6); // assuming quads, 2x tris each

    const atlasUVAttr = new THREE.Float32BufferAttribute(quadCount * 4 * 2, 2);

    for (let quadIndex = 0; quadIndex < quadCount; quadIndex += 1) {
      const atlasFaceIndex = quads.length;

      fetchFaceIndexes(indexes, quadIndex);

      const { left, top, sizeU, sizeV } = computeFaceUV(
        atlasFaceIndex,
        posAttr.array,
        tmpFaceIndexes
      );

      atlasUVAttr.setXY(tmpFaceIndexes[0], left, top + sizeV);
      atlasUVAttr.setXY(tmpFaceIndexes[1], left, top);
      atlasUVAttr.setXY(tmpFaceIndexes[2], left + sizeU, top);
      atlasUVAttr.setXY(tmpFaceIndexes[3], left + sizeU, top + sizeV);

      quads.push({
        mesh: mesh,
        buffer: meshBuffer,
        map: albedoMap,
        quadIndex,
        left,
        top,
        sizeU,
        sizeV
      });
    }

    // store illumination UV as dedicated attribute
    meshBuffer.setAttribute(
      'atlasUV',
      atlasUVAttr.setUsage(THREE.StaticDrawUsage)
    );
  }, []);

  // @todo consider how to skip if not a light factor
  useFrame(() => {
    if (materialRef.current && emissiveIntensity && factor) {
      // read latest value live
      const multiplier = atlas.factorValues[factor];
      materialRef.current.uniforms.emissiveIntensity.value =
        emissiveIntensity * (multiplier || 0);

      materialRef.current.uniformsNeedUpdate = true;
    }
  }, 10);

  return React.cloneElement(
    children,
    { ref: meshRef },
    children.props.children,
    <IrradianceMeshMaterial
      attach="material"
      albedoMap={albedoMap}
      emissiveMap={emissiveMap}
      emissiveIntensity={factor ? 0 : emissiveIntensity}
      materialRef={materialRef}
    />
  );
};

export function useIrradianceFactors() {
  const atlas = useIrradianceAtlasContext();

  const setFactorValues = useCallback(
    (factorValues: { [name: string]: number }) => {
      atlas.factorValues = { ...factorValues };
    },
    [atlas]
  );

  return setFactorValues;
}

const IrradianceSurfaceManager: React.FC = ({ children }) => {
  const atlas: Atlas = useMemo(
    () => ({
      quads: [],
      lightSceneItems: [],
      lightFactors: {},
      factorValues: {}
    }),
    []
  );

  return (
    <IrradianceAtlasContext.Provider value={atlas}>
      {children}
    </IrradianceAtlasContext.Provider>
  );
};

export default IrradianceSurfaceManager;
