# ADR-0001 — Record architecture decisions

**Status:** Accepted
**Date:** 2026-04-28

## Context

We are building a non-trivial multi-tenant booking system with several non-obvious technical choices (EXCLUDE constraints over SERIALIZABLE transactions, RLS over application-layer tenant scoping, Luxon for DST, etc.). Without a record of _why_ we chose each pattern, future engineers will either repeat the original investigation or make changes that violate the original intent.

## Decision

We adopt Architecture Decision Records (ADRs) following Michael Nygard's template. ADRs live under `docs/adrs/`, are sequentially numbered, and each captures: Context, Decision, and Consequences. ADRs are markdown-only and reviewed as part of the regular pull-request process.

## Consequences

- Every non-obvious technical choice gets a one-page document.
- Reviewers can trace the rationale behind any decision without spelunking through commit history.
- Onboarding becomes faster: new contributors read ADRs before changing load-bearing code.
- Cost: ~30 minutes of writing per major decision. Acceptable.
