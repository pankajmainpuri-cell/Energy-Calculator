/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  Table2,
  Calculator,
  Gauge,
  CloudUpload,
  Zap,
} from 'lucide-react';
import { Page1Converter } from './components/Page1Converter';
import { Page2DcemAuto } from './components/Page2DcemAuto';
import { Page3DcemManual } from './components/Page3DcemManual';
import { Page4EbReading } from './components/Page4EbReading';
import { DataSyncModal } from './components/DataSyncModal';
import { AppMetaInfo } from './types/energy';

type ActivePage = 'converter' | 'dcem-auto' | 'dcem-manual' | 'eb-reading';

const NAV_ITEMS: Array<{
  id: ActivePage;
  label: string;
  mobileLabel: string;
  subtitle: string;
  icon: typeof ArrowRightLeft;
}> = [
  {
    id: 'converter',
    label: 'KW ↔ Amp Converter',
    mobileLabel: 'KW ↔ Amp',
    subtitle: '54V DC conversion',
    icon: ArrowRightLeft,
  },
  {
    id: 'dcem-auto',
    label: 'DCEM Auto Reading',
    mobileLabel: 'DCEM Auto',
    subtitle: 'Uploaded format lookup',
    icon: Table2,
  },
  {
    id: 'dcem-manual',
    label: 'DCEM Manual Calc',
    mobileLabel: 'Manual',
    subtitle: 'Channel-wise load & kWh',
    icon: Calculator,
  },
  {
    id: 'eb-reading',
    label: 'EB Reading',
    mobileLabel: 'EB Reading',
    subtitle: 'Date-wise meter tracker',
    icon: Gauge,
  },
];

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>('converter');
  const [meta, setMeta] = useState<AppMetaInfo | null>(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncInitialTab, setSyncInitialTab] = useState<'excel' | 'google'>('excel');
  const [syncDefaultTarget, setSyncDefaultTarget] = useState<'dcem' | 'eb'>('dcem');

  const fetchMeta = useCallback(async () => {
    try {
      const res = await fetch('/api/meta');
      if (!res.ok) return;
      const data = (await res.json()) as AppMetaInfo;
      setMeta(data);
    } catch {
      // Ignore transient network failures
    }
  }, []);

  useEffect(() => {
    void fetchMeta();
  }, [fetchMeta]);

  const openSyncModal = (tab: 'excel' | 'google' = 'excel', target: 'dcem' | 'eb' = 'dcem') => {
    setSyncInitialTab(tab);
    setSyncDefaultTarget(target);
    setSyncModalOpen(true);
  };

  const currentNav = NAV_ITEMS.find((n) => n.id === activePage) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 lg:w-72 shrink-0 flex-col bg-white border-r border-slate-200 sticky top-0 h-screen">
        <div className="h-16 px-5 border-b border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-slate-900 truncate">
              Energy Calculator
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              DCEM &amp; EB Reading MIS
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
                className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl text-left flex items-center gap-3 transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    isActive ? 'text-amber-400' : 'text-slate-500'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{item.label}</div>
                  <div
                    className={`text-[11px] truncate ${
                      isActive ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {item.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div>
              <div className="text-slate-500">EB Sites</div>
              <div className="font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                {meta?.ebCount ?? 0}
              </div>
            </div>
            <div>
              <div className="text-slate-500">DCEM Rows</div>
              <div className="font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                {meta?.dcemCount ?? 0}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openSyncModal('excel', activePage === 'eb-reading' ? 'eb' : 'dcem')}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-bold inline-flex items-center justify-center gap-2"
          >
            <CloudUpload className="w-4 h-4 text-amber-600" />
            Sync Excel / Google Sheets
          </button>

          <div className="pt-3 border-t border-slate-200 text-xs space-y-0.5">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
              Developed by
            </div>
            <div className="font-bold text-slate-900">Pankaj Shakya</div>
            <div className="text-slate-600">(Energy Co-ordinator)</div>
            <div className="pt-1 flex flex-col gap-0.5 font-mono text-[11px] text-slate-700">
              <a href="mailto:energy@hacsindia.in" className="hover:text-amber-700 truncate">
                energy@hacsindia.in
              </a>
              <a href="tel:+919045053205" className="hover:text-amber-700">
                +91 9045053205
              </a>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (compact <=56px on mobile) */}
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="md:hidden w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 hidden md:block">
                Energy Calculator / <span className="text-slate-900 font-semibold">{currentNav.label}</span>
              </div>
              <div className="text-sm font-bold text-slate-900 md:hidden truncate">
                {currentNav.label}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              openSyncModal('google', activePage === 'eb-reading' ? 'eb' : 'dcem')
            }
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-2"
          >
            <CloudUpload className="w-4 h-4 text-amber-400" />
            <span>Sync Data</span>
          </button>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6 pb-24 md:pb-8">
          {activePage === 'converter' && <Page1Converter />}
          {activePage === 'dcem-auto' && (
            <Page2DcemAuto meta={meta} onOpenSync={openSyncModal} />
          )}
          {activePage === 'dcem-manual' && (
            <Page3DcemManual onDataSaved={() => void fetchMeta()} />
          )}
          {activePage === 'eb-reading' && (
            <Page4EbReading meta={meta} onOpenSync={openSyncModal} />
          )}

          <footer className="mt-10 pt-5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-600">
            <div>
              <span className="text-slate-400 font-medium">Developed by </span>
              <span className="font-bold text-slate-900">Pankaj Shakya</span>{' '}
              <span className="text-slate-600">(Energy Co-ordinator)</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-slate-700">
              <a href="mailto:energy@hacsindia.in" className="hover:text-amber-700">
                energy@hacsindia.in
              </a>
              <a href="tel:+919045053205" className="hover:text-amber-700">
                +91 9045053205
              </a>
            </div>
          </footer>
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
        aria-label="Mobile navigation"
      >
        <div className="grid grid-cols-4 h-16 items-center">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
                className={`min-h-[44px] h-full flex flex-col items-center justify-center px-1 transition-colors ${
                  isActive ? 'text-amber-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold tracking-tight mt-1 truncate max-w-full">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Excel & Google Sheets Sync Modal */}
      <DataSyncModal
        isOpen={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        initialTab={syncInitialTab}
        defaultTarget={syncDefaultTarget}
        meta={meta}
        onSyncComplete={() => void fetchMeta()}
      />
    </div>
  );
}
