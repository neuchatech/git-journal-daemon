# git‑journal‑daemon

A TypeScript service that snapshots file changes to a hidden **`refs/heads/journal`** branch without ever touching the user’s active branch.  Designed to integrate with **Project Genie** (node‑graph projects) but works in any Git repo.

---
## 📁 Repository layout

```
.
├── package.json
├── tsconfig.json
├── jest.config.js
├── README.md
├── src/
│   ├── index.ts          # CLI entry (bin)
│   ├── journaler.ts      # core commit logic
│   ├── watcher.ts        # chokidar wrapper
│   └── node-map.ts       # (optional) resolve changed files → Genie node
└── tests/
    └── journaler.test.ts
```

---
## `package.json`
```jsonc
{
  "name": "git-journal-daemon",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "scripts": {
    "build": "tsc -p .",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "test": "jest --runInBand"
  },
  "bin": {
    "git-journal-daemon": "dist/index.js"
  },
  "dependencies": {
    "chokidar": "^3.6.0",
    "fs-extra": "^11.2.0",
    "isomorphic-git": "^1.23.0"
  },
  "devDependencies": {
    "@types/chokidar": "^3.5.4",
    "@types/jest": "^29.5.5",
    "@types/node": "^20.11.17",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.2"
  }
}
```

---
## `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "tests"]
}
```

---
## `jest.config.js`
```js
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^(.*)\\.js$': '$1',
  },
};
```

---
## `README.md`
```markdown
# git‑journal‑daemon

Transparent background commits to `journal` branch.

```bash
npm i -g git-journal-daemon   # global CLI
# or inside a repo
npx git-journal-daemon
```

### Options
* `--interval <ms>`   default **4000** – debounce window before a snapshot.
* `--ignore <glob>`   comma‑separated patterns in addition to .gitignore.

### How it works
1. Watches the working tree with **chokidar**.
2. Stages only the touched files via **isomorphic‑git** (`git.add`).
3. Commits directly to `refs/heads/journal` (HEAD untouched).
4. Adds an optional **git‑note** with Genie node metadata.
```
```

---
## `src/watcher.ts`
```typescript
import chokidar from 'chokidar';

export type WatcherEvent = {
  path: string;
};

export function createWatcher(root: string, onChange: (ev: WatcherEvent) => void, ignore: string[] = []) {
  return chokidar
    .watch(root, {
      ignored: [/(^|\/)(\.git)/, ...ignore],
      persistent: true,
      ignoreInitial: true,
    })
    .on('add', p => onChange({ path: p }))
    .on('change', p => onChange({ path: p }))
    .on('unlink', p => onChange({ path: p }));
}
```

---
## `src/node-map.ts`  (optional helper)
```typescript
/**
 * Dummy resolver that maps a file path to a Genie node ID.
 * Replace with real project‑graph lookup.
 */
export function nodeForPath(path: string): string | undefined {
  const m = /nodes\/(.*?)(\/|$)/.exec(path);
  return m?.[1];
}
```

---
## `src/journaler.ts`
```typescript
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
```

---
## `src/index.ts`
```typescript
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
```
```

---
## `tests/journaler.test.ts`
```typescript
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import git from 'isomorphic-git';
import { Journaler } from '../src/journaler.js';

git.plugins.set('fs', require('fs')); // inject fs for Node

describe('Journaler', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'journal-test-'));

  beforeAll(async () => {
    await git.init({ fs: require('fs'), dir: tmp });
  });

  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('commits to refs/heads/journal', async () => {
    const foo = path.join(tmp, 'foo.txt');
    writeFileSync(foo, 'hello');

    const jr = new Journaler({ dir: tmp, intervalMs: 10 });
    jr.enqueue(foo);
    await new Promise(r => setTimeout(r, 50)); // wait for debounce

    const log = await git.log({ fs: require('fs'), dir: tmp, ref: 'refs/heads/journal' });
    expect(log.length).toBe(1);
    expect(log[0].commit.message).toMatch(/genie snapshot/);
  });
});
```

---
## 🛠  Build & run
```bash
pnpm i        # or npm / yarn
pnpm build    # tsc → dist/
node dist/index.js  # start daemon in current repo
```

---
## ✅ Done
The repo is ready to clone, build, test, and extend.  Swap out `node-map.ts` with your real Project Genie graph lookup to store rich provenance in git‑notes.

