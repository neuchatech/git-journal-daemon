// @ts-ignore
import fs from 'fs';
// @ts-ignore
import git from 'isomorphic-git';
// @ts-ignore
import path from 'path';
import { nodeForPath } from './node-map.js';
import type { EventQueue, ApiEvent } from './api.js';

if ((git as any).plugins?.set) {
  (git as any).plugins.set('fs', fs as any);
}

export interface JournalerOptions {
  dir: string;
  intervalMs?: number;
  ref?: string;
  author?: { name: string; email: string };
  ignore?: string[];
  eventQueue?: EventQueue;
}

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
    const eventQueue = opts.eventQueue || [];
    this.opts = {
      intervalMs: 4000,
      ref: 'refs/heads/journal',
      author: { name: 'Genie‑bot', email: 'genie@example.com' },
      ignore: [],
      ...opts,
      eventQueue,
    } as InternalJournalerOptions;
    this.eventQueue = this.opts.eventQueue;
  }

  enqueue(file: string) {
    this.pendingFileChanges.add(path.relative(this.opts.dir, file));
    this.arm();
  }

  async flushNow() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (this.pendingFileChanges.size > 0 || this.eventQueue.length > 0) {
      await this.flush();
    }
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private arm() {
    if (this.timer) return;
    this.timer = setTimeout(async () => {
      this.timer = undefined;
      if (this.pendingFileChanges.size > 0 || this.eventQueue.length > 0) {
        await this.flush();
      }
    }, this.opts.intervalMs);
  }

  private drainPendingEvents(): ApiEvent[] {
    const eventsToFlush = [...this.eventQueue];
    this.eventQueue.length = 0;
    return eventsToFlush;
  }

  private async flush() {
    const filesToCommit = [...this.pendingFileChanges];
    this.pendingFileChanges.clear();

    const pendingApiEvents = this.drainPendingEvents();

    if (filesToCommit.length === 0 && pendingApiEvents.length > 0) {
      this.eventQueue.push(...pendingApiEvents);
      return;
    }
    
    if (filesToCommit.length === 0) {
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
        oid: sha,
        ref: 'refs/notes/genie',
        note: JSON.stringify(noteData),
        author: this.opts.author,
        force: true,
      });
    }
  }
}
