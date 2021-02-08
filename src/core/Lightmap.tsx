import React, { useMemo } from 'react';
import * as THREE from 'three';

import IrradianceSceneManager from './IrradianceSceneManager';
import WorkManager from './WorkManager';
import IrradianceRenderer from './IrradianceRenderer';
import IrradianceCompositor from './IrradianceCompositor';
import IrradianceScene from './IrradianceScene';

export interface LightmapProps {
  lightMapWidth: number;
  lightMapHeight: number;
  textureFilter?: THREE.TextureFilter;
}

const Lightmap = React.forwardRef<
  THREE.Scene,
  React.PropsWithChildren<LightmapProps>
>(({ lightMapWidth, lightMapHeight, textureFilter, children }, sceneRef) => {
  const LocalSuspender = useMemo<React.FC>(() => {
    const completionPromise = new Promise(() => undefined);
    return () => {
      throw completionPromise;
    };
  }, []);

  return (
    <IrradianceCompositor
      lightMapWidth={lightMapWidth}
      lightMapHeight={lightMapHeight}
      textureFilter={textureFilter}
    >
      <IrradianceSceneManager>
        {(workbench, startWorkbench) => (
          <>
            <IrradianceScene ref={sceneRef} onReady={startWorkbench}>
              {children}
            </IrradianceScene>

            <WorkManager>
              {workbench ? (
                <IrradianceRenderer workbench={workbench} />
              ) : (
                <LocalSuspender />
              )}
            </WorkManager>
          </>
        )}
      </IrradianceSceneManager>
    </IrradianceCompositor>
  );
});

export default Lightmap;
