import { useState, useRef } from 'react';
import { useUIStore } from '../../stores/ui.store';
import { useCollectionStore } from '../../stores/collection.store';
import { useEndpointStore } from '../../stores/endpoint.store';
import { importExportApi, type ConflictPolicy, type ExportData } from '../../api/import-export';
import { ModalOverlay } from '../shared/ModalOverlay';
import { useTranslation, fmt } from '../../i18n';
import { Download, Upload } from 'lucide-react';

type Tab = 'export' | 'import';

export function ImportExportModal() {
  const t = useTranslation();
  const open = useUIStore(s => s.showImportExport);
  const close = () => useUIStore.getState().setShowImportExport(false);
  const collections = useCollectionStore(s => s.collections);
  const fetchEndpoints = useEndpointStore(s => s.fetch);
  const fetchCollections = useCollectionStore(s => s.fetch);

  const [tab, setTab] = useState<Tab>('export');
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [exportAll, setExportAll] = useState(true);

  // Import state
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>('skip');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [isResultError, setIsResultError] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setLoading(true);
    try {
      const data = exportAll
        ? await importExportApi.exportAll()
        : await importExportApi.exportCollections(selectedCollections);

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mocka-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setImportResult(`${t.importExport.exportFailed} ${e.message}`);
      setIsResultError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setLoading(true);
    setImportResult(null);
    try {
      const text = await importFile.text();
      const data: ExportData = JSON.parse(text);

      if (data.version !== 1 || !Array.isArray(data.endpoints)) {
        setImportResult(t.importExport.invalidFormat);
        setIsResultError(true);
        return;
      }

      const result = await importExportApi.importData(data, conflictPolicy);

      const parts: string[] = [];
      if (result.created > 0) parts.push(fmt(t.importExport.countCreated, result.created));
      if (result.skipped > 0) parts.push(fmt(t.importExport.countSkipped, result.skipped));
      if (result.overwritten > 0) parts.push(fmt(t.importExport.countOverwritten, result.overwritten));
      if (result.merged > 0) parts.push(fmt(t.importExport.countMerged, result.merged));
      if (result.collectionsCreated > 0) parts.push(fmt(t.importExport.countCollectionsCreated, result.collectionsCreated));
      if (result.collectionsSkipped > 0) parts.push(fmt(t.importExport.countCollectionsSkipped, result.collectionsSkipped));
      let msg = `${t.importExport.importComplete} ${parts.join(', ')}`;
      setIsResultError(false);

      if (result.errors.length > 0) {
        msg += `\n${t.importExport.errors} ${result.errors.join(', ')}`;
        setIsResultError(true);
      }
      setImportResult(msg);

      // Refresh data
      await Promise.all([fetchEndpoints(), fetchCollections()]);
    } catch (e: any) {
      setImportResult(`${t.importExport.importFailed} ${e.message}`);
      setIsResultError(true);
    } finally {
      setLoading(false);
    }
  };

  const toggleCollection = (id: string) => {
    setSelectedCollections(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  return (
    <ModalOverlay open={open} onClose={close}>
      <div className="w-[480px] rounded-lg border border-border-secondary bg-bg-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">{t.importExport.title}</h2>
          <button onClick={close} className="text-text-muted hover:text-text-secondary text-lg">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-primary mb-4">
          <button
            onClick={() => { setTab('export'); setImportResult(null); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm ${tab === 'export' ? 'border-b-2 border-accent-primary text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            <Download size={14} /> {t.importExport.export}
          </button>
          <button
            onClick={() => { setTab('import'); setImportResult(null); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm ${tab === 'import' ? 'border-b-2 border-accent-primary text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            <Upload size={14} /> {t.importExport.import}
          </button>
        </div>

        {tab === 'export' && (
          <div>
            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input
                  type="radio"
                  checked={exportAll}
                  onChange={() => setExportAll(true)}
                  className="accent-accent-primary"
                />
                {t.importExport.exportAll}
              </label>
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer mt-2">
                <input
                  type="radio"
                  checked={!exportAll}
                  onChange={() => setExportAll(false)}
                  className="accent-accent-primary"
                />
                {t.importExport.exportSelected}
              </label>
            </div>

            {!exportAll && (
              <div className="mb-4 max-h-[200px] overflow-y-auto border border-border-secondary rounded p-2 space-y-1">
                {collections.length === 0 && (
                  <p className="text-xs text-text-muted p-2">{t.importExport.noCollections}</p>
                )}
                {collections.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer px-2 py-1 rounded hover:bg-bg-hover">
                    <input
                      type="checkbox"
                      checked={selectedCollections.includes(c.id)}
                      onChange={() => toggleCollection(c.id)}
                      className="accent-accent-primary"
                    />
                    {c.name}
                    <span className="text-text-muted text-xs ml-auto">{fmt(t.importExport.countEndpoints, c.endpointIds.length)}</span>
                  </label>
                ))}
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={loading || (!exportAll && selectedCollections.length === 0)}
              className="w-full rounded bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t.importExport.exporting : t.importExport.downloadJson}
            </button>
          </div>
        )}

        {tab === 'import' && (
          <div>
            <div className="mb-4">
              <label className="block text-sm text-text-tertiary mb-1.5">{t.importExport.selectJsonFile}</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={e => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); }}
                className="w-full text-sm text-text-secondary file:mr-3 file:rounded file:border-0 file:bg-bg-hover file:px-3 file:py-1.5 file:text-sm file:text-text-primary file:cursor-pointer"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm text-text-tertiary mb-1.5">{t.importExport.duplicateHandling}</label>
              <div className="space-y-1.5">
                {([
                  ['skip', t.importExport.skip, t.importExport.skipDesc],
                  ['overwrite', t.importExport.overwrite, t.importExport.overwriteDesc],
                  ['merge', t.importExport.merge, t.importExport.mergeDesc],
                ] as const).map(([value, label, desc]) => (
                  <label key={value} className="flex items-start gap-2 text-sm text-text-secondary cursor-pointer">
                    <input
                      type="radio"
                      name="conflictPolicy"
                      value={value}
                      checked={conflictPolicy === value}
                      onChange={() => setConflictPolicy(value)}
                      className="accent-accent-primary mt-0.5"
                    />
                    <div>
                      <span className="font-medium">{label}</span>
                      <span className="text-text-muted text-xs ml-1.5">{desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleImport}
              disabled={loading || !importFile}
              className="w-full rounded bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t.importExport.importing : t.importExport.import}
            </button>
          </div>
        )}

        {importResult && (
          <div className={`mt-4 rounded border p-3 text-sm whitespace-pre-wrap ${isResultError ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-green-500/30 bg-green-500/10 text-green-400'}`}>
            {importResult}
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}
