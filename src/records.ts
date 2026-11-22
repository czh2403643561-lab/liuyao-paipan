import { calendarBranches, dayVoids, type ChartCalendar } from './domain';

export const resultLabels = { pending: '待验', verified: '应验', unverified: '未应验' } as const;
export type ResultStatus = keyof typeof resultLabels;
export const methodLabels = { book: '书页', coins: '硬币', pick: '选卦', image: '图片取卦', instant: '即时排盘' } as const;
export type Method = keyof typeof methodLabels;
export const verdictTitles = ['我的断语', '断语二', '断语三', '断语四'];
export type VerdictSection = { title: string; content: string; verified: boolean; savedAt?: number };
export type RecordEntry = {
  id: string;
  time: string;
  question: string;
  method: Method;
  lines: { yang: boolean; moving: boolean }[];
  original: string;
  transformed: string | null;
  favorite: boolean;
  createdAt?: string;
  judgment?: string;
  result?: ResultStatus;
  verdictSections?: VerdictSection[];
  verdictSavedAt?: number;
  calendar?: ChartCalendar;
  image?: string;
  imageNote?: string;
};

const key = 'liuyao.records.v1';

export function verdictSectionsFor(item: RecordEntry): VerdictSection[] {
  return item.verdictSections ?? verdictTitles.map((title, index) => ({
    title, content: index === 0 ? item.judgment ?? '' : '', verified: index === 0 && item.result === 'verified',
  }));
}

function validRecordTime(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(value + 'Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
}

function isRecord(value: unknown): value is RecordEntry {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as RecordEntry;
  return typeof item.id === 'string' && validRecordTime(item.time) &&
    typeof item.question === 'string' && typeof item.original === 'string' &&
    (item.transformed === null || typeof item.transformed === 'string') &&
    typeof item.method === 'string' && Object.hasOwn(methodLabels, item.method) && typeof item.favorite === 'boolean' &&
    (item.createdAt === undefined || typeof item.createdAt === 'string') &&
    (item.judgment === undefined || typeof item.judgment === 'string') &&
    (item.result === undefined || isResultStatus(item.result)) &&
    (item.verdictSections === undefined || (Array.isArray(item.verdictSections) && item.verdictSections.length === 4 &&
      Array.from(item.verdictSections).every(section => section && typeof section.title === 'string' && section.title.trim() &&
        [...section.title].length <= 8 && typeof section.content === 'string' && typeof section.verified === 'boolean' &&
        (section.savedAt === undefined || (typeof section.savedAt === 'number' && Number.isFinite(new Date(section.savedAt).getTime())))))) &&
    (item.verdictSavedAt === undefined || (typeof item.verdictSavedAt === 'number' && Number.isFinite(new Date(item.verdictSavedAt).getTime()))) &&
    (item.image === undefined || (item.method === 'image' && typeof item.image === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(item.image))) &&
    (item.imageNote === undefined || (item.method === 'image' && typeof item.imageNote === 'string' && [...item.imageNote].length <= 60)) &&
    (item.calendar === undefined || (item.method === 'pick' && item.calendar &&
      (item.calendar.mode === 'current' || item.calendar.mode === 'custom') &&
      calendarBranches.includes(item.calendar.monthBranch) && Boolean(dayVoids(item.calendar.dayStem, item.calendar.dayBranch)))) &&
    Array.isArray(item.lines) && item.lines.length === 6 &&
    item.lines.every(line => line && typeof line.yang === 'boolean' && typeof line.moving === 'boolean');
}

export function recordTitle(item: RecordEntry): string {
  if (item.method !== 'image') return item.question || '未填写所问何事';
  const first = (item.imageNote ?? '').trim().split(/[，。；、：！？,.;:!?]/, 1)[0];
  return [...first].slice(0, 20).join('') || '未填写取象笔记';
}

export function isResultStatus(value: unknown): value is ResultStatus {
  return typeof value === 'string' && Object.hasOwn(resultLabels, value);
}

export function makeBackup(records: RecordEntry[]): string {
  return JSON.stringify({ kind: 'liuyao.records', version: 1, records: records.map(withVerdictSections) }, null, 2);
}

function withVerdictSections(item: RecordEntry): RecordEntry {
  const verdictSections = verdictSectionsFor(item);
  const first = verdictSections[0];
  return { ...item, verdictSections,
    judgment: item.judgment ?? (first.content || undefined),
    result: item.result ?? (first.verified ? 'verified' : undefined),
  };
}

export function restoreBackup(source: string, current: RecordEntry[]) {
  const backup = JSON.parse(source);
  if (backup?.kind !== 'liuyao.records' || backup.version !== 1 ||
      !Array.isArray(backup.records) || !backup.records.every(isRecord)) {
    throw new Error('备份格式无效');
  }
  const ids = new Set(current.map(item => item.id));
  const added: RecordEntry[] = [];
  for (const item of backup.records as RecordEntry[]) {
    if (ids.has(item.id)) continue;
    ids.add(item.id);
    added.push(withVerdictSections(item));
  }
  return { records: [...current, ...added], added: added.length, skipped: backup.records.length - added.length };
}

export function readRecords(): RecordEntry[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(saved) ? saved.filter(isRecord).map(withVerdictSections) : [];
  } catch {
    return [];
  }
}

export function writeRecords(records: RecordEntry[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}
