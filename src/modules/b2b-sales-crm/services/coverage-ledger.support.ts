/**
 * Piezas de infraestructura de la cobertura BNPL que no son reglas de negocio: escribir el evento
 * en el outbox dentro de la MISMA transacción, comprobar que la evidencia existe y traducir una
 * violación de unicidad en un 409 legible.
 */
import { ConflictException } from '@nestjs/common';
import { QueryTypes, UniqueConstraintError } from 'sequelize';
import type { Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { MessagingTraceService } from '../../../common/observability/messaging-trace.service';

export interface CoverageOutboxEvent {
  topic: string;
  aggregateType: string;
  aggregateId: string;
  eventKey: string;
  payload: Record<string, unknown>;
}

/**
 * Inserta el evento en `atlas_accounting.event_outbox` con la transacción del cambio de estado:
 * o se confirman los dos o ninguno. `ON CONFLICT (event_key) DO NOTHING` hace idempotente la
 * repetición de la misma transición. La ENTREGA la hace el worker de outbox, no este método.
 */
export async function writeOutboxEvent(
  sequelize: Sequelize,
  messaging: Pick<MessagingTraceService, 'withCarrier'>,
  event: CoverageOutboxEvent,
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO atlas_accounting.event_outbox
       (topic, aggregate_type, aggregate_id, event_key, payload, trace_context)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     ON CONFLICT (event_key) DO NOTHING`,
    {
      bind: [
        event.topic,
        event.aggregateType,
        event.aggregateId,
        event.eventKey,
        JSON.stringify(event.payload),
        JSON.stringify(messaging.withCarrier(null)),
      ],
      transaction,
    },
  );
}

/** Estado del archivo de evidencia en el almacén de archivos del ERP, o `null` si no existe. */
export async function findEvidenceFileStatus(
  sequelize: Sequelize,
  fileId: string,
  transaction: Transaction,
): Promise<string | null> {
  const rows = await sequelize.query<{ status: string }>(
    'SELECT status FROM atlas_accounting.erp_file WHERE id = $1',
    { bind: [fileId], type: QueryTypes.SELECT, transaction },
  );
  return rows[0]?.status ?? null;
}

/**
 * Ejecuta el caso de uso y convierte una colisión con un índice único —dos peticiones que ganaron
 * la carrera a la vez— en un 409 en vez de un 500 «error de base de datos».
 */
export async function mapUniqueViolation<T>(message: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new ConflictException({ code: 'DUPLICATE_REFERENCE', message });
    }
    throw error;
  }
}
