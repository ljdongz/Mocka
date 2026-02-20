import { useResizable } from '../../hooks/useResizable';
import { useUIStore } from '../../stores/ui.store';

export function ResizableDivider() {
  const sidebarWidth = useUIStore(s => s.sidebarWidth);
  const setSidebarWidth = useUIStore(s => s.setSidebarWidth);
  const { onMouseDown } = useResizable(sidebarWidth, setSidebarWidth);

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 cursor-col-resize bg-border-primary hover:bg-accent-primary transition-colors flex-shrink-0"
    />
  );
}
