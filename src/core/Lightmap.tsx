import React from 'react';
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
>(({ lightMapWidth, lightMapHeight, textureFilter, children }, sceneRef) => (
  <IrradianceCompositor
    lightMapWidth={lightMapWidth}
    lightMapHeight={lightMapHeight}
    textureFilter={textureFilter}
  >
    <IrradianceSceneManager>
      {(workbench, startWorkbench) => (
        <>
          <WorkManager>
            {workbench && <IrradianceRenderer workbench={workbench} />}
          </WorkManager>

          <IrradianceScene ref={sceneRef} onReady={startWorkbench}>
            {children}
          </IrradianceScene>
        </>
      )}
    </IrradianceSceneManager>
  </IrradianceCompositor>
));

export default Lightmap;
