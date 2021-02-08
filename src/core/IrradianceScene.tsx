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

  // re-throw our own suspense promise
  // (no need to ever resolve it because this gets unmounted anyway)
  // NOTE: throwing directly from inside this component prevents useEffect from working,
  // hence the nested suspender stub
  const LocalSuspender = useMemo<React.FC>(() => {
    const promise = new Promise(() => undefined);

    return () => {
      throw promise;
    };
  }, []);
  return <LocalSuspender />;
};

const IrradianceScene = React.forwardRef<
  THREE.Scene | null,
  React.PropsWithChildren<{ onReady: () => void }>
>(({ onReady, children }, sceneRef) => {
  // by default, set up kick-off for next tick
  // (but this is prevented if suspense is thrown from children)
  const initialTimeoutId = useMemo(
    () =>
      setTimeout(() => {
        onReady();
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
            onReady();
          }}
        />
      }
    >
      <scene ref={sceneRef}>{children}</scene>
    </React.Suspense>
  );
});

export default IrradianceScene;
