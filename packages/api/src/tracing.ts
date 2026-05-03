import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

/**
 * Tracing is OPT-IN, controlled by env vars:
 *
 *   OTLP_ENDPOINT=http://localhost:4318/v1/traces  → ship spans to OTel collector
 *   OTEL_CONSOLE=true                              → dump spans to stdout (noisy! debug only)
 *   (neither set)                                  → SDK is not initialized at all (silent)
 *
 * The previous default was to console-export when OTLP_ENDPOINT was empty.
 * That floods the dev console with ~10 spans per HTTP request from
 * auto-instrumentation (HTTP, Express middleware, route handler), which makes
 * the API logs unreadable. Explicit opt-in via OTEL_CONSOLE=true keeps dev
 * quiet by default while still giving you a way to inspect spans without
 * spinning up the full observability stack.
 */
const otlpEndpoint = process.env.OTLP_ENDPOINT?.trim();
const consoleEnabled = process.env.OTEL_CONSOLE === 'true';

if (otlpEndpoint || consoleEnabled) {
  const traceExporter = otlpEndpoint
    ? new OTLPTraceExporter({ url: otlpEndpoint })
    : new ConsoleSpanExporter();

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'scheduler-api',
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION ?? 'dev',
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // FS spans are noise — filesystem stats from every Express middleware load
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Express middleware spans are also noisy (5+ spans per request); turn off
        // unless you really need to drill into middleware timing
        '@opentelemetry/instrumentation-express': { enabled: !consoleEnabled },
        '@opentelemetry/instrumentation-pino': { enabled: true },
      }),
    ],
  });

  sdk.start();
  // eslint-disable-next-line no-console
  console.log(`[tracing] OTel SDK started (exporter: ${otlpEndpoint ? 'OTLP→' + otlpEndpoint : 'console'})`);

  process.on('SIGTERM', () => {
    sdk.shutdown().catch((err) => console.error('OTel shutdown error:', err));
  });
}
