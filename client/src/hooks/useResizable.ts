import { useCallback, useRef } from 'react';

export function useResizable(
  initialWidth: number,
  onResize: (width: number) => void,
  min = 200,
  max = 500,
) {
  const startX = useRef(0);
  const startWidth = useRef(initialWidth);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    startX.current = e.clientX;
    startWidth.current = initialWidth;

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX.current;
      const newWidth = Math.min(max, Math.max(min, startWidth.current + delta));
      onResize(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [initialWidth, onResize, min, max]);

  return { onMouseDown };
}
