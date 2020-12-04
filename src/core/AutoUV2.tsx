/*
 * Copyright (c) 2020-now Nick Matantsev
 * Licensed under the MIT license
 */

import React, { useContext, useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';

/// <reference path="potpack.d.ts"/>
import potpack, { PotPackItem } from 'potpack';

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

function guessOrthogonalOrigin(
  indexArray: ArrayLike<number>,
  vStart: number,
  posArray: ArrayLike<number>
): number {
  let minAbsDot = 1;
  let minI = 0;

  for (let i = 0; i < 3; i += 1) {
    // for this ortho origin choice, compute defining edges
    tmpOrigin.fromArray(posArray, indexArray[vStart + i] * 3);
    tmpU.fromArray(posArray, indexArray[vStart + ((i + 2) % 3)] * 3);
    tmpV.fromArray(posArray, indexArray[vStart + ((i + 1) % 3)] * 3);

    tmpU.sub(tmpOrigin);
    tmpV.sub(tmpOrigin);

    // normalize and compute cross (cosine of angle)
    tmpU.normalize();
    tmpV.normalize();

    const absDot = Math.abs(tmpU.dot(tmpV));

    // compare with current minimum
    if (minAbsDot > absDot) {
      minAbsDot = absDot;
      minI = i;
    }
  }

  return minI;
}

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
  lightMapWidth: number;
  lightMapHeight: number;
  lightMapWorldWidth: number;
}

export const AutoUV2Provider: React.FC<AutoUV2ProviderProps> = ({
  lightMapWidth,
  lightMapHeight,
  lightMapWorldWidth: mapWorldWidth,
  children
}) => {
  // read value only on first render
  const widthRef = useRef(lightMapWidth);
  const heightRef = useRef(lightMapHeight);
  const mapWorldWidthRef = useRef(mapWorldWidth);

  // modified in-place to be able to run right on first render
  const meshStagingList = useMemo<THREE.Mesh[]>(() => [], []);

  useEffect(() => {
    const lightmapTexelSize = mapWorldWidthRef.current / widthRef.current;
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
        // see if this face shares a vertex with an existing layout box
        let existingBox: AutoUVBox | undefined;

        for (let i = 0; i < 3; i += 1) {
          const possibleBox = vertexBoxMap[indexArray[vStart + i]];

          if (!possibleBox) {
            continue;
          }

          if (existingBox && existingBox !== possibleBox) {
            // absorb layout box into the other
            // (this may happen if same polygon's faces are defined non-consecutively)
            existingBox.posIndices.push(...possibleBox.posIndices);
            existingBox.posLocalX.push(...possibleBox.posLocalX);
            existingBox.posLocalY.push(...possibleBox.posLocalY);

            // re-assign by-vertex lookup
            for (const index of possibleBox.posIndices) {
              vertexBoxMap[index] = existingBox;
            }

            // remove from main list
            const removedBoxIndex = layoutBoxes.indexOf(possibleBox);
            if (removedBoxIndex === -1) {
              throw new Error('unexpected orphaned layout box');
            }
            layoutBoxes.splice(removedBoxIndex, 1);
          } else {
            existingBox = possibleBox;
          }
        }

        // set up new layout box if needed
        if (!existingBox) {
          // @todo guess axis choice based on angle?
          const originFI = guessOrthogonalOrigin(indexArray, vStart, posArray);

          const vOrigin = vStart + originFI;
          const vU = vStart + ((originFI + 2) % 3); // prev in face
          const vV = vStart + ((originFI + 1) % 3); // next in face

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
            vAxis: tmpVAxis.clone(),

            posArray,
            posIndices: [],
            posLocalX: [],
            posLocalY: []
          };

          layoutBoxes.push(existingBox);
        }

        // add this face's vertices to the layout box local point set
        // @todo warn if normals deviate too much
        for (let i = 0; i < 3; i += 1) {
          const index = indexArray[vStart + i];

          if (vertexBoxMap[index]) {
            continue;
          }

          vertexBoxMap[index] = existingBox;
          existingBox.posIndices.push(index);
          existingBox.posLocalX.push(0); // filled later
          existingBox.posLocalY.push(0); // filled later
        }
      }
    }

    // fill in local coords and compute dimensions for layout boxes based on polygon point sets inside them
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
      tmpMinLocal.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
      tmpMaxLocal.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

      for (let i = 0; i < posIndices.length; i += 1) {
        const index = posIndices[i];

        tmpW.fromArray(posArray, index * 3);
        tmpWLocal.set(tmpW.dot(uAxis), tmpW.dot(vAxis));

        tmpMinLocal.min(tmpWLocal);
        tmpMaxLocal.max(tmpWLocal);

        posLocalX[i] = tmpWLocal.x;
        posLocalY[i] = tmpWLocal.y;
      }

      const realWidth = tmpMaxLocal.x - tmpMinLocal.x;
      const realHeight = tmpMaxLocal.y - tmpMinLocal.y;

      if (realWidth < 0 || realHeight < 0) {
        throw new Error('zero-point polygon?');
      }

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

    // main layout magic
    const { w: layoutWidth, h: layoutHeight } = potpack(layoutBoxes);

    if (layoutWidth > widthRef.current || layoutHeight > heightRef.current) {
      throw new Error(
        `auto-UV needs lightmap sized ${layoutWidth}x${layoutHeight}`
      );
    }

    // based on layout box positions, fill in UV2 attribute data
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
          (ix + posLocalX[i] * iw) / widthRef.current,
          (iy + posLocalY[i] * ih) / heightRef.current
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
