# ADR-0009 — Observability stack: pino + Prometheus + OpenTelemetry

**Status:** Accepted
**Date:** 2026-04-28

## Context

Production-grade scheduler needs:

- **Logs** that survive multi-replica deploys, redact PII, and correlate to a request ID.
- **Metrics** that prove SLOs (p99 latency, error rate, booking conflicts/sec) without hand-waving.
- **Traces** that let oncall drill from "this booking was slow" to the specific DB query that took 400ms.

Each pillar has multiple OSS choices. The constraint is that everything must run on the developer laptop via `docker compose` for the demo, while remaining swappable for managed services in production.

## Decision

| Pillar | Library / Tool | Why |
|---|---|---|
| Logs | `nestjs-pino` + `pino-pretty` (dev) / JSON to stdout (prod) | Fastest Node logger; structured by default; drop-in for any log aggregator. |
| Metrics | `@willsoto/nestjs-prometheus` + `prom-client` | Native Prometheus exposition. Scraped by Prometheus container. |
| Traces | `@opentelemetry/sdk-node` + auto-instrumentations + OTLP HTTP exporter | Vendor-neutral. OTLP collector container in dev pipes to Jaeger; in prod it goes to whatever managed APM the team picks. |
| Local stack | `docker-compose.observability.yml` (Prometheus, Grafana, Jaeger, OTel Collector) | One command (`docker compose --profile observability up`) brings everything online. Grafana dashboard auto-provisioned from `loadtest/grafana-dashboard.json`. |

Pino redaction list explicitly includes `req.headers.authorization`, `req.headers.cookie`, `req.body.password`, `req.body.refresh_token`, `*.password_hash`, `*.token_hash`. Adding to this list as new sensitive fields appear is a code-review checklist item.

Correlation: a `RequestIdMiddleware` assigns/honors `X-Request-Id`, pino injects it into every log line via `customProps`, the OTel auto-instrumentation propagates it as a trace baggage.

## Consequences

- **No vendor lock-in.** OTLP-formatted spans can be redirected at any APM (Datadog, Honeycomb, New Relic) by swapping the collector exporter.
- **Self-contained dev experience.** Engineers see Grafana panels light up while running k6 against their laptop.
- Cost: 4 containers in the observability stack. Acceptable on any developer machine; in CI, the stack is opt-in.
- Future option: adopt `typeorm-transactional` (already in deps) for span propagation across nested transactions — would let us see the full DB-side trace of a booking flow as one span tree.
