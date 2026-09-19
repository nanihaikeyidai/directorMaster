# Director Master Workspace

This directory is the project-owned production surface.

- `screenplays/` stores the approved authoritative screenplay; `drafts/` is the review surface and `history/` holds pre-approval backups.
- `assets/` stores the current material library.
- `workflows/` stores Director workflow snapshots used by this project.
- `skill-jobs/` stores auditable Agent task packages created by the Web UI or CLI.
- `outputs/screenwriter/` stores approved screenplay revisions and reviews.
- `outputs/shotlist-builder/` stores shotlists, MiniMax H3 prompt sheets, and production HTML.

The installed Skills remain in `.agents/skills/`. Task packages reference them by exact name and keep screenplay work separate from prompt-production work.

The production gate is strict: `$screenwriter` writes a draft, the user approves it, and only then may `$shotlist-builder` read the authoritative screenplay. Saving a new draft invalidates the previous approval.
