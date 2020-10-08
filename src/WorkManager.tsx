import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef
} from 'react';
import { useThree, useFrame, PointerEvent } from 'react-three-fiber';

type WorkCallback = (gl: THREE.WebGLRenderer, lightScene: THREE.Scene) => void;
type WorkManagerHook = (
  scene: React.ReactElement | null,
  callback: WorkCallback
) => void;
export const WorkManagerContext = React.createContext<WorkManagerHook | null>(
  null
);

interface RendererJobInfo {
  id: number;
  lightSceneElement: React.ReactElement | null;
  callbackRef: React.MutableRefObject<WorkCallback>;
}

// this runs inside the renderer hook instance
function useJobInstance(
  jobCountRef: React.MutableRefObject<number>,
  setJobs: React.Dispatch<React.SetStateAction<RendererJobInfo[]>>,
  lightSceneElement: React.ReactElement | null,
  callback: WorkCallback
) {
  // unique job ID
  const jobId = useMemo<number>(() => {
    // generate new job ID on mount
    jobCountRef.current += 1;
    return jobCountRef.current;
  }, []);

  // wrap latest callback in stable ref
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // add or update job object (preserving the order)
  useEffect(() => {
    const jobInfo = {
      id: jobId,
      lightSceneElement,
      callbackRef
    };

    setJobs((prev) => {
      const newJobs = [...prev];

      const jobIndex = prev.findIndex((job) => job.id === jobId);
      if (jobIndex === -1) {
        newJobs.push(jobInfo);
      } else {
        newJobs[jobIndex] = jobInfo;
      }

      return newJobs;
    });
  }, [jobId, lightSceneElement]);

  // clean up on unmount
  useEffect(() => {
    return () => {
      // keep all jobs that do not have our ID
      setJobs((prev) => prev.filter((info) => info.id !== jobId));
    };
  }, [jobId]);
}

const WorkManager: React.FC = ({ children }) => {
  const jobCountRef = useRef(0);
  const [jobs, setJobs] = useState<RendererJobInfo[]>([]);

  const hook = useCallback<WorkManagerHook>((lightSceneElement, callback) => {
    useJobInstance(jobCountRef, setJobs, lightSceneElement, callback); // eslint-disable-line react-hooks/rules-of-hooks
  }, []);

  // get light scene for active job, if any, and add our own ref
  const activeJob = jobs.find((item) => item.lightSceneElement !== null);

  const lightSceneRef = useRef<THREE.Scene>();
  const lightSceneElement =
    activeJob &&
    activeJob.lightSceneElement &&
    React.cloneElement(activeJob.lightSceneElement, {
      key: `light-scene-${activeJob.id}`, // ensure scene is fully re-created on job change
      ref: lightSceneRef
    });

  // actual per-frame work invocation
  useFrame(({ gl }) => {
    // check if there is nothing to do
    if (!activeJob || !lightSceneRef.current) {
      return;
    }

    // invoke work callback
    const lightScene = lightSceneRef.current; // local var for type safety
    activeJob.callbackRef.current(gl, lightScene);
  }, 10);

  return (
    <>
      <WorkManagerContext.Provider value={hook}>
        {children}
      </WorkManagerContext.Provider>

      {lightSceneElement}
    </>
  );
};

export default WorkManager;
