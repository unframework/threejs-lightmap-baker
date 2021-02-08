import React, { useState, useMemo } from 'react';
import { useResource, useFrame } from 'react-three-fiber';
import * as THREE from 'three';

const Spinner: React.FC = () => {
  const meshRef = useResource<THREE.Mesh>();

  useFrame(({ clock }) => {
    if (meshRef.current.rotation.isEuler) {
      meshRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.2);
      meshRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.5);
      meshRef.current.rotation.z = Math.sin(clock.elapsedTime);

      const initialZoom = Math.sin(Math.min(clock.elapsedTime, Math.PI / 2));
      meshRef.current.scale.x = meshRef.current.scale.y = meshRef.current.scale.z =
        (1 + 0.2 * Math.sin(clock.elapsedTime * 1.5)) * initialZoom;
    }
  });

  return (
    <>
      <pointLight position={[-4, 4, 8]} />

      <mesh ref={meshRef}>
        <dodecahedronGeometry args={[2]} />
        <meshLambertMaterial color="#808080" />
      </mesh>
    </>
  );
};

export default Spinner;
