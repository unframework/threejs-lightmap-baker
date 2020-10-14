import React, {
  useCallback,
  useState,
  useEffect,
  Dispatch,
  SetStateAction
} from 'react';

// render-prop callback (always returns an element, which happens to be
// our collector instance)
export type PropCallback<Args extends unknown[]> = (
  ...renderPropArgs: Args
) => React.ReactElement;

// @todo figure out a cleaner way
export type PropReturn<Args> = Args extends [infer A]
  ? [PropCallback<Args>, A?]
  : Args extends [infer A, infer B]
  ? [PropCallback<Args>, A?, B?]
  : Args extends [infer A, infer B, infer C]
  ? [PropCallback<Args>, A?, B?, C?]
  : Args extends [infer A, infer B, infer C, infer D]
  ? [PropCallback<Args>, A?, B?, C?, D?]
  : Args extends [infer A, infer B, infer C, infer D, infer E]
  ? [PropCallback<Args>, A?, B?, C?, D?, E?]
  : Args extends [infer A, infer B, infer C, infer D, infer E, infer F]
  ? [PropCallback<Args>, A?, B?, C?, D?, E?, F?]
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

  // nothing to return from collector instance
  return null;
}

export function useRenderProp<Args extends unknown[]>(): PropReturn<Args> {
  const [currentArgs, setCurrentArgs] = useState<Args | undefined>(undefined);

  const propCallback = useCallback<PropCallback<Args>>(
    (...args) => <ArgsCollector setter={setCurrentArgs} args={args} />,
    []
  );

  if (currentArgs === undefined) {
    return [propCallback] as PropReturn<Args>;
  }

  // @todo consider how to add more type safety
  return [propCallback, ...currentArgs] as PropReturn<Args>;
}
