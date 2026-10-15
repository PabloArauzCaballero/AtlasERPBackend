import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { EventOutboxModel } from '../../../../database/models';
import { outboxProducerAttributes } from '../../../../common/observability/messaging-attributes';
import { MessagingTraceService } from '../../../../common/observability/messaging-trace.service';
import { SPAN_NAMES } from '../../../../observability/telemetry.constants';

export interface AccountingDomainEvent {
  topic: string;
  aggregateType: string;
  aggregateId: string;
  eventKey: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class AccountingEventOutbox {
  constructor(
    @InjectModel(EventOutboxModel) private readonly eventOutboxModel: typeof EventOutboxModel,
    private readonly messaging: MessagingTraceService,
  ) {}

  /**
   * Escribe un hecho de dominio en el outbox, dentro de un span PRODUCTOR.
   *
   * El span marca el punto exacto en el que el trabajo deja de ser síncrono, y el portador de
   * traza se inyecta DENTRO de él: así el span consumidor que abra el worker —segundos o minutos
   * después, en otro proceso— cuelga de aquí y la traza queda entera.
   *
   * El portador va en la columna `trace_context` y NO en `payload`: ese campo es el contrato de
   * dominio del evento y lo que saldrá hacia un broker. Ningún atributo del span lleva el
   * contenido del documento; sólo su tipo y su identificador.
   */
  publish(event: AccountingDomainEvent, transaction: Transaction): Promise<unknown> {
    return this.messaging.runAsProducer(
      SPAN_NAMES.outboxPublish,
      outboxProducerAttributes({
        eventType: event.topic,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        producer: 'accounting',
      }),
      () =>
        this.eventOutboxModel.create(
          { ...event, traceContext: this.messaging.withCarrier(null) },
          { transaction },
        ),
    );
  }
}
