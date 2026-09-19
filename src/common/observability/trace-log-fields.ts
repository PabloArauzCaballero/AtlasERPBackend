/**
 * Campos de traza que acompañan a cada línea de log.
 *
 * Se expone como función libre y no como servicio inyectable porque el `mixin` de Pino se
 * configura al construir el módulo raíz, cuando el contenedor de inyección todavía no existe.
 * La lectura es sin estado, así que no pierde nada por no pasar por el contenedor.
 */
import { readActiveTraceIds } from './trace-context.service';

/** Los nombres son los de la convención de OpenTelemetry: son los que reconocen los recolectores. */
export type TraceLogFields = {
  trace_id?: string;
  span_id?: string;
  trace_flags?: number;
};

/**
 * @returns Los identificadores de la traza en curso, o un objeto VACÍO si no hay ninguna.
 *   Vacío y no `null`: así una línea fuera de toda traza —el arranque, el worker entre tandas—
 *   no arrastra tres campos nulos por cada evento.
 */
export function activeTraceLogFields(): TraceLogFields {
  const { traceId, spanId, traceFlags } = readActiveTraceIds();
  if (traceId === undefined || spanId === undefined) return {};
  return { trace_id: traceId, span_id: spanId, trace_flags: traceFlags };
}
