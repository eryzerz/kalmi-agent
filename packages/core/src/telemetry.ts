import { registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';

export function initTelemetry(): void {
  try {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';

    const provider = new NodeTracerProvider({
      resource: resourceFromAttributes({ 'service.name': 'kalmi' }),
      spanProcessors: [
        new SimpleSpanProcessor(new OTLPTraceExporter({ url: endpoint })),
      ],
    });
    provider.register();

    registerTelemetry(
      new OpenTelemetry({
        tracer: provider.getTracer('kalmi'),
      }),
    );
  } catch (err) {
    console.warn(
      `Telemetry initialization failed (non-critical): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
