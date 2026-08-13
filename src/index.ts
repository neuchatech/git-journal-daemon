#!/usr/bin/env node
import { createWatcher } from './watcher.js';
import { Journaler } from './journaler.js';
// @ts-ignore
import { Command } from 'commander';
// @ts-ignore
import path from 'path';
// @ts-ignore
import process from 'process';
import { startApiServerWithHandle, type ApiServerHandle, type EventQueue } from './api.js';
import { removePortFile, writePortFile } from './port-file.js';

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
let apiServer: ApiServerHandle | undefined;
let shuttingDown = false;

async function main() {
  try {
    apiServer = await startApiServerWithHandle(eventQueue, parseInt(opts.apiPort, 10));
    await writePortFile({
      pid: process.pid,
      port: apiServer.port,
      host: apiServer.host,
      repoPath: repoDir,
    });
    console.log('📢 API server started.');
  } catch (error) {
    console.error('💀 Failed to start API server:', error);
    process.exit(1);
  }

  createWatcher(repoDir, ev => journaler.enqueue(ev.path), ignore);
  console.log('👀 Watcher started.');
  console.log('🪄 git‑journal‑daemon running…');
}

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  journaler.stop();

  try {
    await removePortFile(repoDir);
  } catch (error) {
    console.warn('Failed to remove git-journal-daemon discovery file:', error);
  }

  try {
    await apiServer?.close();
  } catch (error) {
    console.warn('Failed to close git-journal-daemon API server:', error);
  }

  process.exit(signal === 'SIGINT' ? 130 : 143);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('beforeExit', () => {
  void removePortFile(repoDir);
});

main();
