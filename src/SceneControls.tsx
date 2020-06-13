import React, { useRef } from 'react';
import { useFrame, useThree, extend, ReactThreeFiber } from 'react-three-fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      orbitControls: ReactThreeFiber.Object3DNode<
        OrbitControls,
        typeof OrbitControls
      >;
    }
  }
}

extend({ OrbitControls });

const SceneControls: React.FC = () => {
  const { camera, gl } = useThree();
  const orbitControlsRef = useRef<OrbitControls>();

  useFrame(() => {
    if (!orbitControlsRef.current) {
      return;
    }
    orbitControlsRef.current.update();
  });

  return (
    <orbitControls
      ref={orbitControlsRef}
      args={[camera, gl.domElement]}
      enableDamping
      dampingFactor={0.1}
      rotateSpeed={0.5}
      target={new THREE.Vector3(0, 0, 1)}
    />
  );
};

export default SceneControls;
