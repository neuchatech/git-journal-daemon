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

## How It Works

1. Watches the working tree with **chokidar**.
2. Stages only the touched files via **isomorphic‑git** (`git.add`).
3. Commits directly to `refs/heads/journal` (HEAD untouched).
4. Adds optional Git notes with Project Genie / TaskForce node and event metadata.

## Current Behavior

- File changes create journal snapshots.
- API events are attached to the next file-change snapshot.
- API-only events do not currently create metadata-only commits.
