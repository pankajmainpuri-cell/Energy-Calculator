import React, { useEffect, useState } from 'react';
import {
  Search,
  RefreshCw,
  FileSpreadsheet,
  Upload,
  Calendar,
} from 'lucide-react';
import { IndusIdCombobox } from './IndusIdCombobox';
import { AppMetaInfo, EbReadingRecord } from '../types/energy';
import { calculateEbDateReading } from '../utils/calculations';

interface Page4EbReadingProps {
  meta: AppMetaInfo | null;
  onOpenSync: (tab: 'excel' | 'google', target: 'dcem' | 'eb') => void;
}

export const Page4EbReading: React.FC<Page4EbReadingProps> = ({ meta, onOpenSync }) => {
  const [indusId, setIndusId] = useState('IN-1074020');
  const [selectedDate, setSelectedDate] = useState('2026-11-24');
  const [rows, setRows] = useState<EbReadingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFindData = async (targetId?: string) => {
    const query = (targetId ?? indusId).trim();
    setLoading(true);
    setError(null);
    try {
      const url = query
        ? `/api/eb-readings/${encodeURIComponent(query)}`
        : '/api/eb-readings?limit=25';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch EB readings');
      const data = (await res.json()) as { rows?: EbReadingRecord[] };
      setRows(data.rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch EB reading data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void handleFindData('IN-1074020');
  }, [meta?.lastEbSync, meta?.ebCount]);

  const primaryRow = rows[0] || null;
  const primaryCalc = primaryRow ? calculateEbDateReading(primaryRow, selectedDate) : null;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            EB READING
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Date-wise Energy EB reading lookup synced with your EB Reading sheet ({meta?.ebCount || 0} sites).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenSync('excel', 'eb')}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4 text-amber-600" />
            Upload EB Sheet
          </button>
          <button
            type="button"
            onClick={() => onOpenSync('google', 'eb')}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Google Sheet Sync
          </button>
        </div>
      </div>

      {/* Filter Bar matching page4 wireframe */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleFindData();
        }}
        className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
      >
        <div className="sm:col-span-6">
          <IndusIdCombobox
            value={indusId}
            onChange={setIndusId}
            onSelect={(item) => void handleFindData(item.indusId)}
            scope="eb"
            label="INDUS ID"
            placeholder="Search or select Indus ID (e.g. IN-1074020)"
          />
        </div>

        <div className="sm:col-span-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
            Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600"
          />
        </div>

        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Find Data
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Results Table matching page4_76da32d9.jpg exact columns */}
      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <h2 className="text-base font-bold text-slate-900">No Matching Site Found</h2>
          <p className="text-sm text-slate-600 mt-1">
            Try another Indus ID or clear the search box and tap Find Data to list sites.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-900 text-xs font-bold">
                    <th className="px-4 py-3.5 bg-indigo-50/90 border-r border-slate-200">
                      Indus Id
                    </th>
                    <th className="px-4 py-3.5 bg-indigo-50/90 border-r border-slate-200">
                      Site Name
                    </th>
                    <th className="px-4 py-3.5 bg-indigo-50/90 border-r border-slate-200">
                      पिछली रीडिंग (केवल देखने के लिए)
                    </th>
                    <th className="px-4 py-3.5 bg-indigo-50/90 border-r border-slate-200">
                      Area
                    </th>
                    <th className="px-4 py-3.5 bg-indigo-50/90 border-r border-slate-200">
                      Technician
                    </th>
                    <th className="px-4 py-3.5 bg-yellow-300 border-l border-yellow-400 text-slate-950">
                      Current Reading
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {rows.map((row) => {
                    const calc = calculateEbDateReading(row, selectedDate);
                    return (
                      <tr key={row.id ?? row.indusId} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900 border-r border-slate-100 whitespace-nowrap">
                          {row.indusId}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800 border-r border-slate-100">
                          {row.siteName || '-'}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-800 border-r border-slate-100">
                          {row.previousReading.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-slate-700 border-r border-slate-100">
                          {row.area || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-700 border-r border-slate-100">
                          {row.technician || '-'}
                        </td>
                        <td className="px-4 py-3 font-mono text-base font-extrabold text-slate-950 bg-yellow-50/80 tabular-nums whitespace-nowrap">
                          {calc.currentReading.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {rows.map((row) => {
              const calc = calculateEbDateReading(row, selectedDate);
              return (
                <div
                  key={row.id ?? row.indusId}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
                >
                  <div className="p-4 flex items-start justify-between gap-3 border-b border-slate-100">
                    <div>
                      <div className="font-mono text-sm font-bold text-slate-900">
                        {row.indusId}
                      </div>
                      <div className="text-sm font-semibold text-slate-800 mt-0.5">
                        {row.siteName}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {row.area} · {row.technician}
                      </div>
                    </div>
                    <div className="bg-yellow-300 px-3 py-2 rounded-xl text-right shrink-0">
                      <div className="text-[10px] font-bold uppercase text-slate-800">
                        Current Reading
                      </div>
                      <div className="font-mono text-base font-extrabold text-slate-950 tabular-nums">
                        {calc.currentReading.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-3 bg-slate-50 flex items-center justify-between text-xs">
                    <span className="text-slate-600">पिछली रीडिंग (केवल देखने के लिए):</span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {row.previousReading.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detailed Site Calculation Breakdown & Date Timeline for Primary Selected Site */}
          {primaryRow && primaryCalc && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Date-Wise Calculation Details — {primaryRow.indusId} ({primaryRow.siteName})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Submitted Date: <span className="font-mono">{primaryRow.submittedDate || 'N/A'}</span> ·{' '}
                    Status: {primaryRow.status || 'Active'} ·{' '}
                    {primaryCalc.source === 'sheet-column'
                      ? `Matched sheet column (${primaryCalc.matchedColumnKey})`
                      : 'Dynamic daily projection formula'}
                  </p>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                  {selectedDate}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-slate-200 rounded-xl p-3">
                  <div className="text-[11px] font-bold uppercase text-slate-500">DC Load</div>
                  <div className="font-mono text-base font-bold text-slate-900 tabular-nums mt-0.5">
                    {primaryRow.dcLoad} kW
                  </div>
                </div>
                <div className="border border-slate-200 rounded-xl p-3">
                  <div className="text-[11px] font-bold uppercase text-slate-500">Perday Units</div>
                  <div className="font-mono text-base font-bold text-slate-900 tabular-nums mt-0.5">
                    {primaryCalc.perdayUnits} kWh/day
                  </div>
                </div>
                <div className="border border-slate-200 rounded-xl p-3">
                  <div className="text-[11px] font-bold uppercase text-slate-500">Days Elapsed</div>
                  <div className="font-mono text-base font-bold text-slate-900 tabular-nums mt-0.5">
                    {primaryCalc.daysElapsed} days
                  </div>
                </div>
                <div className="border border-slate-200 rounded-xl p-3">
                  <div className="text-[11px] font-bold uppercase text-slate-500">Consumption</div>
                  <div className="font-mono text-base font-bold text-emerald-700 tabular-nums mt-0.5">
                    +{primaryCalc.consumption.toLocaleString('en-IN')} kWh
                  </div>
                </div>
              </div>

              {Object.keys(primaryRow.dateReadings || {}).length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                    <Calendar className="w-3.5 h-3.5" />
                    Sheet Date-Wise Readings (Tap a date to inspect)
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {Object.entries(primaryRow.dateReadings).map(([dateKey, readingVal]) => (
                      <button
                        key={dateKey}
                        type="button"
                        onClick={() => {
                          // Convert DD-MMM-YY like 24-Nov-26 to 2026-11-24
                          const parts = dateKey.split('-');
                          const months: Record<string, string> = {
                            jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                            jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
                          };
                          if (parts.length === 3 && months[parts[1].toLowerCase()]) {
                            const yr = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                            setSelectedDate(`${yr}-${months[parts[1].toLowerCase()]}-${parts[0].padStart(2, '0')}`);
                          }
                        }}
                        className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 hover:border-amber-500 bg-slate-50 hover:bg-amber-50 text-left shrink-0 transition-colors"
                      >
                        <div className="text-[11px] font-semibold text-slate-500">{dateKey}</div>
                        <div className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                          {readingVal.toLocaleString('en-IN')}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
