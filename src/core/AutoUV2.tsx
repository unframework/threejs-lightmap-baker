import React, { useContext, useMemo, useEffect, useRef } from 'react';
import { useResource } from 'react-three-fiber';
import * as THREE from 'three';

/// <reference path="potpack.d.ts"/>
import potpack, { PotPackItem } from 'potpack';

import { atlasWidth, atlasHeight } from './IrradianceAtlasMapper';

// return triangle edge canonical code as i1:i2 (in consistent winding order)
function getEdgeCode(
  indexList: ArrayLike<number>,
  start: number,
  edgeIndex: number,
  flip: boolean
) {
  const a = indexList[start + (edgeIndex % 3)];
  const b = indexList[start + ((edgeIndex + 1) % 3)];

  return flip ? `${b}:${a}` : `${a}:${b}`;
}

const tmpOrigin = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

const tmpNormal = new THREE.Vector3();
const tmpUAxis = new THREE.Vector3();
const tmpVAxis = new THREE.Vector3();

const tmpULocal = new THREE.Vector2();
const tmpVLocal = new THREE.Vector2();
const tmpWLocal = new THREE.Vector2();

const tmpMinLocal = new THREE.Vector2();
const tmpMaxLocal = new THREE.Vector2();

interface AutoUVBox extends PotPackItem {
  // index and local coords inside box
  vOrigin: number;
  vOtx: number;
  vOty: number;

  vU: number;
  vUtx: number;
  vUty: number;

  vV: number;
  vVtx: number;
  vVty: number;

  vW: number;
  vWtx: number;
  vWty: number;
}

const lightmapPhysWidth = 16;
const lightmapTexelSize = lightmapPhysWidth / atlasWidth;

const AutoUV2StagingContext = React.createContext<THREE.Mesh[] | null>(null);

export const AutoUV2: React.FC = () => {
  const meshStagingList = useContext(AutoUV2StagingContext);
  const groupRef = useRef<THREE.Group>();

  useEffect(() => {
    if (!meshStagingList) {
      throw new Error('must be inside AutoUV2Provider');
    }

    const group = groupRef.current;

    if (!group) {
      throw new Error('did not instantiate after render');
    }

    const mesh = group.parent;

    if (!(mesh instanceof THREE.Mesh)) {
      throw new Error('expecting mesh');
    }

    meshStagingList.push(mesh);
  }, []);

  return <group ref={groupRef} />;
};

export const AutoUV2Provider: React.FC = ({ children }) => {
  // modified in-place to be able to run right on first render
  const meshStagingList = useMemo<THREE.Mesh[]>(() => [], []);

  useEffect(() => {
    if (meshStagingList.length < 1) {
      return;
    }

    const mesh = meshStagingList[0];

    const buffer = mesh.geometry;

    if (!(buffer instanceof THREE.BufferGeometry)) {
      throw new Error('expecting buffer geometry');
    }

    const indexAttr = buffer.index;

    if (!indexAttr) {
      throw new Error('expecting indexed buffer geometry');
    }

    const indexArray = indexAttr.array;
    const faceCount = Math.floor(indexArray.length / 3);

    const posArray = buffer.attributes.position.array;
    const normalArray = buffer.attributes.normal.array;

    const layoutBoxes: AutoUVBox[] = [];

    for (let vStart = 0; vStart < faceCount * 3; vStart += 3) {
      const vNextStart = vStart + 3;

      // detect quad
      if (vNextStart < faceCount * 3) {
        // encoded vertex index pairs
        const curEdgeCodes = [
          getEdgeCode(indexArray, vStart, 0, false),
          getEdgeCode(indexArray, vStart, 1, false),
          getEdgeCode(indexArray, vStart, 2, false)
        ];

        // same but flipped (to reflect that here the edge is "walked" in opposite direction)
        const nextEdgeCodes = [
          getEdgeCode(indexArray, vNextStart, 0, true),
          getEdgeCode(indexArray, vNextStart, 1, true),
          getEdgeCode(indexArray, vNextStart, 2, true)
        ];

        const sharedEdgeIndex = curEdgeCodes.findIndex(
          (edgeCode) => nextEdgeCodes.indexOf(edgeCode) !== -1
        );

        // decide which is the "origin" vertex
        const oppositeEdgeIndex = sharedEdgeIndex !== -1 ? sharedEdgeIndex : 1;

        // U and V vertices are on the opposite edge to origin
        const vU = vStart + oppositeEdgeIndex;
        const vV = vStart + ((oppositeEdgeIndex + 1) % 3);
        const vOrigin = vStart + ((oppositeEdgeIndex + 2) % 3);

        // get the non-shared edge vectors
        tmpOrigin.fromArray(posArray, indexArray[vOrigin] * 3);
        tmpU.fromArray(posArray, indexArray[vU] * 3);
        tmpV.fromArray(posArray, indexArray[vV] * 3);

        tmpU.sub(tmpOrigin);
        tmpV.sub(tmpOrigin);

        // compute orthogonal coordinate system for face plane
        tmpNormal.fromArray(normalArray, indexArray[vOrigin] * 3);
        tmpUAxis.crossVectors(tmpV, tmpNormal);
        tmpVAxis.crossVectors(tmpNormal, tmpUAxis);
        tmpUAxis.normalize();
        tmpVAxis.normalize();

        // U and V vertex coords in local face plane
        tmpULocal.set(tmpU.dot(tmpUAxis), tmpU.dot(tmpVAxis));
        tmpVLocal.set(tmpV.dot(tmpUAxis), tmpV.dot(tmpVAxis));

        // work on the fourth vertex if this is a quad
        // @todo check if its normal matches
        let vW = -1;
        if (sharedEdgeIndex !== -1) {
          const sharedEdgeCode = curEdgeCodes[sharedEdgeIndex];

          // figure out which edge this is in next face
          const nextEdgeIndex = nextEdgeCodes.indexOf(sharedEdgeCode);

          if (nextEdgeIndex === -1) {
            throw new Error('unexpected non-shared edge');
          }

          // the fourth vertex of the quad is the one opposite to shared edge in next face
          vW = vNextStart + ((nextEdgeIndex + 2) % 3);

          // compute local coords
          tmpW.fromArray(posArray, indexArray[vW] * 3);
          tmpW.sub(tmpOrigin);
          tmpWLocal.set(tmpW.dot(tmpUAxis), tmpW.dot(tmpVAxis));
        } else {
          // not applicable, set to dummy coords
          tmpWLocal.set(0, 0);
        }

        // compute min and max extents of origin, U and V local coords (and W if filled)
        tmpMinLocal.set(0, 0);
        tmpMinLocal.min(tmpULocal);
        tmpMinLocal.min(tmpVLocal);
        tmpMinLocal.min(tmpWLocal);

        tmpMaxLocal.set(0, 0);
        tmpMaxLocal.max(tmpULocal);
        tmpMaxLocal.max(tmpVLocal);
        tmpMaxLocal.max(tmpWLocal);

        const realWidth = tmpMaxLocal.x - tmpMinLocal.x;
        const realHeight = tmpMaxLocal.y - tmpMinLocal.y;

        // texel box is aligned to texel grid
        const boxWidthInTexels = Math.ceil(realWidth / lightmapTexelSize);
        const boxHeightInTexels = Math.ceil(realHeight / lightmapTexelSize);

        // layout box positioning is in texels
        layoutBoxes.push({
          x: 0, // filled later
          y: 0, // filled later
          w: boxWidthInTexels + 2, // plus margins
          h: boxHeightInTexels + 2, // plus margins

          // vertex local coords expressed as 0..1 inside texel box
          vOrigin,
          vOtx: -tmpMinLocal.x / realWidth,
          vOty: -tmpMinLocal.y / realWidth,

          vU,
          vUtx: (tmpULocal.x - tmpMinLocal.x) / realWidth,
          vUty: (tmpULocal.y - tmpMinLocal.y) / realWidth,

          vV,
          vVtx: (tmpVLocal.x - tmpMinLocal.x) / realWidth,
          vVty: (tmpVLocal.y - tmpMinLocal.y) / realWidth,

          vW,
          vWtx: (tmpWLocal.x - tmpMinLocal.x) / realWidth,
          vWty: (tmpWLocal.y - tmpMinLocal.y) / realWidth
        });

        // advance by one extra triangle on next cycle if faces share edge
        // @todo process the second triangle
        if (sharedEdgeIndex !== -1) {
          vStart += 3;
        }
      }
    }

    const { w: layoutWidth, h: layoutHeight } = potpack(layoutBoxes);

    if (layoutWidth > atlasWidth || layoutHeight > atlasHeight) {
      throw new Error(
        `auto-UV needs lightmap sized ${layoutWidth}x${layoutHeight}`
      );
    }

    // now fill in the uv2 coordinates
    const uv2Attr = new THREE.Float32BufferAttribute(
      (2 * posArray.length) / 3,
      2
    );

    for (const layoutBox of layoutBoxes) {
      const {
        x,
        y,
        w,
        h,
        vOrigin,
        vOtx,
        vOty,
        vU,
        vUtx,
        vUty,
        vV,
        vVtx,
        vVty,
        vW,
        vWtx,
        vWty
      } = layoutBox;

      // inner texel box without margins
      const ix = x + 1;
      const iy = y + 1;
      const iw = w - 2;
      const ih = h - 2;

      // convert texel box placement into atlas UV coordinates
      uv2Attr.setXY(
        indexArray[vOrigin],
        (ix + vOtx * iw) / atlasWidth,
        (iy + vOty * ih) / atlasHeight
      );

      uv2Attr.setXY(
        indexArray[vU],
        (ix + vUtx * iw) / atlasWidth,
        (iy + vUty * ih) / atlasHeight
      );

      uv2Attr.setXY(
        indexArray[vV],
        (ix + vVtx * iw) / atlasWidth,
        (iy + vVty * ih) / atlasHeight
      );

      if (vW !== -1) {
        uv2Attr.setXY(
          indexArray[vW],
          (ix + vWtx * iw) / atlasWidth,
          (iy + vWty * ih) / atlasHeight
        );
      }
    }

    buffer.setAttribute('uv2', uv2Attr);
  }, []);

  return (
    <AutoUV2StagingContext.Provider value={meshStagingList}>
      {children}
    </AutoUV2StagingContext.Provider>
  );
};
