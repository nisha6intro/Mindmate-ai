#!/usr/bin/env node
/**
 * Safely import a legacy MindMate Python/Streamlit project.
 *
 *   npm run import:legacy -- --from "E:\path\to\mindmate_ai"
 *
 * - Copies original source/data into data/legacy for provenance.
 * - Merges chat logs, moods, reminders and memories into the working data.
 * - Never deletes or mutates the source folder.
 */
import path from 'node:path';
import { importLegacy } from '../server/services/migrationService.js';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

const source = arg('--from') || process.env.LEGACY_DIR;

if (!source) {
  console.error('Usage: npm run import:legacy -- --from "path/to/mindmate_ai"');
  process.exit(1);
}

const copySource = !process.argv.includes('--no-copy');
const includeMemory = !process.argv.includes('--no-memory');
const resetKnowledge = process.argv.includes('--reset-knowledge');

try {
  const report = await importLegacy(path.resolve(source), { copySource, includeMemory, resetKnowledge });
  console.log('\nMindMate AI legacy import complete\n');
  console.log(`  Source:          ${report.source}`);
  console.log(`  Files preserved: ${report.preserved.files}`);
  console.log(`  Knowledge docs:  ${report.knowledge.documents}`);
  console.log(`  Chat logs:       ${report.chats?.conversations ?? 0} conversation(s), ${report.chats?.messages ?? 0} messages`);
  console.log(`  Mood rows added: ${report.mood?.added ?? 0}${report.mood?.copied ? ' (file copied)' : ''}`);
  console.log(`  Reminders added: ${report.reminders?.added ?? 0}${report.reminders?.copied ? ' (file copied)' : ''}`);
  console.log(`  Memories added:  ${report.memory?.imported ?? 0}`);
  if (report.warnings.length) {
    console.log('\n  Warnings:');
    for (const warning of report.warnings) console.log(`   - ${warning}`);
  }
  console.log('\nOriginal files were not modified. A report is stored in data/legacy/import-report.json.\n');
} catch (error) {
  console.error('Import failed:', error.message);
  process.exit(1);
}
