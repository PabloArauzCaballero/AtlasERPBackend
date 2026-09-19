import { activeTraceLogFields } from '../trace-log-fields';
import { TracingService } from '../tracing.service';
import { installInMemoryTracing, type TracingHarness } from './support/in-memory-tracing';

let harness: TracingHarness;
const tracing = new TracingService();

beforeAll(() => {
  harness = installInMemoryTracing();
});
beforeEach(() => harness.reset());
afterAll(() => harness.shutdown());

describe('campos de traza en cada línea de log', () => {
  it('con traza activa emite los tres campos de la convención', async () => {
    let campos: Record<string, unknown> = {};
    await tracing.runInSpan('operacion', {}, () => {
      campos = activeTraceLogFields();
    });
    const span = harness.spanNamed('operacion')!;
    expect(campos).toEqual({
      trace_id: span.spanContext().traceId,
      span_id: span.spanContext().spanId,
      trace_flags: span.spanContext().traceFlags,
    });
  });

  it('SIN traza activa devuelve un objeto vacío, no tres campos nulos', () => {
    // Importa: el worker entre tandas y el arranque escriben muchas líneas, y arrastrar
    // `trace_id: null` en todas ellas sólo engorda el log sin decir nada.
    expect(activeTraceLogFields()).toEqual({});
  });

  it('el identificador tiene el formato que Jaeger sabe buscar', async () => {
    let campos: { trace_id?: string } = {};
    await tracing.runInSpan('operacion', {}, () => {
      campos = activeTraceLogFields();
    });
    expect(campos.trace_id).toMatch(/^[0-9a-f]{32}$/);
  });
});
