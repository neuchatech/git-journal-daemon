import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import * as nodeFs from 'fs';
import * as os from 'os';
import * as path from 'path';
import git from 'isomorphic-git';
import { Journaler } from '../src/journaler.js';
import type { EventQueue } from '../src/api.js';

const fs = nodeFs;
if ((git as any).plugins?.set) {
  (git as any).plugins.set('fs', fs);
}

function createRepo() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'journal-bdd-'));
  return tmp;
}

async function initRepo(repoPath: string) {
  await git.init({ fs, dir: repoPath });
}

describe('Feature: Git Journal Daemon provenance capture', () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = createRepo();
    await initRepo(repoPath);
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it('Scenario: a file change creates a snapshot on the journal branch', async () => {
    // Given a repository watched by the journal daemon
    const journaler = new Journaler({ dir: repoPath, intervalMs: 10 });

    try {
      // When a file changes
      const filePath = path.join(repoPath, 'foo.txt');
      writeFileSync(filePath, 'hello');
      journaler.enqueue(filePath);
      await journaler.flushNow();

      // Then the change is committed to the dedicated journal branch
      const log = await git.log({ fs, dir: repoPath, ref: 'refs/heads/journal' });
      expect(log).toHaveLength(1);
      expect(log[0].commit.message).toMatch(/genie snapshot/);
    } finally {
      journaler.stop();
    }
  });

  it('Scenario: Project Genie or TaskForce events are attached to the next snapshot', async () => {
    // Given external workflow events are queued for the daemon
    const eventQueue: EventQueue = [
      {
        type: 'task_assigned_to_executor',
        path: 'nodes/task-1/README.md',
        timestamp: '2026-04-27T10:00:00.000Z',
        source: 'project_genie',
        data: {
          taskId: 'task-1',
          executor: 'codex',
        },
      },
    ];
    const journaler = new Journaler({ dir: repoPath, intervalMs: 10, eventQueue });

    try {
      // When a file change is snapshotted
      const nodeFile = path.join(repoPath, 'nodes', 'task-1', 'README.md');
      fs.mkdirSync(path.dirname(nodeFile), { recursive: true });
      writeFileSync(nodeFile, '# Task 1');
      journaler.enqueue(nodeFile);
      await journaler.flushNow();

      // Then the journal commit carries structured node and event metadata
      const log = await git.log({ fs, dir: repoPath, ref: 'refs/heads/journal' });
      expect(log).toHaveLength(1);
      expect(log[0].commit.message).toMatch(/includes 1 API events/);

      const note = await git.readNote({
        fs,
        dir: repoPath,
        ref: 'refs/notes/genie',
        oid: log[0].oid,
      });
      const noteData = JSON.parse(Buffer.from(note).toString('utf-8'));
      expect(noteData.nodes).toEqual(['task-1']);
      expect(noteData.events).toEqual([
        expect.objectContaining({
          type: 'task_assigned_to_executor',
          source: 'project_genie',
          data: expect.objectContaining({
            executor: 'codex',
          }),
        }),
      ]);
      expect(eventQueue).toHaveLength(0);
    } finally {
      journaler.stop();
    }
  });

  it('Scenario: API-only events wait for the next file snapshot', async () => {
    // Given an external event arrives before any file change
    const eventQueue: EventQueue = [
      {
        type: 'executor_started',
        timestamp: '2026-04-27T11:00:00.000Z',
        source: 'project_genie',
        data: {
          executor: 'codex',
        },
      },
    ];
    const journaler = new Journaler({ dir: repoPath, intervalMs: 10, eventQueue });

    try {
      // When the daemon is flushed without a file change
      await journaler.flushNow();

      // Then the event remains queued and no journal branch is created
      expect(eventQueue).toHaveLength(1);
      await expect(git.log({ fs, dir: repoPath, ref: 'refs/heads/journal' })).rejects.toThrow();

      // When a later file change is snapshotted
      const nodeFile = path.join(repoPath, 'nodes', 'task-2', 'README.md');
      fs.mkdirSync(path.dirname(nodeFile), { recursive: true });
      writeFileSync(nodeFile, '# Task 2');
      journaler.enqueue(nodeFile);
      await journaler.flushNow();

      // Then the previously queued event is attached to that snapshot
      const log = await git.log({ fs, dir: repoPath, ref: 'refs/heads/journal' });
      const note = await git.readNote({
        fs,
        dir: repoPath,
        ref: 'refs/notes/genie',
        oid: log[0].oid,
      });
      const noteData = JSON.parse(Buffer.from(note).toString('utf-8'));
      expect(noteData.events).toEqual([
        expect.objectContaining({
          type: 'executor_started',
          data: expect.objectContaining({
            executor: 'codex',
          }),
        }),
      ]);
      expect(eventQueue).toHaveLength(0);
    } finally {
      journaler.stop();
    }
  });
});
