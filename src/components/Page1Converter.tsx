import React, { useState } from 'react';
import { ArrowRightLeft, Zap, Copy, Check } from 'lucide-react';
import { ampToKw, kwToAmp } from '../utils/calculations';

export const Page1Converter: React.FC = () => {
  const [kwInput, setKwInput] = useState<string>('5');
  const [kwResultAmp, setKwResultAmp] = useState<number>(() => kwToAmp(5));

  const [ampInput, setAmpInput] = useState<string>('100');
  const [ampResultKw, setAmpResultKw] = useState<number>(() => ampToKw(100));

  const [copiedField, setCopiedField] = useState<'amp' | 'kw' | null>(null);

  const handleKwChange = (val: string) => {
    setKwInput(val);
    const num = Number(val);
    setKwResultAmp(val.trim() !== '' && Number.isFinite(num) ? kwToAmp(num) : 0);
  };

  const handleConvertKw = (e?: React.FormEvent) => {
    e?.preventDefault();
    const num = Number(kwInput);
    setKwResultAmp(Number.isFinite(num) ? kwToAmp(num) : 0);
  };

  const handleAmpChange = (val: string) => {
    setAmpInput(val);
    const num = Number(val);
    setAmpResultKw(val.trim() !== '' && Number.isFinite(num) ? ampToKw(num) : 0);
  };

  const handleConvertAmp = (e?: React.FormEvent) => {
    e?.preventDefault();
    const num = Number(ampInput);
    setAmpResultKw(Number.isFinite(num) ? ampToKw(num) : 0);
  };

  const copyValue = async (field: 'amp' | 'kw', val: number) => {
    try {
      await navigator.clipboard.writeText(val.toFixed(2));
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // Clipboard may be restricted in some environments
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            DC KW &amp; Amp Converter
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Instant DC power conversion calibrated at <span className="font-mono font-semibold text-slate-800">54V</span> bus voltage.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: KW to Amp Converter */}
        <form
          onSubmit={handleConvertKw}
          className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col"
        >
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">KW to Amp Converter</h2>
                <p className="text-xs font-mono text-slate-500">Amp = KW × 1000 / 54</p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4 flex-1">
            <div className="grid grid-cols-12 border border-slate-200 rounded-xl overflow-hidden">
              <div className="col-span-4 bg-amber-100/80 px-4 py-3.5 flex items-center font-bold text-sm text-slate-900 border-b border-r border-slate-200">
                KW
              </div>
              <div className="col-span-8 bg-white border-b border-slate-200">
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={kwInput}
                  onChange={(e) => handleKwChange(e.target.value)}
                  placeholder="Input KW value"
                  aria-label="KW Input Value"
                  className="w-full min-h-[48px] px-4 py-3 text-base font-mono font-semibold text-slate-900 focus:outline-none focus:bg-amber-50/30"
                />
              </div>

              <div className="col-span-4 bg-sky-100/80 px-4 py-3.5 flex items-center font-bold text-sm text-slate-900 border-r border-slate-200">
                Amp
              </div>
              <div className="col-span-8 bg-slate-50/60 px-4 py-3 flex items-center justify-between gap-2">
                <span className="text-lg font-mono font-bold text-slate-900 tabular-nums">
                  {kwResultAmp.toFixed(2)} A
                </span>
                <button
                  type="button"
                  onClick={() => void copyValue('amp', kwResultAmp)}
                  aria-label="Copy Amp output"
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
                >
                  {copiedField === 'amp' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {[2, 4, 6, 8, 10].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleKwChange(String(preset))}
                  className="min-h-[36px] px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-mono font-semibold text-slate-700"
                >
                  {preset} KW
                </button>
              ))}
            </div>
          </div>

          <div className="px-5 pb-5">
            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-amber-400 hover:bg-amber-500 active:scale-[0.99] text-slate-950 font-bold text-sm border border-amber-500/40 transition-all flex items-center justify-center gap-2"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Convert KW to Amp
            </button>
          </div>
        </form>

        {/* Card 2: Amp to KW Converter */}
        <form
          onSubmit={handleConvertAmp}
          className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col"
        >
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
                <ArrowRightLeft className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Amp to KW Converter</h2>
                <p className="text-xs font-mono text-slate-500">KW = Amp × 54 / 1000</p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4 flex-1">
            <div className="grid grid-cols-12 border border-slate-200 rounded-xl overflow-hidden">
              <div className="col-span-4 bg-sky-100/80 px-4 py-3.5 flex items-center font-bold text-sm text-slate-900 border-b border-r border-slate-200">
                Amp
              </div>
              <div className="col-span-8 bg-white border-b border-slate-200">
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={ampInput}
                  onChange={(e) => handleAmpChange(e.target.value)}
                  placeholder="Input Amp value"
                  aria-label="Amp Input Value"
                  className="w-full min-h-[48px] px-4 py-3 text-base font-mono font-semibold text-slate-900 focus:outline-none focus:bg-sky-50/30"
                />
              </div>

              <div className="col-span-4 bg-amber-100/80 px-4 py-3.5 flex items-center font-bold text-sm text-slate-900 border-r border-slate-200">
                KW
              </div>
              <div className="col-span-8 bg-slate-50/60 px-4 py-3 flex items-center justify-between gap-2">
                <span className="text-lg font-mono font-bold text-slate-900 tabular-nums">
                  {ampResultKw.toFixed(3)} kW
                </span>
                <button
                  type="button"
                  onClick={() => void copyValue('kw', ampResultKw)}
                  aria-label="Copy KW output"
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
                >
                  {copiedField === 'kw' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {[50, 100, 150, 200, 250].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleAmpChange(String(preset))}
                  className="min-h-[36px] px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-mono font-semibold text-slate-700"
                >
                  {preset} A
                </button>
              ))}
            </div>
          </div>

          <div className="px-5 pb-5">
            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-amber-400 hover:bg-amber-500 active:scale-[0.99] text-slate-950 font-bold text-sm border border-amber-500/40 transition-all flex items-center justify-center gap-2"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Convert Amp to KW
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
