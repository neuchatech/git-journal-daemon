#!/usr/bin/env node
import { createWatcher } from './watcher.js';
import { Journaler } from './journaler.js';
// @ts-ignore
import { Command } from 'commander';
// @ts-ignore
import path from 'path';
// @ts-ignore
import process from 'process';
import { startApiServer, type EventQueue } from './api.js';

const program = new Command();
program
  .option('-i, --interval <ms>', 'debounce interval', '4000')
  .option('--ignore <globlist>', 'comma‑separated globs to ignore')
  .option('--api-port <port>', 'base port for the API server', '3000');

program.parse(process.argv);
const opts = program.opts();

const repoDir = process.cwd();
const eventQueue: EventQueue = [];

const journaler = new Journaler({
  dir: repoDir,
  intervalMs: parseInt(opts.interval, 10),
  eventQueue: eventQueue,
});

const ignore = opts.ignore ? opts.ignore.split(',') : [];

async function main() {
  try {
    await startApiServer(eventQueue, parseInt(opts.apiPort, 10));
    console.log('📢 API server started.');
  } catch (error) {
    console.error('💀 Failed to start API server:', error);
    process.exit(1);
  }

  createWatcher(repoDir, ev => journaler.enqueue(ev.path), ignore);
  console.log('👀 Watcher started.');
  console.log('🪄 git‑journal‑daemon running…');
}

main();