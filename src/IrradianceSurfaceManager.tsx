import React, { useMemo, useContext } from 'react';
import { useUpdate } from 'react-three-fiber';
import * as THREE from 'three';

export const atlasWidth = 256;
export const atlasHeight = 256;

const bleedOffsetU = 2 / atlasWidth;
const bleedOffsetV = 2 / atlasHeight;

const itemSizeU = 0.1;
const itemSizeV = 0.1;
const itemUVMargin = 0.025;

// maximum physical dimension of a stored item's face
const atlasItemMaxDim = 5;

const itemsPerRow = Math.floor(1 / (itemSizeU + itemUVMargin));

const tmpFaceIndexes: [number, number, number, number] = [-1, -1, -1, -1];
const tmpOrigin = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();

const IrradianceAtlasContext = React.createContext<AtlasItem[] | null>(null);

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

  const left = itemColumn * (itemSizeU + itemUVMargin) + bleedOffsetU;
  const top = itemRow * (itemSizeV + itemUVMargin) + bleedOffsetV;
  const sizeU = itemSizeU * (dUdim / atlasItemMaxDim);
  const sizeV = itemSizeV * (dVdim / atlasItemMaxDim);

  return { left, top, sizeU, sizeV };
}

export interface AtlasItem {
  mesh: THREE.Mesh;
  buffer: THREE.BufferGeometry;
  quadIndex: number;
  left: number;
  top: number;
  sizeU: number;
  sizeV: number;
}

export const IrradianceSurface: React.FC<{
  children: React.ReactElement<{}, 'mesh'>;
}> = ({ children }) => {
  const atlasInfo = useIrradianceAtlasContext();

  const meshRef = useUpdate<THREE.Mesh>((mesh) => {
    const meshBuffer = mesh.geometry;

    if (!(meshBuffer instanceof THREE.BufferGeometry)) {
      throw new Error('expected buffer geometry');
    }

    if (!meshBuffer.index) {
      throw new Error('expecting indexed mesh buffer');
    }

    const indexes = meshBuffer.index.array;
    const posAttr = meshBuffer.attributes.position;

    const quadCount = Math.floor(indexes.length / 6); // assuming quads, 2x tris each

    const lumUVAttr = new THREE.Float32BufferAttribute(quadCount * 4 * 2, 2);

    for (let quadIndex = 0; quadIndex < quadCount; quadIndex += 1) {
      const atlasFaceIndex = atlasInfo.length;

      fetchFaceIndexes(indexes, quadIndex);

      const { left, top, sizeU, sizeV } = computeFaceUV(
        atlasFaceIndex,
        posAttr.array,
        tmpFaceIndexes
      );

      lumUVAttr.setXY(tmpFaceIndexes[0], left, top + sizeV);
      lumUVAttr.setXY(tmpFaceIndexes[1], left, top);
      lumUVAttr.setXY(tmpFaceIndexes[2], left + sizeU, top);
      lumUVAttr.setXY(tmpFaceIndexes[3], left + sizeU, top + sizeV);

      atlasInfo.push({
        mesh: mesh,
        buffer: meshBuffer,
        quadIndex,
        left,
        top,
        sizeU,
        sizeV
      });
    }

    // store illumination UV as dedicated attribute
    meshBuffer.setAttribute('lumUV', lumUVAttr.setUsage(THREE.StaticDrawUsage));
  }, []);

  return React.cloneElement(children, { ref: meshRef }, [
    ...children.props.children
  ]);
};

const IrradianceSurfaceManager: React.FC = ({ children }) => {
  const atlasInfo: AtlasItem[] = useMemo(() => [], []);

  return (
    <IrradianceAtlasContext.Provider value={atlasInfo}>
      {children}
    </IrradianceAtlasContext.Provider>
  );
};

export default IrradianceSurfaceManager;
