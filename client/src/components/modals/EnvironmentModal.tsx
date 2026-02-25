import { useState, useEffect } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { useEnvironmentStore } from '../../stores/environment.store';
import { useUIStore } from '../../stores/ui.store';
import { ModalOverlay } from '../shared/ModalOverlay';
import type { Environment } from '../../types';
import clsx from 'clsx';

export function EnvironmentModal() {
  const open = useUIStore(s => s.showEnvironments);
  const close = () => useUIStore.getState().setShowEnvironments(false);
  const { environments, fetch, create, update, setActive, remove } = useEnvironmentStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (open) fetch();
  }, [open, fetch]);

  useEffect(() => {
    if (environments.length > 0 && !selectedId) {
      setSelectedId(environments[0].id);
    }
  }, [environments, selectedId]);

  const selected = environments.find(e => e.id === selectedId);

  const handleCreate = async () => {
    const name = newName.trim() || 'New Environment';
    await create(name);
    setNewName('');
    const all = useEnvironmentStore.getState().environments;
    setSelectedId(all[all.length - 1]?.id ?? null);
  };

  const handleDelete = async (id: string) => {
    await remove(id);
    if (selectedId === id) {
      const all = useEnvironmentStore.getState().environments;
      setSelectedId(all[0]?.id ?? null);
    }
  };

  return (
    <ModalOverlay open={open} onClose={close}>
      <div className="w-[640px] max-h-[80vh] rounded-lg border border-border-secondary bg-bg-surface flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-secondary">
          <h2 className="text-base font-semibold text-text-primary">Environments</h2>
          <button onClick={close} className="text-text-muted hover:text-text-secondary text-lg">&times;</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: Environment list */}
          <div className="w-48 border-r border-border-secondary flex flex-col">
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {environments.map(env => (
                <div
                  key={env.id}
                  onClick={() => setSelectedId(env.id)}
                  className={clsx(
                    'flex items-center gap-2 rounded px-2.5 py-2 cursor-pointer text-sm',
                    selectedId === env.id ? 'bg-bg-hover text-text-primary' : 'text-text-secondary hover:bg-bg-hover',
                  )}
                >
                  <span className={clsx(
                    'h-2 w-2 rounded-full flex-shrink-0',
                    env.isActive ? 'bg-server-running' : 'bg-border-secondary',
                  )} />
                  <span className="flex-1 truncate">{env.name}</span>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-border-secondary">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="Name..."
                  className="flex-1 min-w-0 rounded border border-border-secondary bg-bg-input px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary"
                />
                <button onClick={handleCreate} className="text-accent-primary hover:text-accent-primary/80">
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Right: Selected environment editor */}
          <div className="flex-1 p-4 overflow-y-auto">
            {selected ? (
              <EnvironmentEditor
                key={selected.id}
                env={selected}
                onUpdate={update}
                onSetActive={setActive}
                onDelete={handleDelete}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-text-muted">
                Create an environment to get started.
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

function EnvironmentEditor({
  env,
  onUpdate,
  onSetActive,
  onDelete,
}: {
  env: Environment;
  onUpdate: (id: string, data: Partial<Environment>) => Promise<void>;
  onSetActive: (id: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(env.name);
  const [vars, setVars] = useState<{ key: string; value: string }[]>(() => {
    return Object.entries(env.variables).map(([key, value]) => ({ key, value }));
  });

  const saveVars = (nextVars: { key: string; value: string }[]) => {
    setVars(nextVars);
    const variables: Record<string, string> = {};
    for (const v of nextVars) {
      if (v.key.trim()) variables[v.key.trim()] = v.value;
    }
    onUpdate(env.id, { variables });
  };

  const addVar = () => {
    setVars([...vars, { key: '', value: '' }]);
  };

  const updateVar = (idx: number, field: 'key' | 'value', val: string) => {
    const next = [...vars];
    next[idx] = { ...next[idx], [field]: val };
    setVars(next);
  };

  const commitVars = () => {
    saveVars(vars);
  };

  const removeVar = (idx: number) => {
    saveVars(vars.filter((_, i) => i !== idx));
  };

  return (
    <div>
      {/* Name + actions */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { if (name !== env.name) onUpdate(env.id, { name }); }}
          className="flex-1 rounded border border-border-secondary bg-bg-input px-2.5 py-1.5 text-sm text-text-primary font-medium outline-none focus:border-accent-primary"
        />
        <button
          onClick={() => onSetActive(env.isActive ? null : env.id)}
          className={clsx(
            'flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium',
            env.isActive
              ? 'bg-server-running/15 text-server-running'
              : 'bg-bg-hover text-text-tertiary hover:text-text-secondary',
          )}
        >
          {env.isActive && <Check size={12} />}
          {env.isActive ? 'Active' : 'Set Active'}
        </button>
        <button
          onClick={() => onDelete(env.id)}
          className="text-text-muted hover:text-method-delete p-1.5"
          title="Delete environment"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Variables table */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-tertiary uppercase tracking-wider">Variables</span>
        <button onClick={addVar} className="text-xs text-accent-primary hover:underline flex items-center gap-0.5">
          <Plus size={12} /> Add Variable
        </button>
      </div>

      <div className="rounded border border-border-secondary overflow-hidden">
        {/* Header */}
        <div className="flex bg-bg-hover text-xs text-text-muted uppercase tracking-wider">
          <div className="flex-1 px-3 py-1.5 border-r border-border-secondary">Key</div>
          <div className="flex-1 px-3 py-1.5">Value</div>
          <div className="w-8" />
        </div>

        {vars.length === 0 ? (
          <div className="px-3 py-4 text-xs text-text-muted text-center">
            No variables defined. Use <code className="bg-bg-hover px-1 rounded">{'{{key}}'}</code> in response bodies to reference them.
          </div>
        ) : (
          vars.map((v, idx) => (
            <div key={idx} className="flex border-t border-border-secondary">
              <input
                type="text"
                value={v.key}
                onChange={e => updateVar(idx, 'key', e.target.value)}
                onBlur={commitVars}
                placeholder="variableName"
                className="flex-1 px-3 py-1.5 text-xs text-text-primary bg-transparent outline-none border-r border-border-secondary font-mono"
              />
              <input
                type="text"
                value={v.value}
                onChange={e => updateVar(idx, 'value', e.target.value)}
                onBlur={commitVars}
                placeholder="value"
                className="flex-1 px-3 py-1.5 text-xs text-text-primary bg-transparent outline-none font-mono"
              />
              <button
                onClick={() => removeVar(idx)}
                className="w-8 flex items-center justify-center text-text-muted hover:text-method-delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      <p className="mt-3 text-xs text-text-muted">
        Use <code className="bg-bg-hover px-1 rounded">{'{{variableName}}'}</code> in response bodies and headers.
        Environment variables are resolved before template helpers and dynamic variables.
      </p>
    </div>
  );
}
