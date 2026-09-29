import { SiatGatewayService } from '../src/modules/fiscal/siat/application/siat-gateway.service';

/**
 * WP14-ERPB (adenda 5): `GET /accounting/fiscal/status` decía `activo: true` en `piloto` y
 * `produccion` sin avisar de que el transporte SOAP no existe: la pantalla daba a entender que las
 * facturas iban a Impuestos Nacionales. Ahora dice el modo, si el transporte es real y por qué no.
 */
describe('estado del modo de facturación electrónica', () => {
  const con = (modo: string) => {
    const gateway = Object.create(SiatGatewayService.prototype) as SiatGatewayService;
    Object.defineProperty(gateway, 'modo', { get: () => modo });
    return gateway.estadoDelModo;
  };

  it.each(['disabled', 'mock_server', 'piloto', 'produccion'])(
    '%s: ningún transporte es real todavía y la nota lo dice',
    (modo) => {
      const estado = con(modo);
      expect(estado).toMatchObject({
        mode: modo,
        activo: modo !== 'disabled',
        transporteReal: false,
      });
      expect(estado.nota).toMatch(/Impuestos Nacionales/);
    },
  );

  it.each(['piloto', 'produccion'])('%s nombra el transporte que falta', (modo) => {
    expect(con(modo).nota).toContain('SIAT_SOAP_TRANSPORT_NOT_READY');
  });
});
