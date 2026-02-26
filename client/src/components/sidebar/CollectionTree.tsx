import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Pencil, X, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCollectionStore } from '../../stores/collection.store';
import { useEndpointStore } from '../../stores/endpoint.store';
import { useUIStore } from '../../stores/ui.store';
import { useTranslation } from '../../i18n';
import { EndpointItem } from './EndpointItem';
import { SortableEndpointItem } from './SortableEndpointItem';
import type { Collection } from '../../types';

function SortableCollectionItem({
  collection,
  children,
}: {
  collection: Collection;
  children: (dragHandleProps: { listeners: any; attributes: any }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: collection.id,
    data: { type: 'collection' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ listeners, attributes })}
    </div>
  );
}

export function CollectionTree() {
  const t = useTranslation();
  const collections = useCollectionStore(s => s.collections);
  const endpoints = useEndpointStore(s => s.endpoints);
  const toggleExpanded = useCollectionStore(s => s.toggleExpanded);
  const removeCollection = useCollectionStore(s => s.remove);
  const updateCollection = useCollectionStore(s => s.update);
  const reorderCollections = useCollectionStore(s => s.reorderCollections);
  const reorderEndpoints = useCollectionStore(s => s.reorderEndpoints);
  const setShowNewEndpoint = useUIStore(s => s.setShowNewEndpoint);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [hoveredCollId, setHoveredCollId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'collection' | 'endpoint' | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const commitRename = (id: string) => {
    if (editName.trim()) updateCollection(id, { name: editName.trim() });
    setEditingId(null);
  };

  const collectedIds = new Set(collections.flatMap(c => c.endpointIds ?? []));
  const uncollected = endpoints.filter(e => !collectedIds.has(e.id));

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    setActiveType(active.data.current?.type ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveType(null);

    if (!over || active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Collection reorder
    if (activeData?.type === 'collection' && overData?.type === 'collection') {
      const oldIndex = collections.findIndex(c => c.id === active.id);
      const newIndex = collections.findIndex(c => c.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(collections, oldIndex, newIndex);
        reorderCollections(newOrder.map(c => c.id));
      }
      return;
    }

    // Endpoint reorder within same collection
    if (activeData?.type === 'endpoint' && overData?.type === 'endpoint') {
      const collId = activeData.collectionId;
      if (collId && collId === overData.collectionId) {
        const coll = collections.find(c => c.id === collId);
        if (!coll) return;
        const eids = coll.endpointIds ?? [];
        const oldIndex = eids.indexOf(active.id as string);
        const newIndex = eids.indexOf(over.id as string);
        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(eids, oldIndex, newIndex);
          reorderEndpoints(collId, newOrder);
        }
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-1 py-1">
        <SortableContext items={collections.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {collections.map(c => (
            <SortableCollectionItem key={c.id} collection={c}>
              {({ listeners, attributes }) => (
                <div>
                  <div
                    className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-bg-hover"
                    onClick={() => toggleExpanded(c.id)}
                    onMouseEnter={() => setHoveredCollId(c.id)}
                    onMouseLeave={() => setHoveredCollId(null)}
                  >
                    <span
                      className="text-text-muted hover:text-text-secondary cursor-grab flex items-center"
                      {...listeners}
                      {...attributes}
                      onClick={e => e.stopPropagation()}
                    >
                      <GripVertical size={14} strokeWidth={2.5} />
                    </span>
                    <span className="text-text-muted flex items-center">
                      {c.isExpanded ? <ChevronDown size={14} strokeWidth={2.5} /> : <ChevronRight size={14} strokeWidth={2.5} />}
                    </span>
                    {editingId === c.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={() => commitRename(c.id)}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(c.id); if (e.key === 'Escape') setEditingId(null); }}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 bg-bg-input text-text-primary text-xs px-1 py-0.5 rounded border border-accent-primary outline-none"
                      />
                    ) : (
                      <span className="flex-1 font-medium text-text-primary truncate">{c.name}</span>
                    )}
                    {hoveredCollId === c.id && (
                      <div className="flex gap-1.5 items-center">
                        <button
                          onClick={e => { e.stopPropagation(); setShowNewEndpoint(true, c.id); }}
                          className="text-text-muted hover:text-text-secondary flex items-center"
                          title={t.sidebar.addEndpoint}
                        >
                          <Plus size={14} strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); startRename(c.id, c.name); }}
                          className="text-text-muted hover:text-text-secondary flex items-center"
                          title={t.sidebar.rename}
                        >
                          <Pencil size={13} strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); removeCollection(c.id); }}
                          className="text-text-muted hover:text-method-delete flex items-center"
                          title={t.common.delete}
                        >
                          <X size={14} strokeWidth={2.5} />
                        </button>
                      </div>
                    )}
                  </div>
                  {c.isExpanded && (
                    <div className="ml-3">
                      <SortableContext items={c.endpointIds ?? []} strategy={verticalListSortingStrategy}>
                        {(c.endpointIds ?? []).map(eid => {
                          const ep = endpoints.find(e => e.id === eid);
                          if (!ep) return null;
                          return <SortableEndpointItem key={ep.id} endpoint={ep} collectionId={c.id} />;
                        })}
                      </SortableContext>
                    </div>
                  )}
                </div>
              )}
            </SortableCollectionItem>
          ))}
        </SortableContext>
        {uncollected.length > 0 && (
          <div>
            {collections.length > 0 && (
              <div className="px-2 py-1 text-xs text-text-muted uppercase tracking-wider">{t.sidebar.uncollected}</div>
            )}
            {uncollected.map(ep => (
              <EndpointItem key={ep.id} endpoint={ep} />
            ))}
          </div>
        )}
      </div>
      <DragOverlay>
        {activeId && activeType === 'collection' && (() => {
          const c = collections.find(x => x.id === activeId);
          if (!c) return null;
          return (
            <div className="rounded px-2 py-1.5 text-sm bg-bg-surface border border-border-secondary shadow-lg opacity-90">
              <span className="font-medium text-text-primary">{c.name}</span>
            </div>
          );
        })()}
        {activeId && activeType === 'endpoint' && (() => {
          const ep = endpoints.find(x => x.id === activeId);
          if (!ep) return null;
          return (
            <div className="rounded px-2 py-1.5 text-sm bg-bg-surface border border-border-secondary shadow-lg opacity-90 font-mono text-text-secondary">
              {ep.method} {ep.path}
            </div>
          );
        })()}
      </DragOverlay>
    </DndContext>
  );
}
