import React, {
  useCallback,
  useState,
  useEffect,
  Dispatch,
  SetStateAction
} from 'react';

export type PropCallback<Args extends unknown[]> = (
  ...renderPropArgs: Args
) => React.ReactElement;

type ArgConcat<Args extends unknown[]> = (
  head: PropCallback<Args>,
  ...args: Args
) => void;
export type PropReturn<Args extends unknown[]> = ArgConcat<Args> extends (
  ...args: infer ConcatArgs
) => void
  ? ConcatArgs
  : never;

function ArgsCollector<Args extends unknown[]>({
  setter,
  args
}: {
  setter: Dispatch<SetStateAction<Args | undefined>>;
  args: Args;
}) {
  // report args on mount or change
  useEffect(() => {
    setter(args);
  }, [setter, ...args]);

  // clean up on unmount
  useEffect(() => {
    return () => {
      setter(undefined);
    };
  }, [setter]);

  // nothing to display here @todo use fragment?
  return null;
}

export function useRenderProp<Args extends unknown[]>(): PropReturn<Args> {
  const [currentArgs, setCurrentArgs] = useState<Args | undefined>(undefined);

  const propCallback = useCallback<PropCallback<Args>>(
    (...args) => <ArgsCollector setter={setCurrentArgs} args={args} />,
    []
  );

  return [propCallback, ...currentArgs];
}
