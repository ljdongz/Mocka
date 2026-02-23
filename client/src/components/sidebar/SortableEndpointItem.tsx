import { GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EndpointItem } from './EndpointItem';
import type { Endpoint } from '../../types';

export function SortableEndpointItem({
  endpoint,
  collectionId,
}: {
  endpoint: Endpoint;
  collectionId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: endpoint.id,
    data: { type: 'endpoint', collectionId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group/sortable flex items-center">
      <span
        className="text-text-muted hover:text-text-secondary cursor-grab flex items-center opacity-0 group-hover/sortable:opacity-100 transition-opacity shrink-0"
        {...listeners}
        {...attributes}
      >
        <GripVertical size={12} strokeWidth={2.5} />
      </span>
      <div className="flex-1 min-w-0">
        <EndpointItem endpoint={endpoint} />
      </div>
    </div>
  );
}
