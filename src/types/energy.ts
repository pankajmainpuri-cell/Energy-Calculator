export interface EbReadingRecord {
  id?: number;
  indusId: string;
  siteName: string;
  previousReading: number;
  area: string;
  technician: string;
  fse?: string;
  submittedDate: string;
  status?: string;
  ebMeter?: string;
  dcLoad: number;
  perday: number;
  dayCount?: number;
  consumption?: number;
  reading?: number;
  dateReadings: Record<string, number>;
  raw?: Record<string, string>;
  source?: string;
  updatedAt?: string;
}

export interface DcemReadingRecord {
  id?: number;
  indusId: string;
  smpsInstance: string;
  operatorName: string;
  siteName: string;
  currentDate: string;
  previousDate: string;
  days: number;
  voltage: number;
  amp: number;
  previousReading: number;
  currentReading: number;
  raw?: Record<string, string>;
  rowOrder?: number;
  source?: string;
  updatedAt?: string;
}

export interface IndusSuggestion {
  indusId: string;
  siteName: string;
  area?: string;
  source: 'eb' | 'dcem' | 'both';
}

export interface AppMetaInfo {
  ebCount: number;
  dcemCount: number;
  dcemColumns: string[];
  ebColumns: string[];
  lastEbSync: string | null;
  lastDcemSync: string | null;
  lastEbSource: string | null;
  lastDcemSource: string | null;
}

export interface GoogleDriveSpreadsheet {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface GoogleSheetTab {
  sheetId: number;
  title: string;
  rowCount?: number;
}
