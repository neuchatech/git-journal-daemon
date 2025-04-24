import fs from 'fs';
import git from 'isomorphic-git';
import * as path from 'path';
import { nodeForPath } from './node-map.js';

git.plugins.set('fs', fs as unknown as git.FileSystem); // ESM‑friendly injection

export interface JournalerOptions {
  dir: string;
  intervalMs?: number;
  ref?: string;
  author?: { name: string; email: string };
  ignore?: string[];
}

export class Journaler {
  private pending = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private readonly opts: Required<JournalerOptions>;

  constructor(opts: JournalerOptions) {
    this.opts = {
      intervalMs: 4000,
      ref: 'refs/heads/journal',
      author: { name: 'Genie‑bot', email: 'genie@example.com' },
      ignore: [],
      ...opts,
    } as Required<JournalerOptions>;
  }

  enqueue(file: string) {
    this.pending.add(path.relative(this.opts.dir, file));
    this.arm();
  }

  private arm() {
    if (this.timer) return;
    this.timer = setTimeout(async () => {
      this.timer = undefined;
      if (this.pending.size) {
        await this.flush();
      }
    }, this.opts.intervalMs);
  }

  private async flush() {
    const files = [...this.pending];
    this.pending.clear();

    // Stage only deltas
    await Promise.all(files.map(f => git.add({ fs, dir: this.opts.dir, filepath: f })));

    const sha = await git.commit({
      fs,
      dir: this.opts.dir,
      ref: this.opts.ref,
      message: `genie snapshot: ${new Date().toISOString()}`,
      author: this.opts.author,
    });

    // Record node metadata
    const nodes = Array.from(new Set(files.map(nodeForPath).filter(Boolean)));
    if (nodes.length) {
      await git.addNote({
        fs,
        dir: this.opts.dir,
        object: sha,
        ref: 'refs/notes/genie',
        note: JSON.stringify({ nodes }),
      });
    }
  }
}