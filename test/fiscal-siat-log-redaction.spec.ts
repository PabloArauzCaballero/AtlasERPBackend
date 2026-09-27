import { Writable } from 'node:stream';
import pino from 'pino';
import { sensitiveLogPaths } from '../src/common/logging/root-pino-logger';

/** El token delegado del SIN viaja en la cabecera `apikey`: nunca puede llegar a un log. */
describe('redacción del token del SIN', () => {
  it('apikey no aparece en claro ni en cabeceras ni en objetos anidados', () => {
    let salida = '';
    const destino = new Writable({
      write(chunk, _enc, done) {
        salida += chunk.toString();
        done();
      },
    });
    const logger = pino({ redact: { paths: sensitiveLogPaths } }, destino);
    logger.info({ headers: { apikey: 'TokenApi secreto-1' } }, 'a');
    logger.info({ req: { headers: { apikey: 'TokenApi secreto-2' } } }, 'b');
    logger.info({ siat: { apikey: 'TokenApi secreto-3' } }, 'c');
    expect(salida).not.toMatch(/secreto-/);
    expect(salida).toContain('[Redacted]');
  });
});
