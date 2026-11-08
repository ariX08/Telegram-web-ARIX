#!/usr/bin/env node
/**
 * One-shot rebrand: replace every "Telegram" with "KuchuGRAM" in src/lang.ts
 * Run: node scripts/rebrand-kuchugram.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const langPath = resolve(root, 'src/lang.ts');

let s = readFileSync(langPath, 'utf8');
const before = (s.match(/Telegram/g) || []).length;
s = s.replace(/Telegram's/g, "KuchuGRAM's").replace(/Telegram/g, 'KuchuGRAM');
const after = (s.match(/Telegram/g) || []).length;
writeFileSync(langPath, s);
console.log(`Replaced ${before} occurrences of Telegram. Remaining: ${after}`);
console.log('Done. Commit src/lang.ts and push.');
