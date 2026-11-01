import fs from 'node:fs/promises';
import path from 'node:path';

/** Minimal RFC-4180-ish CSV parser (handles quoted fields and embedded newlines). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => String(value).trim() !== ''));
}

export function csvEscape(value) {
  const string = String(value ?? '');
  if (/[",\r\n]/.test(string)) return `"${string.replace(/"/g, '""')}"`;
  return string;
}

let appendQueue = Promise.resolve();

export async function appendCsv(file, values) {
  const line = `${values.map(csvEscape).join(',')}\n`;
  appendQueue = appendQueue.then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    try {
      await fs.access(file);
    } catch {
      await fs.writeFile(file, 'timestamp,mood\n', 'utf8');
    }
    await fs.appendFile(file, line, 'utf8');
  });
  return appendQueue;
}

export async function writeCsv(file, header, rows) {
  const text = [header.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${text}\n`, 'utf8');
}
