"use client";
import { useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
/** The caller's key includes actor, company, resource and refresh generation. */
export function useScopedRead<T>(
  key: string,
  read: () => Promise<T>,
  failure: () => T,
): T | null {
  const [response, setResponse] = useState<{ key: string; value: T } | null>(
    null,
  );
  const pending = useRef<{ key: string; task: Promise<T> } | null>(null);
  useEffect(() => {
    let active = true;
    if (pending.current?.key !== key) pending.current = { key, task: read() };
    void pending.current.task
      .then((value) => {
        if (active)
          setResponse((previous) =>
            previous?.key === key ? previous : { key, value },
          );
      })
      .catch((error) => {
        unstable_rethrow(error);
        if (active)
          setResponse((previous) =>
            previous?.key === key ? previous : { key, value: failure() },
          );
      });
    return () => {
      active = false;
    };
  }, [key, read, failure]);
  return response?.key === key ? response.value : null;
}
