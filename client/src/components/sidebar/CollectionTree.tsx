import { useState, useEffect, useRef, useMemo } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, Plus, Pencil, X, GripVertical, FolderPlus, FolderInput } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import { useCollectionStore } from '../../stores/collection.store';
import { useEndpointStore } from '../../stores/endpoint.store';
import { useUIStore } from '../../stores/ui.store';
import { useTranslation } from '../../i18n';
import { SortableEndpointItem, endpointRowId } from './SortableEndpointItem';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { TreeRow, DropLine, type RowIndicator } from './TreeRow';
import type { Collection } from '../../types';
import {
  flattenTree, subtreeIds, mixedChildren, dropZone, planDrop,
  type DragItem, type DropSpot, type DropPlan, type TreeChild,
} from '../../utils/collection-tree';

const collectionRowId = (id: string) => `col:${id}`;
const ROOT_ID = 'root';

/**
 * The drop target is the row nearest the pointer (vertical distance first) among those the item may go to,
 * so a pointer in a gap, over indentation or over the dragged item's own subtree still lands on the closest
 * sensible spot. The empty space under the tree only wins once the pointer is below every row.
 */
function nearestRow(excluded: Set<string>): CollisionDetection {
  return ({ droppableContainers, droppableRects, pointerCoordinates }) => {
    if (!pointerCoordinates) return [];
    const { x, y } = pointerCoordinates;
    let best: { container: (typeof droppableContainers)[number]; distance: number } | null = null;
    let root: (typeof droppableContainers)[number] | undefined;
    let lowestRowBottom = -Infinity;
    for (const container of droppableContainers) {
      const rect = droppableRects.get(container.id);
      if (!rect) continue;
      if (container.id === ROOT_ID) { root = container; continue; }
      lowestRowBottom = Math.max(lowestRowBottom, rect.bottom);
      if (excluded.has(String(container.id))) continue;
      const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
      const distance = dy * 1000 + dx;
      if (!best || distance < best.distance) best = { container, distance };
    }
    const pick = root && y > lowestRowBottom ? { container: root, distance: 0 } : best;
    return pick ? [{ id: pick.container.id, data: { droppableContainer: pick.container, value: pick.distance } }] : [];
  };
}

/** The empty space under the tree: dropping there moves an item to the top level. */
function RootDropZone({ line }: { line: boolean }) {
  const { setNodeRef } = useDroppable({ id: ROOT_ID, data: { spot: { type: 'root' } satisfies DropSpot } });
  return <div ref={setNodeRef} className="relative min-h-8 flex-1">{line && <DropLine at="top" />}</div>;
}

/** Where the pending drop line goes: on a row, at the end of a collection's block, or at the end of the top level. */
interface DropLines {
  rows: Map<string, RowIndicator>;
  /** 'same' = after the whole block at the collection's own level; 'child' = at its end, one level in. */
  blockEnd: Map<string, 'same' | 'child'>;
  rootEnd: boolean;
}

export function CollectionTree() {
  const t = useTranslation();
  const collections = useCollectionStore(s => s.collections);
  const endpoints = useEndpointStore(s => s.endpoints);
  const toggleExpanded = useCollectionStore(s => s.toggleExpanded);
  const updateCollection = useCollectionStore(s => s.update);
  const moveCollection = useCollectionStore(s => s.move);
  const place = useCollectionStore(s => s.place);
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
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  // Rows the dragged item cannot drop onto: itself and, for a collection, everything inside it.
  const excludedRows = useRef(new Set<string>());
  const collisionDetection = useMemo(() => nearestRow(excludedRows.current), []);
  const [drop, setDrop] = useState<{ plan: DropPlan; spot: DropSpot } | null>(null);

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
    const item = (event.active.data.current?.item as DragItem) ?? null;
    excludedRows.current.clear();
    if (item?.type === 'endpoint') excludedRows.current.add(endpointRowId(item.collectionId, item.id));
    if (item?.type === 'collection') {
      for (const id of subtreeIds(collections, item.id)) {
        excludedRows.current.add(collectionRowId(id));
        for (const eid of collections.find(c => c.id === id)?.endpointIds ?? []) excludedRows.current.add(endpointRowId(id, eid));
      }
    }
    setDragItem(item);
    setDrop(null);
  };

  // The zone (before / inside / after) depends on where on the row the pointer is.
  const computeDrop = (event: DragMoveEvent | DragOverEvent | DragEndEvent) => {
    const item = event.active.data.current?.item as DragItem | undefined;
    const spot = event.over?.data.current?.spot as DropSpot | undefined;
    if (!item || !spot || !event.over) return null;
    const pointerY = (event.activatorEvent as PointerEvent).clientY + event.delta.y;
    const { top, height } = event.over.rect;
    const plan = planDrop(collections, endpoints, item, spot, dropZone(item, spot, (pointerY - top) / height));
    return plan ? { plan, spot } : null;
  };

  const handleDragMove = (event: DragMoveEvent | DragOverEvent) => {
    const next = computeDrop(event);
    setDrop(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
  };

  // Recomputed from the release itself: the last move's state may not have rendered yet on a fast drop,
  // and acting on it would land one row off.
  const handleDragEnd = (event: DragEndEvent) => {
    const plan = computeDrop(event)?.plan;
    setDragItem(null);
    setDrop(null);
    if (!plan) return;
    const { item } = plan;
    place(item.type, item.id, item.type === 'endpoint' ? item.collectionId : null, plan.parentId, plan.index);
  };

  const hasVisibleContent = (c: Collection) => c.isExpanded && mixedChildren(collections, endpoints, c.id).length > 0;

  /** Lines only, drawn exactly where the item will land. */
  const lines: DropLines = { rows: new Map(), blockEnd: new Map(), rootEnd: false };
  // "After collection c" is below everything it shows, not just its header.
  const lineAfterCollection = (c: Collection) => {
    if (hasVisibleContent(c)) lines.blockEnd.set(c.id, 'same');
    else lines.rows.set(collectionRowId(c.id), 'after');
  };
  if (drop) {
    const { plan, spot } = drop;
    const spotId = spot.type === 'collection' ? collectionRowId(spot.id)
      : spot.type === 'endpoint' ? endpointRowId(spot.collectionId, spot.id) : ROOT_ID;
    if (spot.type === 'root') lines.rootEnd = true;
    else if (plan.zone === 'before') lines.rows.set(spotId, 'before');
    else if (plan.zone === 'after') {
      const c = spot.type === 'collection' ? collections.find(x => x.id === spot.id) : undefined;
      if (c) lineAfterCollection(c); else lines.rows.set(spotId, 'after');
    } else if (spot.type === 'collection') lines.rows.set(spotId, 'child'); // first child
  }

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
    const showActions = !editMode && (hoveredCollId === c.id || moveMenuId === c.id);
    return (
      <div key={c.id} className="relative">
        <TreeRow
          id={collectionRowId(c.id)}
          item={{ type: 'collection', id: c.id }}
          spot={{ type: 'collection', id: c.id, parentId: c.parentId ?? null }}
          disabled={editMode}
          indicator={lines.rows.get(collectionRowId(c.id)) ?? null}
          className={clsx(
            'flex items-center gap-1.5 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-bg-hover',
            editMode && selectedCollectionIds.includes(c.id) && 'bg-bg-hover',
          )}
          onClick={() => editMode ? toggleCollectionSelection(subtreeIds(collections, c.id), liveEndpointIds(c)) : toggleExpanded(c.id)}
          onMouseEnter={() => setHoveredCollId(c.id)}
          onMouseLeave={() => setHoveredCollId(null)}
        >
          {(handleProps) => (<>
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
                {...handleProps}
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
          </>)}
        </TreeRow>
        {c.isExpanded && (
          // Indent to the parent's chevron, with a guide line, so nesting reads at a glance.
          <div className="ml-[1.35rem] border-l border-border-secondary pl-1">
            {mixedChildren(collections, endpoints, c.id).map(child => renderChild(child, c.id))}
          </div>
        )}
        {lines.blockEnd.has(c.id) && <DropLine at="bottom" indent={lines.blockEnd.get(c.id) === 'child'} />}
      </div>
    );
  };

  const renderChild = (child: TreeChild, parentId: string | null): React.ReactNode =>
    child.type === 'collection'
      ? renderCollection(child.collection)
      : <SortableEndpointItem key={child.endpoint.id} endpoint={child.endpoint} collectionId={parentId}
          indicator={lines.rows.get(endpointRowId(parentId, child.endpoint.id)) ?? null} />;

  const draggedEndpoint = dragItem?.type === 'endpoint' ? endpoints.find(e => e.id === dragItem.id) : undefined;
  const draggedCollection = dragItem?.type === 'collection' ? collections.find(c => c.id === dragItem.id) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      // onDragMove can still carry the previous row as `over`; onDragOver fires once the new row is known.
      onDragOver={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={() => { setDragItem(null); setDrop(null); }}
    >
      {/* Top-level collections and endpoints outside any collection share one level. */}
      <div className="flex min-h-full flex-col gap-1 py-1">
        {mixedChildren(collections, endpoints, null).map(child => renderChild(child, null))}
        <RootDropZone line={lines.rootEnd} />
      </div>
      <DragOverlay>
        {draggedCollection && (
          <div className="rounded px-2 py-1.5 text-sm bg-bg-surface border border-border-secondary shadow-lg opacity-90">
            <span className="font-medium text-text-primary">{draggedCollection.name}</span>
          </div>
        )}
        {draggedEndpoint && (
          <div className="rounded px-2 py-1.5 text-sm bg-bg-surface border border-border-secondary shadow-lg opacity-90 font-mono text-text-secondary">
            {draggedEndpoint.method} {draggedEndpoint.path}
          </div>
        )}
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
