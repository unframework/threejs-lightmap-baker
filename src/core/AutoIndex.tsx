/*
 * Copyright (c) 2020-now Nick Matantsev
 * Licensed under the MIT license
 */

import React, { useContext, useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';

const tmpVert = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();

const tmpVert2 = new THREE.Vector3();
const tmpNormal2 = new THREE.Vector3();

function findVertex(
  posArray: ArrayLike<number>,
  normalArray: ArrayLike<number>,
  vertexIndex: number
): number {
  tmpVert.fromArray(posArray, vertexIndex * 3);
  tmpNormal.fromArray(normalArray, vertexIndex * 3);

  // finish search before current vertex (since latter is the fallback return)
  for (let vStart = 0; vStart < vertexIndex; vStart += 1) {
    tmpVert2.fromArray(posArray, vStart * 3);
    tmpNormal2.fromArray(normalArray, vStart * 3);

    if (tmpVert2.equals(tmpVert) && tmpNormal2.equals(tmpNormal)) {
      return vStart;
    }
  }

  return vertexIndex;
}

// simple mesh auto-indexer (add face index attribute based on de-duplicated mesh vertices + normals)
// does not change existing mesh position array/etc
export const AutoIndex: React.FC = () => {
  const groupRef = useRef<THREE.Group>();

  useEffect(() => {
    const group = groupRef.current;

    if (!group) {
      throw new Error('did not instantiate after render');
    }

    const mesh = group.parent;

    if (!(mesh instanceof THREE.Mesh)) {
      throw new Error('expecting mesh');
    }

    const buffer = mesh.geometry;

    if (!(buffer instanceof THREE.BufferGeometry)) {
      throw new Error('expecting buffer geometry');
    }

    if (buffer.index) {
      throw new Error('expecting non-indexed buffer geometry');
    }

    const posArray = buffer.attributes.position.array;
    const posVertexCount = Math.floor(posArray.length / 3);
    const faceCount = Math.floor(posVertexCount / 3);

    const normalArray = buffer.attributes.normal.array;

    const indexAttr = new THREE.Uint16BufferAttribute(faceCount * 3, 3);
    indexAttr.count = faceCount * 3; // @todo without this the mesh does not show all faces

    for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
      const vStart = faceIndex * 3;
      const a = findVertex(posArray, normalArray, vStart);
      const b = findVertex(posArray, normalArray, vStart + 1);
      const c = findVertex(posArray, normalArray, vStart + 2);

      indexAttr.setXYZ(faceIndex, a, b, c);
    }

    buffer.setIndex(indexAttr);
  }, []);

  return <group ref={groupRef} />;
};
