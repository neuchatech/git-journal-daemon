#!/usr/bin/env node
import { createWatcher } from './watcher.js';
import { Journaler } from './journaler.js';
import { Command } from 'commander';
import path from 'path';
import process from 'process';

const program = new Command();
program
  .option('-i, --interval <ms>', 'debounce interval', '4000')
  .option('--ignore <globlist>', 'comma‑separated globs to ignore');

program.parse(process.argv);
const opts = program.opts();

const repoDir = process.cwd();
const journaler = new Journaler({
  dir: repoDir,
  intervalMs: parseInt(opts.interval, 10),
});

const ignore = opts.ignore ? opts.ignore.split(',') : [];
createWatcher(repoDir, ev => journaler.enqueue(ev.path), ignore);

console.log('🪄 git‑journal‑daemon running…');