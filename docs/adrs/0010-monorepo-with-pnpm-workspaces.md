# ADR-0010 — Monorepo with pnpm workspaces

**Status:** Accepted
**Date:** 2026-04-28

## Context

The deliverable spans:

- A NestJS API (`packages/api`)
- A Next.js demo client (`packages/web`)
- Shared docs, design specs, ADRs, load tests at the repo root

Three repo layouts considered:

1. **One repo per package.** Forces cross-cutting changes (e.g., adding a new endpoint + matching FE call) into multiple PRs. Slow for a small team.
2. **Monorepo with npm/yarn workspaces.** Workspaces are basic but functional. yarn classic has DX rough edges; npm workspaces lack hoisting controls.
3. **Monorepo with pnpm workspaces.** Strict dependency isolation (no phantom deps), fast install, native workspace filter (`pnpm --filter @keyloop/api dev`). Industry standard for monorepos in 2024+.

## Decision

pnpm workspaces. `pnpm-workspace.yaml` lists `packages/*`. Root `package.json` only carries dev tooling (commitlint, husky). Each workspace is independent and publishable.

Commit hygiene: `husky` runs `commitlint` (Conventional Commits) and a workspace-wide typecheck on pre-commit. Pre-commit can be bypassed with `--no-verify` when the sandbox / CI lacks pnpm in PATH.

## Consequences

- One install, one lockfile, one command to test everything.
- Cross-package refactors land in a single PR.
- Engineers must know pnpm-specific commands (`pnpm --filter <name> <script>`).
- Future option: add a third workspace `packages/shared` if API and web start sharing types or zod schemas. Currently the surface is small enough to keep them duplicated and in sync by hand.
