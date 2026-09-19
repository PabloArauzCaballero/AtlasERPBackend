import { describe, expect, it } from '@jest/globals';
import { ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { buildInstrumentations } from '../telemetry.instrumentations';
import { readTelemetryConfig } from '../telemetry.config';

const config = readTelemetryConfig({
  OTEL_ENABLED: 'true',
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://colector:4318/v1/traces',
});

/** Se leen los hooks REALES de la instrumentación construida, no una copia de su lógica. */
function configuracionDe(nombre: string): Record<string, unknown> {
  const instrumentacion = buildInstrumentations(config).find((candidata) =>
    candidata.instrumentationName.includes(nombre),
  );
  if (instrumentacion === undefined)
    throw new Error(`No se construyó la instrumentación ${nombre}`);
  return instrumentacion.getConfig() as unknown as Record<string, unknown>;
}

describe('instrumentaciones automáticas', () => {
  it('son exactamente cuatro, declaradas una a una', () => {
    const nombres = buildInstrumentations(config)
      .map((instrumentacion) =>
        instrumentacion.instrumentationName.replace('@opentelemetry/instrumentation-', ''),
      )
      .sort();
    // Si esta lista crece sin querer —por volver a `auto-instrumentations-node`, por ejemplo—
    // la traza se llena de spans de `fs` y `dns` y deja de poder leerse.
    expect(nombres).toEqual(['express', 'http', 'pg', 'undici']);
  });

  describe('exclusión de sondas', () => {
    const excluir = configuracionDe('http').ignoreIncomingRequestHook as (r: {
      url?: string;
    }) => boolean;

    it.each([
      ['/health', 'sin prefijo'],
      ['/api/v1/health', 'con el prefijo global de la API'],
      ['/api/v1/ready', 'sonda de preparación del ERP'],
      ['/metrics', 'scrape de Prometheus'],
      ['/api/v1/health?verbose=1', 'con cadena de consulta'],
      ['/favicon.ico', 'ruido del navegador'],
    ])('excluye %s (%s)', (url) => {
      expect(excluir({ url })).toBe(true);
    });

    it.each(['/api/v1/auth/login', '/api/v1/customers', '/api/v1/health-checks-de-negocio'])(
      'NO excluye %s',
      (url) => {
        expect(excluir({ url })).toBe(false);
      },
    );

    it('una petición sin URL no se excluye: ante la duda, se traza', () => {
      expect(excluir({})).toBe(false);
    });
  });

  describe('exclusión del propio exportador', () => {
    const excluirSaliente = configuracionDe('http').ignoreOutgoingRequestHook as (r: {
      hostname?: string | null;
      port?: number | string | null;
    }) => boolean;

    it('no traza sus propias exportaciones: si no, cada lote genera el span del siguiente', () => {
      expect(excluirSaliente({ hostname: 'colector', port: 4318 })).toBe(true);
    });

    it('sí traza las llamadas a cualquier otro destino', () => {
      expect(excluirSaliente({ hostname: 'motor', port: 3000 })).toBe(false);
      expect(excluirSaliente({ hostname: 'colector', port: 9000 })).toBe(false);
    });

    it('sin endpoint configurado no excluye nada', () => {
      const sinDestino = buildInstrumentations(readTelemetryConfig({ OTEL_ENABLED: 'true' }));
      const hook = sinDestino
        .find((i) => i.instrumentationName.includes('http'))!
        .getConfig() as unknown as {
        ignoreOutgoingRequestHook: (r: unknown) => boolean;
      };
      expect(hook.ignoreOutgoingRequestHook({ hostname: 'localhost', port: 4318 })).toBe(false);
    });
  });

  it('NO se instrumenta Redis: este backend no lo usa', () => {
    // Instrumentar lo que no existe es peso muerto en la imagen y una dependencia más que
    // mantener. Si algún día el ERP usa Redis, esta prueba es la que hay que cambiar.
    const nombres = buildInstrumentations(config).map((i) => i.instrumentationName);
    expect(nombres.some((nombre) => nombre.includes('ioredis'))).toBe(false);
  });

  it('axios queda cubierto por la instrumentación de http, sin paquete aparte', () => {
    // Axios en Node emite por el módulo `http`. Una instrumentación propia duplicaría cada
    // llamada saliente en dos spans que describen lo mismo.
    const nombres = buildInstrumentations(config).map((i) => i.instrumentationName);
    expect(nombres.some((nombre) => nombre.includes('axios'))).toBe(false);
    expect(nombres.some((nombre) => nombre.includes('instrumentation-http'))).toBe(true);
  });

  it('express no abre un span por cada middleware', () => {
    // Siete de los dieciocho spans de una petición eran middleware, cinco de ellos de 0,0 ms.
    expect(configuracionDe('express').ignoreLayersType).toEqual([ExpressLayerType.MIDDLEWARE]);
  });

  it('pg no publica los valores de los parámetros ligados', () => {
    expect(configuracionDe('pg').enhancedDatabaseReporting).toBe(false);
  });
});
