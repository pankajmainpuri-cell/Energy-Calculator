import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'energy.db');
const SEED_CSV_PATH = path.resolve(process.cwd(), 'public/assets/aistudio/Energy_Data_Sheet_a4617183');

export const DEFAULT_DCEM_COLUMNS = [
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

export const DEFAULT_EB_COLUMNS = [
  'Indus Id',
  'Site Name',
  'पिछली रीडिंग (केवल देखने के लिए)',
  'Area',
  'Technician',
  'Current Reading',
];

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS eb_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      indus_id TEXT NOT NULL,
      site_name TEXT DEFAULT '',
      previous_reading REAL DEFAULT 0,
      area TEXT DEFAULT '',
      technician TEXT DEFAULT '',
      fse TEXT DEFAULT '',
      submitted_date TEXT DEFAULT '',
      status TEXT DEFAULT '',
      eb_meter TEXT DEFAULT '',
      dc_load REAL DEFAULT 0,
      perday REAL DEFAULT 0,
      day_count REAL DEFAULT 0,
      consumption REAL DEFAULT 0,
      reading REAL DEFAULT 0,
      date_readings_json TEXT DEFAULT '{}',
      raw_json TEXT DEFAULT '{}',
      source TEXT DEFAULT 'seed',
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_eb_indus_id ON eb_readings(indus_id);
    CREATE INDEX IF NOT EXISTS idx_eb_site_name ON eb_readings(site_name);

    CREATE TABLE IF NOT EXISTS dcem_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      indus_id TEXT NOT NULL,
      smps_instance TEXT DEFAULT '',
      operator_name TEXT DEFAULT '',
      site_name TEXT DEFAULT '',
      current_date TEXT DEFAULT '',
      previous_date TEXT DEFAULT '',
      days REAL DEFAULT 0,
      voltage REAL DEFAULT 54,
      amp REAL DEFAULT 0,
      previous_reading REAL DEFAULT 0,
      current_reading REAL DEFAULT 0,
      raw_json TEXT DEFAULT '{}',
      row_order INTEGER DEFAULT 0,
      source TEXT DEFAULT 'manual',
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dcem_indus_id ON dcem_readings(indus_id);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  dbInstance = db;
  seedInitialEbDataIfEmpty(db);
  return db;
}

function toNum(val: unknown, fallback = 0): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '').trim();
    if (!cleaned || cleaned === '#N/A' || cleaned === 'N/A' || cleaned === '-') return fallback;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function normalizeHeaderKey(header: string): string {
  return header.replace(/\s+/g, ' ').trim().toLowerCase();
}

function findField(row: Record<string, unknown>, candidates: string[]): unknown {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const normCand = candidate.toLowerCase();
    for (const [k, v] of entries) {
      if (normalizeHeaderKey(k) === normCand) return v;
    }
  }
  for (const candidate of candidates) {
    const normCand = candidate.toLowerCase();
    for (const [k, v] of entries) {
      if (normalizeHeaderKey(k).includes(normCand)) return v;
    }
  }
  return undefined;
}

export function parseEbRowsAndInsert(
  db: Database.Database,
  headers: string[],
  rows: Record<string, unknown>[],
  sourceLabel: string
): number {
  const now = new Date().toISOString();
  const clearStmt = db.prepare('DELETE FROM eb_readings');
  const insertStmt = db.prepare(`
    INSERT INTO eb_readings (
      indus_id, site_name, previous_reading, area, technician, fse,
      submitted_date, status, eb_meter, dc_load, perday, day_count,
      consumption, reading, date_readings_json, raw_json, source, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const setMeta = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');

  let inserted = 0;

  const tx = db.transaction(() => {
    clearStmt.run();
    for (const row of rows) {
      const indusId = toStr(
        findField(row, ['indus id', 'indus_id', 'site id', 'site_id', 'id'])
      );
      if (!indusId) continue;

      const siteName = toStr(findField(row, ['site name', 'site_name', 'site']));
      const previousReading = toNum(
        findField(row, [
          'पिछली रीडिंग',
          'previous reading',
          'prev reading',
          'last reading',
          'kwh reading',
        ]),
        0
      );
      const area = toStr(findField(row, ['area', 'cluster', 'zone']));
      const technician = toStr(findField(row, ['technician', 'tech']));
      const fse = toStr(findField(row, ['fse']));
      const submittedDate = toStr(findField(row, ['submitted date', 'date', 'reading date']));
      const status = toStr(findField(row, ['status']));
      const ebMeter = toStr(findField(row, ['eb meter', 'meter status']));
      const dcLoad = toNum(findField(row, ['dc load', 'load kw', 'kw']), 0);
      const rawPerday = toNum(findField(row, ['perday', 'per day', 'daily']), 0);
      const perday = rawPerday > 0 ? rawPerday : dcLoad > 0 ? Math.round(dcLoad * 24) : 0;
      const dayCount = toNum(findField(row, ['day']), 0);
      const consumption = toNum(findField(row, ['consumption']), 0);
      const reading = toNum(findField(row, ['reading', 'current reading']), previousReading);

      // Extract date-specific projection columns like 20-Nov-26 .. 30-Nov-26 or YYYY-MM-DD
      const dateReadings: Record<string, number> = {};
      const rawClean: Record<string, string> = {};
      for (const [key, val] of Object.entries(row)) {
        const cleanKey = key.replace(/\s+/g, ' ').trim();
        rawClean[cleanKey] = toStr(val);
        if (/^\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(cleanKey)) {
          const numVal = toNum(val, NaN);
          if (Number.isFinite(numVal) && numVal > 0) {
            dateReadings[cleanKey] = numVal;
          }
        }
      }

      insertStmt.run(
        indusId,
        siteName,
        previousReading,
        area,
        technician,
        fse,
        submittedDate,
        status,
        ebMeter,
        dcLoad,
        perday,
        dayCount,
        consumption,
        reading,
        JSON.stringify(dateReadings),
        JSON.stringify(rawClean),
        sourceLabel,
        now
      );
      inserted++;
    }

    setMeta.run('eb_columns', JSON.stringify(headers.map((h) => h.replace(/\s+/g, ' ').trim())));
    setMeta.run('last_eb_sync', now);
    setMeta.run('last_eb_source', sourceLabel);
  });

  tx();
  return inserted;
}

export function parseDcemRowsAndInsert(
  db: Database.Database,
  headers: string[],
  rows: Record<string, unknown>[],
  sourceLabel: string
): number {
  const now = new Date().toISOString();
  const clearStmt = db.prepare('DELETE FROM dcem_readings');
  const insertStmt = db.prepare(`
    INSERT INTO dcem_readings (
      indus_id, smps_instance, operator_name, site_name, current_date,
      previous_date, days, voltage, amp, previous_reading, current_reading,
      raw_json, row_order, source, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const setMeta = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');

  const cleanHeaders = headers
    .map((h) => h.replace(/\s+/g, ' ').trim())
    .filter((h) => h.length > 0);

  let inserted = 0;

  const tx = db.transaction(() => {
    clearStmt.run();
    rows.forEach((row, index) => {
      const indusId = toStr(
        findField(row, ['indus id', 'indus_id', 'site id', 'site_id'])
      );
      if (!indusId) return;

      const smpsInstance = toStr(
        findField(row, ['smps instance', 'smps', 'instance', 'channel'])
      );
      const operatorName = toStr(
        findField(row, ['operator name', 'operator', 'tenant', 'opco'])
      );
      const siteName = toStr(findField(row, ['site name', 'site_name', 'site']));
      const currentDate = toStr(findField(row, ['current date', 'date', 'reading date']));
      const previousDate = toStr(findField(row, ['previous date', 'prev date', 'last date']));
      const days = toNum(findField(row, ['days', 'day']), 0);
      const voltage = toNum(findField(row, ['voltage', 'volt', 'v']), 54);
      const amp = toNum(findField(row, ['amp', 'current', 'amp load', 'load amp']), 0);
      const previousReading = toNum(
        findField(row, ['previous reading', 'prev reading', 'last reading']),
        0
      );
      const currentReading = toNum(
        findField(row, ['current reading', 'reading', 'kwh']),
        0
      );

      const rawClean: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        const cleanK = k.replace(/\s+/g, ' ').trim();
        if (cleanK) rawClean[cleanK] = toStr(v);
      }

      insertStmt.run(
        indusId,
        smpsInstance,
        operatorName,
        siteName,
        currentDate,
        previousDate,
        days,
        voltage,
        amp,
        previousReading,
        currentReading,
        JSON.stringify(rawClean),
        index,
        sourceLabel,
        now
      );
      inserted++;
    });

    setMeta.run(
      'dcem_columns',
      JSON.stringify(cleanHeaders.length > 0 ? cleanHeaders : DEFAULT_DCEM_COLUMNS)
    );
    setMeta.run('last_dcem_sync', now);
    setMeta.run('last_dcem_source', sourceLabel);
  });

  tx();
  return inserted;
}

function seedInitialEbDataIfEmpty(db: Database.Database) {
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM eb_readings').get() as { cnt: number };
  if (countRow.cnt > 0) return;

  if (!fs.existsSync(SEED_CSV_PATH)) {
    return;
  }

  try {
    const csvText = fs.readFileSync(SEED_CSV_PATH, 'utf8');
    const workbook = XLSX.read(csvText, { type: 'string', raw: true });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (matrix.length < 2) return;

    const rawHeaders = (matrix[0] as unknown[]).map((h) => toStr(h));
    // Handle duplicate header names cleanly (like two "Day" columns)
    const uniqueHeaders: string[] = [];
    const seen = new Map<string, number>();
    for (const h of rawHeaders) {
      const clean = h.replace(/\s+/g, ' ').trim() || 'Column';
      const count = seen.get(clean) || 0;
      seen.set(clean, count + 1);
      uniqueHeaders.push(count === 0 ? clean : `${clean}_${count + 1}`);
    }

    const rowObjects: Record<string, unknown>[] = [];
    for (let i = 1; i < matrix.length; i++) {
      const arr = matrix[i] as unknown[];
      if (!arr || arr.every((c) => toStr(c) === '')) continue;
      const obj: Record<string, unknown> = {};
      uniqueHeaders.forEach((header, idx) => {
        obj[header] = arr[idx] ?? '';
      });
      rowObjects.push(obj);
    }

    const count = parseEbRowsAndInsert(db, uniqueHeaders, rowObjects, 'Energy_Data_Sheet (Seed)');
    console.log(`[db] Seeded ${count} EB reading records from Energy_Data_Sheet_a4617183`);
  } catch (err) {
    console.error('[db] Failed to seed EB readings:', err);
  }
}
