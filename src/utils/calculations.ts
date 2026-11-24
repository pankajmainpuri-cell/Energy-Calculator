import { EbReadingRecord } from '../types/energy';

export const DC_NOMINAL_VOLTAGE = 54;

/**
 * Formula: Amp = KW * 1000 / 54
 */
export function kwToAmp(kw: number): number {
  if (!Number.isFinite(kw)) return 0;
  return (kw * 1000) / DC_NOMINAL_VOLTAGE;
}

/**
 * Formula: KW = AMP * 54 / 1000
 */
export function ampToKw(amp: number): number {
  if (!Number.isFinite(amp)) return 0;
  return (amp * DC_NOMINAL_VOLTAGE) / 1000;
}

/**
 * Calculate channel DC Load in KW: (Voltage * Amp) / 1000
 */
export function calculateChannelKw(voltage: number, amp: number): number {
  if (!Number.isFinite(voltage) || !Number.isFinite(amp)) return 0;
  return (voltage * amp) / 1000;
}

/**
 * Calculate DCEM Current Reading: Previous Reading + ((Voltage * Amp * 24 * Days) / 1000)
 */
export function calculateDcemCurrentReading(
  previousReading: number,
  voltage: number,
  amp: number,
  days: number
): number {
  const prev = Number.isFinite(previousReading) ? previousReading : 0;
  const v = Number.isFinite(voltage) ? voltage : 0;
  const a = Number.isFinite(amp) ? amp : 0;
  const d = Number.isFinite(days) ? Math.max(0, days) : 0;
  return prev + (v * a * 24 * d) / 1000;
}

/**
 * Parse various date formats like YYYY-MM-DD, MM/DD/YYYY HH:mm, DD-MMM-YY, DD/MM/YYYY
 */
export function parseFlexibleDate(input: string | undefined | null): Date | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // ISO YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const d = new Date(year, month, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // DD-MMM-YY or DD-MMM-YYYY (e.g. 20-Nov-26)
  const monMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const dmmMatch = /^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s]?(\d{2,4})?$/.exec(trimmed);
  if (dmmMatch) {
    const day = Number(dmmMatch[1]);
    const month = monMap[dmmMatch[2].toLowerCase()];
    let year = dmmMatch[3] ? Number(dmmMatch[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (month !== undefined) {
      const d = new Date(year, month, day);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  // MM/DD/YYYY (as seen in Energy_Data_Sheet: "10/20/2026 17:51")
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(trimmed);
  if (slashMatch) {
    const p1 = Number(slashMatch[1]);
    const p2 = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);
    if (year < 100) year += 2000;
    // In US / Google Sheets Submitted Date format: MM/DD/YYYY when p1 <= 12
    const month = p1 <= 12 ? p1 - 1 : p2 - 1;
    const day = p1 <= 12 ? p2 : p1;
    const d = new Date(year, month, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(trimmed);
  if (!Number.isNaN(fallback.getTime())) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
  }
  return null;
}

export function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatSheetDateKey(isoDate: string): string {
  const d = parseFlexibleDate(isoDate);
  if (!d) return isoDate;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = d.getDate();
  const mon = months[d.getMonth()];
  const yr = String(d.getFullYear()).slice(-2);
  return `${day}-${mon}-${yr}`;
}

export function calculateDaysBetween(prevDateStr: string, currDateStr: string): number {
  const d1 = parseFlexibleDate(prevDateStr);
  const d2 = parseFlexibleDate(currDateStr);
  if (!d1 || !d2) return 0;
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.round((utc2 - utc1) / 86400000);
}

export interface EbDateCalculationResult {
  currentReading: number;
  daysElapsed: number;
  perdayUnits: number;
  consumption: number;
  source: 'sheet-column' | 'formula';
  matchedColumnKey?: string;
}

/**
 * Computes date-wise EB Current Reading for a site:
 * 1. Looks for a matching pre-computed date column in the EB sheet (e.g. "24-Nov-26" or "2026-11-24")
 * 2. Otherwise calculates: previousReading + (perdayUnits * daysElapsedFromSubmittedDate)
 */
export function calculateEbDateReading(
  record: EbReadingRecord,
  selectedDateIso: string
): EbDateCalculationResult {
  const perday =
    record.perday && record.perday > 0
      ? record.perday
      : record.dcLoad && record.dcLoad > 0
      ? Math.round(record.dcLoad * 24)
      : 0;

  const submitted = parseFlexibleDate(record.submittedDate);
  const selected = parseFlexibleDate(selectedDateIso);

  let daysElapsed = 0;
  if (submitted && selected) {
    const utcSub = Date.UTC(submitted.getFullYear(), submitted.getMonth(), submitted.getDate());
    const utcSel = Date.UTC(selected.getFullYear(), selected.getMonth(), selected.getDate());
    daysElapsed = Math.max(0, Math.round((utcSel - utcSub) / 86400000));
  } else if (record.dayCount && record.dayCount > 0) {
    daysElapsed = Math.round(record.dayCount);
  }

  // Check exact match in dateReadings map
  const targetKeyShort = formatSheetDateKey(selectedDateIso); // e.g. 24-Nov-26
  const targetKeyPadded = (() => {
    if (!selected) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(selected.getDate()).padStart(2, '0')}-${months[selected.getMonth()]}-${String(selected.getFullYear()).slice(-2)}`;
  })();

  const candidateKeys = [selectedDateIso, targetKeyShort, targetKeyPadded];
  for (const key of candidateKeys) {
    if (key && record.dateReadings && Number.isFinite(record.dateReadings[key])) {
      const val = record.dateReadings[key];
      return {
        currentReading: val,
        daysElapsed,
        perdayUnits: perday,
        consumption: Math.max(0, Math.round(val - record.previousReading)),
        source: 'sheet-column',
        matchedColumnKey: key,
      };
    }
  }

  // Also scan any parsed date key matching same calendar date
  if (selected && record.dateReadings) {
    const targetIso = formatIsoDate(selected);
    for (const [k, v] of Object.entries(record.dateReadings)) {
      const parsedKey = parseFlexibleDate(k);
      if (parsedKey && formatIsoDate(parsedKey) === targetIso && Number.isFinite(v)) {
        return {
          currentReading: v,
          daysElapsed,
          perdayUnits: perday,
          consumption: Math.max(0, Math.round(v - record.previousReading)),
          source: 'sheet-column',
          matchedColumnKey: k,
        };
      }
    }
  }

  const consumption = Math.round(perday * daysElapsed);
  const currentReading = Math.round((record.previousReading || 0) + consumption);

  return {
    currentReading,
    daysElapsed,
    perdayUnits: perday,
    consumption,
    source: 'formula',
  };
}

export function formatNum(val: number, decimals = 2): string {
  if (!Number.isFinite(val)) return '0';
  return val.toLocaleString('en-IN', {
    minimumFractionDigits: decimals === 0 ? 0 : 0,
    maximumFractionDigits: decimals,
  });
}
