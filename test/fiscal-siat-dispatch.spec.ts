import { dentroDelPlazoDeAnulacion } from '../src/modules/fiscal/siat/application/siat-annulment.service';
import { SiatDispatchService } from '../src/modules/fiscal/siat/application/siat-dispatch.service';

/**
 * La clasificación de las respuestas del SIN, sin red: qué es terminal, qué se consulta y qué
 * se reintenta. La regla que protege: un código desconocido NUNCA se convierte en rechazo.
 */
describe('interpretación de la respuesta de recepcionFactura', () => {
  const despacho = Object.create(SiatDispatchService.prototype) as SiatDispatchService;
  const con = (codigoEstado: number, ...codigos: number[]) =>
    despacho.interpretarRecepcion({
      codigoEstado,
      mensajesList: codigos.map((codigo) => ({ codigo, descripcion: `c${codigo}` })),
    });

  it('908 → ACCEPTED, 904 → OBSERVED', () => {
    expect(con(908).estado).toBe('ACCEPTED');
    expect(con(904, 2000).estado).toBe('OBSERVED');
  });

  it('902 con 952 → consultar, nunca reenviar ni rechazar', () => {
    expect(con(902, 952).estado).toBe('CONSULTAR');
  });

  it('902 con CUFD vencido o fecha fuera de tolerancia → regenerar fuera de línea', () => {
    expect(con(902, 953).estado).toBe('REGENERAR');
    expect(con(902, 1009).estado).toBe('REGENERAR');
  });

  it('902 con error del documento → REJECTED', () => {
    expect(con(902, 1002).estado).toBe('REJECTED');
    expect(con(902, 1013, 939).estado).toBe('REJECTED');
  });

  it('un código que el ERP no conoce es ERROR reintentable con alerta, no rechazo', () => {
    const resultado = con(902, 7777);
    expect(resultado).toMatchObject({ estado: 'ERROR', alerta: true });
  });

  it('un 902 sin mensajes o un estado inesperado también es ERROR con alerta', () => {
    expect(con(902)).toMatchObject({ estado: 'ERROR', alerta: true });
    expect(con(999)).toMatchObject({ estado: 'ERROR', alerta: true });
  });

  it('un fallo del servicio del SIN (995) se reintenta sin alerta de clasificación', () => {
    expect(con(902, 995)).toMatchObject({ estado: 'ERROR', alerta: false });
  });
});

describe('plazo de anulación', () => {
  it('hasta el día 9 del mes siguiente, inclusive', () => {
    expect(dentroDelPlazoDeAnulacion('2026-09-26T10:00:00.000', '2026-10-09')).toBe(true);
    expect(dentroDelPlazoDeAnulacion('2026-09-26T10:00:00.000', '2026-10-10')).toBe(false);
  });

  it('diciembre pasa al 9 de enero del año siguiente', () => {
    expect(dentroDelPlazoDeAnulacion('2026-12-31T23:59:00.000', '2027-01-09')).toBe(true);
    expect(dentroDelPlazoDeAnulacion('2026-12-31T23:59:00.000', '2027-01-10')).toBe(false);
  });
});
