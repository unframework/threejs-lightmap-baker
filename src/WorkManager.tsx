import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef
} from 'react';
import { useThree, useFrame, PointerEvent } from 'react-three-fiber';

type WorkManagerHook = () => void;
export const WorkManagerContext = React.createContext<WorkManagerHook | null>(
  null
);

interface RendererJobInfo {
  id: number;
}

// this runs inside the renderer hook instance
function useJobInstance(
  jobCountRef: React.MutableRefObject<number>,
  setJobs: React.Dispatch<React.SetStateAction<RendererJobInfo[]>>
) {
  // static object with mutable state
  const jobInfo = useMemo(() => {
    // generate new job ID on mount
    jobCountRef.current += 1;

    return {
      id: jobCountRef.current
    };
  }, []);

  useEffect(() => {
    // register self on mount
    setJobs((prev) => [...prev, jobInfo]);

    // clean up on unmount
    return () => {
      // keep all jobs that do not have our ID
      setJobs((prev) => prev.filter((info) => info.id !== jobInfo.id));
    };
  }, [jobInfo]);
}

const WorkManager: React.FC = ({ children }) => {
  const jobCountRef = useRef(0);
  const [jobs, setJobs] = useState<RendererJobInfo[]>([]);

  const hook = useCallback(() => {
    useJobInstance(jobCountRef, setJobs); // eslint-disable-line react-hooks/rules-of-hooks
  }, []);

  return (
    <>
      <WorkManagerContext.Provider value={hook}>
        {children}
      </WorkManagerContext.Provider>
    </>
  );
};

export default WorkManager;
