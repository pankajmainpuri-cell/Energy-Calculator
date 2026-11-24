import React, { useEffect, useState } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  LogOut,
  FolderOpen,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { User } from 'firebase/auth';
import {
  googleSignIn,
  logoutGoogle,
  getAccessToken,
  initAuth,
} from '../lib/firebaseAuth';
import { AppMetaInfo, GoogleDriveSpreadsheet, GoogleSheetTab } from '../types/energy';

interface DataSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'excel' | 'google';
  defaultTarget?: 'dcem' | 'eb';
  meta: AppMetaInfo | null;
  onSyncComplete: () => void;
}

function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(trimmed);
  if (match) return match[1];
  return trimmed;
}

export const DataSyncModal: React.FC<DataSyncModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'excel',
  defaultTarget = 'dcem',
  meta,
  onSyncComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'excel' | 'google'>(initialTab);
  const [uploadTarget, setUploadTarget] = useState<'dcem' | 'eb'>(defaultTarget);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Parsed workbook preview for Excel upload
  const [parsedSheets, setParsedSheets] = useState<
    Array<{
      sheetName: string;
      headers: string[];
      rows: Record<string, unknown>[];
      suggestedTarget: 'dcem' | 'eb';
    }>
  >([]);
  const [selectedFileName, setSelectedFileName] = useState('');

  // Google Workspace state
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => getAccessToken());
  const [spreadsheets, setSpreadsheets] = useState<GoogleDriveSpreadsheet[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState('');
  const [manualSheetUrl, setManualSheetUrl] = useState('');
  const [sheetTitle, setSheetTitle] = useState('');
  const [tabs, setTabs] = useState<GoogleSheetTab[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setUploadTarget(defaultTarget);
  }, [defaultTarget]);

  useEffect(() => {
    const unsub = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
      },
      (user) => {
        setGoogleUser(user);
        setAccessToken(null);
      }
    );
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const handleDownloadDcemTemplate = () => {
    const headers = [
      'Indus ID',
      'SMPS Instance',
      'Operator Name',
      'Site Name',
      'Current date',
      'Days',
      'Voltage',
      'Amp',
      'Current Reading',
    ];
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ['IN-1074020', 'SMPS-1', 'Airtel', 'Jodhpur', '2026-11-24', 30, 54, 42.5, 1652.4],
      ['IN-1074020', 'SMPS-1', 'Jio', 'Jodhpur', '2026-11-24', 30, 54, 38.0, 1477.4],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DCEM Reading');
    XLSX.writeFile(wb, 'DCEM_Reading_Format.xlsx');
  };

  const handleFileSelected = async (file: File) => {
    setStatusMessage(null);
    setSelectedFileName(file.name);
    setBusy(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', raw: false });
      const extracted: typeof parsedSheets = [];

      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
        if (matrix.length < 2) continue;

        const rawHeaders = (matrix[0] as unknown[]).map((h) =>
          String(h ?? '').replace(/\s+/g, ' ').trim()
        );
        const uniqueHeaders: string[] = [];
        const seen = new Map<string, number>();
        for (const h of rawHeaders) {
          const clean = h || 'Column';
          if (clean === '__proto__' || clean === 'constructor' || clean === 'prototype') {
            uniqueHeaders.push(`Col_${uniqueHeaders.length + 1}`);
            continue;
          }
          const count = seen.get(clean) || 0;
          seen.set(clean, count + 1);
          uniqueHeaders.push(count === 0 ? clean : `${clean}_${count + 1}`);
        }

        const rowObjects: Record<string, unknown>[] = [];
        for (let i = 1; i < matrix.length; i++) {
          const arr = matrix[i] as unknown[];
          if (!arr || arr.every((c) => String(c ?? '').trim() === '')) continue;
          const obj: Record<string, unknown> = {};
          uniqueHeaders.forEach((h, idx) => {
            obj[h] = arr[idx] ?? '';
          });
          rowObjects.push(obj);
        }

        const lowerName = sheetName.toLowerCase();
        const headerJoined = uniqueHeaders.join(' ').toLowerCase();
        const isDcem =
          lowerName.includes('dcem') ||
          headerJoined.includes('smps') ||
          headerJoined.includes('operator');
        const isEb =
          lowerName.includes('eb') ||
          headerJoined.includes('पिछली') ||
          headerJoined.includes('technician');

        extracted.push({
          sheetName,
          headers: uniqueHeaders,
          rows: rowObjects,
          suggestedTarget: isDcem ? 'dcem' : isEb ? 'eb' : uploadTarget,
        });
      }

      if (extracted.length === 0) {
        setStatusMessage({
          type: 'error',
          text: 'No usable header + data rows were found in this file.',
        });
      } else {
        setParsedSheets(extracted);
      }
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Could not read this file. Please upload a valid .xlsx, .xls, or .csv file.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleImportSheetToDb = async (
    sheet: (typeof parsedSheets)[number],
    target: 'dcem' | 'eb'
  ) => {
    setBusy(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/upload/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          sheetName: `${selectedFileName} (${sheet.sheetName})`,
          headers: sheet.headers,
          rows: sheet.rows,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; count?: number; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }
      setStatusMessage({
        type: 'success',
        text: `Synced ${data.count} rows into ${target === 'dcem' ? 'DCEM Reading' : 'EB Reading'} database.`,
      });
      onSyncComplete();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to import sheet',
      });
    } finally {
      setBusy(false);
    }
  };

  const loadDriveSpreadsheets = async (token: string) => {
    setLoadingFiles(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/google/spreadsheets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { files?: GoogleDriveSpreadsheet[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not load Drive spreadsheets');
      setSpreadsheets(data.files || []);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to list Google Drive spreadsheets',
      });
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleGoogleLogin = async () => {
    setBusy(true);
    setStatusMessage(null);
    try {
      const { user, accessToken: token } = await googleSignIn();
      setGoogleUser(user);
      setAccessToken(token);
      await loadDriveSpreadsheets(token);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Google Sign-In was cancelled or failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setAccessToken(null);
    setSpreadsheets([]);
    setTabs([]);
    setSelectedSpreadsheetId('');
  };

  const handleInspectSpreadsheet = async (rawIdOrUrl: string) => {
    if (!accessToken) return;
    const id = extractSpreadsheetId(rawIdOrUrl);
    if (!id) return;

    setSelectedSpreadsheetId(id);
    setLoadingTabs(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/google/spreadsheets/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await res.json()) as {
        title?: string;
        tabs?: GoogleSheetTab[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Could not read spreadsheet tabs');
      setSheetTitle(data.title || 'Google Spreadsheet');
      setTabs(data.tabs || []);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to open spreadsheet',
      });
    } finally {
      setLoadingTabs(false);
    }
  };

  const handleSyncGoogleTab = async (tabTitle: string, target: 'dcem' | 'eb') => {
    if (!accessToken || !selectedSpreadsheetId) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/google/sync-sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          spreadsheetId: selectedSpreadsheetId,
          sheetTitle: tabTitle,
          target,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; count?: number; error?: string };
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setStatusMessage({
        type: 'success',
        text: `Synced ${data.count} rows from "${tabTitle}" into ${target === 'dcem' ? 'DCEM Reading' : 'EB Reading'} database.`,
      });
      onSyncComplete();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Google Sheet sync failed',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 md:p-4">
      <div className="w-full md:max-w-2xl bg-white rounded-t-3xl md:rounded-2xl border border-slate-200 shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="md:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3 mb-1 shrink-0" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Data Source &amp; Backup Sync</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Connect Google Drive sheets or upload Excel/CSV format files to sync with the database.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Database Overview Strip */}
        {meta && (
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 grid grid-cols-2 gap-3 text-xs shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">DCEM Rows:</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">{meta.dcemCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">EB Reading Rows:</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">{meta.ebCount}</span>
            </div>
          </div>
        )}

        {/* Mode Tabs */}
        <div className="px-5 pt-3 border-b border-slate-200 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('excel');
              setStatusMessage(null);
            }}
            className={`min-h-[44px] px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'excel'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-4 h-4" />
            Upload Excel / CSV
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('google');
              setStatusMessage(null);
            }}
            className={`min-h-[44px] px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'google'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Google Drive &amp; Sheets
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-sm ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {activeTab === 'excel' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase">Default Target:</span>
                  <button
                    type="button"
                    onClick={() => setUploadTarget('dcem')}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold border ${
                      uploadTarget === 'dcem'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    DCEM Reading
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadTarget('eb')}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold border ${
                      uploadTarget === 'eb'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    EB Reading
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadDcemTemplate}
                  className="min-h-[36px] px-3 rounded-lg text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download DCEM Format
                </button>
              </div>

              <label className="block border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-2xl p-6 text-center cursor-pointer bg-slate-50/70 transition-colors">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileSelected(file);
                  }}
                />
                <Upload className="w-7 h-7 text-amber-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-900">
                  {selectedFileName || 'Choose Excel (.xlsx / .xls) or CSV backup file'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Uploaded columns and format order are preserved automatically for Auto Reading lookup.
                </p>
              </label>

              {parsedSheets.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Detected Sheets ({parsedSheets.length})
                  </h3>
                  {parsedSheets.map((sheet) => (
                    <div
                      key={sheet.sheetName}
                      className="border border-slate-200 rounded-xl p-4 bg-white space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-bold text-slate-900">{sheet.sheetName}</div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums">
                            {sheet.rows.length} rows · {sheet.headers.length} columns
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleImportSheetToDb(sheet, 'dcem')}
                            className="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                          >
                            Import as DCEM Reading
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleImportSheetToDb(sheet, 'eb')}
                            className="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50"
                          >
                            Import as EB Reading
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5 font-mono overflow-x-auto whitespace-nowrap">
                        {sheet.headers.slice(0, 10).join(' | ')}
                        {sheet.headers.length > 10 ? ` ... (+${sheet.headers.length - 10} more)` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {!accessToken ? (
                <div className="border border-slate-200 rounded-2xl p-6 text-center bg-slate-50 space-y-4">
                  <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                    <FolderOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Connect Google Drive &amp; Sheets
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                      Sign in with Google to browse your backup spreadsheet in Google Drive and sync your{' '}
                      <span className="font-semibold">DCEM Reading</span> and{' '}
                      <span className="font-semibold">EB Reading</span> sheets.
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleGoogleLogin()}
                      className="gsi-material-button"
                    >
                      <div className="gsi-material-button-state" />
                      <div className="gsi-material-button-content-wrapper">
                        <div className="gsi-material-button-icon">
                          <svg
                            version="1.1"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 48 48"
                            style={{ display: 'block' }}
                          >
                            <path
                              fill="#EA4335"
                              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                            />
                            <path
                              fill="#4285F4"
                              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                            />
                            <path
                              fill="#34A853"
                              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                            />
                            <path fill="none" d="M0 0h48v48H0z" />
                          </svg>
                        </div>
                        <span className="gsi-material-button-contents">Sign in with Google</span>
                      </div>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        Connected as {googleUser?.displayName || googleUser?.email || 'Google Account'}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{googleUser?.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => accessToken && void loadDriveSpreadsheets(accessToken)}
                        disabled={loadingFiles}
                        className="min-h-[36px] px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                        Refresh
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleGoogleSignOut()}
                        className="min-h-[36px] px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign out
                      </button>
                    </div>
                  </div>

                  {/* Paste Spreadsheet Link or ID */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualSheetUrl}
                      onChange={(e) => setManualSheetUrl(e.target.value)}
                      placeholder="Paste Google Sheet URL or Spreadsheet ID..."
                      className="flex-1 min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600"
                    />
                    <button
                      type="button"
                      disabled={!manualSheetUrl.trim() || loadingTabs}
                      onClick={() => void handleInspectSpreadsheet(manualSheetUrl)}
                      className="min-h-[44px] px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 shrink-0"
                    >
                      Load Tabs
                    </button>
                  </div>

                  {/* Drive Spreadsheet List */}
                  {spreadsheets.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Your Google Drive Spreadsheets
                      </div>
                      <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-44 overflow-y-auto">
                        {spreadsheets.map((file) => (
                          <button
                            key={file.id}
                            type="button"
                            onClick={() => void handleInspectSpreadsheet(file.id)}
                            className={`w-full min-h-[44px] px-3.5 py-2 text-left flex items-center justify-between gap-3 hover:bg-amber-50/60 transition-colors ${
                              selectedSpreadsheetId === file.id ? 'bg-amber-50' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span className="text-sm font-medium text-slate-900 truncate">
                                {file.name}
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-amber-700 shrink-0">
                              Select
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sheet Tabs */}
                  {tabs.length > 0 && (
                    <div className="space-y-2 border border-slate-200 rounded-xl p-4 bg-slate-50/70">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Tabs in &ldquo;{sheetTitle}&rdquo;
                      </div>
                      <div className="space-y-2">
                        {tabs.map((tab) => (
                          <div
                            key={tab.sheetId}
                            className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
                          >
                            <span className="text-sm font-semibold text-slate-900">{tab.title}</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleSyncGoogleTab(tab.title, 'dcem')}
                                className="min-h-[38px] px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-50"
                              >
                                Sync as DCEM Reading
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleSyncGoogleTab(tab.title, 'eb')}
                                className="min-h-[38px] px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50"
                              >
                                Sync as EB Reading
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
