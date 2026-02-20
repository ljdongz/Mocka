import { useRef, useCallback } from 'react';

export function useDebouncedSave<T>(saveFn: (data: T) => Promise<void>, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const save = useCallback((data: T) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveFn(data), delay);
  }, [saveFn, delay]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { save, flush };
}
