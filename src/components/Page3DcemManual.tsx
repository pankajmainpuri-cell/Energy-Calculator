import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Trash2,
  Calculator,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { IndusIdCombobox } from './IndusIdCombobox';
import { DcemReadingRecord, EbReadingRecord } from '../types/energy';
import {
  calculateChannelKw,
  calculateDaysBetween,
  calculateDcemCurrentReading,
  formatIsoDate,
} from '../utils/calculations';

interface ManualChannelRow {
  localId: string;
  indusId: string;
  smpsInstance: string;
  operatorName: string;
  siteName: string;
  previousReading: number;
  days: number;
  voltage: number;
  amp: number;
  currentLoadKw: number;
  currentReading: number;
}

interface Page3DcemManualProps {
  onDataSaved: () => void;
}

function makeRowId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function defaultDates() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  return {
    prevDate: formatIsoDate(prev),
    currDate: formatIsoDate(now),
  };
}

export const Page3DcemManual: React.FC<Page3DcemManualProps> = ({ onDataSaved }) => {
  const initialDates = defaultDates();
  const [indusId, setIndusId] = useState('IN-1074020');
  const [previousDate, setPreviousDate] = useState(initialDates.prevDate);
  const [currentDate, setCurrentDate] = useState(initialDates.currDate);
  const [siteName, setSiteName] = useState('');
  const [channels, setChannels] = useState<ManualChannelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const computedDays = Math.max(0, calculateDaysBetween(previousDate, currentDate));

  const buildCalculatedRow = (
    base: Omit<ManualChannelRow, 'currentLoadKw' | 'currentReading'>
  ): ManualChannelRow => {
    const loadKw = calculateChannelKw(base.voltage, base.amp);
    const reading = calculateDcemCurrentReading(
      base.previousReading,
      base.voltage,
      base.amp,
      base.days
    );
    return {
      ...base,
      currentLoadKw: loadKw,
      currentReading: reading,
    };
  };

  const syncChannelsToDb = async (targetId: string, rowsToSave: ManualChannelRow[]) => {
    const cleanId = targetId.trim();
    if (!cleanId) return;
    setSyncState('saving');
    try {
      const res = await fetch('/api/dcem-readings/sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indusId: cleanId,
          channels: rowsToSave.map((r) => ({
            smpsInstance: r.smpsInstance,
            operatorName: r.operatorName,
            siteName: r.siteName || siteName,
            previousDate,
            currentDate,
            days: r.days,
            voltage: r.voltage,
            amp: r.amp,
            previousReading: r.previousReading,
            currentReading: r.currentReading,
          })),
        }),
      });
      if (!res.ok) throw new Error('Sync failed');
      setSyncState('saved');
      onDataSaved();
    } catch {
      setSyncState('error');
    }
  };

  const scheduleSync = (targetId: string, rowsToSave: ManualChannelRow[]) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      void syncChannelsToDb(targetId, rowsToSave);
    }, 500);
  };

  const loadSiteData = async (targetId?: string) => {
    const query = (targetId ?? indusId).trim();
    if (!query) return;

    setLoading(true);
    setSyncState('idle');
    try {
      const res = await fetch(`/api/dcem-readings/${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Lookup failed');
      const data = (await res.json()) as {
        rows?: DcemReadingRecord[];
        ebSite?: EbReadingRecord | null;
      };

      const resolvedSiteName =
        data.rows?.[0]?.siteName || data.ebSite?.siteName || '';
      setSiteName(resolvedSiteName);

      if (data.rows && data.rows.length > 0) {
        const mapped = data.rows.map((r) => {
          const daysVal = computedDays > 0 ? computedDays : r.days || 0;
          return buildCalculatedRow({
            localId: makeRowId(),
            indusId: r.indusId || query,
            smpsInstance: r.smpsInstance || 'SMPS-1',
            operatorName: r.operatorName || 'Operator',
            siteName: r.siteName || resolvedSiteName,
            previousReading: r.previousReading || 0,
            days: daysVal,
            voltage: r.voltage || 54,
            amp: r.amp || 0,
          });
        });
        setChannels(mapped);
      } else {
        // Initialize 4 clean channel rows using EB site metadata (if present)
        const baseAmp =
          data.ebSite && data.ebSite.dcLoad > 0
            ? Number(((data.ebSite.dcLoad * 1000) / 54).toFixed(1))
            : 0;
        const defaultOperators = ['Airtel', 'Jio', 'VI', 'BSNL'];
        const initialRows = defaultOperators.map((op, idx) =>
          buildCalculatedRow({
            localId: makeRowId(),
            indusId: query,
            smpsInstance: `SMPS-${idx + 1}`,
            operatorName: op,
            siteName: resolvedSiteName,
            previousReading: idx === 0 && data.ebSite ? data.ebSite.previousReading : 0,
            days: computedDays,
            voltage: 54,
            amp: idx === 0 ? baseAmp : 0,
          })
        );
        setChannels(initialRows);
      }
    } catch {
      // Keep current manual rows on lookup failure
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSiteData('IN-1074020');
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  // Recompute days & readings automatically when Previous Date or Current Date changes
  useEffect(() => {
    setChannels((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.map((row) =>
        buildCalculatedRow({
          ...row,
          days: computedDays,
        })
      );
      return next;
    });
  }, [computedDays]);

  const updateChannelField = (
    localId: string,
    field: keyof ManualChannelRow,
    rawValue: string
  ) => {
    setChannels((prev) => {
      const next = prev.map((row) => {
        if (row.localId !== localId) return row;
        const updated = { ...row };
        if (
          field === 'previousReading' ||
          field === 'days' ||
          field === 'voltage' ||
          field === 'amp'
        ) {
          const parsed = rawValue === '' ? 0 : Number(rawValue);
          updated[field] = Number.isFinite(parsed) ? parsed : 0;
        } else if (
          field === 'smpsInstance' ||
          field === 'operatorName' ||
          field === 'siteName'
        ) {
          updated[field] = rawValue;
        }
        return buildCalculatedRow(updated);
      });
      scheduleSync(indusId, next);
      return next;
    });
  };

  const handleAddChannel = () => {
    setChannels((prev) => {
      const next = [
        ...prev,
        buildCalculatedRow({
          localId: makeRowId(),
          indusId: indusId.trim(),
          smpsInstance: `SMPS-${prev.length + 1}`,
          operatorName: `Channel ${prev.length + 1}`,
          siteName,
          previousReading: 0,
          days: computedDays,
          voltage: 54,
          amp: 0,
        }),
      ];
      scheduleSync(indusId, next);
      return next;
    });
  };

  const handleRemoveChannel = (localId: string) => {
    setChannels((prev) => {
      const next = prev.filter((r) => r.localId !== localId);
      scheduleSync(indusId, next);
      return next;
    });
  };

  const totalAmp = channels.reduce((sum, c) => sum + c.amp, 0);
  const totalKw = channels.reduce((sum, c) => sum + c.currentLoadKw, 0);
  const totalCurrentReading = channels.reduce((sum, c) => sum + c.currentReading, 0);
  const totalAddedUnits = channels.reduce(
    (sum, c) => sum + Math.max(0, c.currentReading - c.previousReading),
    0
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            DCEM Reading Calculate Manual
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Channel-wise manual calculation with previous reading, voltage, amp load, and live database sync.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {syncState === 'saving' && (
            <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Syncing to DB...
            </span>
          )}
          {syncState === 'saved' && (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Synced with database
            </span>
          )}
        </div>
      </div>

      {/* Top Controls matching page3 wireframe */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void loadSiteData();
        }}
        className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
      >
        <div className="md:col-span-4">
          <IndusIdCombobox
            value={indusId}
            onChange={setIndusId}
            onSelect={(item) => void loadSiteData(item.indusId)}
            scope="all"
            label="INDUS ID"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
            Previous Date
          </label>
          <input
            type="date"
            value={previousDate}
            onChange={(e) => setPreviousDate(e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
            Current Date
          </label>
          <input
            type="date"
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600"
          />
        </div>

        <div className="md:col-span-2 flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Find Data
          </button>
        </div>
      </form>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total Amp Load
          </div>
          <div className="text-lg font-mono font-bold text-slate-900 tabular-nums mt-0.5">
            {totalAmp.toFixed(1)} A
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Current Load (KW)
          </div>
          <div className="text-lg font-mono font-bold text-slate-900 tabular-nums mt-0.5">
            {totalKw.toFixed(3)} kW
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Period Units ({computedDays}d)
          </div>
          <div className="text-lg font-mono font-bold text-emerald-700 tabular-nums mt-0.5">
            +{totalAddedUnits.toFixed(1)} kWh
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total Current Reading
          </div>
          <div className="text-lg font-mono font-bold text-amber-700 tabular-nums mt-0.5">
            {totalCurrentReading.toFixed(1)} kWh
          </div>
        </div>
      </div>

      {/* Desktop Editable Grid */}
      <div className="hidden lg:block bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-amber-200/75 border-b border-amber-300/80 text-slate-900 text-xs font-bold">
                <th className="px-3 py-3 border-r border-amber-300/60">Indus ID</th>
                <th className="px-3 py-3 border-r border-amber-300/60">SMPS Instance</th>
                <th className="px-3 py-3 border-r border-amber-300/60">Operator Name</th>
                <th className="px-3 py-3 border-r border-amber-300/60">Site Name</th>
                <th className="px-3 py-3 border-r border-amber-300/60">Prev Reading</th>
                <th className="px-3 py-3 border-r border-amber-300/60">Days</th>
                <th className="px-3 py-3 border-r border-amber-300/60">Voltage</th>
                <th className="px-3 py-3 border-r border-amber-300/60">Amp Load</th>
                <th className="px-3 py-3 border-r border-amber-300/60">Current Load (KW)</th>
                <th className="px-3 py-3 border-r border-amber-300/60">Current Reading</th>
                <th className="px-2 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {channels.map((row) => (
                <tr key={row.localId} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-900 border-r border-slate-100 whitespace-nowrap">
                    {row.indusId}
                  </td>
                  <td className="p-1.5 border-r border-slate-100">
                    <input
                      type="text"
                      value={row.smpsInstance}
                      onChange={(e) => updateChannelField(row.localId, 'smpsInstance', e.target.value)}
                      className="w-24 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-600"
                    />
                  </td>
                  <td className="p-1.5 border-r border-slate-100">
                    <input
                      type="text"
                      value={row.operatorName}
                      onChange={(e) => updateChannelField(row.localId, 'operatorName', e.target.value)}
                      className="w-28 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-600"
                    />
                  </td>
                  <td className="p-1.5 border-r border-slate-100">
                    <input
                      type="text"
                      value={row.siteName}
                      onChange={(e) => updateChannelField(row.localId, 'siteName', e.target.value)}
                      className="w-28 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-amber-600"
                    />
                  </td>
                  <td className="p-1.5 border-r border-slate-100">
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={row.previousReading}
                      onChange={(e) =>
                        updateChannelField(row.localId, 'previousReading', e.target.value)
                      }
                      className="w-28 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:border-amber-600"
                    />
                  </td>
                  <td className="p-1.5 border-r border-slate-100">
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={row.days}
                      onChange={(e) => updateChannelField(row.localId, 'days', e.target.value)}
                      className="w-16 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:border-amber-600"
                    />
                  </td>
                  <td className="p-1.5 border-r border-slate-100">
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={row.voltage}
                      onChange={(e) => updateChannelField(row.localId, 'voltage', e.target.value)}
                      className="w-20 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:border-amber-600"
                    />
                  </td>
                  <td className="p-1.5 border-r border-slate-100">
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={row.amp}
                      onChange={(e) => updateChannelField(row.localId, 'amp', e.target.value)}
                      className="w-20 min-h-[38px] px-2 py-1 border border-slate-200 rounded-lg text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:border-amber-600"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-800 tabular-nums border-r border-slate-100 whitespace-nowrap">
                    {row.currentLoadKw.toFixed(3)} kW
                  </td>
                  <td className="px-3 py-2 font-mono text-sm font-bold text-amber-800 bg-amber-50/40 tabular-nums border-r border-slate-100 whitespace-nowrap">
                    {row.currentReading.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveChannel(row.localId)}
                      aria-label="Remove channel"
                      className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile & Tablet Channel Cards */}
      <div className="lg:hidden space-y-3">
        {channels.map((row, idx) => (
          <div
            key={row.localId}
            className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div>
                <div className="text-sm font-bold text-slate-900">
                  {row.operatorName || `Channel ${idx + 1}`} · {row.smpsInstance}
                </div>
                <div className="text-xs font-mono text-slate-500">
                  {row.indusId} {row.siteName ? `— ${row.siteName}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveChannel(row.localId)}
                aria-label="Remove channel"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  SMPS Instance
                </label>
                <input
                  type="text"
                  value={row.smpsInstance}
                  onChange={(e) => updateChannelField(row.localId, 'smpsInstance', e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Operator Name
                </label>
                <input
                  type="text"
                  value={row.operatorName}
                  onChange={(e) => updateChannelField(row.localId, 'operatorName', e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Previous Reading
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={row.previousReading}
                  onChange={(e) =>
                    updateChannelField(row.localId, 'previousReading', e.target.value)
                  }
                  className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono tabular-nums text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Days (Curr - Prev)
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={row.days}
                  onChange={(e) => updateChannelField(row.localId, 'days', e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono tabular-nums text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Voltage (V)
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={row.voltage}
                  onChange={(e) => updateChannelField(row.localId, 'voltage', e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono tabular-nums text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Amp Load (A)
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={row.amp}
                  onChange={(e) => updateChannelField(row.localId, 'amp', e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono tabular-nums text-slate-900"
                />
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold text-slate-600">Current Load</div>
                <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                  {row.currentLoadKw.toFixed(3)} kW
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-semibold text-amber-800">Current Reading</div>
                <div className="font-mono text-base font-extrabold text-amber-800 tabular-nums">
                  {row.currentReading.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleAddChannel}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800 inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Channel Row
        </button>

        <button
          type="button"
          onClick={() => void syncChannelsToDb(indusId, channels)}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-sm font-bold text-white inline-flex items-center gap-2"
        >
          <Calculator className="w-4 h-4 text-amber-400" />
          Calculate &amp; Sync Readings
        </button>
      </div>
    </div>
  );
};
