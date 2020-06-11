import React, { useRef } from 'react';
import { useFrame, useThree, extend, ReactThreeFiber } from 'react-three-fiber';
import { FlyControls } from 'three/examples/jsm/controls/FlyControls';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      flyControls: ReactThreeFiber.Object3DNode<
        FlyControls,
        typeof FlyControls
      >;
    }
  }
}

extend({ FlyControls });

const SceneControls: React.FC = () => {
  const { camera, gl } = useThree();
  const flyControlsRef = useRef<FlyControls>();

  useFrame((params, delta) => {
    if (!flyControlsRef.current) {
      return;
    }
    flyControlsRef.current.update(delta);
  });

  return (
    <flyControls
      ref={flyControlsRef}
      args={[camera, gl.domElement]}
      rollSpeed={0.75}
      movementSpeed={2}
      dragToLook
    />
  );
};

export default SceneControls;
