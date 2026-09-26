import {
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { SiatMensaje } from '../infrastructure/siat-transport';

/** El SIN contestó y dijo que no: el mensaje es suyo, con su código. */
export function rechazoDelSin(operacion: string, mensajes: readonly SiatMensaje[] = []) {
  const detalle = mensajes.map((m) => `${m.codigo} ${m.descripcion}`).join('; ');
  return new UnprocessableEntityException({
    code: 'FISCAL_SIN_REJECTED',
    message: `Impuestos Nacionales rechazó la operación ${operacion}${detalle ? `: ${detalle}` : '.'}`,
    mensajes,
  });
}

/** El SIN no contestó (o no está implementado el transporte). */
export function sinNoDisponible(operacion: string, motivo: string) {
  return new ServiceUnavailableException({
    code: 'FISCAL_SIN_UNAVAILABLE',
    message: `No fue posible hablar con Impuestos Nacionales (${operacion}): ${motivo}`,
  });
}

export function facturacionFiscalApagada() {
  return new ConflictException({
    code: 'FISCAL_DISABLED',
    message:
      'La facturación electrónica está apagada en este entorno (SIAT_MODE=disabled): las facturas se emiten sin documento fiscal.',
  });
}
