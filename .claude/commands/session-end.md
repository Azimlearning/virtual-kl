---
description: Close out the session — changelog entry, STATUS update, ADRs, doc reconciliation, commit and push to main
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

Close out this session per CLAUDE.md's mandatory rules. Do not skip a step because the session felt small.

1. `git status` and `git diff` — establish what actually changed. Don't rely on memory of the conversation.
2. Add an entry to `refdocs/changelog/CHANGELOG.md` in that file's documented format (newest first). The **Verified** line names a command that was actually run and its actual result; if nothing was run this session, write "nothing verified this session" rather than implying otherwise.
3. Update `refdocs/STATUS.md`: the phase table, and the verification ledger if anything was genuinely verified. Status never rounds up — code that compiles but was never executed is 🔶, not ✅.
4. Any architectural decision made this session → an ADR in `refdocs/changelog/DECISIONS.md`, with an id matching the PRD's decision log (`refdocs/virtual-kl-PRD.md` §7). Any `ASSUMED:` that got resolved gets promoted or deleted in both places.
5. If the work diverged from its execution doc, edit that doc to match reality and note it in the changelog's Deviations line.
6. Update the index tables in `refdocs/plans/README.md` and `refdocs/execution/README.md` if a doc was added or changed status. If a new environment variable appeared, add it to `refdocs/guides/env_setup.md`, `.env.example`, `docker-compose.yml` and `app/config.py` now. If third-party code was reused, add it to `THIRD_PARTY_NOTICES.md`.
7. Check `git status` shows no `.env*` file and no personal data, then commit to `main` with a message summarising the session, and push to `origin main` (CLAUDE.md rule 5 — no branches, never force-push).

Then show me the changelog entry you wrote and the commit hash, and list anything you couldn't resolve.
