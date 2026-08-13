import http from 'node:http';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { startApiServerWithHandle, type EventQueue } from '../src/api.js';
import {
  readPortFile,
  resolvePortFilePath,
  validatePortFileMetadata,
  writePortFile,
} from '../src/port-file.js';

interface HttpResponse {
  statusCode: number;
  body: unknown;
}

function requestJson(
  port: number,
  method: string,
  requestPath: string,
  body?: unknown
): Promise<HttpResponse> {
  const payload = body === undefined ? undefined : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: requestPath,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      res => {
        let responseBody = '';
        res.on('data', chunk => {
          responseBody += chunk.toString();
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: responseBody.length > 0 ? JSON.parse(responseBody) : undefined,
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

describe('Feature: Git Journal Daemon API health and discovery', () => {
  it('Scenario: API health endpoint reports ready', async () => {
    // Given the daemon API is running
    const eventQueue: EventQueue = [];
    const api = await startApiServerWithHandle(eventQueue, 0);

    try {
      // When health is requested
      const response = await requestJson(api.port, 'GET', '/health');

      // Then readiness metadata is returned
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          ready: true,
          status: 'ready',
          service: 'git-journal-daemon',
          pid: process.pid,
          host: '127.0.0.1',
          port: api.port,
          queueDepth: 0,
        })
      );
    } finally {
      await api.close();
    }
  });

  it('Scenario: startup discovery metadata can be written and read back', async () => {
    // Given a repository-local git directory exists
    const repoPath = mkdtempSync(path.join(os.tmpdir(), 'gjd-discovery-'));
    mkdirSync(path.join(repoPath, '.git'));

    try {
      // When daemon startup metadata is written
      const written = await writePortFile({
        pid: process.pid,
        port: 32123,
        host: '127.0.0.1',
        repoPath,
        timestamp: '2026-04-27T12:00:00.000Z',
      });

      // Then clients can discover and read the same machine-readable data
      expect(resolvePortFilePath(repoPath)).toBe(path.join(repoPath, '.git', 'gjd.pid_port'));
      await expect(readPortFile(repoPath)).resolves.toEqual(written);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('Scenario: invalid/stale discovery metadata is rejected', async () => {
    // Given invalid metadata
    const invalid = validatePortFileMetadata({
      pid: 0,
      port: 99999,
      host: '',
      repoPath: 'relative',
      timestamp: 'not-a-date',
    });

    // Then structural validation rejects it
    expect(invalid.valid).toBe(false);

    // Given stale metadata was written in the discovery file
    const repoPath = mkdtempSync(path.join(os.tmpdir(), 'gjd-stale-discovery-'));
    try {
      await writePortFile({
        pid: process.pid,
        port: 32123,
        host: '127.0.0.1',
        repoPath,
        timestamp: '2026-04-27T12:00:00.000Z',
      });

      // Then reads with freshness requirements reject it
      await expect(
        readPortFile(repoPath, {
          maxAgeMs: 1000,
          now: new Date('2026-04-27T12:01:00.000Z'),
        })
      ).rejects.toThrow(/stale/);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('Scenario: POST /log_event still queues events', async () => {
    // Given the daemon API is running
    const eventQueue: EventQueue = [];
    const api = await startApiServerWithHandle(eventQueue, 0);

    try {
      // When an external workflow event is logged
      const event = {
        type: 'executor_started',
        timestamp: '2026-04-27T13:00:00.000Z',
        source: 'project_genie',
        data: {
          executor: 'codex',
        },
      };
      const response = await requestJson(api.port, 'POST', '/log_event', event);

      // Then the API accepts and queues the event for journaling
      expect(response.statusCode).toBe(202);
      expect(eventQueue).toEqual([event]);
    } finally {
      await api.close();
    }
  });
});
