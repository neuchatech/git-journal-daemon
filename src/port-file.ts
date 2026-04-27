import fs from 'node:fs';
import path from 'node:path';

export const PORT_FILE_NAME = 'gjd.pid_port';

export interface PortFileMetadata {
  pid: number;
  port: number;
  host: string;
  repoPath: string;
  timestamp: string;
}

export interface PortFileValidationOptions {
  maxAgeMs?: number;
  now?: Date;
  checkProcess?: boolean;
}

export interface PortFileValidationResult {
  valid: boolean;
  reason?: string;
}

export function resolvePortFilePath(repoPath: string): string {
  const gitDir = path.join(repoPath, '.git');

  try {
    if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
      return path.join(gitDir, PORT_FILE_NAME);
    }
  } catch {
    // Fall back below when .git cannot be inspected.
  }

  return path.join(repoPath, '.neuchatech', PORT_FILE_NAME);
}

export function createPortFileMetadata(input: {
  port: number;
  host: string;
  repoPath: string;
  pid?: number;
  timestamp?: string;
}): PortFileMetadata {
  return {
    pid: input.pid ?? process.pid,
    port: input.port,
    host: input.host,
    repoPath: path.resolve(input.repoPath),
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}

export async function writePortFile(input: {
  port: number;
  host: string;
  repoPath: string;
  pid?: number;
  timestamp?: string;
}): Promise<PortFileMetadata> {
  const metadata = createPortFileMetadata(input);
  const filePath = resolvePortFilePath(metadata.repoPath);

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');

  return metadata;
}

export async function readPortFile(
  repoPath: string,
  options: PortFileValidationOptions = {}
): Promise<PortFileMetadata> {
  const filePath = resolvePortFilePath(path.resolve(repoPath));
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  const validation = validatePortFileMetadata(parsed, options);

  if (!validation.valid) {
    throw new Error(`Invalid git-journal-daemon discovery metadata: ${validation.reason}`);
  }

  return parsed as PortFileMetadata;
}

export async function removePortFile(repoPath: string): Promise<void> {
  await fs.promises.rm(resolvePortFilePath(path.resolve(repoPath)), { force: true });
}

export function validatePortFileMetadata(
  value: unknown,
  options: PortFileValidationOptions = {}
): PortFileValidationResult {
  if (!value || typeof value !== 'object') {
    return { valid: false, reason: 'metadata must be an object' };
  }

  const metadata = value as Partial<PortFileMetadata>;
  const { pid, port, host, repoPath, timestamp } = metadata;

  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
    return { valid: false, reason: 'pid must be a positive integer' };
  }
  if (typeof port !== 'number' || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return { valid: false, reason: 'port must be a valid TCP port' };
  }
  if (typeof host !== 'string' || host.length === 0) {
    return { valid: false, reason: 'host must be a non-empty string' };
  }
  if (typeof repoPath !== 'string' || repoPath.length === 0) {
    return { valid: false, reason: 'repoPath must be a non-empty string' };
  }
  if (!path.isAbsolute(repoPath)) {
    return { valid: false, reason: 'repoPath must be absolute' };
  }
  if (typeof timestamp !== 'string' || timestamp.length === 0) {
    return { valid: false, reason: 'timestamp must be a non-empty string' };
  }

  const timestampMs = Date.parse(timestamp);
  if (Number.isNaN(timestampMs)) {
    return { valid: false, reason: 'timestamp must be an ISO-8601 date string' };
  }

  const nowMs = (options.now ?? new Date()).getTime();
  if (timestampMs > nowMs + 5 * 60 * 1000) {
    return { valid: false, reason: 'timestamp is unexpectedly in the future' };
  }

  if (options.maxAgeMs !== undefined && nowMs - timestampMs > options.maxAgeMs) {
    return { valid: false, reason: 'metadata is stale' };
  }

  if (options.checkProcess && !isProcessAlive(pid)) {
    return { valid: false, reason: 'process is not running' };
  }

  return { valid: true };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    return err.code === 'EPERM';
  }
}
