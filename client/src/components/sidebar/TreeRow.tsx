import clsx from 'clsx';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragItem, DropSpot } from '../../utils/collection-tree';

/** Where a row draws the pending-drop line: above it, below it, or below it indented one level (its first child). */
export type RowIndicator = 'before' | 'after' | 'child' | null;

/** The drop line. `indent` shifts it to the child level. Parent must be `relative`. */
export function DropLine({ at, indent = false }: { at: 'top' | 'bottom'; indent?: boolean }) {
  return (
    <div className={clsx(
      'pointer-events-none absolute right-1 z-10 h-0.5 rounded bg-accent-primary',
      indent ? 'left-[1.6rem]' : 'left-1',
      at === 'top' ? '-top-px' : '-bottom-px',
    )} />
  );
}

/**
 * A sidebar row that can be dragged (by the handle it hands to `children`) and dropped onto.
 * Rows never shift while dragging; the indicator shows where the drop will land instead.
 */
export function TreeRow({ id, item, spot, disabled, indicator, className, children, ...rest }: {
  id: string;
  item: DragItem;
  spot: DropSpot;
  disabled: boolean;
  indicator: RowIndicator;
  className?: string;
  children: (handleProps: Record<string, unknown>, isDragging: boolean) => React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>) {
  const drag = useDraggable({ id, data: { item }, disabled });
  const drop = useDroppable({ id, data: { spot }, disabled });
  const setRef = (el: HTMLDivElement | null) => { drag.setNodeRef(el); drop.setNodeRef(el); };
  return (
    <div
      ref={setRef}
      {...rest}
      className={clsx('relative', className)}
      style={{ opacity: drag.isDragging ? 0.4 : 1 }}
    >
      {children({ ...drag.listeners, ...drag.attributes }, drag.isDragging)}
      {indicator && <DropLine at={indicator === 'before' ? 'top' : 'bottom'} indent={indicator === 'child'} />}
    </div>
  );
}
