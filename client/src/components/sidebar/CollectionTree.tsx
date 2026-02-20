import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Pencil, X } from 'lucide-react';
import { useCollectionStore } from '../../stores/collection.store';
import { useEndpointStore } from '../../stores/endpoint.store';
import { useUIStore } from '../../stores/ui.store';
import { EndpointItem } from './EndpointItem';

export function CollectionTree() {
  const collections = useCollectionStore(s => s.collections);
  const endpoints = useEndpointStore(s => s.endpoints);
  const toggleExpanded = useCollectionStore(s => s.toggleExpanded);
  const removeCollection = useCollectionStore(s => s.remove);
  const updateCollection = useCollectionStore(s => s.update);
  const setShowNewEndpoint = useUIStore(s => s.setShowNewEndpoint);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [hoveredCollId, setHoveredCollId] = useState<string | null>(null);

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const commitRename = (id: string) => {
    if (editName.trim()) updateCollection(id, { name: editName.trim() });
    setEditingId(null);
  };

  // Find uncollected endpoints
  const collectedIds = new Set(collections.flatMap(c => c.endpointIds ?? []));
  const uncollected = endpoints.filter(e => !collectedIds.has(e.id));

  return (
    <div className="flex flex-col gap-1 py-1">
      {collections.map(c => (
        <div key={c.id}>
          <div
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-bg-hover"
            onClick={() => toggleExpanded(c.id)}
            onMouseEnter={() => setHoveredCollId(c.id)}
            onMouseLeave={() => setHoveredCollId(null)}
          >
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
                  title="Add Endpoint"
                >
                  <Plus size={14} strokeWidth={2.5} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); startRename(c.id, c.name); }}
                  className="text-text-muted hover:text-text-secondary flex items-center"
                  title="Rename"
                >
                  <Pencil size={13} strokeWidth={2.5} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); removeCollection(c.id); }}
                  className="text-text-muted hover:text-method-delete flex items-center"
                  title="Delete"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            )}
          </div>
          {c.isExpanded && (
            <div className="ml-3">
              {(c.endpointIds ?? []).map(eid => {
                const ep = endpoints.find(e => e.id === eid);
                if (!ep) return null;
                return <EndpointItem key={ep.id} endpoint={ep} />;
              })}
            </div>
          )}
        </div>
      ))}
      {uncollected.length > 0 && (
        <div>
          {collections.length > 0 && (
            <div className="px-2 py-1 text-xs text-text-muted uppercase tracking-wider">Uncollected</div>
          )}
          {uncollected.map(ep => (
            <EndpointItem key={ep.id} endpoint={ep} />
          ))}
        </div>
      )}
    </div>
  );
}
