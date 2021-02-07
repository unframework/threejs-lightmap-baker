/*
 * Copyright (c) 2020-now Nick Matantsev
 * Licensed under the MIT license
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useResource } from 'react-three-fiber';
import * as THREE from 'three';

const FallbackListener: React.FC<{
  onStarted: () => void;
  onFinished: () => void;
}> = ({ onStarted, onFinished }) => {
  const onStartedRef = useRef(onStarted);
  onStartedRef.current = onStarted;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    onStartedRef.current();

    return () => {
      onFinishedRef.current();
    };
  }, []);
  return null;
};

const IrradianceScene = React.forwardRef<
  THREE.Scene | null,
  { children: React.ReactNode }
>(({ children }, sceneRef) => {
  // by default, set up kick-off for next tick
  // (but this is prevented if suspense is thrown from children)
  const initialTimeoutId = useMemo(
    () =>
      setTimeout(() => {
        console.log('initial start');
      }, 0),
    []
  );

  return (
    <React.Suspense
      fallback={
        <FallbackListener
          onStarted={() => {
            // prevent default starter logic
            clearTimeout(initialTimeoutId);
          }}
          onFinished={() => {
            // issue kick-off once suspense is resolved
            console.log('delayed start');
          }}
        />
      }
    >
      <scene ref={sceneRef}>{children}</scene>
    </React.Suspense>
  );
});

export default IrradianceScene;
