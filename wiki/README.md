# Git Journal Daemon Wiki

This wiki provides detailed documentation for the `git-journal-daemon` project.

## Project Overview

The `git-journal-daemon` is a utility designed for transparent background journaling of activity within a Git repository. Its primary function is to automatically create snapshots of the working tree and commit them to a dedicated `journal` branch, allowing users to have a continuous history of file changes without manually creating commits on their main branches.

## Core Functionality

The daemon operates by:
1.  Watching the working tree for file changes using **chokidar**.
2.  Staging only the touched files via **isomorphic-git** (`git.add`).
3.  Committing these changes directly to the `refs/heads/journal` branch (leaving the main HEAD untouched).
4.  Adding an optional **git-note** with metadata (originally for Genie node metadata, now extended for event journaling).

## Extended Event Journaling

Building upon the core functionality, the `git-journal-daemon` has been extended to support journaling of events beyond just file modifications. This includes the ability to receive events such as file read operations and other custom events from external sources (like the TaskForce VSCode extension) via a local API. These events are then stored in the git notes associated with the file change commits.

This enhanced journaling capability provides richer contextual data, valuable for understanding project activity and potentially for AI training within the Neuchatech TaskForce ecosystem.

## Documentation

*   **[Event Journaling Design](./Event_Journaling_Design.md):** Details the architecture and strategy for capturing and storing various event types alongside file changes using Git Notes, including the multi-instance handling approach.
*   **[API Specification](./API_Specification.md):** Specifies the local HTTP API endpoints, request/response formats, and port management for external tools to send events to the daemon.

This wiki aims to be a comprehensive resource for understanding, using, and contributing to the `git-journal-daemon`.