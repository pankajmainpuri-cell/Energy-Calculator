import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  getDb,
  DEFAULT_DCEM_COLUMNS,
  DEFAULT_EB_COLUMNS,
  parseEbRowsAndInsert,
  parseDcemRowsAndInsert,
} from './server/db';

const PORT = 3000;
const SPREADSHEET_ID_REGEX = /^[a-zA-Z0-9_-]{10,120}$/;

function parseJsonSafe<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

function mapEbRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    indusId: String(row.indus_id || ''),
    siteName: String(row.site_name || ''),
    previousReading: Number(row.previous_reading || 0),
    area: String(row.area || ''),
    technician: String(row.technician || ''),
    fse: String(row.fse || ''),
    submittedDate: String(row.submitted_date || ''),
    status: String(row.status || ''),
    ebMeter: String(row.eb_meter || ''),
    dcLoad: Number(row.dc_load || 0),
    perday: Number(row.perday || 0),
    dayCount: Number(row.day_count || 0),
    consumption: Number(row.consumption || 0),
    reading: Number(row.reading || 0),
    dateReadings: parseJsonSafe<Record<string, number>>(row.date_readings_json as string, {}),
    raw: parseJsonSafe<Record<string, string>>(row.raw_json as string, {}),
    source: String(row.source || 'seed'),
    updatedAt: String(row.updated_at || ''),
  };
}

function mapDcemRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    indusId: String(row.indus_id || ''),
    smpsInstance: String(row.smps_instance || ''),
    operatorName: String(row.operator_name || ''),
    siteName: String(row.site_name || ''),
    currentDate: String(row.current_date || ''),
    previousDate: String(row.previous_date || ''),
    days: Number(row.days || 0),
    voltage: Number(row.voltage ?? 54),
    amp: Number(row.amp || 0),
    previousReading: Number(row.previous_reading || 0),
    currentReading: Number(row.current_reading || 0),
    raw: parseJsonSafe<Record<string, string>>(row.raw_json as string, {}),
    rowOrder: Number(row.row_order || 0),
    source: String(row.source || 'manual'),
    updatedAt: String(row.updated_at || ''),
  };
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 10 ? token : null;
}

async function startServer() {
  const db = getDb();
  const app = express();

  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/meta', (_req: Request, res: Response) => {
    const ebCount = (db.prepare('SELECT COUNT(*) as cnt FROM eb_readings').get() as { cnt: number }).cnt;
    const dcemCount = (db.prepare('SELECT COUNT(*) as cnt FROM dcem_readings').get() as { cnt: number }).cnt;
    const getSetting = (k: string): string | null => {
      const r = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(k) as { value: string } | undefined;
      return r ? r.value : null;
    };

    res.json({
      ebCount,
      dcemCount,
      dcemColumns: parseJsonSafe<string[]>(getSetting('dcem_columns'), DEFAULT_DCEM_COLUMNS),
      ebColumns: parseJsonSafe<string[]>(getSetting('eb_columns'), DEFAULT_EB_COLUMNS),
      lastEbSync: getSetting('last_eb_sync'),
      lastDcemSync: getSetting('last_dcem_sync'),
      lastEbSource: getSetting('last_eb_source'),
      lastDcemSource: getSetting('last_dcem_source'),
    });
  });

  app.get('/api/indus-ids', (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 40;
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 40, 1), 200);
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'all';

    const likePattern = `%${q}%`;
    const map = new Map<string, { indusId: string; siteName: string; area: string; source: 'eb' | 'dcem' | 'both' }>();

    if (scope === 'all' || scope === 'dcem') {
      const dcemRows = q
        ? (db
            .prepare(
              `SELECT DISTINCT indus_id, site_name FROM dcem_readings
               WHERE indus_id LIKE ? OR site_name LIKE ?
               ORDER BY indus_id ASC LIMIT ?`
            )
            .all(likePattern, likePattern, limit) as { indus_id: string; site_name: string }[])
        : (db
            .prepare(
              `SELECT DISTINCT indus_id, site_name FROM dcem_readings
               ORDER BY indus_id ASC LIMIT ?`
            )
            .all(limit) as { indus_id: string; site_name: string }[]);

      for (const r of dcemRows) {
        map.set(r.indus_id, {
          indusId: r.indus_id,
          siteName: r.site_name || '',
          area: '',
          source: 'dcem',
        });
      }
    }

    if (scope === 'all' || scope === 'eb') {
      const ebRows = q
        ? (db
            .prepare(
              `SELECT indus_id, site_name, area FROM eb_readings
               WHERE indus_id LIKE ? OR site_name LIKE ? OR area LIKE ?
               GROUP BY indus_id
               ORDER BY indus_id ASC LIMIT ?`
            )
            .all(likePattern, likePattern, likePattern, limit) as {
            indus_id: string;
            site_name: string;
            area: string;
          }[])
        : (db
            .prepare(
              `SELECT indus_id, site_name, area FROM eb_readings
               GROUP BY indus_id
               ORDER BY id ASC LIMIT ?`
            )
            .all(limit) as { indus_id: string; site_name: string; area: string }[]);

      for (const r of ebRows) {
        const existing = map.get(r.indus_id);
        if (existing) {
          existing.source = 'both';
          if (!existing.siteName) existing.siteName = r.site_name || '';
          existing.area = r.area || '';
        } else {
          map.set(r.indus_id, {
            indusId: r.indus_id,
            siteName: r.site_name || '',
            area: r.area || '',
            source: 'eb',
          });
        }
      }
    }

    res.json({ items: Array.from(map.values()).slice(0, limit) });
  });

  app.get('/api/eb-readings', (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 500);

    const rows = q
      ? (db
          .prepare(
            `SELECT * FROM eb_readings
             WHERE indus_id LIKE ? OR site_name LIKE ? OR area LIKE ? OR technician LIKE ?
             ORDER BY id ASC LIMIT ?`
          )
          .all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit) as Record<string, unknown>[])
      : (db.prepare(`SELECT * FROM eb_readings ORDER BY id ASC LIMIT ?`).all(limit) as Record<string, unknown>[]);

    res.json({ rows: rows.map(mapEbRow) });
  });

  app.get('/api/eb-readings/:indusId', (req: Request, res: Response) => {
    const indusId = String(req.params.indusId || '').trim();
    if (!indusId) {
      return res.status(400).json({ error: 'Indus ID is required' });
    }

    let rows = db
      .prepare('SELECT * FROM eb_readings WHERE LOWER(indus_id) = LOWER(?) ORDER BY id ASC')
      .all(indusId) as Record<string, unknown>[];

    if (rows.length === 0) {
      rows = db
        .prepare('SELECT * FROM eb_readings WHERE indus_id LIKE ? OR site_name LIKE ? ORDER BY id ASC LIMIT 25')
        .all(`%${indusId}%`, `%${indusId}%`) as Record<string, unknown>[];
    }

    res.json({ rows: rows.map(mapEbRow) });
  });

  app.get('/api/dcem-readings', (req: Request, res: Response) => {
    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500);
    const rows = db
      .prepare('SELECT * FROM dcem_readings ORDER BY row_order ASC, id ASC LIMIT ?')
      .all(limit) as Record<string, unknown>[];

    const colSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'dcem_columns'").get() as
      | { value: string }
      | undefined;

    res.json({
      columns: parseJsonSafe<string[]>(colSetting?.value, DEFAULT_DCEM_COLUMNS),
      rows: rows.map(mapDcemRow),
    });
  });

  app.get('/api/dcem-readings/:indusId', (req: Request, res: Response) => {
    const indusId = String(req.params.indusId || '').trim();
    if (!indusId) {
      return res.status(400).json({ error: 'Indus ID is required' });
    }

    let rows = db
      .prepare('SELECT * FROM dcem_readings WHERE LOWER(indus_id) = LOWER(?) ORDER BY row_order ASC, id ASC')
      .all(indusId) as Record<string, unknown>[];

    if (rows.length === 0) {
      rows = db
        .prepare('SELECT * FROM dcem_readings WHERE indus_id LIKE ? ORDER BY row_order ASC, id ASC LIMIT 50')
        .all(`%${indusId}%`) as Record<string, unknown>[];
    }

    const ebSite = db
      .prepare('SELECT * FROM eb_readings WHERE LOWER(indus_id) = LOWER(?) LIMIT 1')
      .get(indusId) as Record<string, unknown> | undefined;

    const colSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'dcem_columns'").get() as
      | { value: string }
      | undefined;

    res.json({
      columns: parseJsonSafe<string[]>(colSetting?.value, DEFAULT_DCEM_COLUMNS),
      rows: rows.map(mapDcemRow),
      ebSite: ebSite ? mapEbRow(ebSite) : null,
    });
  });

  app.put('/api/dcem-readings/sync', (req: Request, res: Response) => {
    const body = req.body as {
      indusId?: unknown;
      channels?: unknown;
    };
    const indusId = typeof body?.indusId === 'string' ? body.indusId.trim() : '';
    const channelsList = Array.isArray(body?.channels) ? body.channels : null;
    if (!indusId || !channelsList) {
      return res.status(400).json({ error: 'Valid indusId and channels array are required' });
    }

    const now = new Date().toISOString();
    const deleteStmt = db.prepare('DELETE FROM dcem_readings WHERE LOWER(indus_id) = LOWER(?)');
    const insertStmt = db.prepare(`
      INSERT INTO dcem_readings (
        indus_id, smps_instance, operator_name, site_name, current_date,
        previous_date, days, voltage, amp, previous_reading, current_reading,
        raw_json, row_order, source, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const savedRows: Record<string, unknown>[] = [];
    const tx = db.transaction(() => {
      deleteStmt.run(indusId);
      channelsList.forEach((ch: unknown, idx: number) => {
        if (!ch || typeof ch !== 'object') return;
        const c = ch as Record<string, unknown>;
        const smpsInstance = String(c.smpsInstance ?? '').trim();
        const operatorName = String(c.operatorName ?? '').trim();
        const siteName = String(c.siteName ?? '').trim();
        const currentDate = String(c.currentDate ?? '').trim();
        const previousDate = String(c.previousDate ?? '').trim();
        const days = Number.isFinite(Number(c.days)) ? Number(c.days) : 0;
        const voltage = Number.isFinite(Number(c.voltage)) ? Number(c.voltage) : 54;
        const amp = Number.isFinite(Number(c.amp)) ? Number(c.amp) : 0;
        const previousReading = Number.isFinite(Number(c.previousReading)) ? Number(c.previousReading) : 0;
        const currentReading = Number.isFinite(Number(c.currentReading)) ? Number(c.currentReading) : 0;

        const rawObj: Record<string, string> = {
          ...(typeof c.raw === 'object' && c.raw !== null ? (c.raw as Record<string, string>) : {}),
          'Indus ID': indusId,
          'SMPS Instance': smpsInstance,
          'Operator Name': operatorName,
          'Site Name': siteName,
          'Current date': currentDate,
          'Previous Date': previousDate,
          Days: String(days),
          Voltage: String(voltage),
          Amp: String(amp),
          'Previous Reading': String(previousReading),
          'Current Reading': String(Number(currentReading.toFixed(2))),
        };

        const info = insertStmt.run(
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
          JSON.stringify(rawObj),
          idx,
          'manual-sync',
          now
        );
        savedRows.push({
          id: info.lastInsertRowid,
          indus_id: indusId,
          smps_instance: smpsInstance,
          operator_name: operatorName,
          site_name: siteName,
          current_date: currentDate,
          previous_date: previousDate,
          days,
          voltage,
          amp,
          previous_reading: previousReading,
          current_reading: currentReading,
          raw_json: JSON.stringify(rawObj),
          row_order: idx,
          source: 'manual-sync',
          updated_at: now,
        });
      });
    });

    tx();
    res.json({ ok: true, count: savedRows.length, rows: savedRows.map(mapDcemRow) });
  });

  app.post('/api/upload/sheet', (req: Request, res: Response) => {
    const body = req.body as {
      target?: unknown;
      sheetName?: unknown;
      headers?: unknown;
      rows?: unknown;
    };

    const target = body?.target === 'eb' || body?.target === 'dcem' ? body.target : null;
    if (!target) {
      return res.status(400).json({ error: 'Target must be "eb" or "dcem"' });
    }
    if (!Array.isArray(body?.headers) || !Array.isArray(body?.rows)) {
      return res.status(400).json({ error: 'Headers and rows arrays are required' });
    }
    if (body.rows.length > 25000) {
      return res.status(400).json({ error: 'Row count exceeds limit (25,000 rows max)' });
    }

    const headers = body.headers.map((h) => String(h ?? '').trim()).filter(Boolean);
    const rows = body.rows.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null);
    const sourceLabel = typeof body.sheetName === 'string' && body.sheetName.trim()
      ? `Upload: ${body.sheetName.trim().slice(0, 80)}`
      : 'Excel Upload';

    const count =
      target === 'eb'
        ? parseEbRowsAndInsert(db, headers, rows, sourceLabel)
        : parseDcemRowsAndInsert(db, headers, rows, sourceLabel);

    res.json({ ok: true, target, count, headers });
  });

  app.get('/api/google/spreadsheets', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Google access token required' });
    }

    try {
      const params = new URLSearchParams({
        q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        fields: 'files(id,name,modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: '30',
      });
      const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!driveRes.ok) {
        const status = driveRes.status;
        return res.status(status).json({
          error: status === 401 ? 'Google session expired. Please sign in again.' : 'Failed to list Google Drive spreadsheets',
        });
      }
      const data = (await driveRes.json()) as { files?: unknown[] };
      res.json({ files: data.files || [] });
    } catch {
      res.status(502).json({ error: 'Unable to reach Google Drive service' });
    }
  });

  app.get('/api/google/spreadsheets/:spreadsheetId', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Google access token required' });
    }
    const spreadsheetId = String(req.params.spreadsheetId || '').trim();
    if (!SPREADSHEET_ID_REGEX.test(spreadsheetId)) {
      return res.status(400).json({ error: 'Invalid Google Spreadsheet ID format' });
    }

    try {
      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!metaRes.ok) {
        const status = metaRes.status;
        return res.status(status).json({
          error: status === 401 ? 'Google session expired. Please sign in again.' : 'Failed to read spreadsheet tabs',
        });
      }
      const data = (await metaRes.json()) as {
        spreadsheetId: string;
        properties?: { title?: string };
        sheets?: Array<{ properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number } } }>;
      };

      const tabs = (data.sheets || []).map((s) => ({
        sheetId: s.properties?.sheetId ?? 0,
        title: s.properties?.title ?? 'Sheet1',
        rowCount: s.properties?.gridProperties?.rowCount ?? 0,
      }));

      res.json({
        spreadsheetId: data.spreadsheetId,
        title: data.properties?.title || 'Spreadsheet',
        tabs,
      });
    } catch {
      res.status(502).json({ error: 'Unable to reach Google Sheets service' });
    }
  });

  app.post('/api/google/sync-sheet', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Google access token required' });
    }

    const body = req.body as {
      spreadsheetId?: unknown;
      sheetTitle?: unknown;
      target?: unknown;
    };

    const spreadsheetId = typeof body?.spreadsheetId === 'string' ? body.spreadsheetId.trim() : '';
    const sheetTitle = typeof body?.sheetTitle === 'string' ? body.sheetTitle.trim() : '';
    const target = body?.target === 'eb' || body?.target === 'dcem' ? body.target : null;

    if (!SPREADSHEET_ID_REGEX.test(spreadsheetId)) {
      return res.status(400).json({ error: 'Invalid Google Spreadsheet ID format' });
    }
    if (!sheetTitle || sheetTitle.length > 150) {
      return res.status(400).json({ error: 'Valid sheet tab name is required' });
    }
    if (!target) {
      return res.status(400).json({ error: 'Target must be "eb" or "dcem"' });
    }

    try {
      const escapedRange = `'${sheetTitle.replace(/'/g, "''")}'!A1:ZZ20000`;
      const sheetRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(escapedRange)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!sheetRes.ok) {
        const status = sheetRes.status;
        return res.status(status).json({
          error: status === 401 ? 'Google session expired. Please sign in again.' : 'Failed to fetch sheet values',
        });
      }

      const payload = (await sheetRes.json()) as { values?: unknown[][] };
      const values = payload.values || [];
      if (values.length < 2) {
        return res.status(400).json({ error: `Tab "${sheetTitle}" has fewer than 2 rows` });
      }

      const rawHeaders = (values[0] || []).map((h) => String(h ?? '').replace(/\s+/g, ' ').trim());
      const uniqueHeaders: string[] = [];
      const seen = new Map<string, number>();
      for (const h of rawHeaders) {
        const label =
          !h || h === '__proto__' || h === 'constructor' || h === 'prototype'
            ? `Column_${uniqueHeaders.length + 1}`
            : h;
        const c = seen.get(label) || 0;
        seen.set(label, c + 1);
        uniqueHeaders.push(c === 0 ? label : `${label}_${c + 1}`);
      }

      const rows: Record<string, unknown>[] = [];
      for (let i = 1; i < values.length; i++) {
        const arr = values[i] || [];
        if (arr.every((cell) => String(cell ?? '').trim() === '')) continue;
        const obj: Record<string, unknown> = {};
        uniqueHeaders.forEach((h, idx) => {
          obj[h] = arr[idx] ?? '';
        });
        rows.push(obj);
      }

      const sourceLabel = `Google Sheet: ${sheetTitle}`;
      const count =
        target === 'eb'
          ? parseEbRowsAndInsert(db, uniqueHeaders, rows, sourceLabel)
          : parseDcemRowsAndInsert(db, uniqueHeaders, rows, sourceLabel);

      res.json({ ok: true, target, count, headers: uniqueHeaders });
    } catch {
      res.status(502).json({ error: 'Unable to sync sheet from Google Sheets' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Energy Calculator server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
