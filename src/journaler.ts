// @ts-ignore
import fs from 'fs';
// @ts-ignore
import git from 'isomorphic-git';
// @ts-ignore
import path from 'path';
import { nodeForPath } from './node-map.js';
import type { EventQueue, ApiEvent } from './api.js';

// @ts-ignore
git.plugins.set('fs', fs as unknown as git.FileSystem); // ESM‑friendly injection

export interface JournalerOptions {
  dir: string;
  intervalMs?: number;
  ref?: string;
  author?: { name: string; email: string };
  ignore?: string[];
  eventQueue?: EventQueue; // Added eventQueue
}

// Make eventQueue non-optional in internal options if it's always provided by index.ts
interface InternalJournalerOptions extends Required<Omit<JournalerOptions, 'eventQueue'>> {
  eventQueue: EventQueue;
}

export class Journaler {
  private pendingFileChanges = new Set<string>();
  // @ts-ignore
  private timer: NodeJS.Timeout | undefined;
  private readonly opts: InternalJournalerOptions;
  private readonly eventQueue: EventQueue;

  constructor(opts: JournalerOptions) {
    // Ensure eventQueue is provided, even if empty, for internal consistency
    const eventQueue = opts.eventQueue || [];
    this.opts = {
      intervalMs: 4000,
      ref: 'refs/heads/journal',
      author: { name: 'Genie‑bot', email: 'genie@example.com' },
      ignore: [],
      ...opts,
      eventQueue, // Ensure eventQueue is part of the spread options
    } as InternalJournalerOptions; // Cast to internal type
    this.eventQueue = this.opts.eventQueue;
  }

  enqueue(file: string) {
    this.pendingFileChanges.add(path.relative(this.opts.dir, file));
    this.arm();
  }

  private arm() {
    if (this.timer) return;
    this.timer = setTimeout(async () => {
      this.timer = undefined;
      // Flush if there are file changes OR pending API events
      if (this.pendingFileChanges.size > 0 || this.eventQueue.length > 0) {
        await this.flush();
      }
    }, this.opts.intervalMs);
  }

  private drainPendingEvents(): ApiEvent[] {
    const eventsToFlush = [...this.eventQueue];
    this.eventQueue.length = 0; // Clear the queue
    return eventsToFlush;
  }

  private async flush() {
    const filesToCommit = [...this.pendingFileChanges];
    this.pendingFileChanges.clear();

    const pendingApiEvents = this.drainPendingEvents();

    // Only proceed with commit if there are file changes.
    // If only API events occurred, they will be attached to the *next* file change commit.
    // This behavior can be adjusted if API events should trigger their own commits.
    if (filesToCommit.length === 0 && pendingApiEvents.length > 0) {
      // Re-queue API events if no file changes to attach them to.
      // Or, decide if API events alone should create a "metadata-only" commit.
      // For now, re-queueing to attach to next actual file change commit.
      this.eventQueue.push(...pendingApiEvents);
      this.arm(); // Re-arm timer in case more file changes or API events come in
      return;
    }
    
    if (filesToCommit.length === 0) { // No file changes and no API events (already handled above)
        this.arm(); // Still re-arm in case watcher missed something or for future API events
        return;
    }


    // Stage only deltas
    await Promise.all(filesToCommit.map(f => git.add({ fs, dir: this.opts.dir, filepath: f })));

    const commitMessage = `genie snapshot: ${new Date().toISOString()}${pendingApiEvents.length > 0 ? ` (includes ${pendingApiEvents.length} API events)` : ''}`;

    const sha = await git.commit({
      fs,
      dir: this.opts.dir,
      ref: this.opts.ref,
      message: commitMessage,
      author: this.opts.author,
    });

    // Prepare note data
    const noteData: { nodes?: string[]; events?: ApiEvent[] } = {};
    const mappedNodes = Array.from(new Set(filesToCommit.map(nodeForPath)));
    const validNodes = mappedNodes.filter(Boolean) as string[]; // Explicitly filter and cast

    if (validNodes.length > 0) {
      noteData.nodes = validNodes;
    }
    if (pendingApiEvents.length > 0) {
      noteData.events = pendingApiEvents;
    }

    if (Object.keys(noteData).length > 0) {
      await git.addNote({
        fs,
        dir: this.opts.dir,
        object: sha,
        ref: 'refs/notes/genie',
        note: JSON.stringify(noteData),
        force: true, // Allow overwriting if a note for this SHA somehow already exists
      });
    }
    this.arm(); // Re-arm the timer for subsequent changes/events
  }
}