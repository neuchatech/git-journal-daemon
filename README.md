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