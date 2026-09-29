import { GripVertical } from 'lucide-react';
import { useUIStore } from '../../stores/ui.store';
import { EndpointItem } from './EndpointItem';
import { TreeRow, type RowIndicator } from './TreeRow';
import type { Endpoint } from '../../types';

/** Row id for an endpoint as listed under `collectionId` (an endpoint can be listed in more than one). */
export const endpointRowId = (collectionId: string | null, endpointId: string) => `ep:${collectionId ?? '-'}:${endpointId}`;

export function SortableEndpointItem({
  endpoint,
  collectionId,
  indicator,
}: {
  endpoint: Endpoint;
  collectionId: string | null;
  indicator: RowIndicator;
}) {
  const editMode = useUIStore(s => s.editMode);
  return (
    <TreeRow
      id={endpointRowId(collectionId, endpoint.id)}
      item={{ type: 'endpoint', id: endpoint.id, collectionId }}
      spot={{ type: 'endpoint', id: endpoint.id, collectionId }}
      disabled={editMode}
      indicator={indicator}
      // pl-2 + a 14px grip: the same spot as the grip on a collection row at this level.
      className="group/sortable flex items-center pl-2"
    >
      {(handleProps) => (
        <>
          {!editMode && (
            <span
              className="text-text-muted hover:text-text-secondary cursor-grab flex items-center opacity-0 group-hover/sortable:opacity-100 transition-opacity shrink-0"
              {...handleProps}
            >
              <GripVertical size={14} strokeWidth={2.5} />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <EndpointItem endpoint={endpoint} />
          </div>
        </>
      )}
    </TreeRow>
  );
}
