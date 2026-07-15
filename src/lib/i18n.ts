import fs from 'fs';
import path from 'path';
import { config } from './config';

const cache = new Map<string, Record<string, string>>();

function load(lang: string): Record<string, string> {
  if (cache.has(lang)) return cache.get(lang)!;
  const file = path.join(process.cwd(), 'locales', `${lang}.json`);
  let dict: Record<string, string> = {};
  try {
    dict = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    if (lang !== 'ko') return load('ko');
  }
  cache.set(lang, dict);
  return dict;
}

export function t(key: string, vars?: Record<string, string | number>, lang?: string): string {
  const dict = load(lang || config.language);
  let text = dict[key] ?? load('ko')[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}
