import React, { useMemo } from 'react';
import * as THREE from 'three';

// simple quad face (from plane geometry) repeated in a grid
// with separated UV at hubs so that each quad can have its own atlas item
const GridGeometry: React.FC<{ attach?: string }> = React.forwardRef(
  ({ attach }, ref) => {
    const basePlaneBuffer = useMemo(
      () => new THREE.PlaneBufferGeometry(5, 5),
      []
    );

    const gridBuffer = useMemo(() => {
      if (!basePlaneBuffer.index) {
        throw new Error('expected index');
      }

      const gridSize = 3;
      const gridCount = gridSize * gridSize;

      const buffer = new THREE.BufferGeometry();
      const baseIndexArray = basePlaneBuffer.index.array;
      const basePosArray = basePlaneBuffer.attributes.position.array;
      const baseNormalArray = basePlaneBuffer.attributes.normal.array;
      const baseUVArray = basePlaneBuffer.attributes.uv.array;

      const indexArray = new Uint16Array(baseIndexArray.length * gridCount);
      const posArray = new Float32Array(basePosArray.length * gridCount);
      const normalArray = new Float32Array(baseNormalArray.length * gridCount);
      const uvArray = new Float32Array(baseUVArray.length * gridCount);

      for (let row = 0; row < gridSize; row += 1) {
        for (let col = 0; col < gridSize; col += 1) {
          const base = row * gridSize + col;

          indexArray.set(baseIndexArray, base * baseIndexArray.length);
          posArray.set(basePosArray, base * basePosArray.length);
          normalArray.set(baseNormalArray, base * baseNormalArray.length);
          uvArray.set(baseUVArray, base * baseUVArray.length);

          const indexBase = base * baseIndexArray.length;
          const vertCount = basePosArray.length / 3;
          for (let iOffset = 0; iOffset < baseIndexArray.length; iOffset += 1) {
            indexArray[indexBase + iOffset] += base * vertCount;
          }

          const posBase = base * basePosArray.length;
          for (let xOffset = 0; xOffset < basePosArray.length; xOffset += 3) {
            posArray[posBase + xOffset] += (col - (gridSize - 1) / 2) * 5;
          }
          for (let yOffset = 1; yOffset < basePosArray.length; yOffset += 3) {
            posArray[posBase + yOffset] += (row - (gridSize - 1) / 2) * 5;
          }
        }
      }

      buffer.setIndex(new THREE.Uint16BufferAttribute(indexArray, 1));

      buffer.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(posArray, 3)
      );

      buffer.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(normalArray, 3)
      );

      buffer.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2));

      return buffer;
    }, []);

    // attachable and disposable object
    return <primitive ref={ref} object={gridBuffer} attach={attach} />;
  }
);

export default GridGeometry;
