import React, { useEffect, useState } from 'react';
import {
  Search,
  Upload,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Database,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { IndusIdCombobox } from './IndusIdCombobox';
import { AppMetaInfo, DcemReadingRecord } from '../types/energy';

interface Page2DcemAutoProps {
  meta: AppMetaInfo | null;
  onOpenSync: (tab: 'excel' | 'google', target: 'dcem' | 'eb') => void;
}

export const Page2DcemAuto: React.FC<Page2DcemAutoProps> = ({ meta, onOpenSync }) => {
  const [indusId, setIndusId] = useState('');
  const [columns, setColumns] = useState<string[]>(
    meta?.dcemColumns || [
      'Indus ID',
      'SMPS Instance',
      'Operator Name',
      'Site Name',
      'Current date',
      'Days',
      'Voltage',
      'Amp',
      'Current Reading',
    ]
  );
  const [rows, setRows] = useState<DcemReadingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchedId, setSearchedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInitialPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dcem-readings?limit=25');
      if (!res.ok) throw new Error('Failed to load DCEM readings');
      const data = (await res.json()) as {
        columns?: string[];
        rows?: DcemReadingRecord[];
      };
      if (data.columns && data.columns.length > 0) setColumns(data.columns);
      setRows(data.rows || []);
      setSearchedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch DCEM readings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInitialPreview();
  }, [meta?.lastDcemSync, meta?.dcemCount]);

  const handleFindData = async (targetId?: string) => {
    const query = (targetId ?? indusId).trim();
    if (!query) {
      await loadInitialPreview();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dcem-readings/${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Failed to find site readings');
      const data = (await res.json()) as {
        columns?: string[];
        rows?: DcemReadingRecord[];
      };
      if (data.columns && data.columns.length > 0) setColumns(data.columns);
      setRows(data.rows || []);
      setSearchedId(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch site readings');
    } finally {
      setLoading(false);
    }
  };

  const getCellValue = (row: DcemReadingRecord, colName: string): string => {
    if (row.raw && row.raw[colName] !== undefined && row.raw[colName] !== '') {
      return row.raw[colName];
    }
    const norm = colName.toLowerCase().trim();
    if (norm.includes('indus')) return row.indusId;
    if (norm.includes('smps') || norm.includes('instance')) return row.smpsInstance;
    if (norm.includes('operator')) return row.operatorName;
    if (norm.includes('site')) return row.siteName;
    if (norm.includes('current date') || norm === 'date') return row.currentDate;
    if (norm.includes('previous date')) return row.previousDate;
    if (norm === 'days' || norm === 'day') return String(row.days);
    if (norm.includes('voltage') || norm === 'volt') return String(row.voltage);
    if (norm === 'amp' || norm.includes('amp')) return String(row.amp);
    if (norm.includes('previous reading')) return String(row.previousReading);
    if (norm.includes('current reading') || norm === 'reading') {
      return Number.isFinite(row.currentReading) ? row.currentReading.toFixed(2) : '0';
    }
    return '-';
  };

  const handleExportExcel = () => {
    if (rows.length === 0) return;
    const exportData = rows.map((row) => {
      const out: Record<string, string> = {};
      columns.forEach((col) => {
        out[col] = getCellValue(row, col);
      });
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DCEM Reading');
    XLSX.writeFile(wb, `DCEM_Reading_${searchedId || 'All'}.xlsx`);
  };

  return (
    <div className="space-y-5">
      {/* Header & Sync Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            DCEM Reading Calculate Auto
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Select or type an Indus ID to populate all site readings in your uploaded format.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenSync('excel', 'dcem')}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4 text-amber-600" />
            Upload Format
          </button>
          <button
            type="button"
            onClick={() => onOpenSync('google', 'dcem')}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Google Sheet Sync
          </button>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={handleExportExcel}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleFindData();
        }}
        className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-end gap-3"
      >
        <div className="flex-1">
          <IndusIdCombobox
            value={indusId}
            onChange={setIndusId}
            onSelect={(item) => void handleFindData(item.indusId)}
            scope="dcem"
            label="INDUS ID"
            placeholder="Select or type Indus ID..."
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="min-h-[44px] px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shrink-0 disabled:opacity-60"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Find Data
        </button>
      </form>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Results Area */}
      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <Database className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h2 className="text-base font-bold text-slate-900">
              {searchedId
                ? `No DCEM rows found for "${searchedId}"`
                : 'No DCEM Reading Format Uploaded Yet'}
            </h2>
            <p className="text-sm text-slate-600">
              {searchedId
                ? 'Upload a DCEM Excel/CSV format containing this Indus ID, sync your Google Sheet "DCEM Reading" tab, or add channels in DCEM Manual.'
                : 'Upload your Excel/CSV format file or connect your Google Sheet "DCEM Reading" tab to auto-populate readings by Indus ID.'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => onOpenSync('excel', 'dcem')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload Format File
            </button>
            <button
              type="button"
              onClick={() => onOpenSync('google', 'dcem')}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold inline-flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Connect Google Sheet
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
            <span>
              Showing <strong className="font-mono text-slate-900 tabular-nums">{rows.length}</strong>{' '}
              channel row{rows.length === 1 ? '' : 's'}
              {searchedId ? (
                <>
                  {' '}
                  for <strong className="font-mono text-slate-900">{searchedId}</strong>
                </>
              ) : (
                ' (latest synced format)'
              )}
            </span>
            {meta?.lastDcemSource && (
              <span className="hidden sm:inline text-slate-500">Source: {meta.lastDcemSource}</span>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-amber-200/75 border-b border-amber-300/80 text-slate-900">
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="px-3.5 py-3 text-xs font-bold whitespace-nowrap border-r last:border-r-0 border-amber-300/60"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {rows.map((row, idx) => (
                    <tr key={row.id ?? idx} className="hover:bg-slate-50 transition-colors">
                      {columns.map((col) => {
                        const val = getCellValue(row, col);
                        const isNumeric =
                          col.toLowerCase().includes('reading') ||
                          col.toLowerCase().includes('amp') ||
                          col.toLowerCase().includes('volt') ||
                          col.toLowerCase().includes('day');
                        return (
                          <td
                            key={col}
                            className={`px-3.5 py-2.5 whitespace-nowrap border-r last:border-r-0 border-slate-100 ${
                              isNumeric ? 'font-mono tabular-nums font-medium text-slate-900' : 'text-slate-800'
                            } ${
                              col.toLowerCase().includes('current reading')
                                ? 'font-bold text-amber-800 bg-amber-50/40'
                                : ''
                            }`}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List View */}
          <div className="md:hidden space-y-3">
            {rows.map((row, idx) => (
              <div
                key={row.id ?? idx}
                className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <div className="font-mono text-sm font-bold text-slate-900">
                      {row.indusId} · {row.smpsInstance || `Channel ${idx + 1}`}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {row.operatorName || 'Operator'} — {row.siteName || 'Site'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase font-semibold text-slate-500">
                      Current Reading
                    </div>
                    <div className="font-mono text-base font-extrabold text-amber-700 tabular-nums">
                      {getCellValue(row, 'Current Reading')}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {columns
                    .filter(
                      (c) =>
                        !['indus id', 'smps instance', 'operator name', 'site name', 'current reading'].includes(
                          c.toLowerCase()
                        )
                    )
                    .map((col) => (
                      <div key={col} className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 truncate">{col}:</span>
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {getCellValue(row, col)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
