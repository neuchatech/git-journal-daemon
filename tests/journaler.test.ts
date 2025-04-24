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