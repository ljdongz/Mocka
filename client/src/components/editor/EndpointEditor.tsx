import { useState, useEffect, useRef } from 'react';
import { useEndpointStore } from '../../stores/endpoint.store';
import { useUIStore } from '../../stores/ui.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useTranslation } from '../../i18n';
import { HttpMethodBadge } from '../shared/HttpMethodBadge';
import { ParamsTab } from './tabs/ParamsTab';
import { HeadersTab } from './tabs/HeadersTab';
import { BodyTab } from './tabs/BodyTab';
import { ResponseTab } from './tabs/ResponseTab';
import clsx from 'clsx';
import type { HttpMethod } from '../../types';
import { buildFullUrl, parseUrlWithParams } from '../../utils/url';
import { createQueryParam } from '../../utils/entity-factory';
import { hasPathParams } from '../../utils/path-params';

const TABS = ['params', 'headers', 'body', 'response'] as const;
type Tab = (typeof TABS)[number];

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

export function EndpointEditor() {
  const t = useTranslation();
  const endpoints = useEndpointStore(s => s.endpoints);
  const selectedId = useEndpointStore(s => s.selectedId);
  const updateEndpoint = useEndpointStore(s => s.updateEndpoint);
  const detailTab = useUIStore(s => s.detailTab);
  const setDetailTab = useUIStore(s => s.setDetailTab);
  const serverStatus = useSettingsStore(s => s.serverStatus);

  const [editingPath, setEditingPath] = useState(false);
  const [pathValue, setPathValue] = useState('');
  const [nameValue, setNameValue] = useState('');
  const [showMethodDropdown, setShowMethodDropdown] = useState(false);
  const [error, setError] = useState('');
  const methodDropdownRef = useRef<HTMLDivElement>(null);

  const endpoint = endpoints.find(e => e.id === selectedId);

  const tabLabels: Record<Tab, string> = {
    params: t.editor.params,
    headers: t.editor.headers,
    body: t.editor.body,
    response: t.editor.response,
  };

  useEffect(() => {
    setNameValue(endpoint?.name ?? '');
  }, [endpoint?.id, endpoint?.name]);

  useEffect(() => {
    if (!showMethodDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (methodDropdownRef.current && !methodDropdownRef.current.contains(e.target as Node)) {
        setShowMethodDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMethodDropdown]);

  useEffect(() => {
    setEditingPath(false);
    setShowMethodDropdown(false);
    setError('');
  }, [selectedId]);

  const renderHighlightedPath = (fullUrl: string) => {
    // Split path from query string
    const [pathPart, ...queryParts] = fullUrl.split('?');
    const query = queryParts.length > 0 ? `?${queryParts.join('?')}` : '';
    const segments = pathPart.split('/');

    return (
      <>
        {segments.map((seg, i) => {
          const isParam = /^:[a-zA-Z_]\w*$/.test(seg) || /^\{[a-zA-Z_]\w*\}$/.test(seg);
          return (
            <span key={i}>
              {i > 0 && '/'}
              {isParam
                ? <span className="rounded bg-accent-primary/15 px-0.5 text-accent-primary">{seg}</span>
                : seg}
            </span>
          );
        })}
        {query && <span className="text-text-muted">{query}</span>}
      </>
    );
  };

  if (!endpoint) {
    return (
      <div className="flex flex-1 items-center justify-center text-text-muted text-sm">
        {t.editor.selectEndpoint}
      </div>
    );
  }

  const startEditPath = () => {
    setPathValue(buildFullUrl(endpoint.path, endpoint.queryParams));
    setEditingPath(true);
    setError('');
  };

  const savePath = async () => {
    const trimmed = pathValue.trim();
    if (!trimmed) {
      setError(t.validation.pathRequired);
      return;
    }
    const { path: parsedPath, params } = parseUrlWithParams(trimmed);
    if (!parsedPath) {
      setError(t.validation.pathRequired);
      return;
    }
    const updates: any = {};
    if (parsedPath !== endpoint.path) {
      updates.path = parsedPath;
    }
    if (params.length > 0) {
      const existing = endpoint.queryParams ?? [];
      const merged = [...existing];
      for (const p of params) {
        if (!merged.some(e => e.key === p.key)) {
          merged.push(createQueryParam(endpoint.id, {
            key: p.key,
            value: p.value,
            sortOrder: merged.length,
          }));
        }
      }
      updates.queryParams = merged;
    }
    if (Object.keys(updates).length > 0) {
      try {
        await updateEndpoint(endpoint.id, updates);
        setError('');
      } catch (e: any) {
        setError(e.message || t.validation.pathRequired);
        return;
      }
    }
    setEditingPath(false);
  };

  const handleMethodChange = async (method: HttpMethod) => {
    setShowMethodDropdown(false);
    if (method !== endpoint.method) {
      try {
        await updateEndpoint(endpoint.id, { method });
      } catch (e: any) {
        setError(e.message);
      }
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border-primary px-6 py-3">
        <div ref={methodDropdownRef} className="relative">
          <div
            onClick={() => setShowMethodDropdown(!showMethodDropdown)}
            className="cursor-pointer"
            title={t.editor.clickToChangeMethod}
          >
            <HttpMethodBadge method={endpoint.method} />
          </div>
          {showMethodDropdown && (
            <div className="absolute left-0 top-full mt-1 z-50 rounded border border-border-secondary bg-bg-surface py-1 shadow-lg">
              {METHODS.map(m => (
                <div
                  key={m}
                  onClick={() => handleMethodChange(m)}
                  className={clsx(
                    'px-4 py-1.5 text-xs font-mono font-bold cursor-pointer hover:bg-bg-hover whitespace-nowrap',
                    m === endpoint.method ? 'text-accent-primary' : 'text-text-secondary',
                  )}
                >
                  {m}
                </div>
              ))}
            </div>
          )}
        </div>

        {editingPath ? (
          <input
            value={pathValue}
            onChange={e => { setPathValue(e.target.value); setError(''); }}
            onBlur={savePath}
            onKeyDown={e => {
              if (e.key === 'Enter') savePath();
              if (e.key === 'Escape') { setEditingPath(false); setError(''); }
            }}
            className="flex-1 rounded border border-border-secondary bg-bg-input px-2 py-1 font-mono text-base text-text-primary outline-none focus:border-accent-primary"
            autoFocus
          />
        ) : (
          <span
            onClick={startEditPath}
            className="font-mono text-base text-text-primary cursor-pointer hover:text-accent-primary transition-colors"
            title={t.editor.clickToEditPath}
          >
            {hasPathParams(endpoint.path)
              ? renderHighlightedPath(buildFullUrl(endpoint.path, endpoint.queryParams))
              : buildFullUrl(endpoint.path, endpoint.queryParams)}
          </span>
        )}
        {error && <span className="text-xs text-method-delete">{error}</span>}
      </div>
      <div className="flex items-center gap-3 px-6 py-1.5 border-b border-border-primary">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">{t.editor.alias}</span>
          <input
            type="text"
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={() => { if (nameValue !== endpoint.name) updateEndpoint(endpoint.id, { name: nameValue }); }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            placeholder={t.editor.enterAlias}
            className="w-40 rounded border border-border-secondary bg-bg-input px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary placeholder:text-text-muted/50"
          />
        </div>
        <span className="text-xs text-text-muted font-mono truncate">
          {`http://${serverStatus.localIp}:${serverStatus.port}${buildFullUrl(endpoint.path, endpoint.queryParams)}`}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border-primary px-6">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setDetailTab(tab)}
            className={clsx(
              'px-4 py-2.5 text-base transition-colors',
              detailTab === tab
                ? 'border-b-2 border-accent-primary text-text-primary font-medium'
                : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {detailTab === 'params' && <ParamsTab endpoint={endpoint} />}
        {detailTab === 'headers' && <HeadersTab endpoint={endpoint} />}
        {detailTab === 'body' && <BodyTab endpoint={endpoint} />}
        {detailTab === 'response' && <ResponseTab endpoint={endpoint} />}
      </div>
    </div>
  );
}
