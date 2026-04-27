# git-journal-daemon

Transparent background commits and structured workflow-event notes for Git repositories.

```bash
npm install
npm run build
npm test

npm i -g git-journal-daemon   # global CLI
# or inside a repo
npx git-journal-daemon
```

## Options

* `--interval <ms>`   default **4000** – debounce window before a snapshot.
* `--ignore <glob>`   comma‑separated patterns in addition to .gitignore.
* `--api-port <port>` base port for the local event API.

## Local API and Discovery

The daemon starts a loopback HTTP API, beginning at `--api-port` and retrying
nearby ports if needed.

* `GET /health` returns readiness JSON with `ready`, `status`, `pid`, `host`,
  `port`, `startedAt`, and queued event count.
* `POST /log_event` accepts structured workflow events and queues them for the
  next journal snapshot.

After the API is listening, the daemon writes repo-local discovery metadata as
JSON:

```json
{
  "pid": 12345,
  "port": 3000,
  "host": "127.0.0.1",
  "repoPath": "/path/to/repo",
  "timestamp": "2026-04-27T12:00:00.000Z"
}
```

The preferred location is `.git/gjd.pid_port` when `.git` is a directory. If no
usable `.git` directory exists, the fallback is `.neuchatech/gjd.pid_port`.
Clean shutdown attempts to remove this file.

## How It Works

1. Watches the working tree with **chokidar**.
2. Stages only the touched files via **isomorphic‑git** (`git.add`).
3. Commits directly to `refs/heads/journal` (HEAD untouched).
4. Adds optional Git notes with Project Genie / TaskForce node and event metadata.

## Current Behavior

- File changes create journal snapshots.
- API events are attached to the next file-change snapshot.
- API-only events do not currently create metadata-only commits.
