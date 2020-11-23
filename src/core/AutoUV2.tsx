import React, { useContext, useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';

/// <reference path="potpack.d.ts"/>
import potpack, { PotPackItem } from 'potpack';

import { atlasWidth, atlasHeight } from './IrradianceAtlasMapper';

const tmpOrigin = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

const tmpNormal = new THREE.Vector3();
const tmpUAxis = new THREE.Vector3();
const tmpVAxis = new THREE.Vector3();

const tmpWLocal = new THREE.Vector2();

const tmpMinLocal = new THREE.Vector2();
const tmpMaxLocal = new THREE.Vector2();

interface AutoUVBox extends PotPackItem {
  uv2Attr: THREE.Float32BufferAttribute;

  uAxis: THREE.Vector3;
  vAxis: THREE.Vector3;

  posArray: ArrayLike<number>;
  posIndices: number[];
  posLocalX: number[];
  posLocalY: number[];
}

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

export interface AutoUV2ProviderProps {
  mapWorldWidth: number;
}

export const AutoUV2Provider: React.FC<AutoUV2ProviderProps> = ({
  mapWorldWidth,
  children
}) => {
  // wrap in ref to avoid re-triggering
  const mapWorldWidthRef = useRef(mapWorldWidth);
  mapWorldWidthRef.current = mapWorldWidth;

  // modified in-place to be able to run right on first render
  const meshStagingList = useMemo<THREE.Mesh[]>(() => [], []);

  useEffect(() => {
    const lightmapTexelSize = mapWorldWidthRef.current / atlasWidth;
    const layoutBoxes: AutoUVBox[] = [];

    for (const mesh of meshStagingList) {
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

      const vertexBoxMap: (AutoUVBox | undefined)[] = new Array(
        posArray.length / 3
      );

      if (buffer.attributes.uv2) {
        throw new Error('uv2 attribute already exists');
      }

      // pre-create uv2 attribute
      const uv2Attr = new THREE.Float32BufferAttribute(
        (2 * posArray.length) / 3,
        2
      );
      buffer.setAttribute('uv2', uv2Attr);

      for (let vStart = 0; vStart < faceCount * 3; vStart += 3) {
        let existingBox: AutoUVBox | undefined;

        for (let i = 0; i < 3; i += 1) {
          const possibleBox = vertexBoxMap[indexArray[vStart + i]];

          if (!possibleBox) {
            continue;
          }

          if (existingBox && existingBox !== possibleBox) {
            throw new Error(
              'multiple polygons share same vertex, make sure to separate vertex normals'
            );
          }

          existingBox = possibleBox;
        }

        if (!existingBox) {
          // @todo guess axis choice based on angle?
          const vU = vStart;
          const vV = vStart + 2;
          const vOrigin = vStart + 1;

          // get the plane-defining edge vectors
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

          existingBox = {
            x: 0, // filled later
            y: 0, // filled later
            w: 0, // filled later
            h: 0, // filled later

            uv2Attr,

            uAxis: tmpUAxis.clone(),
            vAxis: tmpUAxis.clone(),

            posArray,
            posIndices: [],
            posLocalX: [],
            posLocalY: []
          };

          layoutBoxes.push(existingBox);
        }

        for (let i = 0; i < 3; i += 1) {
          const index = indexArray[vStart + i];

          if (vertexBoxMap[index]) {
            continue;
          }

          vertexBoxMap[index] = existingBox;
          existingBox.posIndices.push(index);
          existingBox.posLocalX.push(0);
          existingBox.posLocalY.push(0);
        }
      }
    }

    for (const layoutBox of layoutBoxes) {
      const {
        uAxis,
        vAxis,
        posArray,
        posIndices,
        posLocalX,
        posLocalY
      } = layoutBox;

      // compute min and max extents of all coords
      tmpMinLocal.set(0, 0);
      tmpMaxLocal.set(0, 0);

      for (let i = 0; i < posIndices.length; i += 1) {
        const index = posIndices[i];

        tmpW.fromArray(posArray, index * 3);
        tmpWLocal.set(tmpW.dot(tmpUAxis), tmpW.dot(tmpVAxis));

        tmpMinLocal.min(tmpWLocal);
        tmpMaxLocal.max(tmpWLocal);

        posLocalX[i] = tmpWLocal.x;
        posLocalY[i] = tmpWLocal.y;
      }

      const realWidth = tmpMaxLocal.x - tmpMinLocal.x;
      const realHeight = tmpMaxLocal.y - tmpMinLocal.y;

      // texel box is aligned to texel grid
      const boxWidthInTexels = Math.ceil(realWidth / lightmapTexelSize);
      const boxHeightInTexels = Math.ceil(realHeight / lightmapTexelSize);

      // layout box positioning is in texels
      layoutBox.w = boxWidthInTexels + 2; // plus margins
      layoutBox.h = boxHeightInTexels + 2; // plus margins

      // make vertex local coords expressed as 0..1 inside texel box
      for (let i = 0; i < posIndices.length; i += 1) {
        posLocalX[i] = (posLocalX[i] - tmpMinLocal.x) / realWidth;
        posLocalY[i] = (posLocalY[i] - tmpMinLocal.y) / realHeight;
      }
    }

    const { w: layoutWidth, h: layoutHeight } = potpack(layoutBoxes);

    if (layoutWidth > atlasWidth || layoutHeight > atlasHeight) {
      throw new Error(
        `auto-UV needs lightmap sized ${layoutWidth}x${layoutHeight}`
      );
    }

    for (const layoutBox of layoutBoxes) {
      const {
        x,
        y,
        w,
        h,
        uv2Attr,
        posIndices,
        posLocalX,
        posLocalY
      } = layoutBox;

      // inner texel box without margins
      const ix = x + 1;
      const iy = y + 1;
      const iw = w - 2;
      const ih = h - 2;

      // convert texel box placement into atlas UV coordinates
      for (let i = 0; i < posIndices.length; i += 1) {
        uv2Attr.setXY(
          posIndices[i],
          (ix + posLocalX[i] * iw) / atlasWidth,
          (iy + posLocalY[i] * ih) / atlasHeight
        );
      }
    }
  }, []);

  return (
    <AutoUV2StagingContext.Provider value={meshStagingList}>
      {children}
    </AutoUV2StagingContext.Provider>
  );
};
