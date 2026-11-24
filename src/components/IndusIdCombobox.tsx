import React, { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { IndusSuggestion } from '../types/energy';

interface IndusIdComboboxProps {
  value: string;
  onChange: (val: string) => void;
  onSelect?: (item: IndusSuggestion) => void;
  scope?: 'all' | 'eb' | 'dcem';
  placeholder?: string;
  label?: string;
}

export const IndusIdCombobox: React.FC<IndusIdComboboxProps> = ({
  value,
  onChange,
  onSelect,
  scope = 'all',
  placeholder = 'Search or type Indus ID (e.g. IN-1074020)',
  label = 'INDUS ID',
}) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<IndusSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/indus-ids?q=${encodeURIComponent(value.trim())}&scope=${encodeURIComponent(scope)}&limit=35`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { items?: IndusSuggestion[] };
        if (active) {
          setItems(data.items || []);
        }
      } catch {
        // Ignore aborted requests
      } finally {
        if (active) setLoading(false);
      }
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, scope]);

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
        <input
          type="text"
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full min-h-[44px] pl-9 pr-16 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono font-medium text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600 transition-colors"
        />
        <div className="absolute right-1.5 flex items-center gap-0.5">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(true);
              }}
              aria-label="Clear Indus ID"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-label="Toggle Indus ID list"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute z-40 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="px-3.5 py-3 text-xs text-slate-500">Loading site IDs...</div>
          ) : items.length === 0 ? (
            <div className="px-3.5 py-3 text-xs text-slate-500">
              No saved sites match &ldquo;{value}&rdquo;. You can still enter it manually.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.indusId}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(item.indusId);
                      onSelect?.(item);
                      setOpen(false);
                    }}
                    className="w-full min-h-[44px] px-3.5 py-2 text-left hover:bg-amber-50/70 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold text-slate-900 truncate">
                        {item.indusId}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {item.siteName || 'Unnamed Site'}
                        {item.area ? ` · ${item.area}` : ''}
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 shrink-0 uppercase">
                      {item.source === 'both' ? 'DCEM + EB' : item.source}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
