import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Archive, Download, RotateCcw, Upload } from 'lucide-react';
import type { BackupRestoreResult, GedcomImportResult } from '@shared/types';
import { gedcomImport, restoreBackup } from '../api/client';
import { useOnline } from '../hooks/useOnline';
import { useCanWrite, useReadonly } from '../hooks/useAccess';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/Dialog';
import { STR } from '../lib/strings';

/** Ime ZIP fajla za preuzimanje — usklađeno sa serverskim formatom. */
function backupFileName(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `porodicno-stablo-backup-${d.getFullYear()}-${mm}-${dd}.zip`;
}

/** Potpuna rezervna kopija (ZIP: baza + slike) — samo admin (pun pristup). */
function FullBackupSection() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<BackupRestoreResult | null>(null);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/backup/export', { credentials: 'include' });
      if (!res.ok) throw new Error(STR.backup.exportFailed);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : STR.backup.exportFailed);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error(STR.backup.fileLabel);
      return restoreBackup(file);
    },
    onSuccess: async (res) => {
      setResult(res);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tree'] }),
        queryClient.invalidateQueries({ queryKey: ['person'] }),
      ]);
      toast.success(STR.backup.restored);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : STR.backup.restoreFailed);
    },
  });

  const busy = restoreMutation.isPending;

  return (
    <Card>
      <CardHeader title={STR.backup.title} />
      <div className="space-y-4 p-4">
        <p className="text-sm text-stone-600 dark:text-stone-300">{STR.backup.intro}</p>

        <Button
          onClick={() => exportMutation.mutate()}
          disabled={!online || exportMutation.isPending}
          title={!online ? STR.common.offlineDisabled : undefined}
        >
          <Archive size={16} aria-hidden="true" />
          {STR.backup.exportButton}
        </Button>

        <div className="border-t border-stone-200 pt-4 dark:border-stone-700">
          <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">{STR.backup.restoreTitle}</h3>
          <p className="mt-1 mb-3 flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
            <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
            {STR.backup.restoreHint}
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
              {STR.backup.fileLabel}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              disabled={!online || busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
              className="block w-full cursor-pointer text-sm text-stone-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-amber-700 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-amber-800 disabled:opacity-50 dark:text-stone-300 dark:file:bg-amber-600 dark:hover:file:bg-amber-500"
            />
          </label>
          <Button
            variant="danger"
            className="mt-3"
            onClick={() => setConfirmOpen(true)}
            disabled={file === null || !online || busy}
            title={!online ? STR.common.offlineDisabled : undefined}
          >
            <RotateCcw size={16} aria-hidden="true" />
            {STR.backup.restoreButton}
          </Button>
        </div>

        {result && (
          <div className="grid grid-cols-3 gap-2 border-t border-stone-200 pt-4 dark:border-stone-700">
            <ResultNumber label={STR.backup.personsRestored} value={result.persons} />
            <ResultNumber label={STR.backup.unionsRestored} value={result.unions} />
            <ResultNumber label={STR.backup.photosRestored} value={result.photos} />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={STR.backup.confirmTitle}
        text={STR.backup.confirmText}
        confirmLabel={STR.backup.confirmLabel}
        busy={busy}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          restoreMutation.mutate();
        }}
      />
    </Card>
  );
}

type ImportMode = 'replace' | 'merge';

function ResultNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-stone-100 px-3 py-2 text-center dark:bg-stone-800">
      <p className="text-xl font-bold text-amber-800 dark:text-amber-400">{value}</p>
      <p className="text-xs text-stone-500 dark:text-stone-400">{label}</p>
    </div>
  );
}

function ImportResultView({ result }: { result: GedcomImportResult }) {
  return (
    <Card>
      <CardHeader title={result.dry_run ? STR.gedcom.resultDryRunTitle : STR.gedcom.resultTitle} />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          <ResultNumber label={STR.gedcom.personsCreated} value={result.persons_created} />
          <ResultNumber label={STR.gedcom.unionsCreated} value={result.unions_created} />
          <ResultNumber label={STR.gedcom.matched} value={result.matched} />
        </div>

        {result.warnings.length === 0 ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">{STR.gedcom.noWarnings}</p>
        ) : (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
              {STR.gedcom.warningsTitle}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400">
                    <th className="py-1.5 pr-3 font-medium">{STR.gedcom.warningTag}</th>
                    <th className="py-1.5 pr-3 font-medium">{STR.gedcom.warningCount}</th>
                    <th className="py-1.5 font-medium">{STR.gedcom.warningSample}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.warnings.map((w) => (
                    <tr key={w.tag} className="border-b border-stone-100 dark:border-stone-800">
                      <td className="py-1.5 pr-3 font-mono text-xs">{w.tag}</td>
                      <td className="py-1.5 pr-3">{w.count}</td>
                      <td className="max-w-xs truncate py-1.5 text-stone-500 dark:text-stone-400">
                        {w.sample ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function GedcomPage() {
  const online = useOnline();
  const readonly = useReadonly();
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [result, setResult] = useState<GedcomImportResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/gedcom/export', { credentials: 'include' });
      if (!res.ok) throw new Error(STR.gedcom.exportFailed);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'porodicno-stablo.ged';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : STR.gedcom.exportFailed);
    },
  });

  const importMutation = useMutation({
    mutationFn: ({ dryRun }: { dryRun: boolean }) => {
      if (!file) throw new Error(STR.gedcom.fileLabel);
      return gedcomImport(file, mode, dryRun);
    },
    onSuccess: async (res) => {
      setResult(res);
      if (res.dry_run) {
        toast.success(STR.gedcom.dryRunDone);
      } else {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['tree'] }),
          queryClient.invalidateQueries({ queryKey: ['person'] }),
        ]);
        toast.success(STR.gedcom.imported);
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : STR.errors.generic);
    },
  });

  const busy = importMutation.isPending;
  const canSubmit = file !== null && online && !busy;

  const runImport = () => {
    if (mode === 'replace') setConfirmOpen(true);
    else importMutation.mutate({ dryRun: false });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
        {/* Izvoz */}
        <Card>
          <CardHeader title={STR.gedcom.exportTitle} />
          <div className="space-y-3 p-4">
            <p className="text-sm text-stone-600 dark:text-stone-300">{STR.gedcom.exportText}</p>
            <Button
              onClick={() => exportMutation.mutate()}
              disabled={!online || exportMutation.isPending}
              title={!online ? STR.common.offlineDisabled : undefined}
            >
              <Download size={16} aria-hidden="true" />
              {STR.gedcom.exportButton}
            </Button>
          </div>
        </Card>

        {/* Uvoz — sakriven u režimu samo za pregled */}
        {!readonly && (
        <Card>
          <CardHeader title={STR.gedcom.importTitle} />
          <div className="space-y-4 p-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
                {STR.gedcom.fileLabel}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ged"
                disabled={!online || busy}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setResult(null);
                }}
                className="block w-full cursor-pointer text-sm text-stone-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-amber-700 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-amber-800 disabled:opacity-50 dark:text-stone-300 dark:file:bg-amber-600 dark:hover:file:bg-amber-500"
              />
            </label>

            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
                {STR.gedcom.modeLabel}
              </legend>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="gedcom-mode"
                    value="merge"
                    checked={mode === 'merge'}
                    disabled={busy}
                    onChange={() => {
                      setMode('merge');
                      setResult(null);
                    }}
                    className="mt-0.5 accent-amber-700"
                  />
                  <span>
                    <span className="font-medium">{STR.gedcom.modeMerge}</span>
                    <span className="block text-xs text-stone-500 dark:text-stone-400">
                      {STR.gedcom.modeMergeHint}
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="gedcom-mode"
                    value="replace"
                    checked={mode === 'replace'}
                    disabled={busy}
                    onChange={() => {
                      setMode('replace');
                      setResult(null);
                    }}
                    className="mt-0.5 accent-amber-700"
                  />
                  <span>
                    <span className="font-medium">{STR.gedcom.modeReplace}</span>
                    <span className="flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
                      <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
                      {STR.gedcom.modeReplaceWarning}
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => importMutation.mutate({ dryRun: true })}
                disabled={!canSubmit}
                title={!online ? STR.common.offlineDisabled : undefined}
              >
                {STR.gedcom.dryRunButton}
              </Button>
              <Button
                onClick={runImport}
                disabled={!canSubmit}
                title={!online ? STR.common.offlineDisabled : undefined}
              >
                <Upload size={16} aria-hidden="true" />
                {STR.gedcom.importButton}
              </Button>
            </div>
          </div>
        </Card>
        )}

        {result && <ImportResultView result={result} />}

        {/* Potpuna rezervna kopija — samo admin (pun pristup) */}
        {canWrite && <FullBackupSection />}

        {!readonly && (
          <ConfirmDialog
            open={confirmOpen}
            title={STR.gedcom.confirmReplaceTitle}
            text={STR.gedcom.confirmReplaceText}
            confirmLabel={STR.gedcom.confirmReplaceLabel}
            busy={busy}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => {
              setConfirmOpen(false);
              importMutation.mutate({ dryRun: false });
            }}
          />
        )}
      </div>
    </div>
  );
}
