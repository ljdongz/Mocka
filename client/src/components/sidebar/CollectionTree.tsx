import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, Plus, Pencil, X, GripVertical, FolderPlus, FolderInput } from 'lucide-react';
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
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import type { Collection } from '../../types';
import { childrenOf, flattenTree, subtreeIds } from '../../utils/collection-tree';

function SortableCollectionItem({
  collection,
  disabled,
  children,
}: {
  collection: Collection;
  disabled: boolean;
  children: (dragHandleProps: { listeners: any; attributes: any }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: collection.id,
    data: { type: 'collection', parentId: collection.parentId ?? null },
    disabled,
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
  const updateCollection = useCollectionStore(s => s.update);
  const moveCollection = useCollectionStore(s => s.move);
  const reorderCollections = useCollectionStore(s => s.reorderCollections);
  const reorderEndpoints = useCollectionStore(s => s.reorderEndpoints);
  const setShowNewEndpoint = useUIStore(s => s.setShowNewEndpoint);
  const setShowNewCollection = useUIStore(s => s.setShowNewCollection);
  const editMode = useUIStore(s => s.editMode);
  const selectedCollectionIds = useUIStore(s => s.selectedCollectionIds);
  const toggleCollectionSelection = useUIStore(s => s.toggleCollectionSelection);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [hoveredCollId, setHoveredCollId] = useState<string | null>(null);
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null);
  const moveMenuRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'collection' | 'endpoint' | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    if (!moveMenuId) return;
    const handleClick = (e: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) setMoveMenuId(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moveMenuId]);

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

  // Read from the tree, not from collections[].endpointIds: an endpoint deleted
  // elsewhere stays listed there until something refetches, and a dead id would
  // inflate the delete count. Covers the whole subtree, which a delete takes too.
  const liveEndpointIds = (c: Collection) => {
    const ids = new Set(subtreeIds(collections, c.id));
    const held = new Set(collections.filter(x => ids.has(x.id)).flatMap(x => x.endpointIds ?? []));
    return endpoints.filter(e => held.has(e.id)).map(e => e.id);
  };
  const pendingDeleteCollection = collections.find(c => c.id === pendingDeleteId);
  // Captured once: the delete removes the collection from the store mid-flight,
  // and deriving `open` from it would unmount the dialog while requests are out.
  const pendingDeleteEndpointIds = pendingDeleteCollection ? liveEndpointIds(pendingDeleteCollection) : [];
  const pendingDeleteCollectionIds = pendingDeleteCollection ? subtreeIds(collections, pendingDeleteCollection.id) : [];

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

    // Collection reorder among siblings; moving to another parent goes through the move menu.
    if (activeData?.type === 'collection' && overData?.type === 'collection') {
      if (activeData.parentId !== overData.parentId) return;
      const siblings = childrenOf(collections, activeData.parentId);
      const oldIndex = siblings.findIndex(c => c.id === active.id);
      const newIndex = siblings.findIndex(c => c.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderCollections(arrayMove(siblings, oldIndex, newIndex).map(c => c.id));
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

  const renderMoveMenu = (c: Collection) => {
    const own = new Set(subtreeIds(collections, c.id));
    const option = (key: string, label: string, target: string | null, depth: number) => (
      <div
        key={key}
        onClick={e => {
          e.stopPropagation();
          setMoveMenuId(null);
          if (target !== c.parentId) moveCollection(c.id, target);
        }}
        style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
        className={clsx(
          'pr-3 py-1.5 text-xs cursor-pointer hover:bg-bg-hover',
          target === c.parentId ? 'text-accent-primary font-medium' : 'text-text-secondary',
        )}
      >
        {label}
      </div>
    );
    return (
      <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] max-h-[300px] overflow-y-auto rounded border border-border-secondary bg-bg-surface py-1 shadow-lg">
        {option('__top', t.sidebar.topLevel, null, 0)}
        {flattenTree(collections)
          .filter(({ collection }) => !own.has(collection.id))
          .map(({ collection, depth }) => option(collection.id, collection.name, collection.id, depth))}
      </div>
    );
  };

  const renderCollection = (c: Collection): React.ReactNode => {
    const subCollections = childrenOf(collections, c.id);
    const showActions = !editMode && (hoveredCollId === c.id || moveMenuId === c.id);
    return (
      <SortableCollectionItem key={c.id} collection={c} disabled={editMode}>
        {({ listeners, attributes }) => (
          <div>
            <div
              className={clsx(
                'flex items-center gap-1.5 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-bg-hover',
                editMode && selectedCollectionIds.includes(c.id) && 'bg-bg-hover',
              )}
              onClick={() => editMode ? toggleCollectionSelection(subtreeIds(collections, c.id), liveEndpointIds(c)) : toggleExpanded(c.id)}
              onMouseEnter={() => setHoveredCollId(c.id)}
              onMouseLeave={() => setHoveredCollId(null)}
            >
              {editMode ? (
                <input
                  type="checkbox"
                  checked={selectedCollectionIds.includes(c.id)}
                  onChange={() => toggleCollectionSelection(subtreeIds(collections, c.id), liveEndpointIds(c))}
                  onClick={e => e.stopPropagation()}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-accent-primary"
                />
              ) : (
                <span
                  className="text-text-muted hover:text-text-secondary cursor-grab flex items-center"
                  {...listeners}
                  {...attributes}
                  onClick={e => e.stopPropagation()}
                >
                  <GripVertical size={14} strokeWidth={2.5} />
                </span>
              )}
              {/* In edit mode the row click selects, so expanding needs its own hit area. */}
              <span
                className="text-text-muted flex items-center"
                onClick={e => { if (editMode) { e.stopPropagation(); toggleExpanded(c.id); } }}
              >
                {c.isExpanded ? <ChevronDown size={14} strokeWidth={2.5} /> : <ChevronRight size={14} strokeWidth={2.5} />}
              </span>
              {editingId === c.id && !editMode ? (
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
              {showActions && (
                <div className="flex gap-1.5 items-center">
                  <button
                    onClick={e => { e.stopPropagation(); setShowNewEndpoint(true, c.id); }}
                    className="text-text-muted hover:text-text-secondary flex items-center"
                    title={t.sidebar.addEndpoint}
                  >
                    <Plus size={14} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setShowNewCollection(true, c.id); }}
                    className="text-text-muted hover:text-text-secondary flex items-center"
                    title={t.sidebar.addSubCollection}
                  >
                    <FolderPlus size={13} strokeWidth={2.5} />
                  </button>
                  <div ref={moveMenuId === c.id ? moveMenuRef : undefined} className="relative flex items-center">
                    <button
                      onClick={e => { e.stopPropagation(); setMoveMenuId(moveMenuId === c.id ? null : c.id); }}
                      className="text-text-muted hover:text-text-secondary flex items-center"
                      title={t.sidebar.moveCollection}
                    >
                      <FolderInput size={13} strokeWidth={2.5} />
                    </button>
                    {moveMenuId === c.id && renderMoveMenu(c)}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); startRename(c.id, c.name); }}
                    className="text-text-muted hover:text-text-secondary flex items-center"
                    title={t.sidebar.rename}
                  >
                    <Pencil size={13} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setPendingDeleteId(c.id); }}
                    className="text-text-muted hover:text-method-delete flex items-center"
                    title={t.common.delete}
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>
            {c.isExpanded && (
              // Indent to the parent's chevron, with a guide line, so nesting reads at a glance.
              <div className="ml-[1.35rem] border-l border-border-secondary pl-1">
                {subCollections.length > 0 && (
                  <SortableContext items={subCollections.map(x => x.id)} strategy={verticalListSortingStrategy}>
                    {subCollections.map(renderCollection)}
                  </SortableContext>
                )}
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
    );
  };

  const topLevel = childrenOf(collections, null);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-1 py-1">
        <SortableContext items={topLevel.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {topLevel.map(renderCollection)}
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
      <DeleteConfirmDialog
        open={!!pendingDeleteId}
        collectionIds={pendingDeleteCollectionIds}
        endpointIds={pendingDeleteEndpointIds}
        onClose={() => setPendingDeleteId(null)}
        onDone={() => setPendingDeleteId(null)}
      />
    </DndContext>
  );
}
