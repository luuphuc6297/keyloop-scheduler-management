import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const otlpEndpoint = process.env.OTLP_ENDPOINT?.trim();
const traceExporter = otlpEndpoint ? new OTLPTraceExporter({ url: otlpEndpoint }) : new ConsoleSpanExporter();

export const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'scheduler-api',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION ?? 'dev',
  }),
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-pino': { enabled: true },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().catch((err) => console.error('OTel shutdown error:', err));
});
